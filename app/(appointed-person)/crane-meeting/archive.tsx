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

interface ArchivedMeetingRaw {
  id: string
  meeting_date: string
  archive_pdf_url: string | null
  archived_at: string | null
  site: { name: string } | null
  crane_meeting_signatures: { id: string }[]
}

interface ArchivedMeeting {
  id: string
  meeting_date: string
  archive_pdf_url: string | null
  archived_at: string | null
  site_name: string
  sig_count: number
  title: string
}

function formatMeetingTitle(siteName: string, meetingDate: string): string {
  const dateObj = new Date(meetingDate + 'T00:00:00Z')
  const dayOfWeek = dateObj.toLocaleDateString('en-GB', { weekday: 'long' })
  const dateFormatted = dateObj.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
  // Plain hyphens — never em-dashes (Section 10.14 encoding rule)
  return `Crane Meeting - ${siteName} - ${dayOfWeek} - ${dateFormatted}`
}

function formatArchivedTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

export default function CraneMeetingArchive() {
  const { profile, role } = useAuth()
  const [meetings, setMeetings] = useState<ArchivedMeeting[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const canManage = role === 'appointed_person' || role === 'crane_supervisor'

  const fetchArchive = useCallback(async () => {
    if (!profile?.site_id) return
    setIsLoading(true)
    setFetchError(null)

    const { data, error } = await supabase
      .from('crane_meetings')
      .select(`
        id, meeting_date, archive_pdf_url, archived_at,
        site:sites(name),
        crane_meeting_signatures(id)
      `)
      .eq('site_id', profile.site_id)
      .eq('status', 'archived')
      .not('archive_pdf_url', 'is', null)
      .order('meeting_date', { ascending: false })

    if (error) {
      setFetchError(error.message)
      setIsLoading(false)
      return
    }

    const raw = (data as unknown as ArchivedMeetingRaw[]) ?? []
    setMeetings(
      raw.map((m) => {
        const siteName = m.site?.name ?? 'Unknown Site'
        return {
          id: m.id,
          meeting_date: m.meeting_date,
          archive_pdf_url: m.archive_pdf_url,
          archived_at: m.archived_at,
          site_name: siteName,
          sig_count: m.crane_meeting_signatures?.length ?? 0,
          title: formatMeetingTitle(siteName, m.meeting_date),
        }
      })
    )
    setIsLoading(false)
  }, [profile?.site_id])

  useFocusEffect(useCallback(() => { fetchArchive() }, [fetchArchive]))

  async function handleViewPdf(meeting: ArchivedMeeting) {
    if (!meeting.archive_pdf_url) {
      Alert.alert('Not available', 'PDF not generated yet.')
      return
    }

    const { data, error } = await supabase.storage
      .from('crane-meeting-archive')
      .createSignedUrl(meeting.archive_pdf_url, 3600)

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

  async function handleDelete(meeting: ArchivedMeeting) {
    const confirmed = Platform.OS === 'web'
      ? window.confirm(`Delete "${meeting.title}" from the archive? This cannot be undone.`)
      : await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Delete from Archive',
            `Delete "${meeting.title}" from the archive?`,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
            ],
          )
        })

    if (!confirmed) return

    const { error } = await supabase
      .from('crane_meetings')
      .update({ status: 'deleted' })
      .eq('id', meeting.id)

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
        { label: 'Supervisor Checks', href: '/(appointed-person)/supervisor-checks' },
        { label: 'Crane Meeting', href: '/(appointed-person)/crane-meeting/' },
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
          data={meetings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🗂</Text>
              <Text style={styles.emptyTitle}>No archived crane meetings yet</Text>
              <Text style={styles.emptyMsg}>
                Meetings appear here after the appointed person or crane supervisor generates the archive PDF, or after auto-archive at 19:59 Friday.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.cardMeta}>
                {item.sig_count} {item.sig_count === 1 ? 'signature' : 'signatures'}
                {item.archived_at ? ` · Archived ${formatArchivedTime(item.archived_at)}` : ''}
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
