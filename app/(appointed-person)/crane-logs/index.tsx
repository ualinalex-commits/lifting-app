import { useState, useMemo, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  ScrollView, StyleSheet, ActivityIndicator,
  useWindowDimensions, Platform,
} from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import DateTimePicker from '@react-native-community/datetimepicker'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { EmptyState } from '@/components/empty-state'
import { Breadcrumb } from '@/components/breadcrumb'
import { Colors, Spacing, FontSize, BorderRadius, Shadow } from '@/constants/theme'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

// ─── Types ───────────────────────────────────────────────────────────────────

type LogStatus = 'working' | 'service' | 'thorough_examination' | 'winded_off' | 'breaking_down'
type DateFilter = 'today' | 'week' | 'pick_day' | 'custom'

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

const DATE_FILTER_OPTIONS: { key: DateFilter; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'pick_day', label: 'Pick a Day' },
  { key: 'custom', label: 'Custom Range' },
]

const SUB_PALETTE = [
  '#0F2544', '#E8930A', '#16A34A', '#DC2626',
  '#7C3AED', '#0284C7', '#DB2777', '#D97706',
  '#0D9488', '#9333EA',
]

// ─── Utilities ───────────────────────────────────────────────────────────────

function toInputStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getWeekStart(): Date {
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

function getDayBounds(date: Date) {
  const start = new Date(date); start.setHours(0, 0, 0, 0)
  const end = new Date(date); end.setHours(23, 59, 59, 999)
  return { start: start.getTime(), end: end.getTime() }
}

function getFilteredLogs(
  logs: CraneLog[],
  filter: DateFilter,
  pickedDay: Date | null,
  customFrom: Date | null,
  customTo: Date | null,
): CraneLog[] {
  if (filter === 'today') {
    const { start, end } = getTodayBounds()
    return logs.filter(l => {
      const s = new Date(l.start_time).getTime()
      return s >= start && s <= end
    })
  }
  if (filter === 'week') {
    const weekStart = getWeekStart().getTime()
    return logs.filter(l => new Date(l.start_time).getTime() >= weekStart)
  }
  if (filter === 'pick_day') {
    if (!pickedDay) return []
    const { start, end } = getDayBounds(pickedDay)
    return logs.filter(l => {
      const s = new Date(l.start_time).getTime()
      return s >= start && s <= end
    })
  }
  // custom — open-ended if one bound missing
  const from = customFrom ? new Date(customFrom).setHours(0, 0, 0, 0) : 0
  const to = customTo ? new Date(customTo).setHours(23, 59, 59, 999) : Infinity
  return logs.filter(l => {
    const s = new Date(l.start_time).getTime()
    return s >= from && s <= to
  })
}

function periodLabel(
  filter: DateFilter,
  pickedDay: Date | null,
  customFrom: Date | null,
  customTo: Date | null,
): string {
  switch (filter) {
    case 'today': return 'today'
    case 'week': return 'this week'
    case 'pick_day':
      return pickedDay
        ? pickedDay.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
        : 'selected day'
    case 'custom': {
      const a = customFrom?.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      const b = customTo?.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      if (a && b) return `${a} – ${b}`
      return a ?? b ?? 'selected range'
    }
  }
}

function periodTitle(
  filter: DateFilter,
  pickedDay: Date | null,
  customFrom: Date | null,
  customTo: Date | null,
): string {
  switch (filter) {
    case 'today': return 'Today'
    case 'week': return 'This Week'
    case 'pick_day':
      return pickedDay
        ? pickedDay.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
        : 'Selected Day'
    case 'custom': {
      const a = customFrom?.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      const b = customTo?.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      if (a && b) return `${a} – ${b}`
      return a ?? b ?? 'Custom Range'
    }
  }
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

  // Shared date filter — drives both the log list and the analytics panel
  const [dateFilter, setDateFilter] = useState<DateFilter>('week')
  const [pickedDay, setPickedDay] = useState<Date | null>(null)
  const [customFrom, setCustomFrom] = useState<Date | null>(null)
  const [customTo, setCustomTo] = useState<Date | null>(null)

  const handleDateFilter = useCallback((f: DateFilter) => {
    setDateFilter(f)
    // Seed pick_day to today on first use
    if (f === 'pick_day') setPickedDay(prev => prev ?? new Date())
  }, [])

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

  // Date filter applied first; open/closed and crane filters narrow the list further
  const dateFilteredLogs = useMemo(
    () => getFilteredLogs(logs, dateFilter, pickedDay, customFrom, customTo),
    [logs, dateFilter, pickedDay, customFrom, customTo],
  )

  const filtered = useMemo(() => dateFilteredLogs.filter(l => {
    if (openFilter === 'open' && l.is_closed) return false
    if (openFilter === 'closed' && !l.is_closed) return false
    if (craneFilter !== 'all' && l.crane?.id !== craneFilter) return false
    return true
  }), [dateFilteredLogs, openFilter, craneFilter])

  const openLog = () => router.push('/(appointed-person)/crane-logs/open')
  const goToLog = (id: string) => router.push(`/(appointed-person)/crane-logs/${id}`)

  const dateFilterProps = {
    dateFilter, pickedDay, customFrom, customTo,
    onDateFilter: handleDateFilter,
    onPickedDay: setPickedDay,
    onCustomFrom: setCustomFrom,
    onCustomTo: setCustomTo,
  }

  const listProps = {
    logs: filtered, cranes, craneFilter, openFilter, isLoading,
    onCraneFilter: setCraneFilter, onOpenFilter: setOpenFilter,
    onLogPress: goToLog, onOpenLog: openLog,
    ...dateFilterProps,
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
          <View style={root.right}>
            <RightPanel logs={dateFilteredLogs} tab={rightTab} onTab={setRightTab} {...dateFilterProps} />
          </View>
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
        : <RightPanel logs={dateFilteredLogs} tab={rightTab} onTab={setRightTab} {...dateFilterProps} />
      }
    </ScreenWrapper>
  )
}

const root = StyleSheet.create({
  split: { flex: 1, flexDirection: 'row' },
  left: { width: '40%', minWidth: 300, borderRightWidth: 1, borderRightColor: Colors.border },
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

// ─── Cross-platform date input ────────────────────────────────────────────────

function DateInputField({
  value, onChange, placeholder,
}: {
  value: Date | null
  onChange(d: Date): void
  placeholder: string
}) {
  const [showPicker, setShowPicker] = useState(false)

  if (Platform.OS === 'web') {
    return (
      // @ts-ignore
      <input
        type="date"
        value={value ? toInputStr(value) : ''}
        onChange={(e: any) => {
          if (e.target.value) onChange(new Date(e.target.value + 'T00:00:00'))
        }}
        style={{
          padding: '3px 8px',
          borderRadius: BorderRadius.sm,
          border: `1px solid ${Colors.border}`,
          fontSize: 11,
          fontWeight: 600,
          backgroundColor: Colors.background,
          color: Colors.text,
          cursor: 'pointer',
          minWidth: 112,
          outline: 'none',
        }}
      />
    )
  }

  return (
    <>
      <TouchableOpacity style={di.btn} onPress={() => setShowPicker(true)} activeOpacity={0.8}>
        <Text style={di.btnText}>
          {value
            ? value.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
            : placeholder}
        </Text>
      </TouchableOpacity>
      {showPicker && (
        <DateTimePicker
          value={value ?? new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(_, date) => {
            setShowPicker(false)
            if (date) onChange(date)
          }}
        />
      )}
    </>
  )
}

const di = StyleSheet.create({
  btn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  btnText: { fontSize: 11, fontWeight: '600', color: Colors.text },
})

// ─── Log List Panel ───────────────────────────────────────────────────────────

interface ListProps {
  logs: CraneLog[]
  cranes: { id: string; crane_ref: string }[]
  craneFilter: string
  openFilter: 'all' | 'open' | 'closed'
  isLoading: boolean
  dateFilter: DateFilter
  pickedDay: Date | null
  customFrom: Date | null
  customTo: Date | null
  onCraneFilter(id: string): void
  onOpenFilter(f: 'all' | 'open' | 'closed'): void
  onDateFilter(f: DateFilter): void
  onPickedDay(d: Date): void
  onCustomFrom(d: Date): void
  onCustomTo(d: Date): void
  onLogPress(id: string): void
  onOpenLog(): void
}

function LogList({
  logs, cranes, craneFilter, openFilter, isLoading,
  dateFilter, pickedDay, customFrom, customTo,
  onCraneFilter, onOpenFilter, onDateFilter, onPickedDay, onCustomFrom, onCustomTo,
  onLogPress, onOpenLog,
}: ListProps) {
  const emptyMessage =
    dateFilter === 'pick_day' && !pickedDay ? 'Pick a date above to view logs.' :
    dateFilter === 'custom' && !customFrom && !customTo ? 'Set a date range above to view logs.' :
    'Adjust filters or open a new log.'

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

      {/* Open/closed + crane filter */}
      <View style={ll.filterBar}>
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
      </View>

      {/* Date filter */}
      <View style={ll.dateBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ll.dateChips}>
          {DATE_FILTER_OPTIONS.map(f => (
            <TouchableOpacity
              key={f.key}
              style={[ll.chip, dateFilter === f.key && ll.chipOn]}
              onPress={() => onDateFilter(f.key)}
              activeOpacity={0.7}
            >
              <Text style={[ll.chipTxt, dateFilter === f.key && ll.chipTxtOn]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {dateFilter === 'pick_day' && (
          <View style={ll.dateInputRow}>
            <Text style={ll.dateInputLabel}>Day:</Text>
            <DateInputField value={pickedDay} onChange={onPickedDay} placeholder="Select date" />
          </View>
        )}
        {dateFilter === 'custom' && (
          <View style={ll.dateInputRow}>
            <Text style={ll.dateInputLabel}>From:</Text>
            <DateInputField value={customFrom} onChange={onCustomFrom} placeholder="Start date" />
            <Text style={ll.rangeSep}>–</Text>
            <Text style={ll.dateInputLabel}>To:</Text>
            <DateInputField value={customTo} onChange={onCustomTo} placeholder="End date" />
          </View>
        )}
      </View>

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
            <EmptyState title="No logs" message={emptyMessage} icon="📋" />
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
  filterBar: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    alignItems: 'center',
  },
  dateBar: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingVertical: Spacing.xs,
  },
  dateChips: {
    flexDirection: 'row',
    gap: Spacing.xs,
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingBottom: 2,
  },
  dateInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.xs,
    flexWrap: 'wrap',
  },
  dateInputLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  rangeSep: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '600',
    paddingHorizontal: 2,
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

interface RightPanelProps {
  logs: CraneLog[]
  tab: 'analytics' | 'timeline'
  onTab(t: 'analytics' | 'timeline'): void
  dateFilter: DateFilter
  pickedDay: Date | null
  customFrom: Date | null
  customTo: Date | null
}

function RightPanel({ logs, tab, onTab, dateFilter, pickedDay, customFrom, customTo }: RightPanelProps) {
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

      {tab === 'analytics'
        ? <AnalyticsPanel logs={logs} dateFilter={dateFilter} pickedDay={pickedDay} customFrom={customFrom} customTo={customTo} />
        : <TimelinePanel logs={logs} dateFilter={dateFilter} pickedDay={pickedDay} customFrom={customFrom} customTo={customTo} />
      }
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

interface AnalyticsPanelProps {
  logs: CraneLog[]
  dateFilter: DateFilter
  pickedDay: Date | null
  customFrom: Date | null
  customTo: Date | null
}

function AnalyticsPanel({ logs, dateFilter, pickedDay, customFrom, customTo }: AnalyticsPanelProps) {
  // logs is already date-filtered by the root; use directly
  const period = periodLabel(dateFilter, pickedDay, customFrom, customTo)
  const title = periodTitle(dateFilter, pickedDay, customFrom, customTo)

  const totalSecs = useMemo(
    () => logs.reduce((sum, l) => sum + logDurationSeconds(l), 0),
    [logs],
  )

  const hoursPerCrane = useMemo(() => {
    const m = new Map<string, { ref: string; secs: number }>()
    for (const l of logs) {
      const key = l.crane?.id ?? 'unknown'
      const cur = m.get(key) ?? { ref: l.crane?.crane_ref ?? '—', secs: 0 }
      cur.secs += logDurationSeconds(l)
      m.set(key, cur)
    }
    return [...m.values()].sort((a, b) => b.secs - a.secs)
  }, [logs])

  const statusSecs = useMemo(() => {
    const m: Record<LogStatus, number> = {
      working: 0, service: 0, thorough_examination: 0, winded_off: 0, breaking_down: 0,
    }
    for (const l of logs) m[l.status] = (m[l.status] ?? 0) + logDurationSeconds(l)
    return m
  }, [logs])

  const hoursByDay = useMemo(() => {
    const arr: number[] = Array(7).fill(0)
    for (const l of logs) {
      const di = (new Date(l.start_time).getDay() + 6) % 7
      arr[di] += logDurationSeconds(l)
    }
    return arr
  }, [logs])

  const closedLogs = useMemo(
    () => logs.filter(l => l.is_closed && l.duration_seconds != null),
    [logs],
  )
  const avgSecs = closedLogs.length > 0
    ? closedLogs.reduce((s, l) => s + l.duration_seconds!, 0) / closedLogs.length
    : 0

  const topCrane = hoursPerCrane[0]?.ref ?? '—'
  const maxCraneSecs = hoursPerCrane[0]?.secs ?? 1
  const busiestIdx = hoursByDay.indexOf(Math.max(...hoursByDay))
  const busiestDay = hoursByDay[busiestIdx] > 0 ? DAYS[busiestIdx] : '—'
  const totalStatusSecs = Object.values(statusSecs).reduce((a, b) => a + b, 0)

  const card4 = dateFilter === 'today'
    ? { label: 'Live Logs', value: String(logs.filter(l => !l.is_closed).length), sub: 'currently open' }
    : { label: 'Busiest Day', value: busiestDay, sub: period }

  return (
    <ScrollView contentContainerStyle={an.scroll}>
      <View style={an.cards}>
        <SummaryCard label="Total Hours" value={fmtHours(totalSecs)} sub={period} />
        <SummaryCard label="Top Crane" value={topCrane} sub={period} />
        <SummaryCard label="Avg Duration" value={fmtHours(avgSecs)} sub="per log" />
        <SummaryCard label={card4.label} value={card4.value} sub={card4.sub} />
      </View>

      <View style={an.section}>
        <Text style={an.sectionTitle}>Hours per Crane — {title}</Text>
        {hoursPerCrane.length === 0 ? (
          <Text style={an.empty}>No activity {period}</Text>
        ) : hoursPerCrane.map(item => (
          <View key={item.ref} style={an.barRow}>
            <Text style={an.barLabel} numberOfLines={1}>{item.ref}</Text>
            <View style={an.barTrack}>
              <View style={[an.barFill, { width: `${(item.secs / maxCraneSecs) * 100}%` as any }]} />
            </View>
            <Text style={an.barVal}>{fmtHours(item.secs)}</Text>
          </View>
        ))}
      </View>

      <View style={an.section}>
        <Text style={an.sectionTitle}>Status Breakdown — {title}</Text>
        {totalStatusSecs === 0 ? (
          <Text style={an.empty}>No activity {period}</Text>
        ) : (
          <>
            <View style={an.stackedBar}>
              {ALL_STATUSES.filter(s => statusSecs[s] > 0).map(s => (
                <View key={s} style={[an.stackSegment, { flex: statusSecs[s], backgroundColor: STATUS_COLORS[s] }]} />
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

      <SubcontractorSection logs={logs} period={period} title={title} />
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

// ─── Subcontractor Section ────────────────────────────────────────────────────

function SubcontractorSection({ logs, period, title }: { logs: CraneLog[]; period: string; title: string }) {
  const workingLogs = useMemo(() => logs.filter(l => l.subcontractor != null), [logs])

  const subStats = useMemo(() => {
    const m = new Map<string, {
      id: string; name: string; totalSecs: number; liftCount: number
      cranes: Map<string, { ref: string; secs: number }>
    }>()
    for (const l of workingLogs) {
      const sub = l.subcontractor!
      if (!m.has(sub.id)) m.set(sub.id, { id: sub.id, name: sub.name, totalSecs: 0, liftCount: 0, cranes: new Map() })
      const e = m.get(sub.id)!
      const secs = logDurationSeconds(l)
      e.totalSecs += secs
      e.liftCount++
      if (l.crane) {
        const ce = e.cranes.get(l.crane.id) ?? { ref: l.crane.crane_ref, secs: 0 }
        ce.secs += secs
        e.cranes.set(l.crane.id, ce)
      }
    }
    return [...m.values()].sort((a, b) => b.totalSecs - a.totalSecs)
  }, [workingLogs])

  const subColorMap = useMemo(() => {
    const m = new Map<string, string>()
    subStats.forEach((s, i) => m.set(s.id, SUB_PALETTE[i % SUB_PALETTE.length]))
    return m
  }, [subStats])

  if (subStats.length === 0) {
    return (
      <View style={an.section}>
        <Text style={an.sectionTitle}>Usage by Subcontractor — {title}</Text>
        <Text style={an.empty}>No subcontractor activity {period}</Text>
      </View>
    )
  }

  const maxSubSecs = subStats[0].totalSecs || 1

  return (
    <View style={an.section}>
      <Text style={an.sectionTitle}>Usage by Subcontractor — {title}</Text>
      <Text style={sb.subHeading}>Total Hours</Text>
      {subStats.map(sub => (
        <View key={sub.id} style={an.barRow}>
          <Text style={an.barLabel} numberOfLines={1}>{sub.name}</Text>
          <View style={an.barTrack}>
            <View style={[an.barFill, {
              width: `${(sub.totalSecs / maxSubSecs) * 100}%` as any,
              backgroundColor: subColorMap.get(sub.id) ?? Colors.primary,
            }]} />
          </View>
          <Text style={an.barVal}>{fmtHours(sub.totalSecs)}</Text>
        </View>
      ))}
    </View>
  )
}

const sb = StyleSheet.create({
  subHeading: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: Spacing.sm,
  },
})

// ─── Timeline Panel ───────────────────────────────────────────────────────────

interface TimelinePanelProps {
  logs: CraneLog[]
  dateFilter: DateFilter
  pickedDay: Date | null
  customFrom: Date | null
  customTo: Date | null
}

function TimelinePanel({ logs, dateFilter, pickedDay, customFrom, customTo }: TimelinePanelProps) {
  if (dateFilter === 'today') {
    const { start: dayMs, end: dayEndMs } = getTodayBounds()
    return <DayGanttChart logs={logs} dayMs={dayMs} dayEndMs={dayEndMs} isToday />
  }
  if (dateFilter === 'week') {
    return <WeekTimelineView logs={logs} />
  }
  if (dateFilter === 'pick_day') {
    if (!pickedDay) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl }}>
          <EmptyState title="No date selected" message="Pick a date in the left panel to view the timeline." icon="📅" />
        </View>
      )
    }
    const { start: dayMs, end: dayEndMs } = getDayBounds(pickedDay)
    const { start: todayMs } = getTodayBounds()
    return <DayGanttChart logs={logs} dayMs={dayMs} dayEndMs={dayEndMs} isToday={dayMs === todayMs} />
  }
  // custom
  return <CustomRangeTimelineView logs={logs} from={customFrom} to={customTo} />
}

// ─── Day Gantt Chart ──────────────────────────────────────────────────────────

function DayGanttChart({
  logs, dayMs, dayEndMs, isToday,
}: {
  logs: CraneLog[]
  dayMs: number
  dayEndMs: number
  isToday: boolean
}) {
  const now = Date.now()
  const dayDuration = 24 * 60 * 60 * 1000

  const craneRows = useMemo(() => {
    const m = new Map<string, { craneRef: string; logs: CraneLog[] }>()
    for (const l of logs) {
      const s = new Date(l.start_time).getTime()
      const e = l.end_time ? new Date(l.end_time).getTime() : now
      if (s > dayEndMs || e < dayMs) continue
      const key = l.crane?.id ?? 'unknown'
      if (!m.has(key)) m.set(key, { craneRef: l.crane?.crane_ref ?? '—', logs: [] })
      m.get(key)!.logs.push(l)
    }
    return [...m.values()].sort((a, b) => a.craneRef.localeCompare(b.craneRef))
  }, [logs, dayMs, dayEndMs])

  const nowX = isToday
    ? Math.max(0, Math.min(CHART_W, ((now - dayMs) / dayDuration) * CHART_W))
    : -1

  const dayLabel = new Date(dayMs).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  if (craneRows.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl }}>
        <EmptyState title="No activity" message="No crane logs for this day." icon="📅" />
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={tl.titleRow}>
        <Text style={tl.title}>{dayLabel}</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator style={{ flex: 1 }}>
        <View style={tl.inner}>
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

          {craneRows.map(({ craneRef, logs: craneLogs }) => (
            <View key={craneRef} style={tl.craneRow}>
              <View style={tl.craneLabel}>
                <Text style={tl.craneLabelText} numberOfLines={1}>{craneRef}</Text>
              </View>
              <View style={tl.chartArea}>
                {HOUR_MARKS.map(h => (
                  <View key={h} style={[tl.gridLine, { left: Math.round((h / 24) * CHART_W) }]} />
                ))}
                {nowX >= 0 && <View style={[tl.nowLine, { left: Math.round(nowX) }]} />}
                {craneLogs.map(l => {
                  const s = Math.max(new Date(l.start_time).getTime(), dayMs)
                  const e = Math.min(l.end_time ? new Date(l.end_time).getTime() : now, dayEndMs)
                  if (e <= s) return null
                  const lx = Math.round(((s - dayMs) / dayDuration) * CHART_W)
                  const bw = Math.max(3, Math.round(((e - s) / dayDuration) * CHART_W))
                  const color = STATUS_COLORS[l.status] ?? Colors.primary
                  return (
                    <View
                      key={l.id}
                      style={[tl.block, { left: lx, width: bw, backgroundColor: color + 'D0', borderColor: color }]}
                    >
                      {bw > 50 && (
                        <Text style={tl.blockLabel} numberOfLines={1}>{STATUS_LABELS[l.status]}</Text>
                      )}
                    </View>
                  )
                })}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

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

// ─── Week Timeline View ───────────────────────────────────────────────────────

function WeekTimelineView({ logs }: { logs: CraneLog[] }) {
  const weekStart = useMemo(() => getWeekStart(), [])
  const todayMs = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() }, [])
  const todayDayIdx = (new Date().getDay() + 6) % 7
  const [selectedDay, setSelectedDay] = useState(todayDayIdx)

  const weekDays = useMemo(() =>
    DAYS.map((label, i) => {
      const d = new Date(weekStart)
      d.setDate(weekStart.getDate() + i)
      const { start: dayMs, end: dayEndMs } = getDayBounds(d)
      return { label, dayMs, dayEndMs, dayNum: d.getDate() }
    }),
  [weekStart])

  const { dayMs, dayEndMs } = weekDays[selectedDay]
  const isToday = dayMs === todayMs

  return (
    <View style={{ flex: 1 }}>
      <View style={wk.tabs}>
        {weekDays.map(({ label, dayMs: dMs, dayNum }, i) => {
          const active = selectedDay === i
          const today = dMs === todayMs
          return (
            <TouchableOpacity
              key={i}
              style={[wk.tab, active && wk.tabActive]}
              onPress={() => setSelectedDay(i)}
              activeOpacity={0.7}
            >
              <Text style={[wk.tabLabel, active && wk.tabLabelActive, today && !active && wk.tabLabelToday]}>
                {label}
              </Text>
              <Text style={[wk.tabNum, active && wk.tabNumActive]}>{dayNum}</Text>
              {today && <View style={wk.todayDot} />}
            </TouchableOpacity>
          )
        })}
      </View>

      <DayGanttChart logs={logs} dayMs={dayMs} dayEndMs={dayEndMs} isToday={isToday} />
    </View>
  )
}

const wk = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: 4,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  tabActive: { borderBottomColor: Colors.primary },
  tabLabel: { fontSize: 10, fontWeight: '600', color: Colors.textSecondary, lineHeight: 14 },
  tabLabelActive: { color: Colors.primary },
  tabLabelToday: { color: Colors.accent },
  tabNum: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary, lineHeight: 18 },
  tabNumActive: { color: Colors.primary },
  todayDot: {
    width: 5, height: 5, borderRadius: 3,
    backgroundColor: Colors.accent,
    marginTop: 2,
  },
})

// ─── Custom Range Timeline View ───────────────────────────────────────────────

function CustomRangeTimelineView({
  logs, from, to,
}: {
  logs: CraneLog[]
  from: Date | null
  to: Date | null
}) {
  const todayMs = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() }, [])

  const rangeDays = useMemo(() => {
    if (!from && !to) return []
    const start = new Date(from ?? to!)
    const end = new Date(to ?? from!)
    start.setHours(0, 0, 0, 0)
    end.setHours(0, 0, 0, 0)
    const days: { date: Date; dayMs: number; dayEndMs: number }[] = []
    let d = new Date(start)
    let count = 0
    while (d.getTime() <= end.getTime() && count < 90) {
      const clone = new Date(d)
      const { start: dayMs, end: dayEndMs } = getDayBounds(clone)
      days.push({ date: clone, dayMs, dayEndMs })
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
      count++
    }
    return days
  }, [from, to])

  const dailyStats = useMemo(() =>
    rangeDays.map(({ date, dayMs, dayEndMs }) => {
      const dayLogs = logs.filter(l => {
        const s = new Date(l.start_time).getTime()
        return s >= dayMs && s <= dayEndMs
      })
      return { date, dayMs, totalSecs: dayLogs.reduce((s, l) => s + logDurationSeconds(l), 0), logCount: dayLogs.length }
    }).filter(d => d.logCount > 0),
  [logs, rangeDays])

  if (!from && !to) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl }}>
        <EmptyState title="No range selected" message="Set a date range in the left panel to view the timeline." icon="📅" />
      </View>
    )
  }

  if (dailyStats.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl }}>
        <EmptyState title="No activity" message="No crane logs in this date range." icon="📅" />
      </View>
    )
  }

  const maxSecs = Math.max(...dailyStats.map(d => d.totalSecs), 1)
  const rangeLabel = [
    from?.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    to?.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
  ].filter(Boolean).join(' – ')

  return (
    <ScrollView contentContainerStyle={mo.scroll}>
      <Text style={mo.monthTitle}>{rangeLabel}</Text>
      {dailyStats.map(({ date, dayMs, totalSecs, logCount }) => {
        const isToday = dayMs === todayMs
        const label = date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
        return (
          <View key={dayMs} style={[mo.dayRow, isToday && mo.dayRowToday]}>
            <Text style={[mo.dateLabel, isToday && mo.dateLabelToday]}>{label}</Text>
            <View style={mo.barTrack}>
              <View style={[mo.barFill, { width: `${(totalSecs / maxSecs) * 100}%` as any }]} />
            </View>
            <Text style={mo.hoursLabel}>{fmtHours(totalSecs)}</Text>
            <Text style={mo.logCount}>{logCount}×</Text>
          </View>
        )
      })}
    </ScrollView>
  )
}

const mo = StyleSheet.create({
  scroll: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  monthTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: 5,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: BorderRadius.sm,
  },
  dayRowToday: { backgroundColor: Colors.primary + '12' },
  dateLabel: {
    width: 88,
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  dateLabelToday: { color: Colors.primary, fontWeight: '700' },
  barTrack: {
    flex: 1,
    height: 16,
    backgroundColor: Colors.background,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%' as any,
    backgroundColor: Colors.primary,
    borderRadius: 3,
    opacity: 0.75,
  },
  hoursLabel: {
    width: 38,
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'right',
  },
  logCount: {
    width: 22,
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'right',
  },
})

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
