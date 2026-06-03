import { useState, useRef, useEffect } from 'react'
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
import { buildMeetingHtml } from '@/lib/crane-meeting-template'

// IMPORTANT: Ensure crane_meeting_schema.sql has been run in Supabase SQL Editor
// and buckets "crane-meeting-signatures" and "crane-meeting-archive" exist.

const NativeSignatureCanvas = Platform.OS !== 'web'
  ? require('react-native-signature-canvas').default
  : null

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

interface FormState {
  project: string
  project_no: string
  meeting_date: string     // YYYY-MM-DD
  meeting_time: string
  review_text: string
  incidents_text: string
  revised_methods: string
  future_lifts: string
  weather_forecast: string
  new_methods: string
  lifting_equipment: string
  any_other_business: string
  next_meeting_date: string  // YYYY-MM-DD or ''
}

const EMPTY_FORM: FormState = {
  project: '',
  project_no: '',
  meeting_date: toLocalDateStr(new Date()),
  meeting_time: '',
  review_text: '',
  incidents_text: '',
  revised_methods: '',
  future_lifts: '',
  weather_forecast: '',
  new_methods: '',
  lifting_equipment: '',
  any_other_business: '',
  next_meeting_date: '',
}

export default function CraneMeetingSetup() {
  const { meeting_id: meetingIdParam } = useLocalSearchParams<{ meeting_id: string }>()
  const router = useRouter()
  const { profile } = useAuth()

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [signatureBase64, setSignatureBase64] = useState<string | null>(null)
  const [hasDrawn, setHasDrawn] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [existingMeetingId, setExistingMeetingId] = useState<string | null>(meetingIdParam ?? null)

  const sigRef = useRef<any>(null)
  const submittingViaSignatureRef = useRef(false)

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  useEffect(() => {
    async function loadData() {
      if (!profile?.site_id) { setIsLoading(false); return }
      setIsLoading(true)

      let existing: any = null

      if (meetingIdParam) {
        const { data } = await supabase
          .from('crane_meetings')
          .select('*')
          .eq('id', meetingIdParam)
          .single()
        existing = data
        if (data) setExistingMeetingId(data.id)
      } else {
        // Check for existing active meeting
        const { data } = await supabase
          .from('crane_meetings')
          .select('*')
          .eq('site_id', profile.site_id)
          .eq('status', 'active')
          .maybeSingle()
        if (data) {
          existing = data
          setExistingMeetingId(data.id)
        }
      }

      if (existing) {
        setForm({
          project:            existing.project ?? '',
          project_no:         existing.project_no ?? '',
          meeting_date:       existing.meeting_date ?? toLocalDateStr(new Date()),
          meeting_time:       existing.meeting_time ?? '',
          review_text:        existing.review_text ?? '',
          incidents_text:     existing.incidents_text ?? '',
          revised_methods:    existing.revised_methods ?? '',
          future_lifts:       existing.future_lifts ?? '',
          weather_forecast:   existing.weather_forecast ?? '',
          new_methods:        existing.new_methods ?? '',
          lifting_equipment:  existing.lifting_equipment ?? '',
          any_other_business: existing.any_other_business ?? '',
          next_meeting_date:  existing.next_meeting_date ?? '',
        })
      } else {
        // Create mode: pre-fill persistent fields from settings
        const { data: settings } = await supabase
          .from('crane_meeting_settings')
          .select('*')
          .eq('site_id', profile.site_id)
          .maybeSingle()

        if (settings) {
          setForm(prev => ({
            ...prev,
            project:            settings.project ?? '',
            project_no:         settings.project_no ?? '',
            review_text:        settings.review_text ?? '',
            incidents_text:     settings.incidents_text ?? '',
            revised_methods:    settings.revised_methods ?? '',
            future_lifts:       settings.future_lifts ?? '',
            weather_forecast:   settings.weather_forecast ?? '',
            new_methods:        settings.new_methods ?? '',
            lifting_equipment:  settings.lifting_equipment ?? '',
            any_other_business: settings.any_other_business ?? '',
            next_meeting_date:  settings.next_meeting_date ?? '',
          }))
        }
      }

      setIsLoading(false)
    }
    loadData()
  }, [profile?.site_id, meetingIdParam])

  function validateForm(): string[] {
    const errors: string[] = []
    if (!form.project.trim())       errors.push('Project (Section 1)')
    if (!form.project_no.trim())    errors.push('Project No (Section 1)')
    if (!form.meeting_date.trim())  errors.push('Meeting Date (Section 1)')
    if (!form.meeting_time.trim())  errors.push('Meeting Time (Section 1)')
    if (!form.review_text.trim())   errors.push('Review of Last Week (Section 2)')
    return errors
  }

  async function doSubmit(sig: string) {
    console.log('[CM-SETUP] doSubmit called, existingMeetingId:', existingMeetingId)
    setIsSubmitting(true)

    try {
      const today = toLocalDateStr(new Date())
      const sigPath = `setup/${profile!.site_id}/${today}_submitter.png`

      // Upload signature
      console.log('[CM-SETUP] Uploading signature to:', sigPath)
      if (Platform.OS === 'web') {
        const blob = dataURItoBlob(sig)
        const { error: sigError } = await supabase.storage
          .from('crane-meeting-signatures')
          .upload(sigPath, blob, { contentType: 'image/png', upsert: true })
        if (sigError) throw new Error(`Signature upload failed: ${sigError.message}`)
      } else {
        const base64Data = sig.replace(/^data:image\/png;base64,/, '')
        const { error: sigError } = await supabase.storage
          .from('crane-meeting-signatures')
          .upload(sigPath, decodeBase64(base64Data), { contentType: 'image/png', upsert: true })
        if (sigError) throw new Error(`Signature upload failed: ${sigError.message}`)
      }
      console.log('[CM-SETUP] Signature uploaded')

      // Build meeting HTML
      const contentHtml = buildMeetingHtml({
        project:            form.project,
        project_no:         form.project_no,
        meeting_date:       form.meeting_date,
        meeting_time:       form.meeting_time,
        review_text:        form.review_text,
        incidents_text:     form.incidents_text,
        revised_methods:    form.revised_methods,
        future_lifts:       form.future_lifts,
        weather_forecast:   form.weather_forecast,
        new_methods:        form.new_methods,
        lifting_equipment:  form.lifting_equipment,
        any_other_business: form.any_other_business,
        next_meeting_date:  form.next_meeting_date || null,
      })

      const payload = {
        site_id:                  profile!.site_id,
        meeting_date:             form.meeting_date,
        meeting_time:             form.meeting_time,
        project:                  form.project,
        project_no:               form.project_no,
        review_text:              form.review_text,
        incidents_text:           form.incidents_text,
        revised_methods:          form.revised_methods,
        future_lifts:             form.future_lifts,
        weather_forecast:         form.weather_forecast,
        new_methods:              form.new_methods,
        lifting_equipment:        form.lifting_equipment,
        any_other_business:       form.any_other_business,
        next_meeting_date:        form.next_meeting_date || null,
        submitter_name:           profile!.full_name,
        submitter_signature_url:  sigPath,
        content_html:             contentHtml,
        created_by:               profile!.id,
        status:                   'active',
      }

      if (existingMeetingId) {
        console.log('[CM-SETUP] Updating existing meeting:', existingMeetingId)
        const { error: updateError } = await supabase
          .from('crane_meetings')
          .update({
            meeting_date:             payload.meeting_date,
            meeting_time:             payload.meeting_time,
            project:                  payload.project,
            project_no:               payload.project_no,
            review_text:              payload.review_text,
            incidents_text:           payload.incidents_text,
            revised_methods:          payload.revised_methods,
            future_lifts:             payload.future_lifts,
            weather_forecast:         payload.weather_forecast,
            new_methods:              payload.new_methods,
            lifting_equipment:        payload.lifting_equipment,
            any_other_business:       payload.any_other_business,
            next_meeting_date:        payload.next_meeting_date,
            submitter_name:           payload.submitter_name,
            submitter_signature_url:  payload.submitter_signature_url,
            content_html:             payload.content_html,
          })
          .eq('id', existingMeetingId)
        if (updateError) throw new Error(`Update failed: ${updateError.message}`)
        console.log('[CM-SETUP] Meeting updated')
      } else {
        console.log('[CM-SETUP] Inserting new meeting')
        const { data: inserted, error: insertError } = await supabase
          .from('crane_meetings')
          .insert(payload)
          .select('id')
          .single()
        if (insertError) throw new Error(`Insert failed: ${insertError.message}`)
        console.log('[CM-SETUP] Meeting inserted:', inserted?.id)
      }

      // UPSERT persistent settings
      const { error: settingsError } = await supabase
        .from('crane_meeting_settings')
        .upsert(
          {
            site_id:            profile!.site_id,
            project:            form.project,
            project_no:         form.project_no,
            review_text:        form.review_text,
            incidents_text:     form.incidents_text,
            revised_methods:    form.revised_methods,
            future_lifts:       form.future_lifts,
            weather_forecast:   form.weather_forecast,
            new_methods:        form.new_methods,
            lifting_equipment:  form.lifting_equipment,
            any_other_business: form.any_other_business,
            next_meeting_date:  form.next_meeting_date || null,
            updated_at:         new Date().toISOString(),
            updated_by:         profile!.id,
          },
          { onConflict: 'site_id' }
        )
      if (settingsError) console.error('[CM-SETUP] Settings upsert error (non-fatal):', settingsError.message)

      console.log('[CM-SETUP] Done — navigating to crane meeting home')
      router.replace('/(appointed-person)/crane-meeting/' as any)
    } catch (err: any) {
      console.error('[CM-SETUP] Submit error:', err)
      if (Platform.OS === 'web') {
        window.alert(`Error: ${err.message ?? 'Failed to save meeting'}`)
      } else {
        Alert.alert('Error', err.message ?? 'Failed to save meeting')
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
        window.alert('Please draw your signature in Section 4 before submitting.')
        return
      }
      await doSubmit(signatureBase64)
    } else {
      if (!hasDrawn) {
        Alert.alert('No Signature', 'Please draw your signature in Section 4 before submitting.')
        return
      }
      submittingViaSignatureRef.current = true
      sigRef.current?.readSignature()
    }
  }

  const isEditMode = !!existingMeetingId
  const pageTitle = isEditMode ? 'Edit Meeting' : 'Set Up Meeting'

  if (isLoading) {
    return (
      <ScreenWrapper edges={['bottom']}>
        <Breadcrumb items={[
          { label: 'Dashboard', href: '/(appointed-person)/' },
          { label: 'Supervisor Checks', href: '/(appointed-person)/supervisor-checks' },
          { label: 'Crane Meeting', href: '/(appointed-person)/crane-meeting/' },
          { label: pageTitle },
        ]} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading meeting data…</Text>
        </View>
      </ScreenWrapper>
    )
  }

  return (
    <ScreenWrapper edges={['bottom']}>
      <Breadcrumb items={[
        { label: 'Dashboard', href: '/(appointed-person)/' },
        { label: 'Supervisor Checks', href: '/(appointed-person)/supervisor-checks' },
        { label: 'Crane Meeting', href: '/(appointed-person)/crane-meeting/' },
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
              <Text style={styles.editBannerText}>Editing active meeting — changes will overwrite the existing document.</Text>
            </View>
          )}

          {/* Section 1 — Project, Date & Time */}
          <SectionHeader number="1" title="Project, Date &amp; Time" />
          <View style={styles.card}>
            <Text style={styles.sectionNote}>Project and Project No are persistent — pre-filled from previous meeting. Date and Time are entered fresh each week.</Text>

            <FieldLabel text="Project" required />
            <TextInput
              style={styles.input}
              value={form.project}
              onChangeText={v => updateField('project', v)}
              placeholder="e.g. 75 London Wall"
              placeholderTextColor={Colors.textMuted}
            />

            <FieldLabel text="Project No" required />
            <TextInput
              style={styles.input}
              value={form.project_no}
              onChangeText={v => updateField('project_no', v)}
              placeholder="e.g. PLG-2024-001"
              placeholderTextColor={Colors.textMuted}
            />

            <FieldLabel text="Meeting Date" required />
            {Platform.OS === 'web' ? (
              <input
                type="date"
                value={form.meeting_date}
                onChange={e => updateField('meeting_date', e.target.value)}
                style={{ width: '100%', padding: '8px 10px', fontSize: 14, borderRadius: 6, border: '1px solid #CBD5E1', marginBottom: 8, boxSizing: 'border-box' } as any}
              />
            ) : (
              <TextInput
                style={styles.input}
                value={form.meeting_date}
                onChangeText={v => updateField('meeting_date', v)}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={Colors.textMuted}
                keyboardType="numeric"
              />
            )}

            <FieldLabel text="Meeting Time" required />
            {Platform.OS === 'web' ? (
              <input
                type="time"
                value={form.meeting_time}
                onChange={e => updateField('meeting_time', e.target.value)}
                style={{ width: '100%', padding: '8px 10px', fontSize: 14, borderRadius: 6, border: '1px solid #CBD5E1', marginBottom: 8, boxSizing: 'border-box' } as any}
              />
            ) : (
              <TextInput
                style={styles.input}
                value={form.meeting_time}
                onChangeText={v => updateField('meeting_time', v)}
                placeholder="e.g. 08:00"
                placeholderTextColor={Colors.textMuted}
                keyboardType="numbers-and-punctuation"
              />
            )}
          </View>

          {/* Section 2 — Meeting Details */}
          <SectionHeader number="2" title="Meeting Details" />
          <View style={styles.card}>
            <Text style={styles.sectionNote}>All fields are persistent — pre-filled from previous meeting. Update as needed for this week.</Text>

            <FieldLabel text="Review of Yesterday's / Last Week's Lifting Operations" required />
            <TextInput
              style={[styles.input, styles.textarea]}
              value={form.review_text}
              onChangeText={v => updateField('review_text', v)}
              placeholder="Summary of last week's operations…"
              placeholderTextColor={Colors.textMuted}
              multiline
              textAlignVertical="top"
            />

            <FieldLabel text="Incidents / Problems" required />
            <TextInput
              style={[styles.input, styles.textarea]}
              value={form.incidents_text}
              onChangeText={v => updateField('incidents_text', v)}
              placeholder="Any incidents, near misses, or problems…"
              placeholderTextColor={Colors.textMuted}
              multiline
              textAlignVertical="top"
            />

            <FieldLabel text="Revised Methods" required />
            <TextInput
              style={[styles.input, styles.textarea]}
              value={form.revised_methods}
              onChangeText={v => updateField('revised_methods', v)}
              placeholder="Any revised lifting methods…"
              placeholderTextColor={Colors.textMuted}
              multiline
              textAlignVertical="top"
            />

            <FieldLabel text="Future Lifts" required />
            <TextInput
              style={[styles.input, styles.textarea]}
              value={form.future_lifts}
              onChangeText={v => updateField('future_lifts', v)}
              placeholder="Planned lifts for this week…"
              placeholderTextColor={Colors.textMuted}
              multiline
              textAlignVertical="top"
            />

            <FieldLabel text="Weather Forecast" required />
            <TextInput
              style={[styles.input, styles.textarea]}
              value={form.weather_forecast}
              onChangeText={v => updateField('weather_forecast', v)}
              placeholder="This week's weather forecast…"
              placeholderTextColor={Colors.textMuted}
              multiline
              textAlignVertical="top"
            />

            <FieldLabel text="New Methods" required />
            <TextInput
              style={[styles.input, styles.textarea]}
              value={form.new_methods}
              onChangeText={v => updateField('new_methods', v)}
              placeholder="Any new lifting methods being introduced…"
              placeholderTextColor={Colors.textMuted}
              multiline
              textAlignVertical="top"
            />

            <FieldLabel text="Lifting Equipment and Accessories" required />
            <TextInput
              style={[styles.input, styles.textarea]}
              value={form.lifting_equipment}
              onChangeText={v => updateField('lifting_equipment', v)}
              placeholder="Equipment and accessories for this week…"
              placeholderTextColor={Colors.textMuted}
              multiline
              textAlignVertical="top"
            />

            <FieldLabel text="Any Other Business (Holiday notice, bulletins, and alerts)" />
            <TextInput
              style={[styles.input, styles.textarea]}
              value={form.any_other_business}
              onChangeText={v => updateField('any_other_business', v)}
              placeholder="Bulletins, holiday notices, alerts…"
              placeholderTextColor={Colors.textMuted}
              multiline
              textAlignVertical="top"
            />
          </View>

          {/* Section 3 — Date of Next Meeting */}
          <SectionHeader number="3" title="Date of Next Meeting" />
          <View style={styles.card}>
            <Text style={styles.sectionNote}>Persistent — pre-filled from previous meeting.</Text>
            <FieldLabel text="Next Meeting Date" />
            {Platform.OS === 'web' ? (
              <input
                type="date"
                value={form.next_meeting_date}
                onChange={e => updateField('next_meeting_date', e.target.value)}
                style={{ width: '100%', padding: '8px 10px', fontSize: 14, borderRadius: 6, border: '1px solid #CBD5E1', marginBottom: 8, boxSizing: 'border-box' } as any}
              />
            ) : (
              <TextInput
                style={styles.input}
                value={form.next_meeting_date}
                onChangeText={v => updateField('next_meeting_date', v)}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={Colors.textMuted}
                keyboardType="numeric"
              />
            )}
          </View>

          {/* Section 4 — Creator Signature */}
          <SectionHeader number="4" title="Creator Signature" />
          <View style={styles.card}>
            <FieldLabel text="Submitted By" />
            <View style={styles.readOnlyField}>
              <Text style={styles.readOnlyText}>{profile?.full_name ?? '—'}</Text>
            </View>

            <FieldLabel text="Signature" required />
            <Text style={styles.fieldHint}>Draw your signature to confirm and submit this crane meeting.</Text>

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

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
            onPress={handleSubmitForm}
            disabled={isSubmitting}
            activeOpacity={0.85}
          >
            {isSubmitting
              ? <ActivityIndicator color={Colors.textInverse} />
              : <Text style={styles.submitBtnText}>
                  {isEditMode ? 'Update Meeting' : 'Submit Meeting'}
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
