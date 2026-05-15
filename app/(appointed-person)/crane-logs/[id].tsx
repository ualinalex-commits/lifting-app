import { useState, useEffect, useCallback } from 'react'
import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { StatusBadge, OpenClosedBadge } from '@/components/status-badge'
import { EmptyState } from '@/components/empty-state'
import { Colors, Spacing, FontSize, BorderRadius, Shadow } from '@/constants/theme'
import { supabase } from '@/lib/supabase'

const STATUS_LABELS: Record<string, string> = {
  working: 'Working',
  service: 'Service',
  thorough_examination: 'Thorough Examination',
  winded_off: 'Winded Off',
  breaking_down: 'Breaking Down',
}

interface CraneLog {
  id: string
  status: string
  job_description: string
  start_time: string
  end_time: string | null
  is_closed: boolean
  duration_seconds: number | null
  crane: { id: string; crane_ref: string } | null
  subcontractor: { id: string; name: string } | null
  opener: { id: string; full_name: string } | null
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatDurationSeconds(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m} minutes`
  return m === 0 ? `${h} hour${h !== 1 ? 's' : ''}` : `${h}h ${m}m`
}

function formatDurationFromStrings(start: string, end: string) {
  const seconds = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000)
  return formatDurationSeconds(seconds)
}

export default function CraneLogDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const [log, setLog] = useState<CraneLog | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isClosing, setIsClosing] = useState(false)

  const fetchLog = useCallback(async () => {
    setIsLoading(true)
    const { data } = await supabase
      .from('crane_logs')
      .select(`
        id, status, job_description, start_time, end_time, is_closed, duration_seconds,
        crane:cranes(id, crane_ref),
        subcontractor:subcontractors(id, name),
        opener:profiles!opened_by(id, full_name)
      `)
      .eq('id', id)
      .single()
    setLog(data as CraneLog | null)
    setIsLoading(false)
  }, [id])

  useEffect(() => {
    fetchLog()
  }, [fetchLog])

  async function handleCloseLog() {
    console.log('Close Log pressed')
    if (!log) return

    const performClose = async () => {
      setIsClosing(true)
      const now = new Date().toISOString()
      console.log('[CloseLog] Sending update for log id:', id, 'end_time:', now)
      const { data, error, status, statusText } = await supabase
        .from('crane_logs')
        .update({ is_closed: true, end_time: now })
        .eq('id', id)
        .select('id, is_closed, end_time')
      console.log('[CloseLog] Response — status:', status, 'statusText:', statusText)
      console.log('[CloseLog] Response — data:', JSON.stringify(data))
      console.log('[CloseLog] Response — error:', JSON.stringify(error))
      setIsClosing(false)
      if (error) {
        console.error('[CloseLog] Supabase error full object:', error)
        Alert.alert('Error closing log', `${error.message}\n\nCode: ${error.code ?? 'none'}`)
        return
      }
      if (!data || data.length === 0) {
        console.warn('[CloseLog] Update succeeded but 0 rows affected — likely an RLS policy is blocking UPDATE for this user role/site.')
        Alert.alert(
          'Permission error',
          'The log could not be closed. You may not have permission to update this log.\n\nRun this in Supabase SQL editor to check:\nSELECT policyname, cmd FROM pg_policies WHERE tablename = \'crane_logs\';'
        )
        return
      }
      console.log('[CloseLog] Success — log closed:', data[0])
      await fetchLog()
    }

    if (typeof window !== 'undefined') {
      // Web: Alert.alert renders nothing — use window.confirm instead
      const ok = window.confirm(
        `Close this log for crane ${log.crane?.crane_ref ?? ''}? The end time will be recorded automatically.`
      )
      if (ok) await performClose()
    } else {
      Alert.alert(
        'Close Log',
        `Close this log for crane ${log.crane?.crane_ref ?? ''}? The end time will be recorded automatically.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Close Log', style: 'destructive', onPress: performClose },
        ]
      )
    }
  }

  if (isLoading) {
    return (
      <ScreenWrapper edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </ScreenWrapper>
    )
  }

  if (!log) {
    return (
      <ScreenWrapper edges={['bottom']}>
        <EmptyState title="Log not found" message="This crane log could not be found." icon="📋" />
      </ScreenWrapper>
    )
  }

  const isOpen = !log.is_closed

  function getDurationLabel() {
    if (log!.duration_seconds != null) return formatDurationSeconds(log!.duration_seconds)
    if (log!.is_closed && log!.end_time) return formatDurationFromStrings(log!.start_time, log!.end_time)
    return 'In progress'
  }

  return (
    <ScreenWrapper edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.statusHeader}>
          <View style={styles.statusLeft}>
            <Text style={styles.craneId}>{log.crane?.crane_ref ?? '—'}</Text>
            <View style={styles.badgeRow}>
              <OpenClosedBadge isOpen={isOpen} />
              <StatusBadge status={log.status} />
            </View>
          </View>
          {isOpen && (
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>Live</Text>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <DetailRow label="Status" value={STATUS_LABELS[log.status] ?? log.status} />
          {log.subcontractor ? <DetailRow label="Subcontractor" value={log.subcontractor.name} /> : null}
          <DetailRow label="Opened by" value={log.opener?.full_name ?? '—'} />
          <DetailRow label="Start time" value={formatDateTime(log.start_time)} />
          {log.is_closed && log.end_time ? (
            <>
              <DetailRow label="End time" value={formatDateTime(log.end_time)} />
              <DetailRow label="Duration" value={getDurationLabel()} highlight />
            </>
          ) : (
            <DetailRow label="Duration" value="In progress" highlight />
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Job Description</Text>
          <Text style={styles.jobDesc}>{log.job_description}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Photos</Text>
          <Text style={styles.noPhotos}>No photos attached</Text>
          {isOpen && (
            <TouchableOpacity style={styles.addPhotoBtn}>
              <Text style={styles.addPhotoText}>+ Add Photo</Text>
            </TouchableOpacity>
          )}
        </View>

        {isOpen && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => router.push(`/(appointed-person)/crane-logs/${id}/edit`)}
              activeOpacity={0.8}
            >
              <Text style={styles.editBtnText}>Edit Log</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.closeBtn, isClosing && styles.closeBtnDisabled]}
              onPress={handleCloseLog}
              disabled={isClosing}
              activeOpacity={0.8}
            >
              <Text style={styles.closeBtnText}>{isClosing ? 'Closing…' : 'Close Log'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </ScreenWrapper>
  )
}

function DetailRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={detailStyles.row}>
      <Text style={detailStyles.label}>{label}</Text>
      <Text style={[detailStyles.value, highlight && detailStyles.valueHighlight]}>{value}</Text>
    </View>
  )
}

const detailStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  label: {
    width: 110,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  value: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: '500',
  },
  valueHighlight: {
    fontWeight: '700',
    color: Colors.primary,
  },
})

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    paddingBottom: Spacing.xxl,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadow.sm,
  },
  statusLeft: {
    gap: Spacing.sm,
  },
  craneId: {
    fontSize: FontSize.xxl,
    fontWeight: '900',
    color: Colors.text,
    letterSpacing: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.success + '15',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  liveText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.success,
  },
  card: {
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    ...Shadow.sm,
  },
  fieldLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
  },
  jobDesc: {
    fontSize: FontSize.sm,
    color: Colors.text,
    lineHeight: 20,
  },
  noPhotos: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginBottom: Spacing.sm,
  },
  addPhotoBtn: {
    borderWidth: 1.5,
    borderColor: Colors.accent,
    borderStyle: 'dashed',
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  addPhotoText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.accent,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.sm,
  },
  editBtn: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.primary,
    ...Shadow.sm,
  },
  editBtnText: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.primary,
  },
  closeBtn: {
    flex: 1,
    backgroundColor: Colors.danger,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    ...Shadow.sm,
  },
  closeBtnDisabled: {
    opacity: 0.6,
  },
  closeBtnText: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.textInverse,
  },
})
