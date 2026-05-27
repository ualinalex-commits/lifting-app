import { useState, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Linking, Alert, Platform,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { Breadcrumb } from '@/components/breadcrumb'
import { Colors, Spacing, FontSize, BorderRadius, Shadow } from '@/constants/theme'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

interface ArchivedBriefingRaw {
  id: string
  briefing_date: string
  archive_pdf_url: string | null
  archived_at: string | null
  site: { name: string } | null
  daily_briefing_signatures: { id: string }[]
}

interface ArchivedBriefing {
  id: string
  briefing_date: string
  archive_pdf_url: string | null
  archived_at: string | null
  site_name: string
  sig_count: number
  title: string
}

function formatBriefingTitle(siteName: string, briefingDate: string): string {
  const dateObj = new Date(briefingDate + 'T00:00:00Z')
  const dayOfWeek = dateObj.toLocaleDateString('en-GB', { weekday: 'long' })
  const dateFormatted = dateObj.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
  return `Daily Briefing — ${siteName} — ${dayOfWeek} — ${dateFormatted}`
}

function formatArchivedTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

export default function DailyBriefingArchiveScreen() {
  const { profile, role } = useAuth()
  const [briefings, setBriefings] = useState<ArchivedBriefing[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const canManage = role === 'appointed_person' || role === 'crane_supervisor'

  const fetchArchive = useCallback(async () => {
    if (!profile?.site_id) return
    setIsLoading(true)
    setFetchError(null)

    const { data, error } = await supabase
      .from('daily_briefings')
      .select(`
        id, briefing_date, archive_pdf_url, archived_at,
        site:sites(name),
        daily_briefing_signatures(id)
      `)
      .eq('site_id', profile.site_id)
      .eq('status', 'archived')
      .not('archive_pdf_url', 'is', null)
      .order('briefing_date', { ascending: false })

    if (error) {
      setFetchError(error.message)
      setIsLoading(false)
      return
    }

    const raw = (data as unknown as ArchivedBriefingRaw[]) ?? []
    setBriefings(
      raw.map((b) => {
        const siteName = b.site?.name ?? 'Unknown Site'
        return {
          id: b.id,
          briefing_date: b.briefing_date,
          archive_pdf_url: b.archive_pdf_url,
          archived_at: b.archived_at,
          site_name: siteName,
          sig_count: b.daily_briefing_signatures?.length ?? 0,
          title: formatBriefingTitle(siteName, b.briefing_date),
        }
      })
    )
    setIsLoading(false)
  }, [profile?.site_id])

  useFocusEffect(useCallback(() => { fetchArchive() }, [fetchArchive]))

  async function handleViewPdf(briefing: ArchivedBriefing) {
    if (!briefing.archive_pdf_url) {
      Alert.alert('Not available', 'PDF not generated yet.')
      return
    }

    const { data, error } = await supabase.storage
      .from('daily-briefing-archive')
      .createSignedUrl(briefing.archive_pdf_url, 3600)

    if (error || !data?.signedUrl) {
      Alert.alert('Error', `Could not load PDF: ${error?.message ?? 'unknown'}`)
      return
    }

    if (Platform.OS === 'web') {
      window.open(data.signedUrl, '_blank')
    } else {
      Linking.openURL(data.signedUrl)
    }
  }

  async function handleDelete(briefing: ArchivedBriefing) {
    const confirmed = Platform.OS === 'web'
      ? window.confirm(`Delete "${briefing.title}" from the archive? This cannot be undone.`)
      : await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Delete from Archive',
            `Delete "${briefing.title}" from the archive?`,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
            ],
          )
        })

    if (!confirmed) return

    const { error } = await supabase
      .from('daily_briefings')
      .update({ status: 'deleted' })
      .eq('id', briefing.id)

    if (error) {
      Alert.alert('Delete failed', error.message)
      return
    }

    fetchArchive()
  }

  return (
    <ScreenWrapper edges={['bottom']}>
      <Breadcrumb items={[
        { label: 'Dashboard', href: '/(appointed-person)/' },
        { label: 'Daily Briefing', href: '/(appointed-person)/daily-briefing/' },
        { label: 'Archive' },
      ]} />

      {fetchError ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{fetchError}</Text>
        </View>
      ) : isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={briefings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🗂</Text>
              <Text style={styles.emptyTitle}>No archived briefings yet</Text>
              <Text style={styles.emptyMsg}>
                Briefings appear here after they are generated by the appointed person or crane supervisor, or auto-archived at 18:00.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.cardMeta}>
                {item.sig_count} {item.sig_count === 1 ? 'signature' : 'signatures'}
                {item.archived_at ? ` · Archived at ${formatArchivedTime(item.archived_at)}` : ''}
              </Text>
              <View style={styles.cardActions}>
                {item.archive_pdf_url ? (
                  <TouchableOpacity
                    style={styles.viewBtn}
                    onPress={() => handleViewPdf(item)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.viewBtnText}>View PDF →</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.noPdfText}>PDF not available</Text>
                )}
                {canManage && (
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => handleDelete(item)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.deleteBtnText}>Delete</Text>
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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: {
    fontSize: FontSize.sm,
    color: Colors.danger,
    textAlign: 'center',
    padding: Spacing.md,
  },
  list: { padding: Spacing.md, paddingBottom: 100, flexGrow: 1 },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.sm,
    marginTop: Spacing.xxl,
  },
  emptyIcon: { fontSize: 48, marginBottom: Spacing.sm },
  emptyTitle: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
  },
  emptyMsg: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadow.sm,
  },
  cardTitle: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  cardMeta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginBottom: Spacing.sm,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  viewBtn: { alignSelf: 'flex-start' },
  viewBtnText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '600' },
  noPdfText: { fontSize: FontSize.xs, color: Colors.textMuted },
  deleteBtn: { paddingHorizontal: Spacing.sm, paddingVertical: 4 },
  deleteBtnText: { fontSize: FontSize.xs, color: Colors.danger, fontWeight: '600' },
})
