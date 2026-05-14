import { useState, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { EmptyState } from '@/components/empty-state'
import { Colors, Spacing, FontSize, BorderRadius, Shadow } from '@/constants/theme'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

type ContentType = 'pdf' | 'docx' | 'text'

interface LibraryTalk {
  id: string
  title: string
  content_type: ContentType
  pdf_url: string | null
  is_archived: boolean
  created_at: string
  creator: { full_name: string } | null
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function badgeStyle(ct: ContentType) {
  if (ct === 'pdf') return styles.typeBadgePdf
  if (ct === 'docx') return styles.typeBadgeDocx
  return styles.typeBadgeTxt
}

function badgeLabel(ct: ContentType) {
  if (ct === 'pdf') return 'PDF'
  if (ct === 'docx') return 'DOCX'
  return 'Text'
}

export default function ToolboxTalkLibrary() {
  const router = useRouter()
  const { profile } = useAuth()
  const [talks, setTalks] = useState<LibraryTalk[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [creatingId, setCreatingId] = useState<string | null>(null)

  const fetchTalks = useCallback(async () => {
    if (!profile?.company_id) return
    setIsLoading(true)
    const { data } = await supabase
      .from('toolbox_talk_library')
      .select('id, title, content_type, pdf_url, is_archived, created_at, creator:profiles!created_by(full_name)')
      .eq('company_id', profile.company_id)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
    setTalks((data as unknown as LibraryTalk[]) ?? [])
    setIsLoading(false)
  }, [profile?.company_id])

  useFocusEffect(useCallback(() => { fetchTalks() }, [fetchTalks]))

  async function handleUseTalk(libraryTalk: LibraryTalk) {
    if (!profile?.site_id) {
      Alert.alert('Error', 'Your account is not linked to a site.')
      return
    }
    setCreatingId(libraryTalk.id)
    const { data, error } = await supabase
      .from('toolbox_talks')
      .insert({
        site_id: profile.site_id,
        library_id: libraryTalk.id,
        title: libraryTalk.title,
        content_type: libraryTalk.content_type,
        pdf_url: libraryTalk.pdf_url,
        created_by: profile.id,
        status: 'active',
      })
      .select('id')
      .single()
    setCreatingId(null)
    if (error) { Alert.alert('Error', error.message); return }
    // Navigate back — home screen will refresh and show the new talk
    router.back()
  }

  async function handleArchive(talk: LibraryTalk) {
    Alert.alert(
      'Archive Library Talk',
      `Archive "${talk.title}" from the library? It will no longer appear for new talks.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('toolbox_talk_library')
              .update({ is_archived: true })
              .eq('id', talk.id)
            if (error) { Alert.alert('Error', error.message); return }
            fetchTalks()
          },
        },
      ]
    )
  }

  return (
    <ScreenWrapper edges={['bottom']}>
      {isLoading ? (
        <ActivityIndicator style={styles.loadingSpinner} color={Colors.primary} />
      ) : (
        <FlatList
          data={talks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              title="Library is empty"
              message="Upload a file from the Toolbox Talk screen to populate the library."
              icon="📚"
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
                {item.creator?.full_name ?? '—'} · {formatDate(item.created_at)}
              </Text>
              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={[styles.useBtn, creatingId === item.id && styles.useBtnDisabled]}
                  onPress={() => handleUseTalk(item)}
                  disabled={creatingId !== null}
                  activeOpacity={0.8}
                >
                  {creatingId === item.id
                    ? <ActivityIndicator color={Colors.textInverse} size="small" />
                    : <Text style={styles.useBtnText}>Use This Talk</Text>
                  }
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleArchive(item)} activeOpacity={0.8}>
                  <Text style={styles.archiveText}>Archive</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  loadingSpinner: { marginTop: Spacing.xl },
  list: { padding: Spacing.md, paddingBottom: Spacing.xxl },
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
  typeBadgeTxt: { backgroundColor: Colors.success + '20' },
  typeBadgeLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary },
  cardMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: Spacing.sm },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  useBtn: {
    flex: 1,
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.xs,
    alignItems: 'center',
    minHeight: 32,
    justifyContent: 'center',
  },
  useBtnDisabled: { opacity: 0.5 },
  useBtnText: { color: Colors.textInverse, fontWeight: '700', fontSize: FontSize.sm },
  archiveText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.danger },
})
