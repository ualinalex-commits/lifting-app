import { useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, NativeSyntheticEvent,
  NativeScrollEvent, Linking,
} from 'react-native'
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { Colors, Spacing, FontSize, BorderRadius, Shadow } from '@/constants/theme'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { callGenerateSignOff } from '@/lib/api'

interface ToolboxTalk {
  id: string
  title: string
  content_type: 'text' | 'pdf'
  body: string | null
  pdf_url: string | null
  sign_off_pdf_url: string | null
  is_archived: boolean
  archived_at: string | null
  created_at: string
  creator: { full_name: string } | null
}

interface MyRead { id: string; read_at: string }
interface MySig  { id: string; signed_at: string }

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
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
  const [pdfSignedUrl, setPdfSignedUrl] = useState<string | null>(null)

  const canManage = role === 'appointed_person' || role === 'crane_supervisor'

  const fetchAll = useCallback(async () => {
    if (!profile?.id) return
    setIsLoading(true)

    const [talkRes, readRes, sigRes] = await Promise.all([
      supabase
        .from('toolbox_talks')
        .select(`
          id, title, content_type, body, pdf_url, sign_off_pdf_url,
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

    // If already read, unlock sign button
    if (readRes.data) setHasScrolledToBottom(true)

    // For PDF talks, get a signed URL
    if (talkData?.content_type === 'pdf' && talkData.pdf_url) {
      const { data: signed } = await supabase.storage
        .from('toolbox-talk-pdfs')
        .createSignedUrl(talkData.pdf_url, 3600)
      if (signed?.signedUrl) setPdfSignedUrl(signed.signedUrl)
    }

    setIsLoading(false)
  }, [id, profile?.id])

  useFocusEffect(useCallback(() => { fetchAll() }, [fetchAll]))

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
    if (hasScrolledToBottom) return
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent
    const isBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 40
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
            Alert.alert('Done', 'Sign-off PDF generated. The talk has been archived.')
            fetchAll()
          },
        },
      ]
    )
  }

  function handleViewSignOff() {
    if (!talk?.sign_off_pdf_url) return
    supabase.storage
      .from('toolbox-talk-pdfs')
      .createSignedUrl(talk.sign_off_pdf_url, 3600)
      .then(({ data }) => {
        if (data?.signedUrl) Linking.openURL(data.signedUrl)
      })
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

  return (
    <ScreenWrapper edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
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
              <Text style={styles.archivedText}>Archived · {talk.archived_at ? formatDateTime(talk.archived_at) : ''}</Text>
            </View>
          )}
        </View>

        {/* Content */}
        {talk.content_type === 'text' ? (
          <View style={styles.contentCard}>
            <Text style={styles.bodyText}>{talk.body}</Text>
          </View>
        ) : (
          <View style={styles.contentCard}>
            <Text style={styles.pdfNote}>
              This talk contains a PDF document.
            </Text>
            {pdfSignedUrl ? (
              <TouchableOpacity
                style={styles.viewPdfBtn}
                onPress={() => Linking.openURL(pdfSignedUrl!)}
                activeOpacity={0.8}
              >
                <Text style={styles.viewPdfBtnText}>View PDF</Text>
              </TouchableOpacity>
            ) : (
              <ActivityIndicator color={Colors.primary} style={{ marginVertical: Spacing.sm }} />
            )}
            {!hasScrolledToBottom && (
              <View style={styles.noteCard}>
                <Text style={styles.noteText}>
                  Open and read the PDF above, then scroll to the bottom of this page to unlock the Sign button.
                </Text>
              </View>
            )}
            {/* Invisible spacer — tap "Mark as Read" for PDF talks */}
            {!myRead && (
              <TouchableOpacity
                style={styles.markReadBtn}
                onPress={() => { setHasScrolledToBottom(true); recordRead() }}
                activeOpacity={0.8}
              >
                <Text style={styles.markReadText}>Mark as Read</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Read status */}
        {myRead && (
          <View style={styles.readBanner}>
            <Text style={styles.readBannerText}>
              You read this on {formatDateTime(myRead.read_at)}
            </Text>
          </View>
        )}

        {/* Action buttons */}
        {!isArchived && (
          <View style={styles.actions}>
            {/* Sign button — gated behind scroll-to-bottom */}
            {alreadySigned ? (
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
            )}

            {canManage && (
              <>
                <TouchableOpacity
                  style={styles.statusBtn}
                  onPress={() => router.push(`/(appointed-person)/toolbox-talk/status?talk_id=${id}` as any)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.statusBtnText}>View Status</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.generateBtn, isGenerating && styles.generateBtnDisabled]}
                  onPress={handleGenerateSignOff}
                  disabled={isGenerating}
                  activeOpacity={0.8}
                >
                  {isGenerating
                    ? <ActivityIndicator color={Colors.textInverse} />
                    : <Text style={styles.generateBtnText}>Generate Sign-Off Page</Text>
                  }
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* Archived: view sign-off PDF */}
        {isArchived && talk.sign_off_pdf_url && (
          <View style={styles.actions}>
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
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFoundText: { fontSize: FontSize.base, color: Colors.textMuted },
  scroll: { paddingBottom: Spacing.xxl },
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
  bodyText: {
    fontSize: FontSize.base,
    color: Colors.text,
    lineHeight: 26,
  },
  pdfNote: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  viewPdfBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  viewPdfBtnText: {
    color: Colors.textInverse,
    fontWeight: '700',
    fontSize: FontSize.sm,
  },
  noteCard: {
    backgroundColor: Colors.primary + '0D',
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginTop: Spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  noteText: { fontSize: FontSize.sm, color: Colors.primary, lineHeight: 18 },
  markReadBtn: {
    marginTop: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  markReadText: { color: Colors.primary, fontWeight: '600', fontSize: FontSize.sm },
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
  actions: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
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
  statusBtn: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.primary,
    ...Shadow.sm,
  },
  statusBtnText: { color: Colors.primary, fontWeight: '700', fontSize: FontSize.sm },
  generateBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    ...Shadow.sm,
  },
  generateBtnDisabled: { opacity: 0.6 },
  generateBtnText: { color: Colors.textInverse, fontWeight: '700', fontSize: FontSize.sm },
})
