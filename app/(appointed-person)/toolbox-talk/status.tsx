import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
} from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { EmptyState } from '@/components/empty-state'
import { Colors, Spacing, FontSize, BorderRadius, Shadow } from '@/constants/theme'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

interface Operative {
  id: string
  full_name: string
  role: string
}

interface ReadRecord { user_id: string; read_at: string }
interface SigRecord  { user_id: string; signed_at: string }

const ROLE_LABELS: Record<string, string> = {
  appointed_person:    'AP',
  crane_supervisor:    'Supervisor',
  crane_operator:      'Operator',
  slinger_signaller:   'Slinger',
  subcontractor_admin: 'Sub Admin',
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function ToolboxTalkStatus() {
  const { talk_id } = useLocalSearchParams<{ talk_id: string }>()
  const { profile } = useAuth()

  const [operatives, setOperatives] = useState<Operative[]>([])
  const [reads, setReads] = useState<Map<string, string>>(new Map()) // user_id → read_at
  const [sigs, setSigs] = useState<Map<string, string>>(new Map())  // user_id → signed_at
  const [isLoading, setIsLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    if (!profile?.site_id) return
    setIsLoading(true)

    const [opRes, readRes, sigRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('site_id', profile.site_id)
        .eq('is_archived', false)
        .order('full_name'),
      supabase
        .from('toolbox_talk_reads')
        .select('user_id, read_at')
        .eq('talk_id', talk_id),
      supabase
        .from('toolbox_talk_signatures')
        .select('user_id, signed_at')
        .eq('talk_id', talk_id),
    ])

    setOperatives((opRes.data as Operative[]) ?? [])

    const readMap = new Map<string, string>()
    for (const r of (readRes.data as ReadRecord[]) ?? []) {
      readMap.set(r.user_id, r.read_at)
    }
    setReads(readMap)

    const sigMap = new Map<string, string>()
    for (const s of (sigRes.data as SigRecord[]) ?? []) {
      sigMap.set(s.user_id, s.signed_at)
    }
    setSigs(sigMap)

    setIsLoading(false)
  }, [profile?.site_id, talk_id])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // Supabase Realtime subscription for live updates
  useEffect(() => {
    if (!talk_id) return

    const channel = supabase
      .channel(`toolbox-talk-status-${talk_id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'toolbox_talk_reads', filter: `talk_id=eq.${talk_id}` },
        (payload) => {
          const r = payload.new as ReadRecord
          setReads((prev) => new Map(prev).set(r.user_id, r.read_at))
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'toolbox_talk_signatures', filter: `talk_id=eq.${talk_id}` },
        (payload) => {
          const s = payload.new as SigRecord
          setSigs((prev) => new Map(prev).set(s.user_id, s.signed_at))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [talk_id])

  if (isLoading) {
    return (
      <ScreenWrapper edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </ScreenWrapper>
    )
  }

  return (
    <ScreenWrapper edges={['bottom']}>
      {/* Column headers */}
      <View style={styles.tableHeader}>
        <Text style={[styles.colHeader, styles.colName]}>Name</Text>
        <Text style={[styles.colHeader, styles.colRole]}>Role</Text>
        <Text style={[styles.colHeader, styles.colStatus]}>Read</Text>
        <Text style={[styles.colHeader, styles.colStatus]}>Signed</Text>
      </View>

      <FlatList
        data={operatives}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState title="No site operatives found" icon="👷" />
        }
        renderItem={({ item }) => {
          const readAt = reads.get(item.id)
          const signedAt = sigs.get(item.id)
          return (
            <View style={styles.tableRow}>
              <Text style={[styles.cell, styles.colName]} numberOfLines={1}>
                {item.full_name}
              </Text>
              <Text style={[styles.cell, styles.colRole]} numberOfLines={1}>
                {ROLE_LABELS[item.role] ?? item.role}
              </Text>
              <Text style={[
                styles.cell, styles.colStatus,
                readAt ? styles.cellDone : styles.cellPending,
              ]} numberOfLines={1}>
                {readAt ? formatDateTime(readAt) : 'Not yet'}
              </Text>
              <Text style={[
                styles.cell, styles.colStatus,
                signedAt ? styles.cellDone : styles.cellPending,
              ]} numberOfLines={1}>
                {signedAt ? formatDateTime(signedAt) : 'Not yet'}
              </Text>
            </View>
          )
        }}
      />

      <View style={styles.legend}>
        <View style={styles.liveIndicator}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>Live updates</Text>
        </View>
        <Text style={styles.legendText}>
          {reads.size} read · {sigs.size} signed of {operatives.length}
        </Text>
      </View>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  colHeader: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  colName: { flex: 2 },
  colRole: { flex: 1.2 },
  colStatus: { flex: 1.8 },
  list: { paddingBottom: 100 },
  tableRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    alignItems: 'center',
    backgroundColor: Colors.surface,
  },
  cell: { fontSize: FontSize.xs, color: Colors.text },
  cellDone: { color: Colors.success, fontWeight: '600' },
  cellPending: { color: Colors.textMuted },
  legend: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  liveIndicator: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  liveText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.success },
  legendText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '500' },
})
