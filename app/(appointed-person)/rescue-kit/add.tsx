import { useState, useEffect } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator, Platform, KeyboardAvoidingView,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { Breadcrumb } from '@/components/breadcrumb'
import { Colors, Spacing, FontSize, BorderRadius, Shadow } from '@/constants/theme'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

type YesNo = boolean | null
type YesNoNA = 'yes' | 'no' | 'n/a' | null
type HarnessPackaging = 'new' | 'used' | null

function SectionHeader({ number, title }: { number: string; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionBadge}>
        <Text style={styles.sectionBadgeText}>{number}</Text>
      </View>
      <Text style={styles.sectionHeaderTitle}>{title}</Text>
    </View>
  )
}

function FieldLabel({ text, required, hint }: { text: string; required?: boolean; hint?: string }) {
  return (
    <>
      <Text style={styles.fieldLabel}>
        {text}{required && <Text style={styles.required}> *</Text>}
      </Text>
      {hint && <Text style={styles.fieldHint}>{hint}</Text>}
    </>
  )
}

function YesNoToggle({ value, onChange }: { value: YesNo; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <TouchableOpacity
        style={[styles.toggleBtn, value === true && styles.toggleBtnYes]}
        onPress={() => onChange(true)}
        activeOpacity={0.8}
      >
        <Text style={[styles.toggleBtnText, value === true && styles.toggleBtnYesText]}>YES ✓</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.toggleBtn, value === false && styles.toggleBtnNo]}
        onPress={() => onChange(false)}
        activeOpacity={0.8}
      >
        <Text style={[styles.toggleBtnText, value === false && styles.toggleBtnNoText]}>NO ✗</Text>
      </TouchableOpacity>
    </View>
  )
}

function YesNoNAToggle({ value, onChange }: { value: YesNoNA; onChange: (v: YesNoNA) => void }) {
  return (
    <View style={styles.toggleRow}>
      {(['yes', 'no', 'n/a'] as YesNoNA[]).map((opt) => {
        const isActive = value === opt
        const label = opt === 'yes' ? 'YES ✓' : opt === 'no' ? 'NO ✗' : 'N/A'
        const activeStyle = opt === 'yes' ? styles.toggleBtnYes : opt === 'no' ? styles.toggleBtnNo : styles.toggleBtnNA
        const activeTextStyle = opt === 'yes' ? styles.toggleBtnYesText : opt === 'no' ? styles.toggleBtnNoText : styles.toggleBtnNAText
        return (
          <TouchableOpacity
            key={opt}
            style={[styles.toggleBtn, isActive && activeStyle]}
            onPress={() => onChange(opt)}
            activeOpacity={0.8}
          >
            <Text style={[styles.toggleBtnText, isActive && activeTextStyle]}>{label}</Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

function HarnessToggle({ value, onChange }: { value: HarnessPackaging; onChange: (v: HarnessPackaging) => void }) {
  return (
    <View style={styles.toggleRow}>
      <TouchableOpacity
        style={[styles.toggleBtn, styles.toggleBtnWide, value === 'new' && styles.toggleBtnYes]}
        onPress={() => onChange('new')}
        activeOpacity={0.8}
      >
        <Text style={[styles.toggleBtnText, value === 'new' && styles.toggleBtnYesText]}>Still new in packaging</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.toggleBtn, styles.toggleBtnWide, value === 'used' && styles.toggleBtnNo]}
        onPress={() => onChange('used')}
        activeOpacity={0.8}
      >
        <Text style={[styles.toggleBtnText, value === 'used' && styles.toggleBtnNoText]}>Been used</Text>
      </TouchableOpacity>
    </View>
  )
}

interface FormState {
  main_contractor: string
  project_name: string
  serial_number: string
  location_of_kit: string
  is_secured: YesNo
  how_is_it_secured: string
  who_has_access: string
  plrk_number: string
  is_stretcher_in_bag: YesNo
  is_pole_in_bag: YesNo
  harness_count: string
  harness_packaging_status: HarnessPackaging
  harness_serial_numbers: string
  certificates_of_conformity: string
  is_box_sealed: YesNo
  unsealed_contents_complete: YesNoNA
}

const EMPTY_FORM: FormState = {
  main_contractor: '',
  project_name: '',
  serial_number: '',
  location_of_kit: '',
  is_secured: null,
  how_is_it_secured: '',
  who_has_access: '',
  plrk_number: '',
  is_stretcher_in_bag: null,
  is_pole_in_bag: null,
  harness_count: '',
  harness_packaging_status: null,
  harness_serial_numbers: '',
  certificates_of_conformity: '',
  is_box_sealed: null,
  unsealed_contents_complete: null,
}

export default function RescueKitAdd() {
  const { kit_id } = useLocalSearchParams<{ kit_id: string }>()
  const router = useRouter()
  const { profile } = useAuth()

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [isLoading, setIsLoading] = useState(!!kit_id)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  useEffect(() => {
    if (!kit_id) return
    async function loadKit() {
      setIsLoading(true)
      const { data, error } = await supabase
        .from('rescue_kits')
        .select('*')
        .eq('id', kit_id)
        .single()

      if (error || !data) {
        console.error('[RK-ADD] Failed to load kit:', error?.message)
        setIsLoading(false)
        return
      }

      setForm({
        main_contractor:            data.main_contractor ?? '',
        project_name:               data.project_name ?? '',
        serial_number:              data.serial_number ?? '',
        location_of_kit:            data.location_of_kit ?? '',
        is_secured:                 data.is_secured ?? null,
        how_is_it_secured:          data.how_is_it_secured ?? '',
        who_has_access:             data.who_has_access ?? '',
        plrk_number:                data.plrk_number ?? '',
        is_stretcher_in_bag:        data.is_stretcher_in_bag ?? null,
        is_pole_in_bag:             data.is_pole_in_bag ?? null,
        harness_count:              data.harness_count ?? '',
        harness_packaging_status:   (data.harness_packaging_status as HarnessPackaging) ?? null,
        harness_serial_numbers:     data.harness_serial_numbers ?? '',
        certificates_of_conformity: data.certificates_of_conformity ?? '',
        is_box_sealed:              data.is_box_sealed ?? null,
        unsealed_contents_complete: (data.unsealed_contents_complete as YesNoNA) ?? null,
      })
      setIsLoading(false)
    }
    loadKit()
  }, [kit_id])

  function validateForm(): string[] {
    const errors: string[] = []
    if (!form.main_contractor.trim())  errors.push('Main Contractor Name (Section 1)')
    if (!form.project_name.trim())     errors.push('Project Name (Section 1)')
    if (!form.serial_number.trim())    errors.push('Serial Number on the seal (Section 1)')
    if (!form.location_of_kit.trim())  errors.push('Location of Rescue Kit (Section 2)')
    if (form.is_secured === null)      errors.push('Is it secured? (Section 2)')
    if (!form.how_is_it_secured.trim()) errors.push('How is it secured? (Section 2)')
    if (!form.who_has_access.trim())   errors.push('Who has access to the key/Code? (Section 2)')
    if (form.is_stretcher_in_bag === null) errors.push('Is the Stretcher in the bag? (Section 3)')
    if (form.is_pole_in_bag === null)  errors.push('Is the pole in the bag? (Section 3)')
    if (!form.harness_count.trim())    errors.push('How many Harnesses (Section 3)')
    if (form.harness_packaging_status === null) errors.push('Harness packaging status (Section 3)')
    if (!form.harness_serial_numbers.trim()) errors.push('Harness serial numbers (Section 3)')
    if (!form.certificates_of_conformity.trim()) errors.push('Certificates of conformity / thorough examination (Section 4)')
    if (form.is_box_sealed === null)   errors.push('Is the box still sealed? (Section 4)')
    if (form.unsealed_contents_complete === null) errors.push('Unsealed contents complete (Section 4)')
    return errors
  }

  async function handleSubmit() {
    if (isSubmitting) return

    const errors = validateForm()
    if (errors.length > 0) {
      const msg = `Please complete the following required fields:\n\n• ${errors.join('\n• ')}`
      if (Platform.OS === 'web') window.alert(msg)
      else Alert.alert('Missing Required Fields', msg)
      return
    }

    setIsSubmitting(true)
    console.log('[RK-ADD] Submitting kit, kit_id:', kit_id)

    try {
      const payload = {
        site_id:                    profile!.site_id,
        main_contractor:            form.main_contractor.trim(),
        project_name:               form.project_name.trim(),
        serial_number:              form.serial_number.trim(),
        location_of_kit:            form.location_of_kit.trim(),
        is_secured:                 form.is_secured,
        how_is_it_secured:          form.how_is_it_secured.trim(),
        who_has_access:             form.who_has_access.trim(),
        plrk_number:                form.plrk_number.trim(),
        is_stretcher_in_bag:        form.is_stretcher_in_bag,
        is_pole_in_bag:             form.is_pole_in_bag,
        harness_count:              form.harness_count.trim(),
        harness_packaging_status:   form.harness_packaging_status,
        harness_serial_numbers:     form.harness_serial_numbers.trim(),
        certificates_of_conformity: form.certificates_of_conformity.trim(),
        is_box_sealed:              form.is_box_sealed,
        unsealed_contents_complete: form.unsealed_contents_complete,
        updated_at:                 new Date().toISOString(),
      }

      if (kit_id) {
        const { error } = await supabase
          .from('rescue_kits')
          .update(payload)
          .eq('id', kit_id)
        if (error) throw new Error(`Update failed: ${error.message}`)
        console.log('[RK-ADD] Kit updated:', kit_id)
      } else {
        const { error } = await supabase
          .from('rescue_kits')
          .insert({ ...payload, created_by: profile!.id })
        if (error) throw new Error(`Insert failed: ${error.message}`)
        console.log('[RK-ADD] Kit created')
      }

      router.replace('/(appointed-person)/rescue-kit/' as any)
    } catch (err: any) {
      console.error('[RK-ADD] Submit error:', err)
      if (Platform.OS === 'web') window.alert(`Error: ${err.message}`)
      else Alert.alert('Error', err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const isEdit = !!kit_id
  const pageLabel = isEdit ? 'Edit' : 'Add'

  if (isLoading) {
    return (
      <ScreenWrapper edges={['bottom']}>
        <Breadcrumb items={[
          { label: 'Dashboard', href: '/(appointed-person)/' },
          { label: 'Supervisor Checks', href: '/(appointed-person)/supervisor-checks' },
          { label: 'Rescue Kit Checklist', href: '/(appointed-person)/rescue-kit/' },
          { label: pageLabel },
        ]} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading kit data…</Text>
        </View>
      </ScreenWrapper>
    )
  }

  return (
    <ScreenWrapper edges={['bottom']}>
      <Breadcrumb items={[
        { label: 'Dashboard', href: '/(appointed-person)/' },
        { label: 'Supervisor Checks', href: '/(appointed-person)/supervisor-checks' },
        { label: 'Rescue Kit Checklist', href: '/(appointed-person)/rescue-kit/' },
        { label: pageLabel },
      ]} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {isEdit && (
            <View style={styles.editBanner}>
              <Text style={styles.editBannerText}>Editing existing rescue kit — all weekly check history is preserved.</Text>
            </View>
          )}

          {/* Section 1 — Identification */}
          <SectionHeader number="1" title="Identification" />
          <View style={styles.card}>
            <FieldLabel text="Main Contractor Name" required />
            <TextInput
              style={styles.input}
              value={form.main_contractor}
              onChangeText={v => updateField('main_contractor', v)}
              placeholder="e.g. Multiplex"
              placeholderTextColor={Colors.textMuted}
            />
            <FieldLabel text="Project Name" required />
            <TextInput
              style={styles.input}
              value={form.project_name}
              onChangeText={v => updateField('project_name', v)}
              placeholder="e.g. London Wall"
              placeholderTextColor={Colors.textMuted}
            />
            <FieldLabel text="Serial Number on the seal" required />
            <TextInput
              style={styles.input}
              value={form.serial_number}
              onChangeText={v => updateField('serial_number', v)}
              placeholder="e.g. 613/110817"
              placeholderTextColor={Colors.textMuted}
            />
          </View>

          {/* Section 2 — Location & Access */}
          <SectionHeader number="2" title="Location &amp; Access" />
          <View style={styles.card}>
            <FieldLabel text="Location of Rescue Kit?" required />
            <TextInput
              style={styles.input}
              value={form.location_of_kit}
              onChangeText={v => updateField('location_of_kit', v)}
              placeholder="Where is the kit kept on site?"
              placeholderTextColor={Colors.textMuted}
            />
            <FieldLabel text="Is it secured?" required />
            <YesNoToggle value={form.is_secured} onChange={v => updateField('is_secured', v)} />

            <FieldLabel text="How is it secured? (key/Code)" required />
            <TextInput
              style={styles.input}
              value={form.how_is_it_secured}
              onChangeText={v => updateField('how_is_it_secured', v)}
              placeholder="e.g. Padlock, combination code"
              placeholderTextColor={Colors.textMuted}
            />
            <FieldLabel text="Who has access to the key/Code?" required />
            <TextInput
              style={styles.input}
              value={form.who_has_access}
              onChangeText={v => updateField('who_has_access', v)}
              placeholder="Names / roles with access"
              placeholderTextColor={Colors.textMuted}
            />
            <FieldLabel text="What is the individual / company specific serial number?" />
            <TextInput
              style={styles.input}
              value={form.plrk_number}
              onChangeText={v => updateField('plrk_number', v)}
              placeholder="Optional — e.g. RK-001"
              placeholderTextColor={Colors.textMuted}
            />
          </View>

          {/* Section 3 — Kit Contents */}
          <SectionHeader number="3" title="Kit Contents" />
          <View style={styles.card}>
            <FieldLabel text="Is the Stretcher in the bag?" required />
            <YesNoToggle value={form.is_stretcher_in_bag} onChange={v => updateField('is_stretcher_in_bag', v)} />

            <FieldLabel text="Is the pole in the bag?" required />
            <YesNoToggle value={form.is_pole_in_bag} onChange={v => updateField('is_pole_in_bag', v)} />

            <FieldLabel text="How many Harnesses are with the kit?" required />
            <TextInput
              style={styles.input}
              value={form.harness_count}
              onChangeText={v => updateField('harness_count', v)}
              placeholder="e.g. 2"
              placeholderTextColor={Colors.textMuted}
              keyboardType="numeric"
            />
            <FieldLabel text="Are they still new in packaging or have they been used?" required />
            <HarnessToggle value={form.harness_packaging_status} onChange={v => updateField('harness_packaging_status', v)} />

            <FieldLabel text="What are the serial numbers of the harness?" required />
            <TextInput
              style={[styles.input, styles.textarea]}
              value={form.harness_serial_numbers}
              onChangeText={v => updateField('harness_serial_numbers', v)}
              placeholder="List all serial numbers, one per line"
              placeholderTextColor={Colors.textMuted}
              multiline
              textAlignVertical="top"
            />
          </View>

          {/* Section 4 — Certification & Seal */}
          <SectionHeader number="4" title="Certification &amp; Seal" />
          <View style={styles.card}>
            <FieldLabel
              text="Are all certificates of conformity / thorough examination with the kit?"
              required
              hint="Include expiry date, e.g. 05/09/2026"
            />
            <TextInput
              style={styles.input}
              value={form.certificates_of_conformity}
              onChangeText={v => updateField('certificates_of_conformity', v)}
              placeholder="e.g. Yes — expires 05/09/2026"
              placeholderTextColor={Colors.textMuted}
            />
            <FieldLabel text="Is the box still sealed?" required />
            <YesNoToggle value={form.is_box_sealed} onChange={v => updateField('is_box_sealed', v)} />

            <FieldLabel
              text="If the box is unsealed, are all the contents still in the box as listed on the certificate of conformity?"
              required
            />
            <YesNoNAToggle value={form.unsealed_contents_complete} onChange={v => updateField('unsealed_contents_complete', v)} />
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={isSubmitting}
            activeOpacity={0.85}
          >
            {isSubmitting
              ? <ActivityIndicator color={Colors.textInverse} />
              : <Text style={styles.submitBtnText}>
                  {isEdit ? 'Save Changes' : 'Add Rescue Kit'}
                </Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  loadingText: { fontSize: FontSize.sm, color: Colors.textMuted },
  scroll: { flex: 1 },
  scrollContent: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  editBanner: {
    backgroundColor: Colors.accent + '18',
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
  },
  editBannerText: { fontSize: FontSize.xs, color: Colors.accent, fontWeight: '600', lineHeight: 18 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  sectionBadge: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionBadgeText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textInverse },
  sectionHeaderTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadow.sm,
  },
  fieldLabel: {
    fontSize: FontSize.sm, fontWeight: '600', color: Colors.text,
    marginBottom: 4, marginTop: Spacing.sm,
  },
  required: { color: Colors.danger },
  fieldHint: {
    fontSize: FontSize.xs, color: Colors.textMuted,
    marginBottom: 4, marginTop: -2, lineHeight: 16,
  },
  input: {
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm,
    fontSize: FontSize.sm, color: Colors.text,
    backgroundColor: Colors.background, marginBottom: Spacing.xs,
  },
  textarea: { height: 90, paddingTop: Spacing.sm },
  toggleRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  toggleBtn: {
    flex: 1, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.xs,
    borderRadius: BorderRadius.sm, borderWidth: 1.5,
    borderColor: Colors.border, alignItems: 'center',
    backgroundColor: Colors.background,
  },
  toggleBtnWide: { flex: 1 },
  toggleBtnText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary },
  toggleBtnYes: { backgroundColor: Colors.success + '18', borderColor: Colors.success },
  toggleBtnYesText: { color: Colors.success },
  toggleBtnNo: { backgroundColor: Colors.danger + '18', borderColor: Colors.danger },
  toggleBtnNoText: { color: Colors.danger },
  toggleBtnNA: { backgroundColor: Colors.warning + '18', borderColor: Colors.warning },
  toggleBtnNAText: { color: Colors.warning },
  submitBtn: {
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.md,
    ...Shadow.md,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: Colors.textInverse, fontWeight: '700', fontSize: FontSize.base },
})
