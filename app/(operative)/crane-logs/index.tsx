import { useState, useMemo } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { StatusBadge, OpenClosedBadge } from '@/components/status-badge'
import { EmptyState } from '@/components/empty-state'
import { Colors, Spacing, FontSize, BorderRadius, Shadow } from '@/constants/theme'
import { useAuth } from '@/lib/auth'

type LogStatus = 'working' | 'service' | 'thorough_examination' | 'winded_off' | 'breaking_down'

const MOCK_LOGS = [
  { id: 'l1', craneId: 'TC-01', status: 'working' as LogStatus, subcontractor: 'Apex Lifting Ltd', jobDescription: 'Steel frame erection Level 12', startTime: new Date('2026-05-09T07:30:00'), openedBy: 'Gary Lewis' },
  { id: 'l3', craneId: 'TC-01', status: 'winded_off' as LogStatus, jobDescription: 'Wind speed exceeded 45mph', startTime: new Date('2026-05-08T13:00:00'), endTime: new Date('2026-05-08T16:00:00'), openedBy: 'Gary Lewis' },
]

function formatDate(d: Date) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
function formatTime(d: Date) {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}
function formatDuration(start: Date, end: Date) {
  const mins = Math.round((end.getTime() - start.getTime()) / 60000)
  const h = Math.floor(mins / 60), m = mins % 60
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`
}

export default function OperativeCraneLogsList() {
  const router = useRouter()
  const { role } = useAuth()
  const canOpenLog = role === 'crane_supervisor'
  const [openFilter, setOpenFilter] = useState<'all' | 'open' | 'closed'>('all')

  const filtered = useMemo(() =>
    MOCK_LOGS.filter((log) => {
      const isOpen = !(log as any).endTime
      if (openFilter === 'open' && !isOpen) return false
      if (openFilter === 'closed' && isOpen) return false
      return true
    }), [openFilter])

  return (
    <ScreenWrapper edges={['bottom']}>
      <View style={styles.filterSection}>
        <View style={styles.filterRow}>
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
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, canOpenLog && { paddingBottom: 100 }]}
        ListEmptyComponent={<EmptyState title="No logs found" icon="📋" />}
        renderItem={({ item }) => {
          const isOpen = !(item as any).endTime
          return (
            <TouchableOpacity
              style={styles.logCard}
              onPress={() => router.push(`/(operative)/crane-logs/${item.id}`)}
              activeOpacity={0.8}
            >
              <View style={styles.logCardTop}>
                <Text style={styles.craneId}>{item.craneId}</Text>
                <View style={styles.badges}>
                  <OpenClosedBadge isOpen={isOpen} />
                  <StatusBadge status={item.status} size="sm" />
                </View>
              </View>
              <Text style={styles.jobDesc} numberOfLines={1}>{item.jobDescription}</Text>
              <View style={styles.logCardBottom}>
                <Text style={styles.timeText}>{formatDate(item.startTime)} · {formatTime(item.startTime)}</Text>
                {(item as any).endTime
                  ? <Text style={styles.durationText}>⏱ {formatDuration(item.startTime, (item as any).endTime)}</Text>
                  : <Text style={styles.openText}>In progress</Text>}
              </View>
            </TouchableOpacity>
          )
        }}
      />

      {canOpenLog && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => router.push('/(operative)/crane-logs/open')}
          activeOpacity={0.85}
        >
          <Text style={styles.fabText}>+ Open Log</Text>
        </TouchableOpacity>
      )}
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  filterSection: { backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  filterRow: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: Spacing.xs, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  filterChip: { paddingHorizontal: Spacing.sm, paddingVertical: 5, borderRadius: BorderRadius.full, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textSecondary },
  filterChipTextActive: { color: Colors.textInverse },
  list: { padding: Spacing.md, paddingBottom: Spacing.xl },
  logCard: { backgroundColor: Colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm, ...Shadow.sm },
  logCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  craneId: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text, letterSpacing: 0.5 },
  badges: { flexDirection: 'row', gap: Spacing.xs },
  jobDesc: { fontSize: FontSize.sm, color: Colors.text, marginBottom: 4 },
  logCardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: Spacing.xs, borderTopWidth: 1, borderTopColor: Colors.divider },
  timeText: { fontSize: FontSize.xs, color: Colors.textMuted },
  durationText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textSecondary },
  openText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.success },
  fab: { position: 'absolute', bottom: Spacing.xl, right: Spacing.md, left: Spacing.md, backgroundColor: Colors.accent, borderRadius: BorderRadius.md, paddingVertical: Spacing.md, alignItems: 'center', ...Shadow.md },
  fabText: { color: Colors.textInverse, fontSize: FontSize.base, fontWeight: '700' },
})
