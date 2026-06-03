import { useState, useRef, useEffect } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, Platform,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { Breadcrumb } from '@/components/breadcrumb'
import { Colors, Spacing, FontSize, BorderRadius, Shadow } from '@/constants/theme'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

// IMPORTANT: Bucket "crane-meeting-signatures" must exist in Supabase Storage
// before this screen will work (private, 5 MB, image/png).

const NativeSignatureCanvas = Platform.OS !== 'web'
  ? require('react-native-signature-canvas').default
  : null

const ROLE_LABELS: Record<string, string> = {
  appointed_person:    'Appointed Person',
  crane_supervisor:    'Crane Supervisor',
  crane_operator:      'Crane Operator',
  slinger_signaller:   'Slinger / Signaller',
  subcontractor_admin: 'Subcontractor Admin',
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={row.container}>
      <Text style={row.label}>{label}</Text>
      <Text style={row.value}>{value}</Text>
    </View>
  )
}

const row = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  label: { width: 100, fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '500' },
  value: { flex: 1, fontSize: FontSize.sm, color: Colors.text, fontWeight: '600' },
})

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

function dataURItoBlob(dataURI: string): Blob {
  const [header, base64] = dataURI.split(',')
  const mimeMatch = header.match(/data:([^;]+);base64/)
  const mime = mimeMatch ? mimeMatch[1] : 'image/png'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
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
    canvas.height = canvas.offsetHeight || 200
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
          height: 200,
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

export default function SignCraneMeeting() {
  const { meeting_id } = useLocalSearchParams<{ meeting_id: string }>()
  const router = useRouter()
  const { profile, role } = useAuth()

  const sigRef = useRef<any>(null)
  const [signatureBase64, setSignatureBase64] = useState<string | null>(null)
  const [hasDrawn, setHasDrawn] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [company, setCompany] = useState('')
  const [isLoadingCompany, setIsLoadingCompany] = useState(true)

  useEffect(() => {
    async function resolveCompany() {
      if (!profile) return

      if (role === 'subcontractor_admin') {
        let subId = (profile as any).subcontractor_id
        if (!subId) {
          const { data: fullProfile } = await supabase
            .from('profiles')
            .select('subcontractor_id')
            .eq('id', profile.id)
            .single()
          subId = (fullProfile as any)?.subcontractor_id
        }
        if (subId) {
          const { data } = await supabase
            .from('subcontractors')
            .select('name')
            .eq('id', subId)
            .single()
          setCompany(data?.name ?? 'Subcontractor')
        } else {
          setCompany('Subcontractor')
        }
      } else if (profile.company_id) {
        const { data } = await supabase
          .from('companies')
          .select('name')
          .eq('id', profile.company_id)
          .single()
        setCompany(data?.name ?? 'Unknown Company')
      } else {
        setCompany('Unknown')
      }
      setIsLoadingCompany(false)
    }
    resolveCompany()
  }, [profile, role])

  async function handleConfirm(sig: string) {
    console.log('[SIGN-CM] handleConfirm (native), profile.id:', profile?.id, 'meeting_id:', meeting_id)
    if (!profile?.id || !meeting_id) {
      console.error('[SIGN-CM] Missing profile.id or meeting_id — aborting')
      return
    }

    const base64Data = sig.replace(/^data:image\/png;base64,/, '')
    const storagePath = `${meeting_id}/${profile.id}.png`

    setIsSubmitting(true)
    console.log('[SIGN-CM] Uploading signature to:', storagePath)

    const { error: uploadError } = await supabase.storage
      .from('crane-meeting-signatures')
      .upload(storagePath, decodeBase64(base64Data), { contentType: 'image/png', upsert: true })

    if (uploadError) {
      console.error('[SIGN-CM] Upload error:', uploadError)
      setIsSubmitting(false)
      Alert.alert('Upload Error', uploadError.message)
      return
    }

    console.log('[SIGN-CM] Upload successful, inserting signature record')

    const { error: insertError } = await supabase
      .from('crane_meeting_signatures')
      .insert({
        meeting_id,
        user_id: profile.id,
        full_name: profile.full_name,
        role: role!,
        company,
        signature_image_url: storagePath,
      })

    setIsSubmitting(false)

    if (insertError) {
      console.error('[SIGN-CM] Insert error:', insertError.code, insertError.message)
      if (insertError.code === '23505') {
        Alert.alert('Already Signed', 'You have already signed this crane meeting.')
        router.back()
        return
      }
      Alert.alert('Error', insertError.message)
      return
    }

    console.log('[SIGN-CM] Signature saved — showing thank-you alert')
    Alert.alert(
      'Thank You',
      'Thank you for signing the crane meeting.',
      [{ text: 'OK', onPress: () => router.replace('/(appointed-person)/crane-meeting/' as any) }],
    )
  }

  function handleClear() {
    if (Platform.OS !== 'web') {
      sigRef.current?.clearSignature()
      setHasDrawn(false)
    }
    setSignatureBase64(null)
  }

  async function handleSubmitSignature() {
    console.log('[SIGN-CM] handleSubmitSignature, platform:', Platform.OS)
    console.log('[SIGN-CM] signatureBase64 present:', !!signatureBase64, 'profile.id:', profile?.id)

    if (Platform.OS === 'web') {
      if (!signatureBase64) {
        window.alert('Please draw your signature first.')
        return
      }

      try {
        setIsSubmitting(true)
        const blob = dataURItoBlob(signatureBase64)
        const path = `${meeting_id}/${profile!.id}.png`

        console.log('[SIGN-CM] Uploading to storage path:', path)
        const { error: uploadError } = await supabase.storage
          .from('crane-meeting-signatures')
          .upload(path, blob, { contentType: 'image/png', upsert: true })

        if (uploadError) throw new Error(uploadError.message)

        console.log('[SIGN-CM] Inserting signature record')
        const { error: insertError } = await supabase
          .from('crane_meeting_signatures')
          .insert({
            meeting_id,
            user_id: profile!.id,
            full_name: profile!.full_name,
            role: role!,
            company,
            signature_image_url: path,
          })

        if (insertError) {
          if (insertError.code === '23505') {
            window.alert('You have already signed this crane meeting.')
            router.back()
            return
          }
          throw new Error(insertError.message)
        }

        console.log('[SIGN-CM] Signature saved — navigating to crane meeting home')
        window.alert('Thank you for signing the crane meeting.')
        router.replace('/(appointed-person)/crane-meeting/' as any)
      } catch (err: any) {
        console.error('[SIGN-CM] Submit failed:', err)
        window.alert(`Signature failed: ${err.message ?? 'Unknown error'}`)
      } finally {
        setIsSubmitting(false)
      }
    } else {
      if (!hasDrawn) {
        Alert.alert('No signature', 'Please draw your signature first.')
        return
      }
      console.log('[SIGN-CM] Calling readSignature() on native ref')
      sigRef.current?.readSignature()
    }
  }

  const isSignatureReady = Platform.OS === 'web' ? !!signatureBase64 : hasDrawn

  const breadcrumb = (
    <Breadcrumb items={[
      { label: 'Dashboard', href: '/(appointed-person)/' },
      { label: 'Supervisor Checks', href: '/(appointed-person)/supervisor-checks' },
      { label: 'Crane Meeting', href: '/(appointed-person)/crane-meeting/' },
      { label: 'Sign Off' },
    ]} />
  )

  if (isLoadingCompany) {
    return (
      <ScreenWrapper edges={['bottom']}>
        {breadcrumb}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </ScreenWrapper>
    )
  }

  return (
    <ScreenWrapper edges={['bottom']}>
      {breadcrumb}
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Your Details</Text>
          <DetailRow label="Name" value={profile?.full_name ?? '—'} />
          <DetailRow label="Role" value={ROLE_LABELS[role ?? ''] ?? (role ?? '—')} />
          <DetailRow label="Company" value={company} />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Draw Signature</Text>
          <Text style={styles.canvasHint}>Sign in the box below using your finger.</Text>

          {Platform.OS === 'web' ? (
            <WebSignatureCanvas
              onSave={(base64) => setSignatureBase64(base64)}
              onClear={() => setSignatureBase64(null)}
            />
          ) : (
            <>
              <View style={styles.canvasContainer}>
                <NativeSignatureCanvas
                  ref={sigRef}
                  onOK={(sig: string) => { setSignatureBase64(sig); handleConfirm(sig) }}
                  onClear={() => { setSignatureBase64(null); setHasDrawn(false) }}
                  onBegin={() => setHasDrawn(true)}
                  onEmpty={() => { setHasDrawn(false); setSignatureBase64(null) }}
                  descriptionText=""
                  clearText="Clear"
                  confirmText="Save"
                  webStyle={signatureWebStyle}
                  penColor="#000000"
                  autoClear={false}
                />
              </View>
              <View style={styles.canvasActions}>
                <TouchableOpacity style={styles.clearBtn} onPress={handleClear} activeOpacity={0.8}>
                  <Text style={styles.clearBtnText}>Clear</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        <View style={styles.noteCard}>
          <Text style={styles.noteText}>
            By signing, you confirm that you have read and understood the crane meeting.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.confirmBtn, (!isSignatureReady || isSubmitting) && styles.confirmBtnDisabled]}
          onPress={handleSubmitSignature}
          disabled={!isSignatureReady || isSubmitting}
          activeOpacity={0.8}
        >
          {isSubmitting
            ? <ActivityIndicator color={Colors.textInverse} />
            : <Text style={styles.confirmBtnText}>Confirm Signature</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </ScreenWrapper>
  )
}

const signatureWebStyle = `
  .m-signature-pad { box-shadow: none; border: none; }
  .m-signature-pad--body { border: none; background: #FFFFFF !important; }
  .m-signature-pad--body canvas { background: #FFFFFF !important; }
  .m-signature-pad--footer { display: none; }
  body, html { width: 100%; height: 100%; margin: 0; padding: 0; background: #FFFFFF; }
`

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadow.sm,
  },
  sectionTitle: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
  },
  canvasHint: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: Spacing.sm },
  canvasContainer: {
    height: 200,
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
  noteCard: {
    backgroundColor: Colors.primary + '0D',
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  noteText: { fontSize: FontSize.sm, color: Colors.primary, lineHeight: 18 },
  confirmBtn: {
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    ...Shadow.md,
  },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmBtnText: { color: Colors.textInverse, fontWeight: '700', fontSize: FontSize.base },
})
