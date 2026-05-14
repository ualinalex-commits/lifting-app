import { useState, useRef, useEffect } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import SignatureCanvas from 'react-native-signature-canvas'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { Colors, Spacing, FontSize, BorderRadius, Shadow } from '@/constants/theme'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

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

// Decode base64 to Uint8Array for Supabase Storage upload
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

export default function SignTalk() {
  const { talk_id } = useLocalSearchParams<{ talk_id: string }>()
  const router = useRouter()
  const { profile, role } = useAuth()

  const sigRef = useRef<any>(null)
  const [hasSignature, setHasSignature] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [company, setCompany] = useState('')
  const [isLoadingCompany, setIsLoadingCompany] = useState(true)

  useEffect(() => {
    async function resolveCompany() {
      if (!profile) return

      if (role === 'subcontractor_admin' && (profile as any).subcontractor_id) {
        const { data } = await supabase
          .from('subcontractors')
          .select('name')
          .eq('id', (profile as any).subcontractor_id)
          .single()
        setCompany(data?.name ?? 'Subcontractor')
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

  async function handleConfirm(signatureBase64: string) {
    if (!profile?.id || !talk_id) return

    const base64Data = signatureBase64.replace(/^data:image\/png;base64,/, '')
    const storagePath = `${talk_id}/${profile.id}.png`

    setIsSubmitting(true)

    // IMPORTANT: The "toolbox-talk-signatures" bucket must exist in Supabase Storage
    // (private). Create it in the Supabase Dashboard → Storage → New bucket if absent.
    const { error: uploadError } = await supabase.storage
      .from('toolbox-talk-signatures')
      .upload(storagePath, decodeBase64(base64Data), {
        contentType: 'image/png',
        upsert: true,
      })

    if (uploadError) {
      setIsSubmitting(false)
      Alert.alert('Upload Error', uploadError.message)
      return
    }

    const { error: insertError } = await supabase
      .from('toolbox_talk_signatures')
      .insert({
        talk_id,
        user_id: profile.id,
        full_name: profile.full_name,
        role: role!,
        company,
        signature_image_url: storagePath,
      })

    setIsSubmitting(false)

    if (insertError) {
      if (insertError.code === '23505') {
        Alert.alert('Already Signed', 'You have already signed this talk.')
        router.back()
        return
      }
      Alert.alert('Error', insertError.message)
      return
    }

    Alert.alert('Signed', 'Your signature has been recorded.', [
      { text: 'OK', onPress: () => router.back() },
    ])
  }

  function handleClear() {
    sigRef.current?.clearSignature()
    setHasSignature(false)
  }

  function handleSubmitSignature() {
    if (!hasSignature) {
      Alert.alert('No signature', 'Please draw your signature first.')
      return
    }
    sigRef.current?.readSignature()
  }

  if (isLoadingCompany) {
    return (
      <ScreenWrapper edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </ScreenWrapper>
    )
  }

  return (
    <ScreenWrapper edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Pre-filled details */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Your Details</Text>
          <DetailRow label="Name" value={profile?.full_name ?? '—'} />
          <DetailRow label="Role" value={ROLE_LABELS[role ?? ''] ?? (role ?? '—')} />
          <DetailRow label="Company" value={company} />
        </View>

        {/* Signature canvas */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Draw Signature</Text>
          <Text style={styles.canvasHint}>Sign in the box below using your finger.</Text>
          <View style={styles.canvasContainer}>
            <SignatureCanvas
              ref={sigRef}
              onOK={handleConfirm}
              onEmpty={() => setHasSignature(false)}
              onBegin={() => setHasSignature(true)}
              descriptionText=""
              clearText="Clear"
              confirmText="Confirm"
              webStyle={signatureWebStyle}
              autoClear={false}
            />
          </View>
          <View style={styles.canvasActions}>
            <TouchableOpacity style={styles.clearBtn} onPress={handleClear} activeOpacity={0.8}>
              <Text style={styles.clearBtnText}>Clear</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.noteCard}>
          <Text style={styles.noteText}>
            By signing, you confirm that you have read and understood the content of this toolbox talk.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.confirmBtn, (!hasSignature || isSubmitting) && styles.confirmBtnDisabled]}
          onPress={handleSubmitSignature}
          disabled={!hasSignature || isSubmitting}
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
  .m-signature-pad--body { border: none; }
  .m-signature-pad--footer { display: none; }
  body, html { width: 100%; height: 100%; margin: 0; padding: 0; }
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
    height: 220,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
    backgroundColor: Colors.background,
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
