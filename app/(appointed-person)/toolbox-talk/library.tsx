import { useState, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator, ScrollView,
  KeyboardAvoidingView, Platform, Modal,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { EmptyState } from '@/components/empty-state'
import { Colors, Spacing, FontSize, BorderRadius, Shadow } from '@/constants/theme'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { Linking } from 'react-native'

interface LibraryTalk {
  id: string
  title: string
  content_type: 'text' | 'pdf'
  body: string | null
  pdf_url: string | null
  is_archived: boolean
  created_at: string
  creator: { full_name: string } | null
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function ToolboxTalkLibrary() {
  const { profile } = useAuth()
  const [talks, setTalks] = useState<LibraryTalk[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [previewTalk, setPreviewTalk] = useState<LibraryTalk | null>(null)

  // Form state
  const [title, setTitle] = useState('')
  const [contentType, setContentType] = useState<'text' | 'pdf'>('text')
  const [body, setBody] = useState('')
  const [pdfUrl, setPdfUrl] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fetchTalks = useCallback(async () => {
    if (!profile?.company_id) return
    setIsLoading(true)
    const { data } = await supabase
      .from('toolbox_talk_library')
      .select(`
        id, title, content_type, body, pdf_url, is_archived, created_at,
        creator:profiles!created_by(full_name)
      `)
      .eq('company_id', profile.company_id)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
    setTalks((data as LibraryTalk[]) ?? [])
    setIsLoading(false)
  }, [profile?.company_id])

  useFocusEffect(useCallback(() => { fetchTalks() }, [fetchTalks]))

  function resetForm() {
    setTitle('')
    setContentType('text')
    setBody('')
    setPdfUrl('')
  }

  async function handleSubmit() {
    if (!title.trim()) {
      Alert.alert('Required', 'Please enter a title.')
      return
    }
    if (contentType === 'text' && !body.trim()) {
      Alert.alert('Required', 'Please enter the talk content.')
      return
    }
    if (contentType === 'pdf' && !pdfUrl.trim()) {
      Alert.alert('Required', 'Please enter the PDF URL.')
      return
    }

    setIsSubmitting(true)
    const { error } = await supabase.from('toolbox_talk_library').insert({
      company_id: profile!.company_id,
      title: title.trim(),
      content_type: contentType,
      body: contentType === 'text' ? body.trim() : null,
      pdf_url: contentType === 'pdf' ? pdfUrl.trim() : null,
      created_by: profile!.id,
    })
    setIsSubmitting(false)

    if (error) {
      Alert.alert('Error', error.message)
      return
    }
    setShowModal(false)
    resetForm()
    fetchTalks()
  }

  async function handleArchive(talk: LibraryTalk) {
    Alert.alert(
      'Archive Library Talk',
      `Archive "${talk.title}" from the library? It will no longer appear when creating new talks.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('toolbox_talk_library')
              .update({ is_archived: true })
              .eq('id', talk.id)
            if (error) { Alert.alert('Error', error.message); return }
            fetchTalks()
          },
        },
      ]
    )
  }

  function handlePreview(talk: LibraryTalk) {
    if (talk.content_type === 'pdf' && talk.pdf_url) {
      supabase.storage
        .from('toolbox-talk-pdfs')
        .createSignedUrl(talk.pdf_url, 3600)
        .then(({ data }) => {
          if (data?.signedUrl) Linking.openURL(data.signedUrl)
        })
      return
    }
    setPreviewTalk(talk)
  }

  return (
    <ScreenWrapper edges={['bottom']}>
      <View style={styles.toolbar}>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setShowModal(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.addBtnText}>+ Add to Library</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: Spacing.xl }} color={Colors.primary} />
      ) : (
        <FlatList
          data={talks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              title="Library is empty"
              message="Add reusable toolbox talk templates here for your company."
              icon="📚"
            />
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <TouchableOpacity onPress={() => handlePreview(item)} activeOpacity={0.8}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
                  <View style={[
                    styles.typeBadge,
                    item.content_type === 'pdf' ? styles.typeBadgePdf : styles.typeBadgeTxt,
                  ]}>
                    <Text style={styles.typeBadgeLabel}>
                      {item.content_type === 'pdf' ? 'PDF' : 'Text'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.cardMeta}>
                  {item.creator?.full_name ?? '—'} · {formatDate(item.created_at)}
                </Text>
              </TouchableOpacity>
              <View style={styles.cardActions}>
                <TouchableOpacity onPress={() => handlePreview(item)} activeOpacity={0.8}>
                  <Text style={styles.actionPreview}>Preview</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleArchive(item)} activeOpacity={0.8}>
                  <Text style={styles.actionArchive}>Archive</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      {/* Add to Library modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <View style={modal.header}>
            <Text style={modal.headerTitle}>Add to Library</Text>
            <TouchableOpacity
              onPress={() => { setShowModal(false); resetForm() }}
              activeOpacity={0.8}
            >
              <Text style={modal.cancelBtn}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={modal.scroll} keyboardShouldPersistTaps="handled">
            <View style={modal.field}>
              <Text style={modal.label}>Title *</Text>
              <TextInput
                style={modal.input}
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Working at Height Safety"
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            <View style={modal.field}>
              <Text style={modal.label}>Content Type *</Text>
              <View style={modal.typeRow}>
                {(['text', 'pdf'] as const).map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[modal.typeBtn, contentType === t && modal.typeBtnActive]}
                    onPress={() => setContentType(t)}
                    activeOpacity={0.8}
                  >
                    <Text style={[modal.typeBtnText, contentType === t && modal.typeBtnTextActive]}>
                      {t === 'text' ? 'Text' : 'PDF'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {contentType === 'text' ? (
              <View style={modal.field}>
                <Text style={modal.label}>Content *</Text>
                <TextInput
                  style={modal.textArea}
                  value={body}
                  onChangeText={setBody}
                  placeholder="Enter the full text of the toolbox talk..."
                  placeholderTextColor={Colors.textMuted}
                  multiline
                  numberOfLines={8}
                  textAlignVertical="top"
                />
              </View>
            ) : (
              <View style={modal.field}>
                <Text style={modal.label}>PDF Storage Path *</Text>
                <TextInput
                  style={modal.input}
                  value={pdfUrl}
                  onChangeText={setPdfUrl}
                  placeholder="library/company-id/filename.pdf"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="none"
                />
                <Text style={modal.hint}>
                  Upload the PDF to Supabase Storage bucket "toolbox-talk-pdfs" and paste the path here.
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[modal.submitBtn, isSubmitting && modal.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={isSubmitting}
              activeOpacity={0.8}
            >
              {isSubmitting
                ? <ActivityIndicator color={Colors.textInverse} />
                : <Text style={modal.submitBtnText}>Add to Library</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Text preview modal */}
      <Modal visible={!!previewTalk} animationType="slide" presentationStyle="pageSheet">
        <View style={preview.container}>
          <View style={preview.header}>
            <Text style={preview.title} numberOfLines={2}>{previewTalk?.title}</Text>
            <TouchableOpacity onPress={() => setPreviewTalk(null)} activeOpacity={0.8}>
              <Text style={preview.closeBtn}>Close</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={preview.scroll}>
            <Text style={preview.body}>{previewTalk?.body}</Text>
          </ScrollView>
        </View>
      </Modal>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  toolbar: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  addBtn: {
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    ...Shadow.sm,
  },
  addBtnText: { color: Colors.textInverse, fontWeight: '700', fontSize: FontSize.sm },
  list: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xxl },
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
  typeBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  typeBadgePdf: { backgroundColor: Colors.info + '20' },
  typeBadgeTxt: { backgroundColor: Colors.success + '20' },
  typeBadgeLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary },
  cardMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: Spacing.sm },
  cardActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  actionPreview: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.primary },
  actionArchive: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.danger },
})

const modal = StyleSheet.create({
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
  cancelBtn: { fontSize: FontSize.base, color: Colors.primary, fontWeight: '600' },
  scroll: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  field: { marginBottom: Spacing.md },
  label: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  input: {
    backgroundColor: Colors.background,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSize.base,
    color: Colors.text,
  },
  textArea: {
    backgroundColor: Colors.background,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    fontSize: FontSize.base,
    color: Colors.text,
    minHeight: 160,
    textAlignVertical: 'top',
  },
  hint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
    lineHeight: 16,
  },
  typeRow: { flexDirection: 'row', gap: Spacing.sm },
  typeBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  typeBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '10' },
  typeBtnText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
  typeBtnTextActive: { color: Colors.primary },
  submitBtn: {
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    ...Shadow.sm,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: Colors.textInverse, fontWeight: '700', fontSize: FontSize.base },
})

const preview = StyleSheet.create({
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
  title: { flex: 1, fontSize: FontSize.base, fontWeight: '700', color: Colors.text, marginRight: Spacing.md },
  closeBtn: { fontSize: FontSize.base, color: Colors.primary, fontWeight: '600' },
  scroll: { padding: Spacing.md },
  body: { fontSize: FontSize.base, color: Colors.text, lineHeight: 24 },
})
