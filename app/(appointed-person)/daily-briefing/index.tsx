import { useState, useCallback, useRef, useEffect } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  Alert, ActivityIndicator, NativeSyntheticEvent, NativeScrollEvent,
  Platform,
} from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { Breadcrumb } from '@/components/breadcrumb'
import { Colors, Spacing, FontSize, BorderRadius, Shadow } from '@/constants/theme'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { callDailyBriefingGeneratePdf } from '@/lib/api'
import { DAILY_BRIEFING_CONTENT_STYLES, DAILY_BRIEFING_NATIVE_STYLES } from '@/lib/daily-briefing-template'
import { WebView } from 'react-native-webview'

interface ActiveBriefing {
  id: string
  briefing_date: string
  content_html: string
  status: string
  ap_name: string
  supervisor_name: string
  muster_point: string
  first_aider_name: string
  created_at: string
}

interface BriefingSettings {
  first_aider_name: string
  muster_point: string
  site_location: string
}

interface BarData {
  label: string
  total: number
  signed: number
}

function toLocalDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function BarChart({ data }: { data: BarData[] }) {
  if (data.length === 0) {
    return <Text style={{ fontSize: FontSize.xs, color: Colors.textMuted, marginTop: Spacing.xs }}>No operative data</Text>
  }
  const max = Math.max(...data.map(d => d.total), 1)
  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 10, height: 10, backgroundColor: Colors.danger, borderRadius: 2 }} />
          <Text style={{ fontSize: 10, color: Colors.textMuted }}>Total</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 10, height: 10, backgroundColor: Colors.primary, borderRadius: 2 }} />
          <Text style={{ fontSize: 10, color: Colors.textMuted }}>Signed</Text>
        </View>
      </View>
      {data.map((item, i) => (
        <View key={i} style={{ marginBottom: 10 }}>
          <Text style={{ fontSize: 11, color: Colors.textSecondary, marginBottom: 3, fontWeight: '600' }} numberOfLines={1}>
            {item.label}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <View style={{ flex: 1, height: 14, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden' }}>
              <View style={{ width: `${(item.total / max) * 100}%` as any, height: '100%', backgroundColor: Colors.danger, borderRadius: 3 }} />
            </View>
            <Text style={{ fontSize: 10, color: Colors.text, minWidth: 18, textAlign: 'right' }}>{item.total}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ flex: 1, height: 14, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden' }}>
              <View style={{ width: `${(item.signed / max) * 100}%` as any, height: '100%', backgroundColor: Colors.primary, borderRadius: 3 }} />
            </View>
            <Text style={{ fontSize: 10, color: Colors.text, minWidth: 18, textAlign: 'right' }}>{item.signed}</Text>
          </View>
        </View>
      ))}
    </View>
  )
}

export default function DailyBriefingHome() {
  const router = useRouter()
  const { profile, role } = useAuth()

  const [activeBriefing, setActiveBriefing] = useState<ActiveBriefing | null>(null)
  const [settings, setSettings] = useState<BriefingSettings | null>(null)
  const [chartData, setChartData] = useState<BarData[]>([])
  const [myRead, setMyRead] = useState<{ id: string; read_at: string } | null>(null)
  const [mySig, setMySig] = useState<{ id: string; signed_at: string } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const contentDivRef = useRef<any>(null)
  const myReadRef = useRef<{ id: string; read_at: string } | null>(null)

  const canManage = role === 'appointed_person' || role === 'crane_supervisor'

  useEffect(() => { myReadRef.current = myRead }, [myRead])

  // Inject CSS once on web mount
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const id = 'daily-briefing-content-styles'
    if (document.getElementById(id)) return
    const style = document.createElement('style')
    style.id = id
    style.textContent = DAILY_BRIEFING_CONTENT_STYLES
    document.head.appendChild(style)
  }, [])

  // Web scroll handler for the content div — mirrors Toolbox Talk pattern exactly
  useEffect(() => {
    if (Platform.OS !== 'web') return
    if (!activeBriefing) return

    const timer = setTimeout(() => {
      const div = contentDivRef.current
      if (!div) return

      const handleDivScroll = () => {
        if (myReadRef.current) return
        const { scrollTop, scrollHeight, clientHeight } = div
        console.log('[DAILY-BRIEFING] div scroll:', { scrollTop, scrollHeight, clientHeight })
        if (scrollTop + clientHeight >= scrollHeight - 50) {
          console.log('[DAILY-BRIEFING] div reached bottom — marking read')
          setHasScrolledToBottom(true)
          setMyRead({ id: 'local', read_at: new Date().toISOString() })
          if (profile?.id && activeBriefing?.id) {
            supabase
              .from('daily_briefing_reads')
              .insert({ briefing_id: activeBriefing.id, user_id: profile.id })
              .then(({ error }) => {
                if (error && error.code !== '23505') console.error('[DAILY-BRIEFING] Read insert error:', error)
                else console.log('[DAILY-BRIEFING] Read recorded (or already exists)')
              })
          }
        }
      }

      div.addEventListener('scroll', handleDivScroll, { passive: true })

      // Mark read immediately if content fits on screen without scrolling
      const { scrollHeight, clientHeight } = div
      if (scrollHeight <= clientHeight + 50 && !myReadRef.current) {
        console.log('[DAILY-BRIEFING] Content fits on screen — marking read immediately')
        setHasScrolledToBottom(true)
        setMyRead({ id: 'local', read_at: new Date().toISOString() })
        if (profile?.id && activeBriefing?.id) {
          supabase
            .from('daily_briefing_reads')
            .insert({ briefing_id: activeBriefing.id, user_id: profile.id })
            .then(({ error }) => {
              if (error && error.code !== '23505') console.error('[DAILY-BRIEFING] Read insert error:', error)
            })
        }
      }

      return () => div.removeEventListener('scroll', handleDivScroll)
    }, 300)

    return () => clearTimeout(timer)
  }, [activeBriefing?.id, profile?.id])

  async function fetchChartData(siteId: string, companyId: string | null, briefingId: string | null) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, role, company_id, subcontractor_id')
      .eq('site_id', siteId)

    let mainCompanyName = 'Main Company'
    if (companyId) {
      const { data: co } = await supabase.from('companies').select('name').eq('id', companyId).single()
      if (co?.name) mainCompanyName = co.name
    }

    const subIds = [...new Set(
      (profiles ?? [])
        .filter((p: any) => p.role === 'subcontractor_admin' && p.subcontractor_id)
        .map((p: any) => p.subcontractor_id)
    )].filter(Boolean)

    let subMap: Record<string, string> = {}
    if (subIds.length > 0) {
      const { data: subs } = await supabase
        .from('subcontractors')
        .select('id, name')
        .in('id', subIds)
      subs?.forEach((s: any) => { subMap[s.id] = s.name })
    }

    let signedIds = new Set<string>()
    if (briefingId) {
      const { data: sigs } = await supabase
        .from('daily_briefing_signatures')
        .select('user_id')
        .eq('briefing_id', briefingId)
      sigs?.forEach((s: any) => signedIds.add(s.user_id))
    }

    const groups: Record<string, { total: number; signed: number }> = {}
    for (const p of profiles ?? []) {
      const label = ((p as any).role === 'subcontractor_admin' && (p as any).subcontractor_id && subMap[(p as any).subcontractor_id])
        ? subMap[(p as any).subcontractor_id]
        : mainCompanyName
      if (!groups[label]) groups[label] = { total: 0, signed: 0 }
      groups[label].total++
      if (signedIds.has((p as any).id)) groups[label].signed++
    }

    setChartData(Object.entries(groups).map(([label, c]) => ({ label, total: c.total, signed: c.signed })))
  }

  const fetchAll = useCallback(async () => {
    if (!profile?.site_id || !profile?.id) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setHasScrolledToBottom(false)

    const today = toLocalDateStr(new Date())

    const { data: briefingData } = await supabase
      .from('daily_briefings')
      .select('id, briefing_date, content_html, status, ap_name, supervisor_name, muster_point, first_aider_name, created_at')
      .eq('site_id', profile.site_id)
      .eq('status', 'active')
      .eq('briefing_date', today)
      .maybeSingle()

    const briefing = briefingData as ActiveBriefing | null
    setActiveBriefing(briefing)

    const { data: settingsData } = await supabase
      .from('daily_briefing_settings')
      .select('first_aider_name, muster_point, site_location')
      .eq('site_id', profile.site_id)
      .maybeSingle()
    setSettings(settingsData as BriefingSettings | null)

    if (briefing) {
      const [readRes, sigRes] = await Promise.all([
        supabase
          .from('daily_briefing_reads')
          .select('id, read_at')
          .eq('briefing_id', briefing.id)
          .eq('user_id', profile.id)
          .maybeSingle(),
        supabase
          .from('daily_briefing_signatures')
          .select('id, signed_at')
          .eq('briefing_id', briefing.id)
          .eq('user_id', profile.id)
          .maybeSingle(),
      ])
      setMyRead((readRes.data as any) ?? null)
      setMySig((sigRes.data as any) ?? null)
      if (readRes.data) setHasScrolledToBottom(true)
    } else {
      setMyRead(null)
      setMySig(null)
    }

    await fetchChartData(profile.site_id, profile.company_id, briefing?.id ?? null)

    setIsLoading(false)
  }, [profile?.site_id, profile?.id, profile?.company_id])

  useFocusEffect(useCallback(() => { fetchAll() }, [fetchAll]))

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (hasScrolledToBottom || !activeBriefing || myRead) return
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 50) {
      console.log('[DAILY-BRIEFING] ScrollView reached bottom — marking read')
      setHasScrolledToBottom(true)
      setMyRead({ id: 'local', read_at: new Date().toISOString() })
      supabase
        .from('daily_briefing_reads')
        .insert({ briefing_id: activeBriefing.id, user_id: profile!.id })
        .then(({ error }) => {
          if (error && error.code !== '23505') console.error('[DAILY-BRIEFING] Read insert error:', error)
        })
    }
  }

  async function handleDelete() {
    if (!activeBriefing) return
    const confirmed = Platform.OS === 'web'
      ? window.confirm("Delete today's briefing? This cannot be undone.")
      : await new Promise<boolean>(resolve => {
          Alert.alert(
            'Delete Briefing',
            "Delete today's daily briefing? It will be removed from the site.",
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
            ],
          )
        })
    if (!confirmed) return

    console.log('[DAILY-BRIEFING] Deleting briefing:', activeBriefing.id)
    setIsDeleting(true)

    const { data, error } = await supabase
      .from('daily_briefings')
      .update({ status: 'deleted' })
      .eq('id', activeBriefing.id)
      .select()

    setIsDeleting(false)

    if (error) {
      console.error('[DAILY-BRIEFING] Delete error:', error)
      Alert.alert('Delete Failed', `${error.message} (code: ${error.code})`)
      return
    }
    if (!data || data.length === 0) {
      console.error('[DAILY-BRIEFING] Delete returned no rows — likely RLS block')
      Alert.alert('Delete Failed', 'No rows updated — check that you have permission to delete this briefing (RLS policy).')
      return
    }

    console.log('[DAILY-BRIEFING] Delete succeeded')
    setActiveBriefing(null)
    setMyRead(null)
    setMySig(null)
    await fetchAll()
  }

  async function handleGeneratePdf() {
    if (!activeBriefing) return
    const confirmed = Platform.OS === 'web'
      ? window.confirm("Generate archive PDF and close today's briefing?")
      : await new Promise<boolean>(resolve => {
          Alert.alert(
            'Generate Archive PDF',
            "This will archive today's briefing and generate the sign-off PDF. Continue?",
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Generate', onPress: () => resolve(true) },
            ],
          )
        })
    if (!confirmed) return

    console.log('[DAILY-BRIEFING] Generating PDF for briefing:', activeBriefing.id)
    setIsGenerating(true)
    const { error } = await callDailyBriefingGeneratePdf(activeBriefing.id)
    setIsGenerating(false)

    if (error) {
      console.error('[DAILY-BRIEFING] Generate failed:', error)
      Alert.alert('Error', `${error}\n\nCheck that the daily-briefing-generate-pdf Edge Function is deployed.`)
      return
    }

    Alert.alert('Done', "Archive PDF generated. Today's briefing has been archived.", [
      { text: 'OK', onPress: fetchAll },
    ])
  }

  const displayMusterPoint = activeBriefing?.muster_point || settings?.muster_point || '—'
  const displayFirstAider = activeBriefing?.first_aider_name || settings?.first_aider_name || '—'

  const briefingDateFormatted = activeBriefing
    ? new Date(activeBriefing.briefing_date + 'T00:00:00Z').toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    : ''

  return (
    <ScreenWrapper edges={['bottom']}>
      <Breadcrumb items={[
        { label: 'Dashboard', href: '/(appointed-person)/' },
        { label: 'Daily Briefing' },
      ]} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: activeBriefing && !isLoading ? 90 : Spacing.xxl },
        ]}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {/* Top row: chart (60%) + action buttons (40%) */}
        <View style={styles.topRow}>
          <View style={styles.chartCard}>
            <Text style={styles.cardLabel}>SIGN-OFF PROGRESS</Text>
            {isLoading
              ? <ActivityIndicator size="small" color={Colors.primary} style={{ marginTop: Spacing.sm }} />
              : <BarChart data={chartData} />
            }
          </View>

          <View style={styles.actionCol}>
            {canManage && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => {
                  const path = activeBriefing
                    ? `/(appointed-person)/daily-briefing/setup?briefing_id=${activeBriefing.id}`
                    : '/(appointed-person)/daily-briefing/setup'
                  router.push(path as any)
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.actionBtnIcon}>📋</Text>
                <Text style={styles.actionBtnLabel}>{activeBriefing ? 'Edit\nBriefing' : 'Set Up'}</Text>
              </TouchableOpacity>
            )}
            {canManage && (
              <TouchableOpacity
                style={[styles.actionBtn, !activeBriefing && styles.actionBtnDisabled]}
                onPress={() => {
                  if (!activeBriefing) {
                    Alert.alert('No Briefing', "Set up today's briefing first.")
                    return
                  }
                  router.push(`/(appointed-person)/daily-briefing/attendance?briefing_id=${activeBriefing.id}` as any)
                }}
                disabled={!activeBriefing}
                activeOpacity={0.8}
              >
                <Text style={styles.actionBtnIcon}>👥</Text>
                <Text style={styles.actionBtnLabel}>{'Who\nSigned'}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => router.push('/(appointed-person)/daily-briefing/archive' as any)}
              activeOpacity={0.8}
            >
              <Text style={styles.actionBtnIcon}>🗂</Text>
              <Text style={styles.actionBtnLabel}>Archive</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Muster Point + First Aider info cards */}
        <View style={styles.infoRow}>
          <View style={[styles.infoCard, { borderLeftColor: Colors.primary }]}>
            <Text style={styles.infoCardLabel}>MUSTER POINT</Text>
            <Text style={styles.infoCardValue} numberOfLines={3}>{displayMusterPoint}</Text>
          </View>
          <View style={[styles.infoCard, { borderLeftColor: Colors.accent }]}>
            <Text style={styles.infoCardLabel}>FIRST AIDER</Text>
            <Text style={styles.infoCardValue} numberOfLines={3}>{displayFirstAider}</Text>
          </View>
        </View>

        {/* Briefing document area */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : !activeBriefing ? (
          <View style={styles.emptyArea}>
            <Text style={styles.emptyIcon}>📢</Text>
            <Text style={styles.emptyTitle}>No briefing for today</Text>
            <Text style={styles.emptyMsg}>
              {canManage
                ? "Tap Set Up to create today's daily briefing."
                : "Your appointed person or supervisor will set up today's briefing here."}
            </Text>
          </View>
        ) : (
          <View style={styles.docArea}>
            <View style={styles.docHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.docTitle}>Daily Briefing</Text>
                <Text style={styles.docMeta}>{briefingDateFormatted}</Text>
              </View>
              {canManage && (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity
                    style={[styles.headerBtn, { borderColor: Colors.primary + '60' }]}
                    onPress={handleGeneratePdf}
                    disabled={isGenerating}
                    activeOpacity={0.8}
                  >
                    {isGenerating
                      ? <ActivityIndicator size="small" color={Colors.primary} />
                      : <Text style={[styles.headerBtnText, { color: Colors.primary }]}>Archive PDF</Text>
                    }
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.headerBtn, { borderColor: Colors.danger + '60' }]}
                    onPress={handleDelete}
                    disabled={isDeleting}
                    activeOpacity={0.8}
                  >
                    {isDeleting
                      ? <ActivityIndicator size="small" color={Colors.danger} />
                      : <Text style={[styles.headerBtnText, { color: Colors.danger }]}>Delete</Text>
                    }
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <View style={styles.docContent}>
              {Platform.OS === 'web' ? (
                <div
                  ref={contentDivRef}
                  dangerouslySetInnerHTML={{ __html: activeBriefing.content_html }}
                  style={{ maxWidth: '100%', overflowWrap: 'break-word' } as React.CSSProperties}
                />
              ) : (
                <WebView
                  source={{
                    html: `<html><head><meta name="viewport" content="width=device-width,initial-scale=1.0"><style>${DAILY_BRIEFING_NATIVE_STYLES}</style></head><body>${activeBriefing.content_html}</body></html>`,
                  }}
                  style={{ height: 600, borderRadius: 8 }}
                  nestedScrollEnabled
                  scrollEnabled
                />
              )}
            </View>

            {myRead && (
              <View style={styles.readBanner}>
                <Text style={styles.readBannerText}>You have read today's briefing ✓</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Fixed bottom bar: Sign Off / Signed ✓ / read gate */}
      {activeBriefing && !isLoading && (
        <View style={styles.bottomBar}>
          {mySig ? (
            <View style={styles.signedBadge}>
              <Text style={styles.signedBadgeText}>Signed ✓</Text>
            </View>
          ) : !myRead ? (
            <View style={styles.readGateMsg}>
              <Text style={styles.readGateMsgText}>
                {Platform.OS === 'web'
                  ? 'Scroll to the bottom of the briefing to mark it as read, then sign.'
                  : 'Scroll through the full briefing to unlock signing.'}
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.signOffBtn}
              onPress={() => router.push(`/(appointed-person)/daily-briefing/sign?briefing_id=${activeBriefing.id}` as any)}
              activeOpacity={0.85}
            >
              <Text style={styles.signOffBtnText}>Sign Daily Briefing</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { padding: Spacing.md },
  topRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  chartCard: {
    flex: 3,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    ...Shadow.sm,
  },
  cardLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: Spacing.xs,
  },
  actionCol: { flex: 2, gap: Spacing.sm },
  actionBtn: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    ...Shadow.sm,
  },
  actionBtnDisabled: { opacity: 0.4 },
  actionBtnIcon: { fontSize: 20 },
  actionBtnLabel: { fontSize: 11, fontWeight: '700', color: Colors.text, textAlign: 'center', lineHeight: 14 },
  infoRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  infoCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    borderLeftWidth: 3,
    ...Shadow.sm,
  },
  infoCardLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  infoCardValue: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  loadingContainer: { paddingTop: Spacing.xxl, alignItems: 'center' },
  emptyArea: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
    ...Shadow.sm,
  },
  emptyIcon: { fontSize: 40, marginBottom: Spacing.xs },
  emptyTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text },
  emptyMsg: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
  docArea: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  docHeader: {
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  docTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text, marginBottom: 2 },
  docMeta: { fontSize: FontSize.xs, color: Colors.textMuted },
  headerBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    justifyContent: 'center',
    minWidth: 64,
    alignItems: 'center',
  },
  headerBtnText: { fontSize: FontSize.xs, fontWeight: '600' },
  docContent: { padding: Spacing.md },
  readBanner: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    backgroundColor: Colors.success + '15',
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: Colors.success,
  },
  readBannerText: { fontSize: FontSize.xs, color: Colors.success, fontWeight: '500' },
  bottomBar: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  signOffBtn: {
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    ...Shadow.md,
  },
  signOffBtnText: { color: Colors.textInverse, fontWeight: '700', fontSize: FontSize.base },
  signedBadge: {
    backgroundColor: Colors.success + '15',
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.success + '40',
  },
  signedBadgeText: { color: Colors.success, fontWeight: '700', fontSize: FontSize.base },
  readGateMsg: {
    backgroundColor: Colors.warning + '15',
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning,
  },
  readGateMsgText: { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 18 },
})
