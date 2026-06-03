import { useState, useCallback, useRef, useEffect } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  Alert, ActivityIndicator, NativeSyntheticEvent, NativeScrollEvent,
  Platform, Linking,
} from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { Breadcrumb } from '@/components/breadcrumb'
import { Colors, Spacing, FontSize, BorderRadius, Shadow } from '@/constants/theme'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { callCraneMeetingGeneratePdf } from '@/lib/api'
import { CRANE_MEETING_CONTENT_STYLES, CRANE_MEETING_NATIVE_STYLES } from '@/lib/crane-meeting-template'
import { WebView } from 'react-native-webview'

// IMPORTANT: Before using this feature ensure these buckets exist in Supabase Dashboard:
//   "crane-meeting-signatures"  private, 5 MB,  image/png
//   "crane-meeting-archive"     private, 50 MB, application/pdf
// Also run supabase/crane_meeting_schema.sql in the Supabase SQL Editor.

interface ActiveMeeting {
  id: string
  meeting_date: string
  meeting_time: string | null
  project: string | null
  project_no: string | null
  content_html: string
  archive_pdf_url: string | null
  status: string
  created_at: string
}

export default function CraneMeetingHome() {
  const router = useRouter()
  const { profile, role } = useAuth()

  const [activeMeeting, setActiveMeeting] = useState<ActiveMeeting | null>(null)
  const [sigCount, setSigCount] = useState(0)
  const [myRead, setMyRead] = useState<{ id: string; read_at: string } | null>(null)
  const [mySig, setMySig] = useState<{ id: string; signed_at: string } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isResetting, setIsResetting] = useState(false)

  const contentDivRef = useRef<any>(null)
  const myReadRef = useRef<{ id: string; read_at: string } | null>(null)

  const canManage = role === 'appointed_person' || role === 'crane_supervisor'

  useEffect(() => { myReadRef.current = myRead }, [myRead])

  // Inject CSS once on web
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const id = 'crane-meeting-content-styles'
    if (document.getElementById(id)) return
    const style = document.createElement('style')
    style.id = id
    style.textContent = CRANE_MEETING_CONTENT_STYLES
    document.head.appendChild(style)
  }, [])

  // Web scroll handler for the content div
  useEffect(() => {
    if (Platform.OS !== 'web') return
    if (!activeMeeting) return

    const timer = setTimeout(() => {
      const div = contentDivRef.current
      if (!div) return

      const handleDivScroll = () => {
        if (myReadRef.current) return
        const { scrollTop, scrollHeight, clientHeight } = div
        console.log('[CRANE-MEETING] div scroll:', { scrollTop, scrollHeight, clientHeight })
        if (scrollTop + clientHeight >= scrollHeight - 50) {
          console.log('[CRANE-MEETING] div reached bottom — marking read')
          setHasScrolledToBottom(true)
          setMyRead({ id: 'local', read_at: new Date().toISOString() })
          if (profile?.id && activeMeeting?.id) {
            supabase
              .from('crane_meeting_reads')
              .insert({ meeting_id: activeMeeting.id, user_id: profile.id })
              .then(({ error }) => {
                if (error && error.code !== '23505') console.error('[CRANE-MEETING] Read insert error:', error)
                else console.log('[CRANE-MEETING] Read recorded (or already exists)')
              })
          }
        }
      }

      div.addEventListener('scroll', handleDivScroll, { passive: true })

      // Mark read immediately if content fits on screen without scrolling
      const { scrollHeight, clientHeight } = div
      if (scrollHeight <= clientHeight + 50 && !myReadRef.current) {
        console.log('[CRANE-MEETING] Content fits on screen — marking read immediately')
        setHasScrolledToBottom(true)
        setMyRead({ id: 'local', read_at: new Date().toISOString() })
        if (profile?.id && activeMeeting?.id) {
          supabase
            .from('crane_meeting_reads')
            .insert({ meeting_id: activeMeeting.id, user_id: profile.id })
            .then(({ error }) => {
              if (error && error.code !== '23505') console.error('[CRANE-MEETING] Read insert error:', error)
            })
        }
      }

      return () => div.removeEventListener('scroll', handleDivScroll)
    }, 300)

    return () => clearTimeout(timer)
  }, [activeMeeting?.id, profile?.id])

  // Realtime subscription for sig count
  useEffect(() => {
    if (!activeMeeting?.id) return

    // Unique channel name per mount avoids React 18 Strict Mode channel reuse
    const channelName = `crane-meeting-sigs-${activeMeeting.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'crane_meeting_signatures',
          filter: `meeting_id=eq.${activeMeeting.id}`,
        },
        async () => {
          const { count } = await supabase
            .from('crane_meeting_signatures')
            .select('*', { count: 'exact', head: true })
            .eq('meeting_id', activeMeeting.id)
          setSigCount(count ?? 0)
          console.log('[CRANE-MEETING] Realtime sig count update:', count)
        }
      )
      .subscribe((status) => {
        console.log('[CRANE-MEETING] Realtime status:', status)
      })

    return () => {
      console.log('[CRANE-MEETING] Removing channel:', channelName)
      supabase.removeChannel(channel)
    }
  }, [activeMeeting?.id])

  const fetchAll = useCallback(async () => {
    if (!profile?.site_id || !profile?.id) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setHasScrolledToBottom(false)

    const { data: meetingData } = await supabase
      .from('crane_meetings')
      .select('id, meeting_date, meeting_time, project, project_no, content_html, archive_pdf_url, status, created_at')
      .eq('site_id', profile.site_id)
      .eq('status', 'active')
      .maybeSingle()

    const meeting = meetingData as ActiveMeeting | null
    setActiveMeeting(meeting)

    if (meeting) {
      const [readRes, sigRes, countRes] = await Promise.all([
        supabase
          .from('crane_meeting_reads')
          .select('id, read_at')
          .eq('meeting_id', meeting.id)
          .eq('user_id', profile.id)
          .maybeSingle(),
        supabase
          .from('crane_meeting_signatures')
          .select('id, signed_at')
          .eq('meeting_id', meeting.id)
          .eq('user_id', profile.id)
          .maybeSingle(),
        supabase
          .from('crane_meeting_signatures')
          .select('*', { count: 'exact', head: true })
          .eq('meeting_id', meeting.id),
      ])
      setMyRead((readRes.data as any) ?? null)
      setMySig((sigRes.data as any) ?? null)
      setSigCount(countRes.count ?? 0)
      if (readRes.data) setHasScrolledToBottom(true)
    } else {
      setMyRead(null)
      setMySig(null)
      setSigCount(0)
    }

    setIsLoading(false)
  }, [profile?.site_id, profile?.id])

  useFocusEffect(useCallback(() => { fetchAll() }, [fetchAll]))

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (hasScrolledToBottom || !activeMeeting || myRead) return
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 50) {
      console.log('[CRANE-MEETING] ScrollView reached bottom — marking read')
      setHasScrolledToBottom(true)
      setMyRead({ id: 'local', read_at: new Date().toISOString() })
      supabase
        .from('crane_meeting_reads')
        .insert({ meeting_id: activeMeeting.id, user_id: profile!.id })
        .then(({ error }) => {
          if (error && error.code !== '23505') console.error('[CRANE-MEETING] Read insert error:', error)
        })
    }
  }

  async function handleGenerate() {
    if (!activeMeeting) return
    const confirmed = Platform.OS === 'web'
      ? window.confirm('Generate archive PDF and close the active meeting?')
      : await new Promise<boolean>(resolve => {
          Alert.alert(
            'Generate Archive PDF',
            'This will archive the current crane meeting and generate the sign-off PDF. Continue?',
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Generate', onPress: () => resolve(true) },
            ],
          )
        })
    if (!confirmed) return

    console.log('[CRANE-MEETING] Generating PDF for meeting:', activeMeeting.id)
    setIsGenerating(true)
    const { error } = await callCraneMeetingGeneratePdf(activeMeeting.id)
    setIsGenerating(false)

    if (error) {
      console.error('[CRANE-MEETING] Generate failed:', error)
      Alert.alert('Error', `${error}\n\nCheck that the crane-meeting-generate-pdf Edge Function is deployed.`)
      return
    }

    Alert.alert('Done', 'Archive PDF generated. The meeting has been archived.', [
      { text: 'View Archive', onPress: () => router.push('/(appointed-person)/crane-meeting/archive' as any) },
      { text: 'OK', onPress: fetchAll },
    ])
  }

  async function handleView() {
    if (!activeMeeting?.archive_pdf_url) {
      router.push('/(appointed-person)/crane-meeting/archive' as any)
      return
    }
    const { data, error } = await supabase.storage
      .from('crane-meeting-archive')
      .createSignedUrl(activeMeeting.archive_pdf_url, 3600)
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

  async function handleReset() {
    if (!activeMeeting) return
    const confirmed = Platform.OS === 'web'
      ? window.confirm('Reset (delete) the current active meeting? This cannot be undone.')
      : await new Promise<boolean>(resolve => {
          Alert.alert(
            'Reset Meeting',
            'Delete the current active crane meeting? It will be removed from the site.',
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
            ],
          )
        })
    if (!confirmed) return

    console.log('[CRANE-MEETING] Resetting meeting:', activeMeeting.id)
    setIsResetting(true)

    const { data, error } = await supabase
      .from('crane_meetings')
      .update({ status: 'deleted' })
      .eq('id', activeMeeting.id)
      .select()

    setIsResetting(false)

    if (error) {
      console.error('[CRANE-MEETING] Reset error:', error)
      Alert.alert('Reset Failed', `${error.message} (code: ${error.code})`)
      return
    }
    if (!data || data.length === 0) {
      Alert.alert('Reset Failed', 'No rows updated — check RLS permissions.')
      return
    }

    console.log('[CRANE-MEETING] Reset succeeded')
    setActiveMeeting(null)
    setMyRead(null)
    setMySig(null)
    await fetchAll()
  }

  const meetingDateFormatted = activeMeeting
    ? new Date(activeMeeting.meeting_date + 'T00:00:00Z').toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    : ''

  return (
    <ScreenWrapper edges={['bottom']}>
      <Breadcrumb items={[
        { label: 'Dashboard', href: '/(appointed-person)/' },
        { label: 'Supervisor Checks', href: '/(appointed-person)/supervisor-checks' },
        { label: 'Crane Meeting' },
      ]} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: activeMeeting && !isLoading ? 90 : Spacing.xxl },
        ]}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {/* Toolbar */}
        <View style={styles.toolbar}>
          {canManage && (
            <TouchableOpacity
              style={styles.toolBtn}
              onPress={() => {
                const path = activeMeeting
                  ? `/(appointed-person)/crane-meeting/setup?meeting_id=${activeMeeting.id}`
                  : '/(appointed-person)/crane-meeting/setup'
                router.push(path as any)
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.toolBtnIcon}>📋</Text>
              <Text style={styles.toolBtnLabel}>{activeMeeting ? 'Edit' : 'Set up'}</Text>
            </TouchableOpacity>
          )}
          {canManage && (
            <TouchableOpacity
              style={[styles.toolBtn, !activeMeeting && styles.toolBtnDisabled]}
              onPress={handleGenerate}
              disabled={!activeMeeting || isGenerating}
              activeOpacity={0.8}
            >
              {isGenerating
                ? <ActivityIndicator size="small" color={Colors.primary} />
                : <Text style={styles.toolBtnIcon}>📄</Text>
              }
              <Text style={styles.toolBtnLabel}>Generate</Text>
            </TouchableOpacity>
          )}
          {canManage && (
            <TouchableOpacity
              style={styles.toolBtn}
              onPress={handleView}
              activeOpacity={0.8}
            >
              <Text style={styles.toolBtnIcon}>👁</Text>
              <Text style={styles.toolBtnLabel}>View</Text>
            </TouchableOpacity>
          )}
          {canManage && (
            <TouchableOpacity
              style={[styles.toolBtn, !activeMeeting && styles.toolBtnDisabled]}
              onPress={handleReset}
              disabled={!activeMeeting || isResetting}
              activeOpacity={0.8}
            >
              {isResetting
                ? <ActivityIndicator size="small" color={Colors.danger} />
                : <Text style={styles.toolBtnIcon}>🗑</Text>
              }
              <Text style={[styles.toolBtnLabel, { color: Colors.danger }]}>Reset</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.toolBtn}
            onPress={() => router.push('/(appointed-person)/crane-meeting/archive' as any)}
            activeOpacity={0.8}
          >
            <Text style={styles.toolBtnIcon}>🗂</Text>
            <Text style={styles.toolBtnLabel}>Archive</Text>
          </TouchableOpacity>
        </View>

        {/* Info cards row: Project + Phase */}
        {(activeMeeting?.project || activeMeeting?.project_no) && (
          <View style={styles.infoRow}>
            <View style={[styles.infoCard, { borderLeftColor: Colors.primary }]}>
              <Text style={styles.infoCardLabel}>PROJECT</Text>
              <Text style={styles.infoCardValue} numberOfLines={3}>
                {activeMeeting?.project || '—'}
              </Text>
            </View>
            <View style={[styles.infoCard, { borderLeftColor: Colors.accent }]}>
              <Text style={styles.infoCardLabel}>PHASE</Text>
              <Text style={styles.infoCardValue} numberOfLines={3}>
                {activeMeeting?.project_no || '—'}
              </Text>
            </View>
          </View>
        )}

        {/* Signed counter */}
        {activeMeeting && !isLoading && (
          <View style={styles.sigCountRow}>
            <View style={styles.sigCountCard}>
              <Text style={styles.sigCountLabel}>Signed</Text>
              <Text style={styles.sigCountValue}>{sigCount}</Text>
            </View>
            {canManage && (
              <TouchableOpacity
                style={styles.attendanceBtn}
                onPress={() => router.push(`/(appointed-person)/crane-meeting/attendance?meeting_id=${activeMeeting.id}` as any)}
                activeOpacity={0.8}
              >
                <Text style={styles.attendanceBtnText}>Who Signed →</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Meeting content area */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : !activeMeeting ? (
          <View style={styles.emptyArea}>
            <Text style={styles.emptyIcon}>🏗</Text>
            <Text style={styles.emptyTitle}>No active crane meeting</Text>
            <Text style={styles.emptyMsg}>
              {canManage
                ? "Tap Set up to create this week's crane meeting."
                : 'Your appointed person or supervisor will set up the weekly crane meeting here.'}
            </Text>
          </View>
        ) : (
          <View style={styles.docArea}>
            <View style={styles.docHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.docTitle}>Crane Meeting</Text>
                <Text style={styles.docMeta}>{meetingDateFormatted}{activeMeeting.meeting_time ? ` at ${activeMeeting.meeting_time}` : ''}</Text>
              </View>
            </View>

            <View style={styles.docContent}>
              {Platform.OS === 'web' ? (
                <div
                  ref={contentDivRef}
                  dangerouslySetInnerHTML={{ __html: activeMeeting.content_html }}
                  style={{ maxWidth: '100%', overflowWrap: 'break-word' } as React.CSSProperties}
                />
              ) : (
                <WebView
                  source={{
                    html: `<html><head><meta name="viewport" content="width=device-width,initial-scale=1.0"><style>${CRANE_MEETING_NATIVE_STYLES}</style></head><body>${activeMeeting.content_html}</body></html>`,
                  }}
                  style={{ height: 600, borderRadius: 8 }}
                  nestedScrollEnabled
                  scrollEnabled
                />
              )}
            </View>

            {myRead && (
              <View style={styles.readBanner}>
                <Text style={styles.readBannerText}>You have read the crane meeting ✓</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Fixed bottom bar: Sign Off / Signed ✓ / read gate */}
      {activeMeeting && !isLoading && (
        <View style={styles.bottomBar}>
          {mySig ? (
            <View style={styles.signedBadge}>
              <Text style={styles.signedBadgeText}>Signed ✓</Text>
            </View>
          ) : !myRead ? (
            <View style={styles.readGateMsg}>
              <Text style={styles.readGateMsgText}>
                {Platform.OS === 'web'
                  ? 'Scroll to the bottom of the meeting to mark it as read, then sign.'
                  : 'Scroll through the full meeting to unlock signing.'}
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.signOffBtn}
              onPress={() => router.push(`/(appointed-person)/crane-meeting/sign?meeting_id=${activeMeeting.id}` as any)}
              activeOpacity={0.85}
            >
              <Text style={styles.signOffBtnText}>Sign Crane Meeting</Text>
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
  toolbar: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
    flexWrap: 'wrap',
  },
  toolBtn: {
    flex: 1,
    minWidth: 60,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    ...Shadow.sm,
  },
  toolBtnDisabled: { opacity: 0.35 },
  toolBtnIcon: { fontSize: 18 },
  toolBtnLabel: { fontSize: 10, fontWeight: '700', color: Colors.text, textAlign: 'center' },
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
  sigCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  sigCountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    ...Shadow.sm,
  },
  sigCountLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '500' },
  sigCountValue: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.primary },
  attendanceBtn: {
    backgroundColor: Colors.primary + '15',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  attendanceBtnText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.primary },
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
