import { useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { StatusBadge, OpenClosedBadge } from '@/components/status-badge'
import { Colors, Spacing, FontSize, BorderRadius, Shadow } from '@/constants/theme'
import { useAuth } from '@/lib/auth'

const STATUS_LABELS: Record<string, string> = {
  working: 'Working', service: 'Service',
  thorough_examination: 'Thorough Examination',
  winded_off: 'Winded Off', breaking_down: 'Breaking Down',
}

const MOCK_LOG = {
  id: 'l1', craneId: 'TC-01', status: 'working',
  subcontractor: 'Apex Lifting Ltd',
  jobDescription: 'Steel frame erection Level 12 — installing primary beams on the north elevation.',
  startTime: new Date('2026-05-09T07:30:00'),
  endTime: null as Date | null,
  openedBy: 'Gary Lewis',
}

function formatDateTime(d: Date) {
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function formatDuration(s: Date, e: Date) {
  const mins = Math.round((e.getTime() - s.getTime()) / 60000)
  const h = Math.floor(mins / 60), m = mins % 60
  return h === 0 ? `${m} minutes` : m === 0 ? `${h}h` : `${h}h ${m}m`
}

export default function OperativeCraneLogDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { role } = useAuth()
  const router = useRouter()
  const [log] = useState(MOCK_LOG)
  const isOpen = !log.endTime
  const canClose = role === 'crane_supervisor' || role === 'appointed_person'

  function handleClose() {
    Alert.alert('Close Log', `Close this log for crane ${log.craneId}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Close Log', onPress: () => { /* TODO: Supabase update */ } },
    ])
  }

  return (
    <ScreenWrapper edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.statusHeader}>
          <View style={styles.statusLeft}>
            <Text style={styles.craneId}>{log.craneId}</Text>
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
          {[
            ['Status', STATUS_LABELS[log.status] ?? log.status],
            ...(log.subcontractor ? [['Subcontractor', log.subcontractor]] : []),
            ['Opened by', log.openedBy],
            ['Start time', formatDateTime(log.startTime)],
            ...(log.endTime ? [['End time', formatDateTime(log.endTime)], ['Duration', formatDuration(log.startTime, log.endTime)]] : [['Duration', 'In progress']]),
          ].map(([label, value]) => (
            <View key={label} style={styles.row}>
              <Text style={styles.rowLabel}>{label}</Text>
              <Text style={styles.rowValue}>{value}</Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Job Description</Text>
          <Text style={styles.jobDesc}>{log.jobDescription}</Text>
        </View>

        {isOpen && canClose && (
          <TouchableOpacity style={styles.closeBtn} onPress={handleClose} activeOpacity={0.8}>
            <Text style={styles.closeBtnText}>Close Log</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: Spacing.xxl },
  statusHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', backgroundColor: Colors.surface, padding: Spacing.md, marginBottom: Spacing.sm, ...Shadow.sm },
  statusLeft: { gap: Spacing.sm },
  craneId: { fontSize: FontSize.xxl, fontWeight: '900', color: Colors.text, letterSpacing: 1 },
  badgeRow: { flexDirection: 'row', gap: Spacing.sm },
  liveIndicator: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.success + '15', paddingHorizontal: Spacing.sm, paddingVertical: 5, borderRadius: BorderRadius.full },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success },
  liveText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.success },
  card: { backgroundColor: Colors.surface, marginHorizontal: Spacing.md, marginBottom: Spacing.sm, borderRadius: BorderRadius.md, padding: Spacing.md, ...Shadow.sm },
  row: { flexDirection: 'row', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  rowLabel: { width: 110, fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '500' },
  rowValue: { flex: 1, fontSize: FontSize.sm, color: Colors.text, fontWeight: '500' },
  fieldLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: Spacing.sm },
  jobDesc: { fontSize: FontSize.sm, color: Colors.text, lineHeight: 20 },
  closeBtn: { marginHorizontal: Spacing.md, backgroundColor: Colors.danger, borderRadius: BorderRadius.md, paddingVertical: Spacing.md, alignItems: 'center', ...Shadow.sm },
  closeBtnText: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textInverse },
})
