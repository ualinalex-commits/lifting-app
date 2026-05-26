import { useState, useCallback, useEffect } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Platform,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { Breadcrumb } from '@/components/breadcrumb'
import { Colors, Spacing, FontSize, BorderRadius, Shadow } from '@/constants/theme'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { callDailyBriefingGeneratePdf } from '@/lib/api'

interface ReadEntry {
  user_id: string
  read_at: string
  reader: { full_name: string; role: string } | null
}

interface SigEntry {
  user_id: string
  signed_at: string
  full_name: string
  role: string
  company: string
}

const ROLE_LABELS: Record<string, string> = {
  appointed_person:    'Appointed Person',
  crane_supervisor:    'Crane Supervisor',
  crane_operator:      'Crane Operator',
  slinger_signaller:   'Slinger / Signaller',
  subcontractor_admin: 'Subcontractor Admin',
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function DailyBriefingAttendance() {
  const { briefing_id } = useLocalSearchParams<{ briefing_id: string }>()
  const router = useRouter()
  const { role } = useAuth()

  const [reads, setReads] = useState<ReadEntry[]>([])
  const [sigs, setSigs] = useState<SigEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)

  const canManage = role === 'appointed_person' || role === 'crane_supervisor'

  const fetchAttendance = useCallback(async () => {
    if (!briefing_id) return
    setIsLoading(true)
    const [readsRes, sigsRes] = await Promise.all([
      supabase
        .from('daily_briefing_reads')
        .select('user_id, read_at, reader:profiles!user_id(full_name, role)')
        .eq('briefing_id', briefing_id)
        .order('read_at'),
      supabase
        .from('daily_briefing_signatures')
        .select('user_id, signed_at, full_name, role, company')
        .eq('briefing_id', briefing_id)
        .order('signed_at'),
    ])
    setReads((readsRes.data as unknown as ReadEntry[]) ?? [])
    setSigs((sigsRes.data as unknown as SigEntry[]) ?? [])
    setIsLoading(false)
  }, [briefing_id])

  useEffect(() => {
    if (!briefing_id) return
    fetchAttendance()

    const channel = supabase
      .channel(`daily-briefing-attendance-${briefing_id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_briefing_reads', filter: `briefing_id=eq.${briefing_id}` },
        () => fetchAttendance()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_briefing_signatures', filter: `briefing_id=eq.${briefing_id}` },
        () => fetchAttendance()
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [briefing_id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleGeneratePdf() {
    if (!briefing_id) return

    const confirmed = Platform.OS === 'web'
      ? window.confirm("Generate archive PDF and close today's briefing? Once archived it cannot be edited or signed.")
      : await new Promise<boolean>(resolve => {
          Alert.alert(
            'Generate Archive PDF',
            "This will create the archive PDF and close today's briefing. Continue?",
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Generate', onPress: () => resolve(true) },
            ],
          )
        })

    if (!confirmed) return

    console.log('[DAILY-BRIEFING-ATTENDANCE] Generating PDF for briefing:', briefing_id)
    setIsGenerating(true)

    const { error } = await callDailyBriefingGeneratePdf(briefing_id)
    setIsGenerating(false)

    if (error) {
      console.error('[DAILY-BRIEFING-ATTENDANCE] Generate failed:', error)
      Alert.alert(
        'Generate Failed',
        `${error}\n\nCheck that the daily-briefing-generate-pdf Edge Function is deployed to Supabase.`,
      )
      return
    }

    Alert.alert('Done', 'Archive PDF generated. The briefing has been archived.')
    router.replace('/(appointed-person)/daily-briefing/' as any)
  }

  const breadcrumb = (
    <Breadcrumb items={[
      { label: 'Dashboard', href: '/(appointed-person)/' },
      { label: 'Daily Briefing', href: '/(appointed-person)/daily-briefing/' },
      { label: 'Who Signed' },
    ]} />
  )

  if (!canManage) {
    return (
      <ScreenWrapper edges={['bottom']}>
        {breadcrumb}
        <View style={styles.centered}>
          <Text style={styles.emptyText}>This screen is only accessible to appointed persons and crane supervisors.</Text>
        </View>
      </ScreenWrapper>
    )
  }

  if (!briefing_id) {
    return (
      <ScreenWrapper edges={['bottom']}>
        {breadcrumb}
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No active daily briefing.</Text>
        </View>
      </ScreenWrapper>
    )
  }

  return (
    <ScreenWrapper edges={['bottom']}>
      {breadcrumb}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Who Signed</Text>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>Live</Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.8}>
          <Text style={styles.doneBtn}>Done</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Read ({reads.length})</Text>
          </View>
          {reads.length === 0 ? (
            <Text style={styles.emptyText}>No reads recorded yet.</Text>
          ) : (
            reads.map(r => (
              <View key={r.user_id} style={styles.row}>
                <View style={styles.rowBody}>
                  <Text style={styles.rowName}>{r.reader?.full_name ?? '—'}</Text>
                  <Text style={styles.rowSub}>{ROLE_LABELS[r.reader?.role ?? ''] ?? r.reader?.role ?? '—'}</Text>
                </View>
                <Text style={styles.rowTime}>{formatTime(r.read_at)}</Text>
              </View>
            ))
          )}

          <View style={styles.divider} />

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Signed ({sigs.length})</Text>
          </View>
          {sigs.length === 0 ? (
            <Text style={styles.emptyText}>No signatures recorded yet.</Text>
          ) : (
            sigs.map(s => (
              <View key={s.user_id} style={styles.row}>
                <View style={styles.rowBody}>
                  <Text style={styles.rowName}>{s.full_name}</Text>
                  <Text style={styles.rowSub}>{ROLE_LABELS[s.role] ?? s.role} · {s.company}</Text>
                </View>
                <Text style={styles.rowTime}>{formatTime(s.signed_at)}</Text>
              </View>
            ))
          )}

          {canManage && (
            <View style={styles.generateSection}>
              <TouchableOpacity
                style={[styles.generateBtn, isGenerating && styles.generateBtnDisabled]}
                onPress={handleGeneratePdf}
                disabled={isGenerating}
                activeOpacity={0.8}
              >
                {isGenerating
                  ? <ActivityIndicator color={Colors.textInverse} />
                  : <Text style={styles.generateBtnText}>Generate Archive PDF</Text>
                }
              </TouchableOpacity>
              <Text style={styles.generateHint}>
                Archives today's briefing and creates a PDF with all signatures.
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.success + '15',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.success },
  liveText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.success },
  doneBtn: { fontSize: FontSize.base, color: Colors.primary, fontWeight: '600' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  sectionHeader: { marginBottom: Spacing.sm, marginTop: Spacing.xs },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyText: { fontSize: FontSize.sm, color: Colors.textMuted, paddingVertical: Spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: 4,
    ...Shadow.sm,
  },
  rowBody: { flex: 1 },
  rowName: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  rowSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1 },
  rowTime: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '500' },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: Spacing.md },
  generateSection: {
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing.sm,
  },
  generateBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  generateBtnDisabled: { opacity: 0.6 },
  generateBtnText: { color: Colors.textInverse, fontWeight: '700', fontSize: FontSize.sm },
  generateHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    lineHeight: 16,
    textAlign: 'center',
  },
})
