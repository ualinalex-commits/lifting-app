import { useState, useMemo, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { StatusBadge, OpenClosedBadge } from '@/components/status-badge'
import { EmptyState } from '@/components/empty-state'
import { Colors, Spacing, FontSize, BorderRadius, Shadow } from '@/constants/theme'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

type LogStatus = 'working' | 'service' | 'thorough_examination' | 'winded_off' | 'breaking_down'

interface CraneLog {
  id: string
  crane: { id: string; crane_ref: string } | null
  status: LogStatus
  subcontractor: { id: string; name: string } | null
  job_description: string
  start_time: string
  end_time: string | null
  is_closed: boolean
  duration_seconds: number | null
  opener: { id: string; full_name: string } | null
}

const ALL_STATUSES: LogStatus[] = ['working', 'service', 'thorough_examination', 'winded_off', 'breaking_down']
const STATUS_LABELS: Record<LogStatus, string> = {
  working: 'Working',
  service: 'Service',
  thorough_examination: 'Thorough Exam',
  winded_off: 'Winded Off',
  breaking_down: 'Breaking Down',
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function formatDurationFromStrings(start: string, end: string) {
  const seconds = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000)
  return formatDuration(seconds)
}

export default function CraneLogsList() {
  const router = useRouter()
  const { profile } = useAuth()
  const [logs, setLogs] = useState<CraneLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<LogStatus | 'all'>('all')
  const [openFilter, setOpenFilter] = useState<'all' | 'open' | 'closed'>('all')

  useFocusEffect(
    useCallback(() => {
      if (!profile?.site_id) return
      setIsLoading(true)
      supabase
        .from('crane_logs')
        .select(`
          id, status, job_description, start_time, end_time, is_closed, duration_seconds,
          crane:cranes(id, crane_ref),
          subcontractor:subcontractors(id, name),
          opener:profiles!opened_by(id, full_name)
        `)
        .eq('site_id', profile.site_id)
        .order('start_time', { ascending: false })
        .then(({ data }) => {
          setLogs((data as CraneLog[]) ?? [])
          setIsLoading(false)
        })
    }, [profile?.site_id])
  )

  const filtered = useMemo(() => {
    return logs.filter((log) => {
      if (openFilter === 'open' && log.is_closed) return false
      if (openFilter === 'closed' && !log.is_closed) return false
      if (statusFilter !== 'all' && log.status !== statusFilter) return false
      return true
    })
  }, [logs, statusFilter, openFilter])

  return (
    <ScreenWrapper edges={['bottom']}>
      <View style={styles.filterSection}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {(['all', 'open', 'closed'] as const).map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterChip, openFilter === f && styles.filterChipActive]}
              onPress={() => setOpenFilter(f)}
            >
              <Text style={[styles.filterChipText, openFilter === f && styles.filterChipTextActive]}>
                {f === 'all' ? 'All' : f === 'open' ? 'Open' : 'Closed'}
              </Text>
            </TouchableOpacity>
          ))}
          <View style={styles.filterDivider} />
          {(['all', ...ALL_STATUSES] as const).map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.filterChip, statusFilter === s && styles.filterChipActive]}
              onPress={() => setStatusFilter(s)}
            >
              <Text style={[styles.filterChipText, statusFilter === s && styles.filterChipTextActive]}>
                {s === 'all' ? 'All statuses' : STATUS_LABELS[s]}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
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
          ListEmptyComponent={<EmptyState title="No logs found" message="Try adjusting your filters or open a new log." icon="📋" />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.logCard}
              onPress={() => router.push(`/(appointed-person)/crane-logs/${item.id}`)}
              activeOpacity={0.8}
            >
              <View style={styles.logCardTop}>
                <Text style={styles.craneId}>{item.crane?.crane_ref ?? '—'}</Text>
                <View style={styles.badges}>
                  <OpenClosedBadge isOpen={!item.is_closed} />
                  <StatusBadge status={item.status} size="sm" />
                </View>
              </View>
              <Text style={styles.jobDesc} numberOfLines={1}>{item.job_description}</Text>
              {item.subcontractor ? (
                <Text style={styles.subcontractor}>{item.subcontractor.name}</Text>
              ) : null}
              <View style={styles.logCardBottom}>
                <Text style={styles.timeText}>
                  {formatDate(item.start_time)} · Started {formatTime(item.start_time)}
                </Text>
                {item.is_closed ? (
                  <Text style={styles.durationText}>
                    ⏱ {item.duration_seconds != null
                      ? formatDuration(item.duration_seconds)
                      : item.end_time
                        ? formatDurationFromStrings(item.start_time, item.end_time)
                        : '—'}
                  </Text>
                ) : (
                  <Text style={styles.openText}>In progress</Text>
                )}
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/(appointed-person)/crane-logs/open')}
        activeOpacity={0.85}
      >
        <Text style={styles.fabText}>+ Open Log</Text>
      </TouchableOpacity>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  filterSection: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  filterRow: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  filterChipTextActive: {
    color: Colors.textInverse,
  },
  filterDivider: {
    width: 1,
    height: 20,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.xs,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    padding: Spacing.md,
    paddingBottom: 100,
  },
  logCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadow.sm,
  },
  logCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  craneId: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: 0.5,
  },
  badges: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  jobDesc: {
    fontSize: FontSize.sm,
    color: Colors.text,
    marginBottom: 2,
  },
  subcontractor: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  logCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.xs,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  timeText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  durationText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  openText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.success,
  },
  fab: {
    position: 'absolute',
    bottom: Spacing.xl,
    right: Spacing.md,
    left: Spacing.md,
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    ...Shadow.md,
  },
  fabText: {
    color: Colors.textInverse,
    fontSize: FontSize.base,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
})
