import { useState, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { EmptyState } from '@/components/empty-state'
import { Colors, Spacing, FontSize, BorderRadius, Shadow } from '@/constants/theme'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

interface ToolboxTalk {
  id: string
  title: string
  content_type: 'text' | 'pdf'
  is_archived: boolean
  archived_at: string | null
  created_at: string
  creator: { full_name: string } | null
  reads: { user_id: string }[]
  signatures: { user_id: string }[]
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function ToolboxTalkScreen() {
  const router = useRouter()
  const { profile, role } = useAuth()
  const [talks, setTalks] = useState<ToolboxTalk[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [tab, setTab] = useState<'active' | 'archive'>('active')

  const canCreate = role === 'appointed_person' || role === 'crane_supervisor'

  useFocusEffect(
    useCallback(() => {
      if (!profile?.site_id) return
      setIsLoading(true)
      supabase
        .from('toolbox_talks')
        .select(`
          id, title, content_type, is_archived, archived_at, created_at,
          creator:profiles!created_by(full_name),
          reads:toolbox_talk_reads(user_id),
          signatures:toolbox_talk_signatures(user_id)
        `)
        .eq('site_id', profile.site_id)
        .order('created_at', { ascending: false })
        .then(({ data }) => {
          setTalks((data as ToolboxTalk[]) ?? [])
          setIsLoading(false)
        })
    }, [profile?.site_id])
  )

  const filtered = talks.filter((t) =>
    tab === 'active' ? !t.is_archived : t.is_archived
  )

  return (
    <ScreenWrapper edges={['bottom']}>
      {/* Tab row */}
      <View style={styles.tabRow}>
        {(['active', 'archive'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'active' ? 'Active' : 'Archive'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            canCreate && tab === 'active' ? (
              <View style={styles.headerBtns}>
                <TouchableOpacity
                  style={styles.newBtn}
                  onPress={() => router.push('/(appointed-person)/toolbox-talk/new' as any)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.newBtnText}>+ New Toolbox Talk</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.libraryBtn}
                  onPress={() => router.push('/(appointed-person)/toolbox-talk/library' as any)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.libraryBtnText}>Library</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              title={tab === 'active' ? 'No active talks' : 'No archived talks'}
              message={
                tab === 'active'
                  ? 'Create a new toolbox talk to get started.'
                  : 'Archived talks appear here after sign-off is generated.'
              }
              icon="🔧"
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push(`/(appointed-person)/toolbox-talk/${item.id}` as any)}
              activeOpacity={0.8}
            >
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
                <View style={[
                  styles.typeBadge,
                  item.content_type === 'pdf' ? styles.typeBadgePdf : styles.typeBadgeText,
                ]}>
                  <Text style={styles.typeBadgeText2}>
                    {item.content_type === 'pdf' ? 'PDF' : 'Text'}
                  </Text>
                </View>
              </View>
              <Text style={styles.cardMeta}>
                {item.creator?.full_name ?? '—'} · {formatDate(item.created_at)}
              </Text>
              <View style={styles.cardFooter}>
                <Text style={styles.countText}>
                  {item.reads?.length ?? 0} read · {item.signatures?.length ?? 0} signed
                </Text>
                {item.is_archived && (
                  <Text style={styles.archivedText}>Archived</Text>
                )}
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  tabRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: Colors.primary,
  },
  tabText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: Colors.primary,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    padding: Spacing.md,
    paddingBottom: 100,
    flexGrow: 1,
  },
  headerBtns: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  newBtn: {
    flex: 1,
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    ...Shadow.sm,
  },
  newBtnText: {
    color: Colors.textInverse,
    fontWeight: '700',
    fontSize: FontSize.sm,
  },
  libraryBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  libraryBtnText: {
    color: Colors.textSecondary,
    fontWeight: '600',
    fontSize: FontSize.sm,
  },
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
  cardTitle: {
    flex: 1,
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.text,
  },
  typeBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  typeBadgePdf: {
    backgroundColor: Colors.info + '20',
  },
  typeBadgeText: {
    backgroundColor: Colors.success + '20',
  },
  typeBadgeText2: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  cardMeta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginBottom: Spacing.xs,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.xs,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  countText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  archivedText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textMuted,
  },
})
