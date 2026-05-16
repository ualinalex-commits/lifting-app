import { useState, useMemo, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  ScrollView, StyleSheet, ActivityIndicator,
  useWindowDimensions,
} from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { EmptyState } from '@/components/empty-state'
import { Breadcrumb } from '@/components/breadcrumb'
import { Colors, Spacing, FontSize, BorderRadius, Shadow } from '@/constants/theme'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<LogStatus, string> = {
  working: 'Working',
  service: 'Service',
  thorough_examination: 'Thorough Exam',
  winded_off: 'Winded Off',
  breaking_down: 'Breaking Down',
}

const STATUS_COLORS: Record<LogStatus, string> = {
  working: Colors.logStatus.working,
  service: Colors.logStatus.service,
  thorough_examination: Colors.logStatus.thorough_examination,
  winded_off: Colors.logStatus.winded_off,
  breaking_down: Colors.logStatus.breaking_down,
}

const ALL_STATUSES: LogStatus[] = ['working', 'service', 'thorough_examination', 'winded_off', 'breaking_down']
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HOUR_MARKS = [0, 4, 8, 12, 16, 20, 24]
const LABEL_W = 76
const CHART_W = 540
const DESKTOP = 768

// ─── Utilities ───────────────────────────────────────────────────────────────

function getWeekStart() {
  const d = new Date()
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  d.setHours(0, 0, 0, 0)
  return d
}

function getTodayBounds() {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const end = new Date(); end.setHours(23, 59, 59, 999)
  return { start: start.getTime(), end: end.getTime() }
}

function logDurationSeconds(log: CraneLog): number {
  if (log.duration_seconds != null) return log.duration_seconds
  const s = new Date(log.start_time).getTime()
  const e = log.end_time ? new Date(log.end_time).getTime() : Date.now()
  return Math.max(0, Math.round((e - s) / 1000))
}

function fmtHours(secs: number): string {
  const h = secs / 3600
  return h < 0.1 ? `${Math.round(secs / 60)}m` : `${h.toFixed(1)}h`
}

function fmtDuration(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// ─── Root Screen ─────────────────────────────────────────────────────────────

export default function CraneLogsScreen() {
  const router = useRouter()
  const { profile } = useAuth()
  const { width } = useWindowDimensions()
  const isDesktop = width >= DESKTOP

  const [logs, setLogs] = useState<CraneLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [craneFilter, setCraneFilter] = useState('all')
  const [openFilter, setOpenFilter] = useState<'all' | 'open' | 'closed'>('all')
  const [rightTab, setRightTab] = useState<'analytics' | 'timeline'>('analytics')
  const [mobileView, setMobileView] = useState<'list' | 'stats'>('list')

  useFocusEffect(useCallback(() => {
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
      .then(({ data }) => { setLogs((data as unknown as CraneLog[]) ?? []); setIsLoading(false) })
  }, [profile?.site_id]))

  const cranes = useMemo(() => {
    const seen = new Map<string, string>()
    for (const l of logs) {
      if (l.crane && !seen.has(l.crane.id)) seen.set(l.crane.id, l.crane.crane_ref)
    }
    return [...seen.entries()].map(([id, crane_ref]) => ({ id, crane_ref }))
  }, [logs])

  const filtered = useMemo(() => logs.filter(l => {
    if (openFilter === 'open' && l.is_closed) return false
    if (openFilter === 'closed' && !l.is_closed) return false
    if (craneFilter !== 'all' && l.crane?.id !== craneFilter) return false
    return true
  }), [logs, openFilter, craneFilter])

  const openLog = () => router.push('/(appointed-person)/crane-logs/open')
  const goToLog = (id: string) => router.push(`/(appointed-person)/crane-logs/${id}`)

  const listProps = {
    logs: filtered, cranes, craneFilter, openFilter, isLoading,
    onCraneFilter: setCraneFilter, onOpenFilter: setOpenFilter,
    onLogPress: goToLog, onOpenLog: openLog,
  }

  const breadcrumb = (
    <Breadcrumb items={[
      { label: 'Dashboard', href: '/(appointed-person)/' },
      { label: 'Crane Logs' },
    ]} />
  )

  if (isDesktop) {
    return (
      <ScreenWrapper edges={['bottom']}>
        {breadcrumb}
        <View style={root.split}>
          <View style={root.left}><LogList {...listProps} /></View>
          <View style={root.right}><RightPanel logs={logs} tab={rightTab} onTab={setRightTab} /></View>
        </View>
      </ScreenWrapper>
    )
  }

  return (
    <ScreenWrapper edges={['bottom']}>
      {breadcrumb}
      <View style={root.mobileBar}>
        {mobileView === 'list' ? (
          <TouchableOpacity style={root.statsBtn} onPress={() => setMobileView('stats')} activeOpacity={0.85}>
            <Text style={root.statsBtnText}>📊  Stats</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => setMobileView('list')} activeOpacity={0.8}>
            <Text style={root.backBtn}>← Back to Logs</Text>
          </TouchableOpacity>
        )}
      </View>
      {mobileView === 'list'
        ? <LogList {...listProps} />
        : <RightPanel logs={logs} tab={rightTab} onTab={setRightTab} />
      }
    </ScreenWrapper>
  )
}

const root = StyleSheet.create({
  split: { flex: 1, flexDirection: 'row' },
  left: { width: '40%', borderRightWidth: 1, borderRightColor: Colors.border },
  right: { flex: 1 },
  mobileBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  statsBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
  },
  statsBtnText: { color: Colors.textInverse, fontSize: FontSize.sm, fontWeight: '700' },
  backBtn: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.primary },
})

// ─── Log List Panel ───────────────────────────────────────────────────────────

interface ListProps {
  logs: CraneLog[]
  cranes: { id: string; crane_ref: string }[]
  craneFilter: string
  openFilter: 'all' | 'open' | 'closed'
  isLoading: boolean
  onCraneFilter(id: string): void
  onOpenFilter(f: 'all' | 'open' | 'closed'): void
  onLogPress(id: string): void
  onOpenLog(): void
}

function LogList({ logs, cranes, craneFilter, openFilter, isLoading, onCraneFilter, onOpenFilter, onLogPress, onOpenLog }: ListProps) {
  return (
    <View style={{ flex: 1 }}>
      <View style={ll.header}>
        <TouchableOpacity style={ll.openBtn} onPress={onOpenLog} activeOpacity={0.85}>
          <Text style={ll.openBtnText}>+ Open Log</Text>
        </TouchableOpacity>
        <Text style={ll.count}>
          {logs.length} {logs.length === 1 ? 'log' : 'logs'}
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={ll.filterScroll}
        contentContainerStyle={ll.filterRow}
      >
        {(['all', 'open', 'closed'] as const).map(f => (
          <TouchableOpacity
            key={f}
            style={[ll.chip, openFilter === f && ll.chipOn]}
            onPress={() => onOpenFilter(f)}
          >
            <Text style={[ll.chipTxt, openFilter === f && ll.chipTxtOn]}>
              {f === 'all' ? 'All' : f === 'open' ? 'Open' : 'Closed'}
            </Text>
          </TouchableOpacity>
        ))}
        {cranes.length > 0 && <View style={ll.divider} />}
        {cranes.length > 0 && (
          <TouchableOpacity
            style={[ll.chip, craneFilter === 'all' && ll.chipOn]}
            onPress={() => onCraneFilter('all')}
          >
            <Text style={[ll.chipTxt, craneFilter === 'all' && ll.chipTxtOn]}>All cranes</Text>
          </TouchableOpacity>
        )}
        {cranes.map(c => (
          <TouchableOpacity
            key={c.id}
            style={[ll.chip, craneFilter === c.id && ll.chipOn]}
            onPress={() => onCraneFilter(c.id)}
          >
            <Text style={[ll.chipTxt, craneFilter === c.id && ll.chipTxtOn]}>{c.crane_ref}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={logs}
          keyExtractor={i => i.id}
          contentContainerStyle={ll.list}
          ListEmptyComponent={
            <EmptyState title="No logs" message="Adjust filters or open a new log." icon="📋" />
          }
          renderItem={({ item }) => <LogRow log={item} onPress={() => onLogPress(item.id)} />}
        />
      )}
    </View>
  )
}

const ll = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  openBtn: {
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
  },
  openBtnText: { color: Colors.textInverse, fontSize: FontSize.sm, fontWeight: '700' },
  count: { fontSize: FontSize.xs, color: Colors.textSecondary },
  filterScroll: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    flexGrow: 0,
  },
  filterRow: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipTxt: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },
  chipTxtOn: { color: Colors.textInverse },
  divider: { width: 1, height: 16, backgroundColor: Colors.border, marginHorizontal: 2 },
  list: { padding: Spacing.sm, paddingBottom: 80 },
})

// ─── Compact Log Row ──────────────────────────────────────────────────────────

function LogRow({ log, onPress }: { log: CraneLog; onPress(): void }) {
  const color = STATUS_COLORS[log.status] ?? Colors.textSecondary
  const dur = logDurationSeconds(log)

  return (
    <TouchableOpacity style={lr.row} onPress={onPress} activeOpacity={0.8}>
      <View style={[lr.stripe, { backgroundColor: color }]} />
      <View style={lr.body}>
        <View style={lr.top}>
          <Text style={lr.craneRef}>{log.crane?.crane_ref ?? '—'}</Text>
          <View style={lr.topRight}>
            {!log.is_closed && <View style={lr.liveDot} />}
            <Text style={[lr.statusText, { color }]}>{STATUS_LABELS[log.status]}</Text>
          </View>
        </View>
        <View style={lr.bottom}>
          <Text style={lr.meta} numberOfLines={1}>
            {[
              log.subcontractor?.name,
              `${fmtDate(log.start_time)} ${fmtTime(log.start_time)}`,
            ].filter(Boolean).join(' · ')}
          </Text>
          <Text style={[lr.dur, { color: log.is_closed ? Colors.textSecondary : Colors.success }]}>
            {log.is_closed ? fmtDuration(dur) : 'Live'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  )
}

const lr = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.sm,
    marginBottom: 4,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  stripe: { width: 4 },
  body: { flex: 1, paddingHorizontal: Spacing.sm, paddingVertical: 8 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  craneRef: { fontSize: FontSize.sm, fontWeight: '800', color: Colors.text, letterSpacing: 0.5 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.success },
  statusText: { fontSize: 11, fontWeight: '600' },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  meta: { flex: 1, fontSize: 11, color: Colors.textMuted, marginRight: 4 },
  dur: { fontSize: 11, fontWeight: '700' },
})

// ─── Right Panel ─────────────────────────────────────────────────────────────

function RightPanel({
  logs,
  tab,
  onTab,
}: {
  logs: CraneLog[]
  tab: 'analytics' | 'timeline'
  onTab(t: 'analytics' | 'timeline'): void
}) {
  return (
    <View style={{ flex: 1 }}>
      <View style={rp.tabBar}>
        {(['analytics', 'timeline'] as const).map(t => (
          <TouchableOpacity
            key={t}
            style={[rp.tab, tab === t && rp.tabActive]}
            onPress={() => onTab(t)}
          >
            <Text style={[rp.tabText, tab === t && rp.tabTextActive]}>
              {t === 'analytics' ? '📊  Analytics' : '📅  Timeline'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {tab === 'analytics' ? <AnalyticsPanel logs={logs} /> : <TimelinePanel logs={logs} />}
    </View>
  )
}

const rp = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: Spacing.md,
  },
  tab: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  tabActive: { borderBottomColor: Colors.primary },
  tabText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
  tabTextActive: { color: Colors.primary },
})

// ─── Analytics Panel ─────────────────────────────────────────────────────────

function AnalyticsPanel({ logs }: { logs: CraneLog[] }) {
  const now = Date.now()
  const { start: todayMs, end: todayEndMs } = getTodayBounds()
  const weekStartMs = getWeekStart().getTime()

  const weekLogs = useMemo(
    () => logs.filter(l => new Date(l.start_time).getTime() >= weekStartMs),
    [logs, weekStartMs],
  )

  const todaySeconds = useMemo(() => weekLogs.reduce((sum, l) => {
    const s = Math.max(new Date(l.start_time).getTime(), todayMs)
    const e = Math.min(l.end_time ? new Date(l.end_time).getTime() : now, todayEndMs)
    return sum + Math.max(0, (e - s) / 1000)
  }, 0), [weekLogs, todayMs, todayEndMs])

  const hoursPerCrane = useMemo(() => {
    const m = new Map<string, { ref: string; secs: number }>()
    for (const l of weekLogs) {
      const key = l.crane?.id ?? 'unknown'
      const cur = m.get(key) ?? { ref: l.crane?.crane_ref ?? '—', secs: 0 }
      cur.secs += logDurationSeconds(l)
      m.set(key, cur)
    }
    return [...m.values()].sort((a, b) => b.secs - a.secs)
  }, [weekLogs])

  const statusSecs = useMemo(() => {
    const m: Record<LogStatus, number> = {
      working: 0, service: 0, thorough_examination: 0, winded_off: 0, breaking_down: 0,
    }
    for (const l of weekLogs) m[l.status] = (m[l.status] ?? 0) + logDurationSeconds(l)
    return m
  }, [weekLogs])

  const hoursByDay = useMemo(() => {
    const arr: number[] = Array(7).fill(0)
    for (const l of weekLogs) {
      const di = (new Date(l.start_time).getDay() + 6) % 7
      arr[di] += logDurationSeconds(l)
    }
    return arr
  }, [weekLogs])

  const closedLogs = useMemo(() => logs.filter(l => l.is_closed && l.duration_seconds != null), [logs])
  const avgSecs = closedLogs.length > 0
    ? closedLogs.reduce((s, l) => s + l.duration_seconds!, 0) / closedLogs.length
    : 0

  const topCrane = hoursPerCrane[0]?.ref ?? '—'
  const maxSecs = hoursPerCrane[0]?.secs ?? 1
  const busiestIdx = hoursByDay.indexOf(Math.max(...hoursByDay))
  const busiestDay = hoursByDay[busiestIdx] > 0 ? DAYS[busiestIdx] : '—'
  const totalStatusSecs = Object.values(statusSecs).reduce((a, b) => a + b, 0)

  return (
    <ScrollView contentContainerStyle={an.scroll}>
      {/* Summary cards */}
      <View style={an.cards}>
        <SummaryCard label="Today" value={fmtHours(todaySeconds)} sub="total hours" />
        <SummaryCard label="Top Crane" value={topCrane} sub="this week" />
        <SummaryCard label="Avg Duration" value={fmtHours(avgSecs)} sub="per log" />
        <SummaryCard label="Busiest Day" value={busiestDay} sub="this week" />
      </View>

      {/* Hours per crane bar chart */}
      <View style={an.section}>
        <Text style={an.sectionTitle}>Hours per Crane — This Week</Text>
        {hoursPerCrane.length === 0 ? (
          <Text style={an.empty}>No activity this week</Text>
        ) : hoursPerCrane.map(item => (
          <View key={item.ref} style={an.barRow}>
            <Text style={an.barLabel} numberOfLines={1}>{item.ref}</Text>
            <View style={an.barTrack}>
              <View
                style={[an.barFill, { width: `${(item.secs / maxSecs) * 100}%` as any }]}
              />
            </View>
            <Text style={an.barVal}>{fmtHours(item.secs)}</Text>
          </View>
        ))}
      </View>

      {/* Status breakdown */}
      <View style={an.section}>
        <Text style={an.sectionTitle}>Status Breakdown — This Week</Text>
        {totalStatusSecs === 0 ? (
          <Text style={an.empty}>No activity this week</Text>
        ) : (
          <>
            <View style={an.stackedBar}>
              {ALL_STATUSES.filter(s => statusSecs[s] > 0).map(s => (
                <View
                  key={s}
                  style={[an.stackSegment, {
                    flex: statusSecs[s],
                    backgroundColor: STATUS_COLORS[s],
                  }]}
                />
              ))}
            </View>
            <View style={an.legend}>
              {ALL_STATUSES.filter(s => statusSecs[s] > 0).map(s => (
                <View key={s} style={an.legendRow}>
                  <View style={[an.legendDot, { backgroundColor: STATUS_COLORS[s] }]} />
                  <Text style={an.legendLabel}>{STATUS_LABELS[s]}</Text>
                  <Text style={an.legendVal}>
                    {fmtHours(statusSecs[s])} · {Math.round((statusSecs[s] / totalStatusSecs) * 100)}%
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}
      </View>
    </ScrollView>
  )
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <View style={an.card}>
      <Text style={an.cardLabel}>{label}</Text>
      <Text style={an.cardValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={an.cardSub}>{sub}</Text>
    </View>
  )
}

const an = StyleSheet.create({
  scroll: { padding: Spacing.md, paddingBottom: 48 },
  cards: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  card: {
    flex: 1,
    minWidth: 90,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    ...Shadow.sm,
  },
  cardLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  cardValue: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 2,
  },
  cardSub: { fontSize: FontSize.xs, color: Colors.textMuted },
  section: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.sm,
  },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  barLabel: {
    width: 72,
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
  },
  barTrack: {
    flex: 1,
    height: 20,
    backgroundColor: Colors.background,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%' as any,
    backgroundColor: Colors.primary,
    borderRadius: 4,
  },
  barVal: {
    width: 40,
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
    textAlign: 'right',
  },
  stackedBar: {
    flexDirection: 'row',
    height: 24,
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  stackSegment: { minWidth: 2 },
  legend: { gap: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { flex: 1, fontSize: FontSize.sm, color: Colors.text },
  legendVal: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600' },
  empty: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: Spacing.md,
  },
})

// ─── Timeline Panel ───────────────────────────────────────────────────────────

function TimelinePanel({ logs }: { logs: CraneLog[] }) {
  const now = Date.now()
  const { start: todayMs, end: todayEndMs } = getTodayBounds()
  const dayDuration = 24 * 60 * 60 * 1000

  const todayLogs = useMemo(() => logs.filter(l => {
    const s = new Date(l.start_time).getTime()
    const e = l.end_time ? new Date(l.end_time).getTime() : now
    return s <= todayEndMs && e >= todayMs
  }), [logs, todayMs, todayEndMs])

  const craneRows = useMemo(() => {
    const m = new Map<string, { craneRef: string; logs: CraneLog[] }>()
    for (const l of todayLogs) {
      const key = l.crane?.id ?? 'unknown'
      if (!m.has(key)) m.set(key, { craneRef: l.crane?.crane_ref ?? '—', logs: [] })
      m.get(key)!.logs.push(l)
    }
    return [...m.values()].sort((a, b) => a.craneRef.localeCompare(b.craneRef))
  }, [todayLogs])

  const nowX = Math.max(0, Math.min(CHART_W, ((now - todayMs) / dayDuration) * CHART_W))
  const todayLabel = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  if (craneRows.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl }}>
        <EmptyState title="No activity today" message="No crane logs opened today." icon="📅" />
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={tl.titleRow}>
        <Text style={tl.title}>Today — {todayLabel}</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator style={{ flex: 1 }}>
        <View style={tl.inner}>
          {/* X-axis hour labels */}
          <View style={tl.axisRow}>
            <View style={{ width: LABEL_W }} />
            <View style={[tl.chartArea, { height: 22 }]}>
              {HOUR_MARKS.map(h => (
                <Text
                  key={h}
                  style={[tl.hourText, { left: Math.round((h / 24) * CHART_W) - (h === 24 ? 28 : 0) }]}
                >
                  {String(h).padStart(2, '0')}:00
                </Text>
              ))}
            </View>
          </View>

          {/* Crane rows */}
          {craneRows.map(({ craneRef, logs: craneLogs }) => (
            <View key={craneRef} style={tl.craneRow}>
              <View style={tl.craneLabel}>
                <Text style={tl.craneLabelText} numberOfLines={1}>{craneRef}</Text>
              </View>
              <View style={tl.chartArea}>
                {/* Hour grid lines */}
                {HOUR_MARKS.map(h => (
                  <View
                    key={h}
                    style={[tl.gridLine, { left: Math.round((h / 24) * CHART_W) }]}
                  />
                ))}
                {/* Current time line */}
                <View style={[tl.nowLine, { left: Math.round(nowX) }]} />
                {/* Log blocks */}
                {craneLogs.map(l => {
                  const s = Math.max(new Date(l.start_time).getTime(), todayMs)
                  const e = Math.min(l.end_time ? new Date(l.end_time).getTime() : now, todayEndMs)
                  if (e <= s) return null
                  const lx = Math.round(((s - todayMs) / dayDuration) * CHART_W)
                  const bw = Math.max(3, Math.round(((e - s) / dayDuration) * CHART_W))
                  const color = STATUS_COLORS[l.status] ?? Colors.primary
                  return (
                    <View
                      key={l.id}
                      style={[tl.block, {
                        left: lx,
                        width: bw,
                        backgroundColor: color + 'D0',
                        borderColor: color,
                      }]}
                    >
                      {bw > 50 && (
                        <Text style={tl.blockLabel} numberOfLines={1}>
                          {STATUS_LABELS[l.status]}
                        </Text>
                      )}
                    </View>
                  )
                })}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Legend - outside horizontal scroll */}
      <View style={tl.legend}>
        {ALL_STATUSES.map(s => (
          <View key={s} style={tl.legendItem}>
            <View style={[tl.legendDot, { backgroundColor: STATUS_COLORS[s] }]} />
            <Text style={tl.legendLabel}>{STATUS_LABELS[s]}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

const ROW_H = 34

const tl = StyleSheet.create({
  titleRow: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  title: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  inner: { padding: Spacing.md, paddingBottom: Spacing.md },
  axisRow: { flexDirection: 'row', marginBottom: 4 },
  chartArea: {
    width: CHART_W,
    height: ROW_H,
    position: 'relative',
    backgroundColor: Colors.background,
    borderRadius: 4,
    overflow: 'hidden',
  },
  hourText: {
    position: 'absolute',
    bottom: 2,
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  craneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    height: ROW_H,
  },
  craneLabel: {
    width: LABEL_W,
    paddingRight: Spacing.sm,
    justifyContent: 'center',
  },
  craneLabelText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.text,
  },
  gridLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: Colors.border,
    opacity: 0.6,
  },
  nowLine: {
    position: 'absolute',
    top: -2,
    bottom: -2,
    width: 2,
    backgroundColor: Colors.danger,
    opacity: 0.7,
    zIndex: 10,
  },
  block: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    borderRadius: 4,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 5,
    overflow: 'hidden',
  },
  blockLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textInverse,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: '500' },
})
