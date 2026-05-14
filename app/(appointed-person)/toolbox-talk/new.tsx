import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useRouter } from 'expo-router'
import * as DocumentPicker from 'expo-document-picker'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { Colors, Spacing, FontSize, BorderRadius, Shadow } from '@/constants/theme'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { callExtractDocxText } from '@/lib/api'

type FileContentType = 'pdf' | 'docx'

interface LibraryTalk {
  id: string
  title: string
  content_type: 'text' | 'pdf' | 'docx'
  body: string | null
  pdf_url: string | null
}

interface PickedFile {
  uri: string
  name: string
  mimeType: string
}

function filenameToTitle(filename: string): string {
  return filename.replace(/\.(pdf|docx)$/i, '').replace(/[-_]/g, ' ').trim()
}

function mimeToContentType(mimeType: string): FileContentType {
  return mimeType === 'application/pdf' ? 'pdf' : 'docx'
}

function mimeToExt(mimeType: string): string {
  return mimeType === 'application/pdf' ? 'pdf' : 'docx'
}

async function uploadFileToStorage(
  uri: string,
  mimeType: string,
  companyId: string
): Promise<string> {
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

export default function NewToolboxTalk() {
  const router = useRouter()
  const { profile } = useAuth()

  const [mode, setMode] = useState<'library' | 'manual'>('library')
  const [libraryTalks, setLibraryTalks] = useState<LibraryTalk[]>([])
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(true)
  const [selectedLibraryId, setSelectedLibraryId] = useState('')

  // Manual form
  const [title, setTitle] = useState('')
  const [manualType, setManualType] = useState<'text' | 'file'>('text')
  const [body, setBody] = useState('')
  const [pickedFile, setPickedFile] = useState<PickedFile | null>(null)

  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!profile?.company_id) return
    supabase
      .from('toolbox_talk_library')
      .select('id, title, content_type, body, pdf_url')
      .eq('company_id', profile.company_id)
      .eq('is_archived', false)
      .order('title')
      .then(({ data }) => {
        setLibraryTalks((data as LibraryTalk[]) ?? [])
        setIsLoadingLibrary(false)
      })
  }, [profile?.company_id])

  async function handlePickFile() {
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
      const file: PickedFile = {
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType ?? 'application/pdf',
      }
      setPickedFile(file)
      // Pre-fill title from filename; keep any manually typed value only if no file was previously picked
      if (!title.trim() || pickedFile !== null) {
        setTitle(filenameToTitle(asset.name))
      }
    } catch {
      Alert.alert('Error', 'Could not open the file picker.')
    }
  }

  async function handleSubmit() {
    if (mode === 'library') {
      if (!selectedLibraryId) {
        Alert.alert('Required', 'Please select a talk from the library.')
        return
      }
      const selected = libraryTalks.find((t) => t.id === selectedLibraryId)
      if (!selected) return

      setIsSubmitting(true)
      const { data, error } = await supabase
        .from('toolbox_talks')
        .insert({
          site_id: profile!.site_id!,
          title: selected.title,
          content_type: selected.content_type,
          body: selected.body,
          pdf_url: selected.pdf_url,
          created_by: profile!.id,
          library_id: selected.id,
        })
        .select('id')
        .single()

      if (error) {
        setIsSubmitting(false)
        Alert.alert('Error', error.message)
        return
      }

      // For docx library items, extract text for this talk instance
      if (selected.content_type === 'docx' && selected.pdf_url) {
        await callExtractDocxText(data.id, selected.pdf_url)
      }

      setIsSubmitting(false)
      router.replace(`/(appointed-person)/toolbox-talk/${data.id}` as any)
      return
    }

    // Manual — text
    if (manualType === 'text') {
      if (!title.trim()) {
        Alert.alert('Required', 'Please enter a title.')
        return
      }
      if (!body.trim()) {
        Alert.alert('Required', 'Please enter the talk content.')
        return
      }
      setIsSubmitting(true)
      const { data, error } = await supabase
        .from('toolbox_talks')
        .insert({
          site_id: profile!.site_id!,
          title: title.trim(),
          content_type: 'text' as const,
          body: body.trim(),
          pdf_url: null,
          created_by: profile!.id,
        })
        .select('id')
        .single()
      setIsSubmitting(false)
      if (error) { Alert.alert('Error', error.message); return }
      router.replace(`/(appointed-person)/toolbox-talk/${data.id}` as any)
      return
    }

    // Manual — file upload
    if (!title.trim()) {
      Alert.alert('Required', 'Please enter a title.')
      return
    }
    if (!pickedFile) {
      Alert.alert('Required', 'Please select a file to upload.')
      return
    }

    setIsSubmitting(true)
    try {
      const filePath = await uploadFileToStorage(
        pickedFile.uri,
        pickedFile.mimeType,
        profile!.company_id!
      )
      const fileContentType = mimeToContentType(pickedFile.mimeType)

      // Auto-add to library first
      const { data: libraryData, error: libraryError } = await supabase
        .from('toolbox_talk_library')
        .insert({
          company_id: profile!.company_id,
          title: title.trim(),
          content_type: fileContentType,
          body: null,
          pdf_url: filePath,
          created_by: profile!.id,
        })
        .select('id')
        .single()

      if (libraryError) {
        setIsSubmitting(false)
        Alert.alert('Error', libraryError.message)
        return
      }

      // Create site-level talk linked to the library entry
      const { data: talkData, error: talkError } = await supabase
        .from('toolbox_talks')
        .insert({
          site_id: profile!.site_id!,
          title: title.trim(),
          content_type: fileContentType,
          body: null,
          pdf_url: filePath,
          library_id: libraryData.id,
          created_by: profile!.id,
        })
        .select('id')
        .single()

      if (talkError) {
        setIsSubmitting(false)
        Alert.alert('Error', talkError.message)
        return
      }

      // For docx, trigger server-side text extraction
      if (fileContentType === 'docx') {
        await callExtractDocxText(talkData.id, filePath)
      }

      setIsSubmitting(false)
      router.replace(`/(appointed-person)/toolbox-talk/${talkData.id}` as any)
    } catch (err: any) {
      setIsSubmitting(false)
      Alert.alert('Upload Error', err?.message ?? 'Failed to upload file.')
    }
  }

  return (
    <ScreenWrapper edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* Mode selector */}
          <View style={styles.card}>
            <FormLabel label="Source" />
            <View style={styles.modeRow}>
              {(['library', 'manual'] as const).map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
                  onPress={() => setMode(m)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.modeBtnText, mode === m && styles.modeBtnTextActive]}>
                    {m === 'library' ? 'From Library' : 'Create Manually'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {mode === 'library' ? (
            <View style={styles.card}>
              <FormLabel label="Select from Library" required />
              {isLoadingLibrary ? (
                <ActivityIndicator color={Colors.primary} style={{ marginVertical: Spacing.md }} />
              ) : libraryTalks.length === 0 ? (
                <Text style={styles.emptyLibraryText}>
                  No talks in the library yet. Add templates via the Library screen.
                </Text>
              ) : (
                <View style={styles.optionList}>
                  {libraryTalks.map((t) => (
                    <TouchableOpacity
                      key={t.id}
                      style={[styles.optionRow, selectedLibraryId === t.id && styles.optionRowActive]}
                      onPress={() => setSelectedLibraryId(t.id)}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.radio, selectedLibraryId === t.id && styles.radioActive]}>
                        {selectedLibraryId === t.id && <View style={styles.radioDot} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[
                          styles.optionLabel,
                          selectedLibraryId === t.id && styles.optionLabelActive,
                        ]}>
                          {t.title}
                        </Text>
                        <Text style={styles.optionSub}>
                          {t.content_type === 'pdf' ? 'PDF' : t.content_type === 'docx' ? 'DOCX' : 'Text'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          ) : (
            <>
              <View style={styles.card}>
                <FormLabel label="Title" required />
                <TextInput
                  style={styles.input}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="e.g. Working at Height Safety"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>

              <View style={styles.card}>
                <FormLabel label="Content Type" required />
                <View style={styles.modeRow}>
                  {(['text', 'file'] as const).map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.modeBtn, manualType === t && styles.modeBtnActive]}
                      onPress={() => setManualType(t)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.modeBtnText, manualType === t && styles.modeBtnTextActive]}>
                        {t === 'text' ? 'Text' : 'Upload File'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {manualType === 'text' ? (
                <View style={styles.card}>
                  <FormLabel label="Content" required />
                  <TextInput
                    style={styles.textArea}
                    value={body}
                    onChangeText={setBody}
                    placeholder="Enter the full text of the toolbox talk..."
                    placeholderTextColor={Colors.textMuted}
                    multiline
                    numberOfLines={6}
                    textAlignVertical="top"
                  />
                </View>
              ) : (
                <View style={styles.card}>
                  <FormLabel label="File" required />
                  {pickedFile ? (
                    <View style={styles.fileSelected}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.fileName} numberOfLines={1}>{pickedFile.name}</Text>
                        <Text style={styles.fileType}>
                          {mimeToContentType(pickedFile.mimeType).toUpperCase()} · Will be added to library
                        </Text>
                      </View>
                      <TouchableOpacity onPress={handlePickFile} activeOpacity={0.8}>
                        <Text style={styles.changeFile}>Change</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.pickFileBtn} onPress={handlePickFile} activeOpacity={0.8}>
                      <Text style={styles.pickFileBtnText}>Pick PDF or Word File</Text>
                    </TouchableOpacity>
                  )}
                  <Text style={styles.hint}>Supported: PDF (.pdf), Word (.docx)</Text>
                </View>
              )}
            </>
          )}

          <TouchableOpacity
            style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={isSubmitting}
            activeOpacity={0.8}
          >
            {isSubmitting
              ? <ActivityIndicator color={Colors.textInverse} />
              : <Text style={styles.submitBtnText}>Create Toolbox Talk</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  )
}

function FormLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <Text style={labelStyles.label}>
      {label}{required ? <Text style={labelStyles.req}> *</Text> : null}
    </Text>
  )
}

const labelStyles = StyleSheet.create({
  label: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, marginBottom: Spacing.sm },
  req: { color: Colors.danger },
})

const styles = StyleSheet.create({
  scroll: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadow.sm,
  },
  modeRow: { flexDirection: 'row', gap: Spacing.sm },
  modeBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  modeBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '10' },
  modeBtnText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
  modeBtnTextActive: { color: Colors.primary },
  optionList: { gap: 2 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  optionRowActive: { backgroundColor: Colors.primary + '0D' },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { borderColor: Colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary },
  optionLabel: { fontSize: FontSize.base, color: Colors.text },
  optionLabelActive: { fontWeight: '600', color: Colors.primary },
  optionSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1 },
  emptyLibraryText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: Spacing.md,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSize.base,
    color: Colors.text,
    backgroundColor: Colors.background,
  },
  textArea: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    fontSize: FontSize.base,
    color: Colors.text,
    backgroundColor: Colors.background,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  pickFileBtn: {
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    backgroundColor: Colors.primary + '08',
  },
  pickFileBtnText: { color: Colors.primary, fontWeight: '700', fontSize: FontSize.sm },
  fileSelected: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.success + '10',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1.5,
    borderColor: Colors.success + '40',
    gap: Spacing.sm,
  },
  fileName: { fontSize: FontSize.sm, color: Colors.text, fontWeight: '600' },
  fileType: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  changeFile: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '600' },
  hint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
    lineHeight: 16,
  },
  submitBtn: {
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
    ...Shadow.md,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: Colors.textInverse, fontWeight: '700', fontSize: FontSize.base },
})
