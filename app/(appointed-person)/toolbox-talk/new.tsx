import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useRouter } from 'expo-router'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { Colors, Spacing, FontSize, BorderRadius, Shadow } from '@/constants/theme'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

interface LibraryTalk {
  id: string
  title: string
  content_type: 'text' | 'pdf'
  body: string | null
  pdf_url: string | null
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
  const [contentType, setContentType] = useState<'text' | 'pdf'>('text')
  const [body, setBody] = useState('')
  const [pdfUrl, setPdfUrl] = useState('')

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

  async function handleSubmit() {
    let payload: {
      site_id: string
      title: string
      content_type: 'text' | 'pdf'
      body: string | null
      pdf_url: string | null
      created_by: string
      library_id?: string
    }

    if (mode === 'library') {
      if (!selectedLibraryId) {
        Alert.alert('Required', 'Please select a talk from the library.')
        return
      }
      const selected = libraryTalks.find((t) => t.id === selectedLibraryId)
      if (!selected) return
      payload = {
        site_id: profile!.site_id!,
        title: selected.title,
        content_type: selected.content_type,
        body: selected.body,
        pdf_url: selected.pdf_url,
        created_by: profile!.id,
        library_id: selected.id,
      }
    } else {
      if (!title.trim()) {
        Alert.alert('Required', 'Please enter a title.')
        return
      }
      if (contentType === 'text' && !body.trim()) {
        Alert.alert('Required', 'Please enter the talk content.')
        return
      }
      if (contentType === 'pdf' && !pdfUrl.trim()) {
        Alert.alert('Required', 'Please enter the PDF path.')
        return
      }
      payload = {
        site_id: profile!.site_id!,
        title: title.trim(),
        content_type: contentType,
        body: contentType === 'text' ? body.trim() : null,
        pdf_url: contentType === 'pdf' ? pdfUrl.trim() : null,
        created_by: profile!.id,
      }
    }

    setIsSubmitting(true)
    const { data, error } = await supabase
      .from('toolbox_talks')
      .insert(payload)
      .select('id')
      .single()
    setIsSubmitting(false)

    if (error) {
      Alert.alert('Error', error.message)
      return
    }
    router.replace(`/(appointed-person)/toolbox-talk/${data.id}` as any)
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
                          {t.content_type === 'pdf' ? 'PDF' : 'Text'}
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
                  {(['text', 'pdf'] as const).map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.modeBtn, contentType === t && styles.modeBtnActive]}
                      onPress={() => setContentType(t)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.modeBtnText, contentType === t && styles.modeBtnTextActive]}>
                        {t === 'text' ? 'Text' : 'PDF'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {contentType === 'text' ? (
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
                  <FormLabel label="PDF Storage Path" required />
                  <TextInput
                    style={styles.input}
                    value={pdfUrl}
                    onChangeText={setPdfUrl}
                    placeholder="talks/site-id/filename.pdf"
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="none"
                  />
                  <Text style={styles.hint}>
                    Upload the PDF to Supabase Storage bucket "toolbox-talk-pdfs" first, then paste the path here.
                  </Text>
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
