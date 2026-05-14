import { useState, useCallback } from 'react'
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet, Alert, ActivityIndicator,
} from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import * as DocumentPicker from 'expo-document-picker'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { EmptyState } from '@/components/empty-state'
import { Colors, Spacing, FontSize, BorderRadius, Shadow } from '@/constants/theme'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { callExtractDocxText } from '@/lib/api'

interface ToolboxTalk {
  id: string
  title: string
  content_type: 'text' | 'pdf' | 'docx'
  is_archived: boolean
  created_at: string
  creator: { full_name: string } | null
  reads: { user_id: string }[]
  signatures: { user_id: string }[]
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function filenameToTitle(filename: string): string {
  return filename.replace(/\.(pdf|docx)$/i, '').replace(/[-_]/g, ' ').trim()
}

function mimeToContentType(mimeType: string): 'pdf' | 'docx' {
  return mimeType === 'application/pdf' ? 'pdf' : 'docx'
}

function mimeToExt(mimeType: string): string {
  return mimeType === 'application/pdf' ? 'pdf' : 'docx'
}

async function uploadFileToStorage(uri: string, mimeType: string, companyId: string): Promise<string> {
  const ext = mimeToExt(mimeType)
  const uniqueId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  const path = `library/${companyId}/${uniqueId}.${ext}`
  const response = await fetch(uri)
  const blob = await response.blob()
  const { error } = await supabase.storage
    .from('toolbox-talk-pdfs')
    .upload(path, blob, { contentType: mimeType, upsert: false })
  if (error) throw new Error(error.message)
  return path
}

export default function ToolboxTalkScreen() {
  const router = useRouter()
  const { profile, role } = useAuth()
  const [isUploading, setIsUploading] = useState(false)

  // Used only for non-canCreate roles (operative talk list)
  const [talks, setTalks] = useState<ToolboxTalk[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const canCreate = role === 'appointed_person' || role === 'crane_supervisor'

  // Only fetch talk list for non-canCreate roles
  useFocusEffect(
    useCallback(() => {
      if (canCreate || !profile?.site_id) {
        setIsLoading(false)
        return
      }
      setIsLoading(true)
      supabase
        .from('toolbox_talks')
        .select(`
          id, title, content_type, is_archived, created_at,
          creator:profiles!created_by(full_name),
          reads:toolbox_talk_reads(user_id),
          signatures:toolbox_talk_signatures(user_id)
        `)
        .eq('site_id', profile.site_id)
        .eq('is_archived', false)
        .order('created_at', { ascending: false })
        .then(({ data }) => {
          setTalks((data as ToolboxTalk[]) ?? [])
          setIsLoading(false)
        })
    }, [profile?.site_id, canCreate])
  )

  async function handleUploadFile() {
    if (!profile?.company_id || !profile?.site_id) {
      Alert.alert('Error', 'Your account is not linked to a site. Contact your appointed person.')
      return
    }
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ],
        copyToCacheDirectory: true,
      })
      if (result.canceled) return

      const asset = result.assets[0]
      const mimeType = asset.mimeType ?? 'application/pdf'
      const contentType = mimeToContentType(mimeType)
      const title = filenameToTitle(asset.name)

      setIsUploading(true)

      // 1. Upload file to storage
      const filePath = await uploadFileToStorage(asset.uri, mimeType, profile.company_id)

      // 2. Create library record (permanent, company-scoped)
      const { data: libraryData, error: libraryError } = await supabase
        .from('toolbox_talk_library')
        .insert({
          company_id: profile.company_id,
          title,
          content_type: contentType,
          body: null,
          pdf_url: filePath,
          created_by: profile.id,
        })
        .select('id')
        .single()

      if (libraryError) throw new Error(libraryError.message)

      // 3. Create site-level talk linked to the library entry
      const { data: talkData, error: talkError } = await supabase
        .from('toolbox_talks')
        .insert({
          site_id: profile.site_id,
          library_id: libraryData.id,
          title,
          content_type: contentType,
          body: null,
          pdf_url: filePath,
          created_by: profile.id,
        })
        .select('id')
        .single()

      if (talkError) throw new Error(talkError.message)

      // 4. For .docx: fire text extraction in background, do not block navigation
      if (contentType === 'docx') {
        callExtractDocxText(talkData.id, filePath)
      }

      setIsUploading(false)
      router.push(`/(appointed-person)/toolbox-talk/${talkData.id}` as any)
    } catch (err: any) {
      setIsUploading(false)
      Alert.alert('Upload Error', err?.message ?? 'Failed to upload file.')
    }
  }

  // ── canCreate view (AP / crane supervisor) ──────────────────────────────────
  if (canCreate) {
    return (
      <ScreenWrapper edges={['bottom']}>
        {isUploading && (
          <View style={styles.overlay}>
            <View style={styles.overlayCard}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.overlayText}>Uploading…</Text>
            </View>
          </View>
        )}
        <View style={styles.optionList}>
          <TouchableOpacity
            style={styles.optionCard}
            onPress={handleUploadFile}
            activeOpacity={0.8}
            disabled={isUploading}
          >
            <Text style={styles.optionIcon}>📄</Text>
            <View style={styles.optionBody}>
              <Text style={styles.optionTitle}>Upload File</Text>
              <Text style={styles.optionDesc}>PDF or Word document — saved to company library automatically</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.optionCard}
            onPress={() => router.push('/(appointed-person)/toolbox-talk/library' as any)}
            activeOpacity={0.8}
          >
            <Text style={styles.optionIcon}>📚</Text>
            <View style={styles.optionBody}>
              <Text style={styles.optionTitle}>Library</Text>
              <Text style={styles.optionDesc}>Select a saved talk from your company library</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.optionCard}
            onPress={() => router.push('/(appointed-person)/toolbox-talk/archive' as any)}
            activeOpacity={0.8}
          >
            <Text style={styles.optionIcon}>🗂</Text>
            <View style={styles.optionBody}>
              <Text style={styles.optionTitle}>Archive</Text>
              <Text style={styles.optionDesc}>View past talks with generated sign-off PDFs</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>
      </ScreenWrapper>
    )
  }

  // ── Operative view: active talks to read + archive access ───────────────────
  return (
    <ScreenWrapper edges={['bottom']}>
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={talks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <TouchableOpacity
              style={styles.archiveLinkRow}
              onPress={() => router.push('/(appointed-person)/toolbox-talk/archive' as any)}
              activeOpacity={0.8}
            >
              <Text style={styles.archiveLinkText}>View Archive →</Text>
            </TouchableOpacity>
          }
          ListEmptyComponent={
            <EmptyState
              title="No active talks"
              message="Your appointed person or supervisor will add toolbox talks here."
              icon="🔧"
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push(`/(appointed-person)/toolbox-talk/${item.id}` as any)}
              activeOpacity={0.8}
            >
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
                <View style={[
                  styles.typeBadge,
                  item.content_type === 'pdf' ? styles.typeBadgePdf
                    : item.content_type === 'docx' ? styles.typeBadgeDocx
                    : styles.typeBadgeText,
                ]}>
                  <Text style={styles.typeBadgeLabel}>
                    {item.content_type === 'pdf' ? 'PDF' : item.content_type === 'docx' ? 'DOCX' : 'Text'}
                  </Text>
                </View>
              </View>
              <Text style={styles.cardMeta}>
                {item.creator?.full_name ?? '—'} · {formatDate(item.created_at)}
              </Text>
              <View style={styles.cardFooter}>
                <Text style={styles.countText}>
                  {item.reads?.length ?? 0} read · {item.signatures?.length ?? 0} signed
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  optionList: {
    flex: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  optionCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    ...Shadow.sm,
  },
  optionIcon: { fontSize: 26 },
  optionBody: { flex: 1 },
  optionTitle: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 3,
  },
  optionDesc: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    lineHeight: 18,
  },
  chevron: { fontSize: 22, color: Colors.textMuted },
  // Operative list styles
  list: { padding: Spacing.md, paddingBottom: 100, flexGrow: 1 },
  archiveLinkRow: { alignItems: 'flex-end', marginBottom: Spacing.sm },
  archiveLinkText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '600' },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadow.sm,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginBottom: 4,
  },
  cardTitle: { flex: 1, fontSize: FontSize.base, fontWeight: '700', color: Colors.text },
  typeBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.full },
  typeBadgePdf: { backgroundColor: Colors.info + '20' },
  typeBadgeDocx: { backgroundColor: Colors.purple + '20' },
  typeBadgeText: { backgroundColor: Colors.success + '20' },
  typeBadgeLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary },
  cardMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: Spacing.xs },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.xs,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  countText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '500' },
})
