import { useState, useRef, useEffect, useCallback } from 'react'
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
import { buildBriefingHtml } from '@/lib/daily-briefing-template'

const NativeSignatureCanvas = Platform.OS !== 'web'
  ? require('react-native-signature-canvas').default
  : null

// IMPORTANT: Before using this feature ensure these buckets exist in Supabase Dashboard:
//   "daily-briefing-signatures" (private, 5 MB, image/png)
//   "daily-briefing-archive"    (private, 50 MB, application/pdf)

const YES_NO_QUESTIONS = [
  'Is everyone clear on which crane they are responsible for?',
  'Are all activities planned?',
  'Are all expected deliveries scheduled?',
  'Have you communicated any site / environmental changes?',
  'Have you reminded everyone to carry out the daily pre-use accessory checks?',
  "Is everyone clear on 'Safety First', if unsure stop the lifting operation and re-assess?",
  'Is tower crane secured each floor for unauthorised personnel to access the crane?',
  'Do all Slinger/Crane Supervisor have handheld Whistles and checked they are working?',
  'Has a radio check been completed for all lifting operatives?',
]

type YesNo = boolean | null

interface FormState {
  wind_speed: string
  gust_speed: string
  weather_condition: string
  changes_on_site: string
  lifting_schedule: string
  any_other_business: string
  first_aider_name: string
  site_location: string
  muster_point: string
  q: [YesNo, YesNo, YesNo, YesNo, YesNo, YesNo, YesNo, YesNo, YesNo]
  ap_name: string
  supervisor_name: string
}

const EMPTY_FORM: FormState = {
  wind_speed: '',
  gust_speed: '',
  weather_condition: '',
  changes_on_site: '',
  lifting_schedule: '',
  any_other_business: '',
  first_aider_name: '',
  site_location: '',
  muster_point: '',
  q: [null, null, null, null, null, null, null, null, null],
  ap_name: '',
  supervisor_name: '',
}

function toLocalDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function dataURItoBlob(dataURI: string): Blob {
  const [header, base64] = dataURI.split(',')
  const mimeMatch = header.match(/data:([^;]+);base64/)
  const mime = mimeMatch ? mimeMatch[1] : 'image/png'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

function decodeBase64(base64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const result: number[] = []
  let i = 0
  const b64 = base64.replace(/=/g, '')
  while (i < b64.length) {
    const enc1 = chars.indexOf(b64[i++])
    const enc2 = chars.indexOf(b64[i++])
    const enc3 = chars.indexOf(b64[i++])
    const enc4 = chars.indexOf(b64[i++])
    result.push((enc1 << 2) | (enc2 >> 4))
    if (enc3 !== -1) result.push(((enc2 & 15) << 4) | (enc3 >> 2))
    if (enc4 !== -1) result.push(((enc3 & 3) << 6) | enc4)
  }
  return new Uint8Array(result)
}

function WebSignatureCanvas({ onSave, onClear }: {
  onSave: (base64: string) => void
  onClear: () => void
}) {
  const canvasRef = useRef<any>(null)
  const isDrawing = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = canvas.offsetWidth || 340
    canvas.height = canvas.offsetHeight || 160
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  const getPos = (e: any, canvas: any) => {
    const rect = canvas.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  const startDraw = (e: any) => {
    const canvas = canvasRef.current
    if (!canvas) return
    isDrawing.current = true
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const pos = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
    e.preventDefault()
  }

  const draw = (e: any) => {
    if (!isDrawing.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const pos = getPos(e, canvas)
    ctx?.lineTo(pos.x, pos.y)
    ctx?.stroke()
    e.preventDefault()
  }

  const endDraw = () => {
    isDrawing.current = false
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.save()
      ctx.globalCompositeOperation = 'destination-over'
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.restore()
    }
    onSave(canvas.toDataURL('image/png'))
  }

  const handleClear = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    onClear()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 } as any}>
      <canvas
        ref={canvasRef}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
        style={{
          border: '1.5px solid #cccccc',
          borderRadius: 8,
          touchAction: 'none',
          cursor: 'crosshair',
          backgroundColor: '#FFFFFF',
          width: '100%',
          height: 160,
          display: 'block',
        } as any}
      />
      <button
        onClick={handleClear}
        style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid #ccc', background: '#f5f5f5', cursor: 'pointer', fontSize: 13 } as any}
      >
        Clear
      </button>
    </div>
  )
}

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

function FieldLabel({ text, required }: { text: string; required?: boolean }) {
  return (
    <Text style={styles.fieldLabel}>
      {text}
      {required && <Text style={styles.required}> *</Text>}
    </Text>
  )
}

function YesNoToggle({ value, onChange }: { value: YesNo; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.ynRow}>
      <TouchableOpacity
        style={[styles.ynBtn, value === true && styles.ynBtnYes]}
        onPress={() => onChange(true)}
        activeOpacity={0.8}
      >
        <Text style={[styles.ynBtnText, value === true && styles.ynBtnYesText]}>YES</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.ynBtn, value === false && styles.ynBtnNo]}
        onPress={() => onChange(false)}
        activeOpacity={0.8}
      >
        <Text style={[styles.ynBtnText, value === false && styles.ynBtnNoText]}>NO</Text>
      </TouchableOpacity>
    </View>
  )
}

export default function DailyBriefingSetup() {
  const { briefing_id: briefingIdParam } = useLocalSearchParams<{ briefing_id: string }>()
  const router = useRouter()
  const { profile, role } = useAuth()

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [signatureBase64, setSignatureBase64] = useState<string | null>(null)
  const [hasDrawn, setHasDrawn] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [existingBriefingId, setExistingBriefingId] = useState<string | null>(briefingIdParam ?? null)

  const sigRef = useRef<any>(null)
  const submittingViaSignatureRef = useRef(false)

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function updateQuestion(index: number, value: boolean) {
    setForm(prev => {
      const q = [...prev.q] as FormState['q']
      q[index] = value
      return { ...prev, q }
    })
  }

  useEffect(() => {
    async function loadData() {
      if (!profile?.site_id) { setIsLoading(false); return }
      setIsLoading(true)

      let existing: any = null

      if (briefingIdParam) {
        const { data } = await supabase
          .from('daily_briefings')
          .select('*')
          .eq('id', briefingIdParam)
          .single()
        existing = data
        if (data) setExistingBriefingId(data.id)
      } else {
        // Check if today already has an active briefing
        const today = toLocalDateStr(new Date())
        const { data } = await supabase
          .from('daily_briefings')
          .select('*')
          .eq('site_id', profile.site_id)
          .eq('status', 'active')
          .eq('briefing_date', today)
          .maybeSingle()
        if (data) {
          existing = data
          setExistingBriefingId(data.id)
        }
      }

      if (existing) {
        // Edit mode: pre-fill ALL fields from existing briefing
        setForm({
          wind_speed: existing.wind_speed ?? '',
          gust_speed: existing.gust_speed ?? '',
          weather_condition: existing.weather_condition ?? '',
          changes_on_site: existing.changes_on_site ?? '',
          lifting_schedule: existing.lifting_schedule ?? '',
          any_other_business: existing.any_other_business ?? '',
          first_aider_name: existing.first_aider_name ?? '',
          site_location: existing.site_location ?? '',
          muster_point: existing.muster_point ?? '',
          q: [
            existing.q1_crane_clear,
            existing.q2_activities_planned,
            existing.q3_deliveries_scheduled,
            existing.q4_changes_communicated,
            existing.q5_accessory_checks,
            existing.q6_safety_first,
            existing.q7_crane_secured,
            existing.q8_whistles_working,
            existing.q9_radio_check,
          ],
          ap_name: existing.ap_name ?? '',
          supervisor_name: existing.supervisor_name ?? '',
        })
      } else {
        // Create mode: pre-fill persistent fields from settings
        const { data: settings } = await supabase
          .from('daily_briefing_settings')
          .select('changes_on_site, lifting_schedule, any_other_business, first_aider_name, site_location, muster_point')
          .eq('site_id', profile.site_id)
          .maybeSingle()

        const base: Partial<FormState> = {}
        if (settings) {
          base.changes_on_site = settings.changes_on_site ?? ''
          base.lifting_schedule = settings.lifting_schedule ?? ''
          base.any_other_business = settings.any_other_business ?? ''
          base.first_aider_name = settings.first_aider_name ?? ''
          base.site_location = settings.site_location ?? ''
          base.muster_point = settings.muster_point ?? ''
        }

        // Pre-fill AP or supervisor name from current user
        if (role === 'appointed_person') base.ap_name = profile.full_name
        else if (role === 'crane_supervisor') base.supervisor_name = profile.full_name

        setForm(prev => ({ ...prev, ...base }))
      }

      setIsLoading(false)
    }
    loadData()
  }, [profile?.site_id, briefingIdParam, role, profile?.full_name])

  function validateForm(): string[] {
    const errors: string[] = []
    if (!form.wind_speed.trim()) errors.push('Wind Speed (Section 1)')
    if (!form.gust_speed.trim()) errors.push('Gust Speed (Section 1)')
    if (!form.weather_condition.trim()) errors.push('Weather Condition (Section 1)')
    if (!form.changes_on_site.trim()) errors.push('Changes on Site (Section 2)')
    if (!form.lifting_schedule.trim()) errors.push('Lifting Schedule (Section 2)')
    if (!form.first_aider_name.trim()) errors.push('First Aider Name (Section 4)')
    if (!form.site_location.trim()) errors.push('Site Location (Section 4)')
    if (!form.muster_point.trim()) errors.push('Muster Point (Section 4)')
    if (form.q.some(q => q === null)) errors.push('All Yes/No questions (Section 5)')
    if (!form.ap_name.trim()) errors.push('Appointed Person name (Section 6)')
    if (!form.supervisor_name.trim()) errors.push('Lifting Supervisor name (Section 6)')
    return errors
  }

  async function doSubmit(sig: string) {
    console.log('[SETUP] doSubmit called, existingBriefingId:', existingBriefingId)
    setIsSubmitting(true)

    try {
      const today = toLocalDateStr(new Date())
      const sigPath = `setup/${profile!.site_id}/${today}_submitter.png`

      // Upload signature
      console.log('[SETUP] Uploading signature to:', sigPath)
      if (Platform.OS === 'web') {
        const blob = dataURItoBlob(sig)
        const { error: sigError } = await supabase.storage
          .from('daily-briefing-signatures')
          .upload(sigPath, blob, { contentType: 'image/png', upsert: true })
        if (sigError) throw new Error(`Signature upload failed: ${sigError.message}`)
      } else {
        const base64Data = sig.replace(/^data:image\/png;base64,/, '')
        const { error: sigError } = await supabase.storage
          .from('daily-briefing-signatures')
          .upload(sigPath, decodeBase64(base64Data), { contentType: 'image/png', upsert: true })
        if (sigError) throw new Error(`Signature upload failed: ${sigError.message}`)
      }
      console.log('[SETUP] Signature uploaded')

      // Build briefing HTML
      const contentHtml = buildBriefingHtml({
        briefing_date: today,
        wind_speed: form.wind_speed,
        gust_speed: form.gust_speed,
        weather_condition: form.weather_condition,
        first_aider_name: form.first_aider_name,
        site_location: form.site_location,
        muster_point: form.muster_point,
        changes_on_site: form.changes_on_site,
        lifting_schedule: form.lifting_schedule,
        any_other_business: form.any_other_business,
        q1_crane_clear: form.q[0]!,
        q2_activities_planned: form.q[1]!,
        q3_deliveries_scheduled: form.q[2]!,
        q4_changes_communicated: form.q[3]!,
        q5_accessory_checks: form.q[4]!,
        q6_safety_first: form.q[5]!,
        q7_crane_secured: form.q[6]!,
        q8_whistles_working: form.q[7]!,
        q9_radio_check: form.q[8]!,
        ap_name: form.ap_name,
        supervisor_name: form.supervisor_name,
      })

      const payload = {
        site_id: profile!.site_id,
        briefing_date: today,
        wind_speed: form.wind_speed,
        gust_speed: form.gust_speed,
        weather_condition: form.weather_condition,
        changes_on_site: form.changes_on_site,
        lifting_schedule: form.lifting_schedule,
        any_other_business: form.any_other_business,
        first_aider_name: form.first_aider_name,
        site_location: form.site_location,
        muster_point: form.muster_point,
        q1_crane_clear: form.q[0]!,
        q2_activities_planned: form.q[1]!,
        q3_deliveries_scheduled: form.q[2]!,
        q4_changes_communicated: form.q[3]!,
        q5_accessory_checks: form.q[4]!,
        q6_safety_first: form.q[5]!,
        q7_crane_secured: form.q[6]!,
        q8_whistles_working: form.q[7]!,
        q9_radio_check: form.q[8]!,
        ap_name: form.ap_name,
        supervisor_name: form.supervisor_name,
        submitter_name: profile!.full_name,
        submitter_signature_url: sigPath,
        content_html: contentHtml,
        created_by: profile!.id,
        status: 'active',
      }

      if (existingBriefingId) {
        console.log('[SETUP] Updating existing briefing:', existingBriefingId)
        const { error: updateError } = await supabase
          .from('daily_briefings')
          .update({
            wind_speed: payload.wind_speed,
            gust_speed: payload.gust_speed,
            weather_condition: payload.weather_condition,
            changes_on_site: payload.changes_on_site,
            lifting_schedule: payload.lifting_schedule,
            any_other_business: payload.any_other_business,
            first_aider_name: payload.first_aider_name,
            site_location: payload.site_location,
            muster_point: payload.muster_point,
            q1_crane_clear: payload.q1_crane_clear,
            q2_activities_planned: payload.q2_activities_planned,
            q3_deliveries_scheduled: payload.q3_deliveries_scheduled,
            q4_changes_communicated: payload.q4_changes_communicated,
            q5_accessory_checks: payload.q5_accessory_checks,
            q6_safety_first: payload.q6_safety_first,
            q7_crane_secured: payload.q7_crane_secured,
            q8_whistles_working: payload.q8_whistles_working,
            q9_radio_check: payload.q9_radio_check,
            ap_name: payload.ap_name,
            supervisor_name: payload.supervisor_name,
            submitter_name: payload.submitter_name,
            submitter_signature_url: payload.submitter_signature_url,
            content_html: payload.content_html,
          })
          .eq('id', existingBriefingId)
        if (updateError) throw new Error(`Update failed: ${updateError.message}`)
        console.log('[SETUP] Briefing updated')
      } else {
        console.log('[SETUP] Inserting new briefing')
        const { data: inserted, error: insertError } = await supabase
          .from('daily_briefings')
          .insert(payload)
          .select('id')
          .single()
        if (insertError) throw new Error(`Insert failed: ${insertError.message}`)
        console.log('[SETUP] Briefing inserted:', inserted?.id)
      }

      // UPSERT persistent fields into settings
      const { error: settingsError } = await supabase
        .from('daily_briefing_settings')
        .upsert(
          {
            site_id: profile!.site_id,
            changes_on_site: form.changes_on_site,
            lifting_schedule: form.lifting_schedule,
            any_other_business: form.any_other_business,
            first_aider_name: form.first_aider_name,
            site_location: form.site_location,
            muster_point: form.muster_point,
            updated_at: new Date().toISOString(),
            updated_by: profile!.id,
          },
          { onConflict: 'site_id' }
        )
      if (settingsError) console.error('[SETUP] Settings upsert error (non-fatal):', settingsError.message)

      console.log('[SETUP] Done — navigating to briefing home')
      router.replace('/(appointed-person)/daily-briefing/' as any)
    } catch (err: any) {
      console.error('[SETUP] Submit error:', err)
      if (Platform.OS === 'web') {
        window.alert(`Error: ${err.message ?? 'Failed to save briefing'}`)
      } else {
        Alert.alert('Error', err.message ?? 'Failed to save briefing')
      }
    } finally {
      submittingViaSignatureRef.current = false
      setIsSubmitting(false)
    }
  }

  function handleNativeSignatureOk(sig: string) {
    setSignatureBase64(sig)
    if (submittingViaSignatureRef.current) {
      doSubmit(sig)
    }
  }

  function handleClearSignature() {
    if (Platform.OS !== 'web') {
      sigRef.current?.clearSignature()
      setHasDrawn(false)
    }
    setSignatureBase64(null)
  }

  async function handleSubmitForm() {
    if (isSubmitting || submittingViaSignatureRef.current) return

    const errors = validateForm()
    if (errors.length > 0) {
      const msg = `Please complete the following required fields:\n\n• ${errors.join('\n• ')}`
      if (Platform.OS === 'web') {
        window.alert(msg)
      } else {
        Alert.alert('Missing Required Fields', msg)
      }
      return
    }

    if (Platform.OS === 'web') {
      if (!signatureBase64) {
        window.alert('Please draw your signature in Section 6 before submitting.')
        return
      }
      await doSubmit(signatureBase64)
    } else {
      if (!hasDrawn) {
        Alert.alert('No Signature', 'Please draw your signature in Section 6 before submitting.')
        return
      }
      submittingViaSignatureRef.current = true
      sigRef.current?.readSignature()
    }
  }

  const isEditMode = !!existingBriefingId
  const pageTitle = isEditMode ? 'Edit Briefing' : 'Set Up Briefing'

  if (isLoading) {
    return (
      <ScreenWrapper edges={['bottom']}>
        <Breadcrumb items={[
          { label: 'Dashboard', href: '/(appointed-person)/' },
          { label: 'Daily Briefing', href: '/(appointed-person)/daily-briefing/' },
          { label: pageTitle },
        ]} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading briefing data…</Text>
        </View>
      </ScreenWrapper>
    )
  }

  return (
    <ScreenWrapper edges={['bottom']}>
      <Breadcrumb items={[
        { label: 'Dashboard', href: '/(appointed-person)/' },
        { label: 'Daily Briefing', href: '/(appointed-person)/daily-briefing/' },
        { label: pageTitle },
      ]} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {isEditMode && (
            <View style={styles.editBanner}>
              <Text style={styles.editBannerText}>Editing today's briefing — changes will overwrite the existing document.</Text>
            </View>
          )}

          {/* Section 1 — Weather Forecast */}
          <SectionHeader number="1" title="Weather Forecast" />
          <View style={styles.card}>
            <Text style={styles.sectionNote}>Resets daily — not pre-filled from previous briefing.</Text>

            <FieldLabel text="Wind Speed" required />
            <TextInput
              style={styles.input}
              value={form.wind_speed}
              onChangeText={v => updateField('wind_speed', v)}
              placeholder="e.g. 18 km/h"
              placeholderTextColor={Colors.textMuted}
              keyboardType="default"
            />

            <FieldLabel text="Gust Speed" required />
            <TextInput
              style={styles.input}
              value={form.gust_speed}
              onChangeText={v => updateField('gust_speed', v)}
              placeholder="e.g. 28 km/h"
              placeholderTextColor={Colors.textMuted}
              keyboardType="default"
            />

            <FieldLabel text="Weather Conditions and Temperature" required />
            <TextInput
              style={styles.input}
              value={form.weather_condition}
              onChangeText={v => updateField('weather_condition', v)}
              placeholder="e.g. 18°C, partly cloudy"
              placeholderTextColor={Colors.textMuted}
            />
          </View>

          {/* Section 2 — Site Details */}
          <SectionHeader number="2" title="Site Details" />
          <View style={styles.card}>
            <Text style={styles.sectionNote}>Persistent — pre-filled from last briefing and saved for future briefings.</Text>

            <FieldLabel text="Changes on Site" required />
            <Text style={styles.fieldHint}>Site layout changes, lifting team changes, new restrictions, amended risk assessments, etc.</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              value={form.changes_on_site}
              onChangeText={v => updateField('changes_on_site', v)}
              placeholder="Describe any changes to site, personnel, or restrictions…"
              placeholderTextColor={Colors.textMuted}
              multiline
              textAlignVertical="top"
            />

            <FieldLabel text="Lifting Schedule" required />
            <Text style={styles.fieldHint}>TC1 / TC2 / TC3 times, priority notes, planned deliveries.</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              value={form.lifting_schedule}
              onChangeText={v => updateField('lifting_schedule', v)}
              placeholder="List planned lifts for today, crane assignments, delivery windows…"
              placeholderTextColor={Colors.textMuted}
              multiline
              textAlignVertical="top"
            />
          </View>

          {/* Section 3 — Any Other Business */}
          <SectionHeader number="3" title="Any Other Business" />
          <View style={styles.card}>
            <Text style={styles.sectionNote}>Persistent — pre-filled from last briefing.</Text>

            <FieldLabel text="Any Other Business" />
            <TextInput
              style={[styles.input, styles.textarea]}
              value={form.any_other_business}
              onChangeText={v => updateField('any_other_business', v)}
              placeholder="Additional notes or announcements…"
              placeholderTextColor={Colors.textMuted}
              multiline
              textAlignVertical="top"
            />
          </View>

          {/* Section 4 — First Aider / Muster Point */}
          <SectionHeader number="4" title="First Aider &amp; Muster Point" />
          <View style={styles.card}>
            <Text style={styles.sectionNote}>Persistent — pre-filled from last briefing.</Text>

            <FieldLabel text="First Aider Name" required />
            <TextInput
              style={styles.input}
              value={form.first_aider_name}
              onChangeText={v => updateField('first_aider_name', v)}
              placeholder="Full name of site first aider"
              placeholderTextColor={Colors.textMuted}
            />

            <FieldLabel text="Site Location / Address" required />
            <TextInput
              style={styles.input}
              value={form.site_location}
              onChangeText={v => updateField('site_location', v)}
              placeholder="e.g. 75 London Wall, EC2M 5ND"
              placeholderTextColor={Colors.textMuted}
            />

            <FieldLabel text="Muster Point Location" required />
            <TextInput
              style={styles.input}
              value={form.muster_point}
              onChangeText={v => updateField('muster_point', v)}
              placeholder="e.g. Car park on south side of building"
              placeholderTextColor={Colors.textMuted}
            />
          </View>

          {/* Section 5 — Have You Covered the Following? */}
          <SectionHeader number="5" title="Have You Covered the Following?" />
          <View style={styles.card}>
            <Text style={styles.sectionNote}>All questions are required and reset daily.</Text>
            {YES_NO_QUESTIONS.map((q, i) => (
              <View key={i} style={styles.questionRow}>
                <Text style={styles.questionText}>{q}</Text>
                <YesNoToggle value={form.q[i] as YesNo} onChange={v => updateQuestion(i, v)} />
              </View>
            ))}
          </View>

          {/* Section 6 — AP and Supervisors */}
          <SectionHeader number="6" title="AP and Supervisors" />
          <View style={styles.card}>
            <FieldLabel text="Appointed Person Resident" required />
            <TextInput
              style={styles.input}
              value={form.ap_name}
              onChangeText={v => updateField('ap_name', v)}
              placeholder="Full name"
              placeholderTextColor={Colors.textMuted}
            />

            <FieldLabel text="Lifting Supervisor" required />
            <TextInput
              style={styles.input}
              value={form.supervisor_name}
              onChangeText={v => updateField('supervisor_name', v)}
              placeholder="Full name"
              placeholderTextColor={Colors.textMuted}
            />

            <FieldLabel text="Submitted By" />
            <View style={styles.readOnlyField}>
              <Text style={styles.readOnlyText}>{profile?.full_name ?? '—'}</Text>
            </View>

            <FieldLabel text="Signature" required />
            <Text style={styles.fieldHint}>Draw your signature to confirm this briefing.</Text>

            {Platform.OS === 'web' ? (
              <WebSignatureCanvas
                onSave={base64 => setSignatureBase64(base64)}
                onClear={() => setSignatureBase64(null)}
              />
            ) : (
              <>
                <View style={styles.canvasContainer}>
                  <NativeSignatureCanvas
                    ref={sigRef}
                    onOK={handleNativeSignatureOk}
                    onClear={() => { setSignatureBase64(null); setHasDrawn(false) }}
                    onBegin={() => setHasDrawn(true)}
                    onEmpty={() => { setHasDrawn(false); setSignatureBase64(null) }}
                    descriptionText=""
                    clearText="Clear"
                    confirmText="Save"
                    webStyle={nativeCanvasStyle}
                    penColor="#000000"
                    autoClear={false}
                  />
                </View>
                <View style={styles.canvasActions}>
                  <TouchableOpacity style={styles.clearBtn} onPress={handleClearSignature} activeOpacity={0.8}>
                    <Text style={styles.clearBtnText}>Clear</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>

          {/* Submit button */}
          <TouchableOpacity
            style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
            onPress={handleSubmitForm}
            disabled={isSubmitting}
            activeOpacity={0.85}
          >
            {isSubmitting
              ? <ActivityIndicator color={Colors.textInverse} />
              : <Text style={styles.submitBtnText}>
                  {isEditMode ? 'Update Briefing' : 'Submit Briefing'}
                </Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  )
}

const nativeCanvasStyle = `
  .m-signature-pad { box-shadow: none; border: none; }
  .m-signature-pad--body { border: none; background: #FFFFFF !important; }
  .m-signature-pad--body canvas { background: #FFFFFF !important; }
  .m-signature-pad--footer { display: none; }
  body, html { width: 100%; height: 100%; margin: 0; padding: 0; background: #FFFFFF; }
`

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
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
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
  sectionNote: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginBottom: Spacing.md,
  },
  fieldLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 6,
    marginTop: Spacing.sm,
  },
  required: { color: Colors.danger },
  fieldHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginBottom: 6,
    marginTop: -4,
    lineHeight: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    fontSize: FontSize.sm,
    color: Colors.text,
    backgroundColor: Colors.background,
    marginBottom: Spacing.xs,
  },
  textarea: { height: 100, paddingTop: Spacing.sm },
  readOnlyField: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.border,
    marginBottom: Spacing.xs,
  },
  readOnlyText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600' },
  questionRow: {
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  questionText: { fontSize: FontSize.sm, color: Colors.text, lineHeight: 20, flex: 1 },
  ynRow: { flexDirection: 'row', gap: 8 },
  ynBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    minWidth: 52,
    alignItems: 'center',
  },
  ynBtnYes: { borderColor: Colors.success, backgroundColor: Colors.success + '15' },
  ynBtnNo: { borderColor: Colors.danger, backgroundColor: Colors.danger + '15' },
  ynBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textSecondary },
  ynBtnYesText: { color: Colors.success },
  ynBtnNoText: { color: Colors.danger },
  canvasContainer: {
    height: 160,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  canvasActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: Spacing.sm,
  },
  clearBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  clearBtnText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600' },
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
