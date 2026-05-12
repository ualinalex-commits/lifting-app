import { useState, useCallback, useEffect } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, Modal,
  StyleSheet, Alert, ActivityIndicator, NativeSyntheticEvent,
  NativeScrollEvent, Linking,
} from 'react-native'
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router'
import { WebView } from 'react-native-webview'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { Colors, Spacing, FontSize, BorderRadius, Shadow } from '@/constants/theme'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { callGenerateSignOff } from '@/lib/api'

interface ToolboxTalk {
  id: string
  title: string
  content_type: 'text' | 'pdf' | 'docx'
  body: string | null
  pdf_url: string | null
  content_text: string | null
  sign_off_pdf_url: string | null
  is_archived: boolean
  archived_at: string | null
  created_at: string
  creator: { full_name: string } | null
}

interface MyRead { id: string; read_at: string }
interface MySig  { id: string; signed_at: string }

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
  company_name: string
}

const ROLE_LABELS: Record<string, string> = {
  appointed_person:    'Appointed Person',
  crane_supervisor:    'Crane Supervisor',
  crane_operator:      'Crane Operator',
  slinger_signaller:   'Slinger / Signaller',
  subcontractor_admin: 'Subcontractor Admin',
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function ToolboxTalkDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { profile, role } = useAuth()

  const [talk, setTalk] = useState<ToolboxTalk | null>(null)
  const [myRead, setMyRead] = useState<MyRead | null>(null)
  const [mySig, setMySig] = useState<MySig | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false)
  const [isRecordingRead, setIsRecordingRead] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [fileSignedUrl, setFileSignedUrl] = useState<string | null>(null)

  // Attendance modal
  const [showAttendance, setShowAttendance] = useState(false)
  const [attendanceReads, setAttendanceReads] = useState<ReadEntry[]>([])
  const [attendanceSigs, setAttendanceSigs] = useState<SigEntry[]>([])
  const [isLoadingAttendance, setIsLoadingAttendance] = useState(false)

  const canManage = role === 'appointed_person' || role === 'crane_supervisor'

  const fetchAll = useCallback(async () => {
    if (!profile?.id) return
    setIsLoading(true)

    const [talkRes, readRes, sigRes] = await Promise.all([
      supabase
        .from('toolbox_talks')
        .select(`
          id, title, content_type, body, pdf_url, content_text, sign_off_pdf_url,
          is_archived, archived_at, created_at,
          creator:profiles!created_by(full_name)
        `)
        .eq('id', id)
        .single(),
      supabase
        .from('toolbox_talk_reads')
        .select('id, read_at')
        .eq('talk_id', id)
        .eq('user_id', profile.id)
        .maybeSingle(),
      supabase
        .from('toolbox_talk_signatures')
        .select('id, signed_at')
        .eq('talk_id', id)
        .eq('user_id', profile.id)
        .maybeSingle(),
    ])

    const talkData = talkRes.data as ToolboxTalk | null
    setTalk(talkData)
    setMyRead(readRes.data as MyRead | null)
    setMySig(sigRes.data as MySig | null)

    if (readRes.data) setHasScrolledToBottom(true)

    // Generate signed URL for file types (PDF and DOCX)
    if ((talkData?.content_type === 'pdf' || talkData?.content_type === 'docx') && talkData.pdf_url) {
      const { data: signed } = await supabase.storage
        .from('toolbox-talk-pdfs')
        .createSignedUrl(talkData.pdf_url, 3600)
      if (signed?.signedUrl) setFileSignedUrl(signed.signedUrl)
    }

    setIsLoading(false)
  }, [id, profile?.id])

  useFocusEffect(useCallback(() => { fetchAll() }, [fetchAll]))

  const fetchAttendance = useCallback(async () => {
    if (!id) return
    setIsLoadingAttendance(true)
    const [readsRes, sigsRes] = await Promise.all([
      supabase
        .from('toolbox_talk_reads')
        .select('user_id, read_at, reader:profiles!user_id(full_name, role)')
        .eq('talk_id', id)
        .order('read_at'),
      supabase
        .from('toolbox_talk_signatures')
        .select('user_id, signed_at, full_name, role, company_name')
        .eq('talk_id', id)
        .order('signed_at'),
    ])
    setAttendanceReads((readsRes.data as ReadEntry[]) ?? [])
    setAttendanceSigs((sigsRes.data as SigEntry[]) ?? [])
    setIsLoadingAttendance(false)
  }, [id])

  useEffect(() => {
    if (!showAttendance || !id) return

    fetchAttendance()

    const channel = supabase
      .channel(`toolbox-talk-attendance-${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'toolbox_talk_reads', filter: `talk_id=eq.${id}` },
        () => fetchAttendance()
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'toolbox_talk_signatures', filter: `talk_id=eq.${id}` },
        () => fetchAttendance()
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [showAttendance, id, fetchAttendance])

  async function recordRead() {
    if (myRead || isRecordingRead || !profile?.id) return
    setIsRecordingRead(true)
    const { error } = await supabase
      .from('toolbox_talk_reads')
      .insert({ talk_id: id, user_id: profile.id })
    setIsRecordingRead(false)
    if (!error) {
      setMyRead({ id: 'pending', read_at: new Date().toISOString() })
    }
  }

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (hasScrolledToBottom || !talk) return
    if (talk.content_type === 'pdf') return
    if (talk.content_type === 'docx' && !talk.content_text) return
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent
    const isBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 50
    if (isBottom) {
      setHasScrolledToBottom(true)
      recordRead()
    }
  }

  async function handleGenerateSignOff() {
    Alert.alert(
      'Generate Sign-Off',
      'This will generate the sign-off PDF and archive this talk. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate',
          onPress: async () => {
            setIsGenerating(true)
            const { error } = await callGenerateSignOff(id)
            setIsGenerating(false)
            if (error) {
              Alert.alert('Error', error)
              return
            }
            setShowAttendance(false)
            Alert.alert('Done', 'Sign-off PDF generated. The talk has been archived.')
            fetchAll()
          },
        },
      ]
    )
  }

  async function handleViewSignOff() {
    if (!talk?.sign_off_pdf_url) return
    const { data } = await supabase.storage
      .from('toolbox-talk-pdfs')
      .createSignedUrl(talk.sign_off_pdf_url, 3600)
    if (data?.signedUrl) Linking.openURL(data.signedUrl)
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

  if (!talk) {
    return (
      <ScreenWrapper edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <Text style={styles.notFoundText}>Talk not found.</Text>
        </View>
      </ScreenWrapper>
    )
  }

  const isArchived = talk.is_archived
  const alreadySigned = !!mySig
  const hasFileUrl = talk.content_type !== 'text' && !!talk.pdf_url

  return (
    <ScreenWrapper edges={['bottom']}>
      {/* Scrollable content */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scroll, { paddingBottom: isArchived ? Spacing.xxl : 160 }]}
        onScroll={handleScroll}
        scrollEventThrottle={200}
      >
        {/* Header */}
        <View style={styles.headerCard}>
          <Text style={styles.talkTitle}>{talk.title}</Text>
          <Text style={styles.talkMeta}>
            {talk.creator?.full_name ?? '—'} · {formatDateTime(talk.created_at)}
          </Text>
          {isArchived && (
            <View style={styles.archivedBanner}>
              <Text style={styles.archivedText}>
                Archived · {talk.archived_at ? formatDateTime(talk.archived_at) : ''}
              </Text>
            </View>
          )}
        </View>

        {/* Content — text */}
        {talk.content_type === 'text' && (
          <View style={styles.contentCard}>
            <Text style={styles.bodyText}>{talk.body}</Text>
          </View>
        )}

        {/* Content — docx (extracted text) */}
        {talk.content_type === 'docx' && (
          <View style={styles.contentCard}>
            {talk.content_text ? (
              <Text style={styles.bodyText}>{talk.content_text}</Text>
            ) : (
              <>
                <Text style={styles.pdfNote}>Extracting document text, please wait…</Text>
                <ActivityIndicator color={Colors.primary} style={{ marginVertical: Spacing.sm }} />
                <TouchableOpacity style={styles.refreshBtn} onPress={fetchAll} activeOpacity={0.8}>
                  <Text style={styles.refreshBtnText}>Refresh</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* Content — PDF embedded in WebView */}
        {talk.content_type === 'pdf' && (
          <View style={styles.contentCard}>
            {fileSignedUrl ? (
              <>
                <WebView
                  source={{ uri: fileSignedUrl }}
                  style={styles.pdfViewer}
                  nestedScrollEnabled={true}
                  startInLoadingState={true}
                  renderLoading={() => (
                    <ActivityIndicator
                      color={Colors.primary}
                      style={StyleSheet.absoluteFillObject}
                    />
                  )}
                />
                {!myRead && (
                  <TouchableOpacity
                    style={[styles.markReadBtn, { marginTop: Spacing.md }]}
                    onPress={() => { setHasScrolledToBottom(true); recordRead() }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.markReadText}>Mark as Read</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <ActivityIndicator color={Colors.primary} style={{ marginVertical: Spacing.md }} />
            )}
          </View>
        )}

        {/* "View as PDF" / "Open File" — small button below viewer */}
        {hasFileUrl && fileSignedUrl && (
          <TouchableOpacity
            style={styles.openFileRow}
            onPress={() => Linking.openURL(fileSignedUrl)}
            activeOpacity={0.8}
          >
            <Text style={styles.openFileText}>
              {talk.content_type === 'pdf' ? 'View as PDF ↗' : 'Open Original File ↗'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Read status banner */}
        {myRead && (
          <View style={styles.readBanner}>
            <Text style={styles.readBannerText}>
              You read this on {formatDateTime(myRead.read_at)}
            </Text>
          </View>
        )}

        {/* Archived: view sign-off PDF */}
        {isArchived && talk.sign_off_pdf_url && (
          <View style={styles.signOffSection}>
            <TouchableOpacity
              style={styles.viewPdfBtn}
              onPress={handleViewSignOff}
              activeOpacity={0.8}
            >
              <Text style={styles.viewPdfBtnText}>View Sign-Off PDF</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Fixed bottom bar */}
      <View style={styles.bottomBar}>
        {canManage && (
          <TouchableOpacity
            style={styles.attendanceBtn}
            onPress={() => setShowAttendance(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.attendanceBtnText}>Attendance</Text>
          </TouchableOpacity>
        )}

        {!isArchived && (
          alreadySigned ? (
            <View style={styles.signedBadge}>
              <Text style={styles.signedBadgeText}>Signed ✓</Text>
              <Text style={styles.signedAt}>{formatDateTime(mySig!.signed_at)}</Text>
            </View>
          ) : hasScrolledToBottom ? (
            <TouchableOpacity
              style={styles.signBtn}
              onPress={() => router.push(`/(appointed-person)/toolbox-talk/sign?talk_id=${id}` as any)}
              activeOpacity={0.8}
            >
              <Text style={styles.signBtnText}>Sign this Talk</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.signBtnLocked}>
              <Text style={styles.signBtnLockedText}>
                Read to the end to unlock signing
              </Text>
            </View>
          )
        )}
      </View>

      {/* Attendance modal */}
      <Modal
        visible={showAttendance}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAttendance(false)}
      >
        <View style={att.container}>
          <View style={att.header}>
            <Text style={att.headerTitle}>Attendance</Text>
            <View style={att.headerRight}>
              <View style={att.livePill}>
                <View style={att.liveDot} />
                <Text style={att.liveText}>Live</Text>
              </View>
              <TouchableOpacity onPress={() => setShowAttendance(false)} activeOpacity={0.8}>
                <Text style={att.doneBtn}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>

          {isLoadingAttendance ? (
            <View style={att.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : (
            <ScrollView contentContainerStyle={att.scroll}>
              {/* Read section */}
              <View style={att.sectionHeader}>
                <Text style={att.sectionTitle}>Read ({attendanceReads.length})</Text>
              </View>
              {attendanceReads.length === 0 ? (
                <Text style={att.emptyText}>No reads recorded yet.</Text>
              ) : (
                attendanceReads.map((r) => (
                  <View key={r.user_id} style={att.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={att.rowName}>{r.reader?.full_name ?? '—'}</Text>
                      <Text style={att.rowSub}>
                        {ROLE_LABELS[r.reader?.role ?? ''] ?? r.reader?.role ?? '—'}
                      </Text>
                    </View>
                    <Text style={att.rowTime}>{formatTime(r.read_at)}</Text>
                  </View>
                ))
              )}

              <View style={att.divider} />

              {/* Signed section */}
              <View style={att.sectionHeader}>
                <Text style={att.sectionTitle}>Signed ({attendanceSigs.length})</Text>
              </View>
              {attendanceSigs.length === 0 ? (
                <Text style={att.emptyText}>No signatures recorded yet.</Text>
              ) : (
                attendanceSigs.map((s) => (
                  <View key={s.user_id} style={att.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={att.rowName}>{s.full_name}</Text>
                      <Text style={att.rowSub}>
                        {ROLE_LABELS[s.role] ?? s.role} · {s.company_name}
                      </Text>
                    </View>
                    <Text style={att.rowTime}>{formatTime(s.signed_at)}</Text>
                  </View>
                ))
              )}

              {/* Generate sign-off — canManage, active talks only */}
              {canManage && !isArchived && (
                <View style={att.generateSection}>
                  <TouchableOpacity
                    style={[att.generateBtn, isGenerating && att.generateBtnDisabled]}
                    onPress={handleGenerateSignOff}
                    disabled={isGenerating}
                    activeOpacity={0.8}
                  >
                    {isGenerating
                      ? <ActivityIndicator color={Colors.textInverse} />
                      : <Text style={att.generateBtnText}>Generate Sign-Off Page</Text>
                    }
                  </TouchableOpacity>
                  <Text style={att.generateHint}>
                    Archives this talk and produces a combined PDF with all signatures appended.
                  </Text>
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </Modal>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFoundText: { fontSize: FontSize.base, color: Colors.textMuted },
  scroll: {},
  headerCard: {
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadow.sm,
  },
  talkTitle: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.text,
    lineHeight: 28,
    marginBottom: Spacing.xs,
  },
  talkMeta: { fontSize: FontSize.xs, color: Colors.textMuted },
  archivedBanner: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.textMuted + '20',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    alignSelf: 'flex-start',
  },
  archivedText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textMuted },
  contentCard: {
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    ...Shadow.sm,
  },
  bodyText: { fontSize: FontSize.base, color: Colors.text, lineHeight: 26 },
  pdfNote: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.sm },
  pdfViewer: {
    height: 480,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
    backgroundColor: Colors.background,
  },
  markReadBtn: {
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  markReadText: { color: Colors.primary, fontWeight: '600', fontSize: FontSize.sm },
  refreshBtn: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  refreshBtnText: { color: Colors.textSecondary, fontWeight: '600', fontSize: FontSize.sm },
  openFileRow: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    alignSelf: 'flex-start',
  },
  openFileText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '600' },
  readBanner: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.success + '15',
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: Colors.success,
  },
  readBannerText: { fontSize: FontSize.xs, color: Colors.success, fontWeight: '500' },
  signOffSection: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  viewPdfBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  viewPdfBtnText: { color: Colors.textInverse, fontWeight: '700', fontSize: FontSize.sm },
  // Fixed bottom bar
  bottomBar: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing.sm,
  },
  attendanceBtn: {
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  attendanceBtnText: { color: Colors.primary, fontWeight: '700', fontSize: FontSize.sm },
  signBtn: {
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    ...Shadow.md,
  },
  signBtnText: { color: Colors.textInverse, fontWeight: '700', fontSize: FontSize.base },
  signBtnLocked: {
    backgroundColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  signBtnLockedText: { color: Colors.textMuted, fontWeight: '600', fontSize: FontSize.sm },
  signedBadge: {
    backgroundColor: Colors.success + '15',
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.success + '40',
  },
  signedBadgeText: { color: Colors.success, fontWeight: '700', fontSize: FontSize.base },
  signedAt: { color: Colors.success, fontSize: FontSize.xs, marginTop: 2 },
})

const att = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
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
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  sectionHeader: { marginBottom: Spacing.sm, marginTop: Spacing.xs },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    paddingVertical: Spacing.sm,
    paddingLeft: Spacing.xs,
  },
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
