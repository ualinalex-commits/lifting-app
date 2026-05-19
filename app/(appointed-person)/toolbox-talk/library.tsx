import { useState, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, Platform,
} from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { EmptyState } from '@/components/empty-state'
import { Breadcrumb } from '@/components/breadcrumb'
import { Colors, Spacing, FontSize, BorderRadius, Shadow } from '@/constants/theme'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

type ContentType = 'pdf' | 'docx' | 'text'

interface LibraryTalk {
  id: string
  title: string
  content_type: ContentType
  content_text: string | null
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
  const { profile, role } = useAuth()
  const canManage = role === 'appointed_person' || role === 'crane_supervisor'
  const [talks, setTalks] = useState<LibraryTalk[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [creatingId, setCreatingId] = useState<string | null>(null)

  const fetchTalks = useCallback(async () => {
    if (!profile?.company_id) {
      setFetchError('Your account is not linked to a company. Contact your administrator.')
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setFetchError(null)
    const { data, error } = await supabase
      .from('toolbox_talk_library')
      .select('id, title, content_type, content_text, pdf_url, is_archived, created_at, creator:profiles!created_by(full_name)')
      .eq('company_id', profile.company_id)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
    if (error) {
      setFetchError(error.message)
      setTalks([])
    } else {
      setTalks((data as unknown as LibraryTalk[]) ?? [])
    }
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
        content_text: libraryTalk.content_text,
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

  async function handleDelete(libraryTalkId: string) {
    const confirmed = Platform.OS === 'web'
      ? window.confirm('Delete this library talk? It will no longer appear in the library. Existing site talks that reference it will not be affected.')
      : await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Delete Library Talk',
            'It will no longer appear in the library. Existing site talks that reference it will not be affected.',
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
            ],
          )
        })

    if (!confirmed) return

    const { error } = await supabase
      .from('toolbox_talk_library')
      .update({ is_archived: true })
      .eq('id', libraryTalkId)

    if (error) {
      Alert.alert('Delete failed', error.message)
      return
    }

    fetchTalks()
  }

  return (
    <ScreenWrapper edges={['bottom']}>
      <Breadcrumb items={[
        { label: 'Dashboard', href: '/(appointed-person)/' },
        { label: 'Toolbox Talk', href: '/(appointed-person)/toolbox-talk/' },
        { label: 'Library' },
      ]} />
      {fetchError ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{fetchError}</Text>
        </View>
      ) : isLoading ? (
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
                {canManage && (
                  <TouchableOpacity onPress={() => handleDelete(item.id)} activeOpacity={0.8}>
                    <Text style={styles.archiveText}>Delete</Text>
                  </TouchableOpacity>
                )}
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
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  errorText: { fontSize: FontSize.sm, color: Colors.danger, textAlign: 'center', lineHeight: 20 },
})
