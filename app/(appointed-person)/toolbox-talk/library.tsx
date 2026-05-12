import { useState, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator, ScrollView,
  KeyboardAvoidingView, Platform, Modal,
} from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { EmptyState } from '@/components/empty-state'
import { Colors, Spacing, FontSize, BorderRadius, Shadow } from '@/constants/theme'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

type ContentType = 'text' | 'pdf' | 'docx'

interface LibraryTalk {
  id: string
  title: string
  content_type: ContentType
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
  const router = useRouter()
  const { profile } = useAuth()
  const [talks, setTalks] = useState<LibraryTalk[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [creatingId, setCreatingId] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [previewTalk, setPreviewTalk] = useState<LibraryTalk | null>(null)

  // Add text talk form state
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
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
    setBody('')
  }

  async function handleUseTalk(libraryTalk: LibraryTalk) {
    if (!profile?.site_id) {
      Alert.alert('Error', 'Your account is not linked to a site.')
      return
    }
    setCreatingId(libraryTalk.id)
    const { data, error } = await supabase
      .from('toolbox_talks')
      .insert({
        site_id: profile.site_id,
        library_id: libraryTalk.id,
        title: libraryTalk.title,
        content_type: libraryTalk.content_type,
        body: libraryTalk.body,
        pdf_url: libraryTalk.pdf_url,
        created_by: profile.id,
      })
      .select('id')
      .single()
    setCreatingId(null)
    if (error) { Alert.alert('Error', error.message); return }
    router.replace(`/(appointed-person)/toolbox-talk/${data.id}` as any)
  }

  async function handleSubmitTextTalk() {
    if (!title.trim()) { Alert.alert('Required', 'Please enter a title.'); return }
    if (!body.trim()) { Alert.alert('Required', 'Please enter the talk content.'); return }

    setIsSubmitting(true)
    const { error } = await supabase.from('toolbox_talk_library').insert({
      company_id: profile!.company_id,
      title: title.trim(),
      content_type: 'text' as const,
      body: body.trim(),
      pdf_url: null,
      created_by: profile!.id,
    })
    setIsSubmitting(false)
    if (error) { Alert.alert('Error', error.message); return }
    setShowAddModal(false)
    resetForm()
    fetchTalks()
  }

  async function handleArchive(talk: LibraryTalk) {
    Alert.alert(
      'Archive Library Talk',
      `Archive "${talk.title}" from the library? It will no longer appear for new talks.`,
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

  function badgeStyle(ct: ContentType) {
    if (ct === 'pdf') return styles.typeBadgePdf
    if (ct === 'docx') return styles.typeBadgeDocx
    return styles.typeBadgeTxt
  }

  function badgeLabel(ct: ContentType) {
    if (ct === 'pdf') return 'PDF'
    if (ct === 'docx') return 'DOCX'
    return 'Text'
  }

  return (
    <ScreenWrapper edges={['bottom']}>
      <View style={styles.toolbar}>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setShowAddModal(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.addBtnText}>+ Add Text Talk</Text>
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
              message="Upload a file from the Toolbox Talk screen, or add a text talk using the button above."
              icon="📚"
            />
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
                <View style={[styles.typeBadge, badgeStyle(item.content_type)]}>
                  <Text style={styles.typeBadgeLabel}>{badgeLabel(item.content_type)}</Text>
                </View>
              </View>
              <Text style={styles.cardMeta}>
                {item.creator?.full_name ?? '—'} · {formatDate(item.created_at)}
              </Text>
              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={[styles.useBtn, creatingId === item.id && styles.useBtnDisabled]}
                  onPress={() => handleUseTalk(item)}
                  disabled={creatingId !== null}
                  activeOpacity={0.8}
                >
                  {creatingId === item.id
                    ? <ActivityIndicator color={Colors.textInverse} size="small" />
                    : <Text style={styles.useBtnText}>Use This Talk</Text>
                  }
                </TouchableOpacity>
                {item.content_type === 'text' && (
                  <TouchableOpacity onPress={() => setPreviewTalk(item)} activeOpacity={0.8}>
                    <Text style={styles.actionSecondary}>Preview</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => handleArchive(item)} activeOpacity={0.8}>
                  <Text style={styles.actionDanger}>Archive</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      {/* Add Text Talk modal */}
      <Modal visible={showAddModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={modal.header}>
            <Text style={modal.headerTitle}>Add Text Talk</Text>
            <TouchableOpacity onPress={() => { setShowAddModal(false); resetForm() }} activeOpacity={0.8}>
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
              <Text style={modal.label}>Content *</Text>
              <TextInput
                style={modal.textArea}
                value={body}
                onChangeText={setBody}
                placeholder="Enter the full text of the toolbox talk..."
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={10}
                textAlignVertical="top"
              />
            </View>
            <TouchableOpacity
              style={[modal.submitBtn, isSubmitting && modal.submitBtnDisabled]}
              onPress={handleSubmitTextTalk}
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
  toolbar: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.md },
  addBtn: {
    backgroundColor: Colors.primary,
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
  typeBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.full },
  typeBadgePdf: { backgroundColor: Colors.info + '20' },
  typeBadgeDocx: { backgroundColor: Colors.purple + '20' },
  typeBadgeTxt: { backgroundColor: Colors.success + '20' },
  typeBadgeLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary },
  cardMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: Spacing.sm },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  useBtn: {
    flex: 1,
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.xs,
    alignItems: 'center',
    minHeight: 32,
    justifyContent: 'center',
  },
  useBtnDisabled: { opacity: 0.5 },
  useBtnText: { color: Colors.textInverse, fontWeight: '700', fontSize: FontSize.sm },
  actionSecondary: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.primary },
  actionDanger: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.danger },
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
  label: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, marginBottom: Spacing.xs },
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
    minHeight: 200,
    textAlignVertical: 'top',
  },
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
