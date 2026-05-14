import { useState, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Linking,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { EmptyState } from '@/components/empty-state'
import { Colors, Spacing, FontSize, BorderRadius, Shadow } from '@/constants/theme'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

interface ArchivedTalk {
  id: string
  title: string
  content_type: 'pdf' | 'docx' | 'text'
  sign_off_pdf_url: string | null
  archived_at: string | null
  created_at: string
  creator: { full_name: string } | null
  sig_count: number
}

interface ArchivedTalkRaw {
  id: string
  title: string
  content_type: 'pdf' | 'docx' | 'text'
  sign_off_pdf_url: string | null
  archived_at: string | null
  created_at: string
  creator: { full_name: string } | null
  toolbox_talk_signatures: { id: string }[]
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function badgeStyle(ct: string) {
  if (ct === 'pdf') return styles.typeBadgePdf
  if (ct === 'docx') return styles.typeBadgeDocx
  return styles.typeBadgeText
}

function badgeLabel(ct: string) {
  if (ct === 'pdf') return 'PDF'
  if (ct === 'docx') return 'DOCX'
  return 'Text'
}

export default function ToolboxTalkArchiveScreen() {
  const { profile } = useAuth()
  const [talks, setTalks] = useState<ArchivedTalk[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useFocusEffect(
    useCallback(() => {
      if (!profile?.site_id) return
      setIsLoading(true)
      supabase
        .from('toolbox_talks')
        .select(`
          id, title, content_type, sign_off_pdf_url, archived_at, created_at,
          creator:profiles!created_by(full_name),
          toolbox_talk_signatures(id)
        `)
        .eq('site_id', profile.site_id)
        .eq('status', 'archived')
        .order('archived_at', { ascending: false })
        .then(({ data }) => {
          const raw = (data as unknown as ArchivedTalkRaw[]) ?? []
          setTalks(
            raw.map((t) => ({
              id: t.id,
              title: t.title,
              content_type: t.content_type,
              sign_off_pdf_url: t.sign_off_pdf_url,
              archived_at: t.archived_at,
              created_at: t.created_at,
              creator: t.creator,
              sig_count: t.toolbox_talk_signatures?.length ?? 0,
            }))
          )
          setIsLoading(false)
        })
    }, [profile?.site_id])
  )

  async function handleViewSignOff(talk: ArchivedTalk) {
    if (!talk.sign_off_pdf_url) return
    const { data } = await supabase.storage
      .from('toolbox-talk-pdfs')
      .createSignedUrl(talk.sign_off_pdf_url, 3600)
    if (data?.signedUrl) Linking.openURL(data.signedUrl)
  }

  return (
    <ScreenWrapper edges={['bottom']}>
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={talks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              title="No archived talks"
              message="Talks are archived here after a sign-off PDF is generated."
              icon="🗂"
            />
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
                <View style={[styles.typeBadge, badgeStyle(item.content_type)]}>
                  <Text style={styles.typeBadgeLabel}>{badgeLabel(item.content_type)}</Text>
                </View>
              </View>
              <Text style={styles.cardMeta}>
                Archived {formatDate(item.archived_at ?? item.created_at)} · {item.sig_count} {item.sig_count === 1 ? 'signature' : 'signatures'}
              </Text>
              <Text style={styles.cardCreator}>{item.creator?.full_name ?? '—'}</Text>
              {item.sign_off_pdf_url ? (
                <TouchableOpacity
                  style={styles.pdfBtn}
                  onPress={() => handleViewSignOff(item)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.pdfBtnText}>View Sign-Off PDF →</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.noPdfText}>No sign-off PDF generated</Text>
              )}
            </View>
          )}
        />
      )}
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: Spacing.md, paddingBottom: 100, flexGrow: 1 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadow.sm,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginBottom: 4,
  },
  cardTitle: { flex: 1, fontSize: FontSize.base, fontWeight: '700', color: Colors.text },
  typeBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.full },
  typeBadgePdf: { backgroundColor: Colors.info + '20' },
  typeBadgeDocx: { backgroundColor: Colors.purple + '20' },
  typeBadgeText: { backgroundColor: Colors.success + '20' },
  typeBadgeLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary },
  cardMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: 2 },
  cardCreator: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: Spacing.sm },
  pdfBtn: { alignSelf: 'flex-start' },
  pdfBtnText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '600' },
  noPdfText: { fontSize: FontSize.xs, color: Colors.textMuted },
})
