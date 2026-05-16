import { useState, useCallback } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  Alert, ActivityIndicator, NativeSyntheticEvent, NativeScrollEvent, Linking,
  Platform,
} from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import * as DocumentPicker from 'expo-document-picker'
import { WebView } from 'react-native-webview'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { Breadcrumb } from '@/components/breadcrumb'
import { Colors, Spacing, FontSize, BorderRadius, Shadow } from '@/constants/theme'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { callExtractDocxText } from '@/lib/api'

interface ActiveTalk {
  id: string
  title: string
  content_type: 'pdf' | 'docx' | 'text'
  content_text: string | null
  pdf_url: string | null
  status: 'active' | 'archived'
  created_at: string
  creator: { full_name: string } | null
}

function filenameToTitle(filename: string): string {
  return filename.replace(/\.(pdf|docx)$/i, '').replace(/[-_]/g, ' ').trim()
}

// IMPORTANT: Before using this feature, create the following Supabase Storage buckets
// in the Supabase Dashboard (Storage → New bucket):
//   - "toolbox-talk-pdfs"  → private, used for library PDFs, site talk PDFs, and sign-off PDFs
//   - "toolbox-talk-signatures" → private, used for drawn signature PNG images
// Both buckets must be private; signed URLs are generated at read time.

async function uploadFileToStorage(
  asset: DocumentPicker.DocumentPickerAsset,
  mimeType: string,
  companyId: string,
  filename: string,
): Promise<string> {
  const ext = mimeType === 'application/pdf' ? 'pdf' : 'docx'
  const ts = Date.now()
  const safe = filename.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '')
  const path = `library/${companyId}/${ts}_${safe}.${ext}`

  let uploadData: ArrayBuffer | Blob

  if (Platform.OS === 'web') {
    // On web, expo-document-picker exposes the native File/Blob on asset.file
    if ((asset as any).file) {
      uploadData = await (asset as any).file.arrayBuffer()
    } else if (asset.uri?.startsWith('data:')) {
      // base64 data URI fallback
      const base64 = asset.uri.split(',')[1]
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      uploadData = bytes.buffer
    } else {
      const res = await fetch(asset.uri)
      uploadData = await res.arrayBuffer()
    }
  } else {
    const res = await fetch(asset.uri)
    uploadData = await res.blob()
  }

  console.log('UPLOAD ASSET:', {
    uri: asset.uri?.substring(0, 100),
    mimeType,
    hasFile: !!(asset as any).file,
    platform: Platform.OS,
    uploadDataType: uploadData?.constructor?.name,
    uploadDataSize: uploadData instanceof ArrayBuffer
      ? uploadData.byteLength
      : (uploadData as Blob)?.size,
  })

  const { error, data } = await supabase.storage
    .from('toolbox-talk-pdfs')
    .upload(path, uploadData, { contentType: mimeType, upsert: false })

  if (error) {
    console.error('STORAGE UPLOAD ERROR:', JSON.stringify(error))
    if (
      error.message === 'Bucket not found' ||
      (error as any).statusCode === '404' ||
      (error as any).error === 'Bucket not found'
    ) {
      throw new Error(
        'Storage bucket "toolbox-talk-pdfs" does not exist.\n\n' +
        'To fix: open the Supabase Dashboard → Storage → New Bucket → ' +
        'create a bucket named "toolbox-talk-pdfs" (set to Private).'
      )
    }
    throw new Error(`Storage upload failed: ${error.message}`)
  }

  console.log('STORAGE UPLOAD SUCCESS:', data)
  return path
}

export default function ToolboxTalkHome() {
  const router = useRouter()
  const { profile, role } = useAuth()

  const [activeTalk, setActiveTalk] = useState<ActiveTalk | null>(null)
  const [myRead, setMyRead] = useState<{ id: string; read_at: string } | null>(null)
  const [mySig, setMySig] = useState<{ id: string; signed_at: string } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [fileSignedUrl, setFileSignedUrl] = useState<string | null>(null)
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false)
  const [isRecordingRead, setIsRecordingRead] = useState(false)

  const canManage = role === 'appointed_person' || role === 'crane_supervisor'

  const fetchActiveTalk = useCallback(async () => {
    if (!profile?.site_id || !profile?.id) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setFileSignedUrl(null)
    setHasScrolledToBottom(false)

    const { data: talkData } = await supabase
      .from('toolbox_talks')
      .select('id, title, content_type, content_text, pdf_url, status, created_at, creator:profiles!created_by(full_name)')
      .eq('site_id', profile.site_id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const talk = talkData as ActiveTalk | null
    setActiveTalk(talk)

    if (talk) {
      const [readRes, sigRes] = await Promise.all([
        supabase
          .from('toolbox_talk_reads')
          .select('id, read_at')
          .eq('talk_id', talk.id)
          .eq('user_id', profile.id)
          .maybeSingle(),
        supabase
          .from('toolbox_talk_signatures')
          .select('id, signed_at')
          .eq('talk_id', talk.id)
          .eq('user_id', profile.id)
          .maybeSingle(),
      ])
      setMyRead((readRes.data as any) ?? null)
      setMySig((sigRes.data as any) ?? null)
      if (readRes.data) setHasScrolledToBottom(true)

      if ((talk.content_type === 'pdf' || talk.content_type === 'docx') && talk.pdf_url) {
        const { data: signed } = await supabase.storage
          .from('toolbox-talk-pdfs')
          .createSignedUrl(talk.pdf_url, 3600)
        if (signed?.signedUrl) setFileSignedUrl(signed.signedUrl)
      }
    }

    setIsLoading(false)
  }, [profile?.site_id, profile?.id])

  useFocusEffect(useCallback(() => { fetchActiveTalk() }, [fetchActiveTalk]))

  async function recordRead() {
    if (myRead || isRecordingRead || !profile?.id || !activeTalk) return
    setIsRecordingRead(true)
    const { error } = await supabase
      .from('toolbox_talk_reads')
      .insert({ talk_id: activeTalk.id, user_id: profile.id })
    setIsRecordingRead(false)
    if (!error) setMyRead({ id: 'pending', read_at: new Date().toISOString() })
  }

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (hasScrolledToBottom || !activeTalk) return
    if (activeTalk.content_type === 'pdf') return
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 50) {
      setHasScrolledToBottom(true)
      recordRead()
    }
  }

  async function handleUploadFile() {
    if (!profile?.company_id || !profile?.site_id) {
      Alert.alert('Error', 'Your account is not linked to a site.')
      return
    }
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ],
        copyToCacheDirectory: false,
      })
      if (result.canceled) return

      const asset = result.assets[0]
      const mimeType = asset.mimeType ?? 'application/pdf'
      const contentType: 'pdf' | 'docx' = mimeType === 'application/pdf' ? 'pdf' : 'docx'
      const title = filenameToTitle(asset.name)

      setIsUploading(true)

      // 1. Upload to storage
      const filePath = await uploadFileToStorage(asset, mimeType, profile.company_id, asset.name)

      // 2. Create library record
      const { data: libData, error: libError } = await supabase
        .from('toolbox_talk_library')
        .insert({
          company_id: profile.company_id,
          title,
          content_type: contentType,
          pdf_url: filePath,
          created_by: profile.id,
        })
        .select('id')
        .single()
      if (libError) throw new Error(libError.message)

      // 3. Create site talk record
      const { data: talkData, error: talkError } = await supabase
        .from('toolbox_talks')
        .insert({
          site_id: profile.site_id,
          library_id: libData.id,
          title,
          content_type: contentType,
          pdf_url: filePath,
          created_by: profile.id,
          status: 'active',
        })
        .select('id')
        .single()
      if (talkError) throw new Error(talkError.message)

      // 4. For docx: extract text in background (non-blocking)
      if (contentType === 'docx') {
        callExtractDocxText(talkData.id, filePath)
      }

      setIsUploading(false)
      fetchActiveTalk()
    } catch (err: any) {
      setIsUploading(false)
      console.error('UPLOAD FAILED AT STEP:', err)
      Alert.alert('Upload Error', JSON.stringify(err?.message ?? err))
    }
  }

  return (
    <ScreenWrapper edges={['bottom']}>
      <Breadcrumb items={[
        { label: 'Dashboard', href: '/(appointed-person)/' },
        { label: 'Toolbox Talk' },
      ]} />
      {isUploading && (
        <View style={styles.overlay}>
          <View style={styles.overlayCard}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.overlayText}>Uploading…</Text>
          </View>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: activeTalk && !isLoading ? 90 : Spacing.xxl },
        ]}
        onScroll={handleScroll}
        scrollEventThrottle={200}
      >
        {/* Action buttons */}
        <View style={styles.buttonGrid}>
          {canManage && (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={handleUploadFile}
              disabled={isUploading}
              activeOpacity={0.8}
            >
              <Text style={styles.actionBtnIcon}>📄</Text>
              <Text style={styles.actionBtnLabel}>Upload File</Text>
            </TouchableOpacity>
          )}

          {canManage && (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => router.push('/(appointed-person)/toolbox-talk/library' as any)}
              activeOpacity={0.8}
            >
              <Text style={styles.actionBtnIcon}>📚</Text>
              <Text style={styles.actionBtnLabel}>Library</Text>
            </TouchableOpacity>
          )}

          {canManage && (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => {
                if (!activeTalk) {
                  Alert.alert('No Active Talk', 'There is no active toolbox talk.')
                  return
                }
                router.push(`/(appointed-person)/toolbox-talk/attendance?talk_id=${activeTalk.id}` as any)
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.actionBtnIcon}>👥</Text>
              <Text style={styles.actionBtnLabel}>Attendance</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => router.push('/(appointed-person)/toolbox-talk/archive' as any)}
            activeOpacity={0.8}
          >
            <Text style={styles.actionBtnIcon}>🗂</Text>
            <Text style={styles.actionBtnLabel}>Archive</Text>
          </TouchableOpacity>
        </View>

        {/* Document area */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : !activeTalk ? (
          <View style={styles.emptyArea}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>No active toolbox talk</Text>
            <Text style={styles.emptyMsg}>
              {canManage
                ? 'Upload a file or select from the library to begin.'
                : 'Your appointed person or supervisor will add a toolbox talk here.'}
            </Text>
          </View>
        ) : (
          <View style={styles.docArea}>
            <View style={styles.docHeader}>
              <Text style={styles.docTitle} numberOfLines={2}>{activeTalk.title}</Text>
              <Text style={styles.docMeta}>{activeTalk.creator?.full_name ?? '—'}</Text>
            </View>

            {/* DOCX — extracted text */}
            {activeTalk.content_type === 'docx' && (
              <View style={styles.docContent}>
                {activeTalk.content_text ? (
                  <Text style={styles.docText}>{activeTalk.content_text}</Text>
                ) : (
                  <View style={styles.extractingState}>
                    <ActivityIndicator color={Colors.primary} />
                    <Text style={styles.extractingText}>Extracting document text…</Text>
                    <TouchableOpacity
                      style={styles.refreshBtn}
                      onPress={fetchActiveTalk}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.refreshBtnText}>Refresh</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* PDF — inline WebView */}
            {activeTalk.content_type === 'pdf' && (
              <View style={styles.docContent}>
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
                        style={styles.markReadBtn}
                        onPress={() => { setHasScrolledToBottom(true); recordRead() }}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.markReadText}>Mark as Read</Text>
                      </TouchableOpacity>
                    )}
                  </>
                ) : (
                  <ActivityIndicator color={Colors.primary} style={{ marginVertical: Spacing.xl }} />
                )}
              </View>
            )}

            {/* Open original file externally */}
            {fileSignedUrl && (
              <TouchableOpacity
                style={styles.openFileRow}
                onPress={() => Linking.openURL(fileSignedUrl)}
                activeOpacity={0.8}
              >
                <Text style={styles.openFileText}>
                  {activeTalk.content_type === 'pdf' ? 'View as PDF ↗' : 'Open Original File ↗'}
                </Text>
              </TouchableOpacity>
            )}

            {/* Read confirmation banner */}
            {myRead && (
              <View style={styles.readBanner}>
                <Text style={styles.readBannerText}>You have read this talk</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Fixed Sign Off button — only when active talk exists */}
      {activeTalk && !isLoading && (
        <View style={styles.bottomBar}>
          {mySig ? (
            <View style={styles.signedBadge}>
              <Text style={styles.signedBadgeText}>Signed ✓</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.signOffBtn}
              onPress={() => router.push(`/(appointed-person)/toolbox-talk/sign?talk_id=${activeTalk.id}` as any)}
              activeOpacity={0.85}
            >
              <Text style={styles.signOffBtnText}>Sign Off</Text>
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
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 99,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
    ...Shadow.md,
  },
  overlayText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  buttonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  actionBtn: {
    flex: 1,
    minWidth: '44%',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    alignItems: 'center',
    gap: 6,
    ...Shadow.sm,
  },
  actionBtnIcon: { fontSize: 22 },
  actionBtnLabel: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
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
  emptyMsg: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
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
  },
  docTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 4,
  },
  docMeta: { fontSize: FontSize.xs, color: Colors.textMuted },
  docContent: { padding: Spacing.md },
  docText: { fontSize: FontSize.base, color: Colors.text, lineHeight: 26 },
  extractingState: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md },
  extractingText: { fontSize: FontSize.sm, color: Colors.textMuted },
  refreshBtn: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  refreshBtnText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600' },
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
    marginTop: Spacing.md,
  },
  markReadText: { color: Colors.primary, fontWeight: '600', fontSize: FontSize.sm },
  openFileRow: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  openFileText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '600' },
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
  signOffBtnText: {
    color: Colors.textInverse,
    fontWeight: '700',
    fontSize: FontSize.base,
  },
  signedBadge: {
    backgroundColor: Colors.success + '15',
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.success + '40',
  },
  signedBadgeText: {
    color: Colors.success,
    fontWeight: '700',
    fontSize: FontSize.base,
  },
})
