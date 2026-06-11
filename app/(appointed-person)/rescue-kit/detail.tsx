import { useState, useRef, useEffect } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator, Platform,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { Breadcrumb } from '@/components/breadcrumb'
import { Colors, Spacing, FontSize, BorderRadius, Shadow } from '@/constants/theme'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { callRescueKitGeneratePdf } from '@/lib/api'

// IMPORTANT: Bucket "rescue-kit-signatures" and "rescue-kit-archive" must exist in
// Supabase Storage. Deploy rescue-kit-generate-pdf Edge Function before using this screen.

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

interface RescueKit {
  id: string
  site_id: string
  main_contractor: string
  project_name: string
  serial_number: string
  location_of_kit: string | null
  is_secured: boolean | null
  how_is_it_secured: string | null
  who_has_access: string | null
  plrk_number: string | null
  is_stretcher_in_bag: boolean | null
  is_pole_in_bag: boolean | null
  harness_count: string | null
  harness_packaging_status: string | null
  harness_serial_numbers: string | null
  certificates_of_conformity: string | null
  is_box_sealed: boolean | null
  unsealed_contents_complete: string | null
  last_version_number: number
  last_signed_week_start: string | null
}

function getThisWeekMonday(): string {
  const now = new Date()
  const dow = now.getDay()
  const diff = (dow + 6) % 7
  const monday = new Date(now)
  monday.setDate(now.getDate() - diff)
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
}

function boolLabel(v: boolean | null | undefined): string {
  if (v === true) return 'Yes'
  if (v === false) return 'No'
  return '—'
}

function harnessLabel(v: string | null | undefined): string {
  if (v === 'new') return 'Still new in packaging'
  if (v === 'used') return 'Been used'
  return '—'
}

function unsealedLabel(v: string | null | undefined): string {
  if (v === 'yes') return 'Yes'
  if (v === 'no') return 'No'
  if (v === 'n/a') return 'N/A'
  return '—'
}

function GridRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={grid.row}>
      <Text style={grid.label}>{label}</Text>
      <Text style={grid.value}>{value || '—'}</Text>
    </View>
  )
}

const grid = StyleSheet.create({
  row: {
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  label: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  value: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: '500',
    lineHeight: 20,
  },
})

// Checklist preview — renders the 14-question checklist document inline.
function ChecklistPreview({ kit, supervisorName }: { kit: RescueKit; supervisorName: string }) {
  const QUESTIONS: [string, string][] = [
    ['Location of Rescue Kit?',                                        kit.location_of_kit ?? '—'],
    ['Is it secured?',                                                 boolLabel(kit.is_secured)],
    ['How is it secured? (key/Code)',                                  kit.how_is_it_secured ?? '—'],
    ['Who has access to the key/Code?',                                kit.who_has_access ?? '—'],
    ['What is the serial number on the seal?',                         kit.serial_number],
    ['What is the individual / company specific serial number?',        kit.plrk_number || '—'],
    ['Is the Stretcher in the bag?',                                   boolLabel(kit.is_stretcher_in_bag)],
    ['Is the pole in the bag?',                                        boolLabel(kit.is_pole_in_bag)],
    ['How many Harness are with the kit?',                             kit.harness_count ?? '—'],
    ['Are they still new in packaging or have they been used?',        harnessLabel(kit.harness_packaging_status)],
    ['What are the serial numbers of the harness?',                    kit.harness_serial_numbers ?? '—'],
    ['Are all certificates of conformity / thorough examination with the kit? (Include Expiry Date)', kit.certificates_of_conformity ?? '—'],
    ['Is the box still sealed?',                                       boolLabel(kit.is_box_sealed)],
    ['If the box is unsealed are all the contents still in the box as listed on the certificate of conformity?', unsealedLabel(kit.unsealed_contents_complete)],
  ]

  return (
    <View style={preview.container}>
      {/* Document header */}
      <View style={preview.navyHeader}>
        <Text style={preview.navyHeaderText}>TOWER CRANE RESCUE KIT CHECKLIST</Text>
      </View>
      <View style={preview.titleBlock}>
        <Text style={preview.docTitle}>
          {kit.main_contractor} {kit.project_name} - {kit.serial_number}
        </Text>
        <Text style={preview.docSubtitle}>Tower Crane Rescue Kit Checklist</Text>
      </View>

      {/* Supervisor & Site row */}
      <View style={preview.infoRow}>
        <View style={preview.infoCell}>
          <Text style={preview.infoCellLabel}>Name of lift Supervisor</Text>
          <Text style={preview.infoCellValue}>{supervisorName || '—'}</Text>
        </View>
        <View style={[preview.infoCell, { borderLeftWidth: 1, borderLeftColor: Colors.border }]}>
          <Text style={preview.infoCellLabel}>Site</Text>
          <Text style={preview.infoCellValue}>{kit.project_name}</Text>
        </View>
      </View>

      {/* Table header */}
      <View style={preview.tableHeader}>
        <Text style={[preview.tableHeaderCell, { flex: 1.2 }]}>Question</Text>
        <Text style={[preview.tableHeaderCell, { flex: 0.8 }]}>Answer</Text>
      </View>

      {/* Table rows */}
      {QUESTIONS.map(([q, a], i) => (
        <View key={i} style={[preview.tableRow, i % 2 === 1 && preview.tableRowAlt]}>
          <Text style={[preview.tableCell, preview.tableCellQ]}>{q}</Text>
          <Text style={[preview.tableCell, preview.tableCellA]}>{a}</Text>
        </View>
      ))}

      {/* Footer notes */}
      <View style={preview.footerNotes}>
        <Text style={preview.footerNote}>
          If you are in doubt of answers to any of the above questions or you suspect that items within the rescue kit are missing/damaged/out of date, then please contact the Appointed Person and/or Health &amp; Safety Manager immediately.
        </Text>
        <Text style={[preview.footerNote, { marginTop: 6 }]}>
          It is the lift Supervisor's responsibility to ensure that this rescue kit is intact and available immediately should a rescue situation transpire.
        </Text>
      </View>

      {/* Signature box placeholder */}
      <View style={preview.sigBox}>
        <View style={preview.sigBoxRow}>
          <Text style={preview.sigBoxLabel}>Signature of responsible Person</Text>
          <View style={preview.sigBoxEmpty}>
            <Text style={preview.sigBoxEmptyText}>Signature goes here</Text>
          </View>
          <Text style={preview.sigBoxLabel}>Job Title</Text>
          <Text style={preview.sigBoxValue}>—</Text>
        </View>
        <View style={preview.sigBoxRow}>
          <Text style={preview.sigBoxLabel}>Print Name</Text>
          <Text style={preview.sigBoxValue}>{supervisorName || '—'}</Text>
          <Text style={preview.sigBoxLabel}>Date</Text>
          <Text style={preview.sigBoxValue}>—</Text>
        </View>
      </View>
    </View>
  )
}

const preview = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  navyHeader: {
    backgroundColor: '#0F2544',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 10,
  },
  navyHeaderText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: FontSize.xs,
    letterSpacing: 0.5,
  },
  titleBlock: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    alignItems: 'center',
  },
  docTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 2,
  },
  docSubtitle: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  infoCell: {
    flex: 1,
    padding: Spacing.xs,
  },
  infoCellLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  infoCellValue: {
    fontSize: FontSize.xs,
    color: Colors.text,
    fontWeight: '600',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#0F2544',
    paddingHorizontal: Spacing.xs,
    paddingVertical: 6,
  },
  tableHeaderCell: {
    fontSize: FontSize.xs,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 5,
    minHeight: 28,
  },
  tableRowAlt: { backgroundColor: '#F8FAFC' },
  tableCell: {
    fontSize: FontSize.xs,
    color: Colors.text,
    lineHeight: 16,
  },
  tableCellQ: { flex: 1.2, paddingRight: 4 },
  tableCellA: { flex: 0.8, fontWeight: '600' },
  footerNotes: {
    padding: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: '#FAFAFA',
  },
  footerNote: {
    fontSize: 10,
    color: Colors.textSecondary,
    lineHeight: 14,
    fontStyle: 'italic',
  },
  sigBox: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  sigBoxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
    minHeight: 36,
  },
  sigBoxLabel: {
    flex: 1,
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: '600',
    padding: 4,
    backgroundColor: '#F8FAFC',
  },
  sigBoxValue: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.text,
    padding: 4,
  },
  sigBoxEmpty: {
    flex: 1,
    height: 36,
    borderWidth: 1,
    borderColor: Colors.border,
    margin: 4,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sigBoxEmptyText: {
    fontSize: 10,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
})

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

export default function RescueKitDetail() {
  const { kit_id } = useLocalSearchParams<{ kit_id: string }>()
  const router = useRouter()
  const { profile, role } = useAuth()

  const [kit, setKit] = useState<RescueKit | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [supervisorName, setSupervisorName] = useState('')
  const [signatureBase64, setSignatureBase64] = useState<string | null>(null)
  const [hasDrawn, setHasDrawn] = useState(false)
  const [alreadySigned, setAlreadySigned] = useState(false)
  const [showReSignForm, setShowReSignForm] = useState(false)

  const sigRef = useRef<any>(null)
  const submittingViaSignatureRef = useRef(false)

  useEffect(() => {
    if (!kit_id || !profile) return
    async function loadKit() {
      setIsLoading(true)
      const { data, error } = await supabase
        .from('rescue_kits')
        .select('*')
        .eq('id', kit_id)
        .single()

      if (error || !data) {
        console.error('[RK-DETAIL] Failed to load kit:', error?.message)
        setIsLoading(false)
        return
      }

      setKit(data as RescueKit)
      setSupervisorName(profile.full_name ?? '')

      // Check if already signed this week
      const thisMonday = getThisWeekMonday()
      const signed = data.last_signed_week_start && data.last_signed_week_start >= thisMonday
      setAlreadySigned(!!signed)
      setIsLoading(false)
    }
    loadKit()
  }, [kit_id, profile])

  function handleClearSignature() {
    if (Platform.OS !== 'web') {
      sigRef.current?.clearSignature()
      setHasDrawn(false)
    }
    setSignatureBase64(null)
  }

  async function doSubmit(sig: string) {
    console.log('[RK-DETAIL] doSubmit, kit_id:', kit_id, 'supervisor:', supervisorName)

    if (!kit_id || !profile?.id) {
      console.error('[RK-DETAIL] Missing kit_id or profile.id')
      return
    }

    if (!supervisorName.trim()) {
      if (Platform.OS === 'web') window.alert('Please enter the Supervisor Name.')
      else Alert.alert('Missing Name', 'Please enter the Supervisor Name.')
      submittingViaSignatureRef.current = false
      return
    }

    setIsSubmitting(true)

    try {
      console.log('[RK-DETAIL] Calling Edge Function')
      const { error } = await callRescueKitGeneratePdf({
        kit_id,
        supervisor_name: supervisorName.trim(),
        supervisor_signature_base64: sig,
        supervisor_id: profile.id,
      })

      if (error) {
        console.error('[RK-DETAIL] Edge Function error:', error)
        if (Platform.OS === 'web') {
          window.alert(`Error generating PDF: ${error}\n\nEnsure the rescue-kit-generate-pdf Edge Function is deployed in Supabase.`)
        } else {
          Alert.alert('Error', `${error}\n\nCheck that the rescue-kit-generate-pdf Edge Function is deployed.`)
        }
        return
      }

      console.log('[RK-DETAIL] PDF generated — navigating home')
      if (Platform.OS === 'web') {
        window.alert('Rescue kit check signed and PDF generated successfully.')
        router.replace('/(appointed-person)/rescue-kit/' as any)
      } else {
        Alert.alert(
          'Signed',
          'Rescue kit check has been signed and the PDF has been generated.',
          [{ text: 'OK', onPress: () => router.replace('/(appointed-person)/rescue-kit/' as any) }],
        )
      }
    } catch (err: any) {
      console.error('[RK-DETAIL] Unexpected error:', err)
      if (Platform.OS === 'web') window.alert(`Unexpected error: ${err.message}`)
      else Alert.alert('Error', err.message ?? 'An unexpected error occurred')
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

  async function handleSign() {
    if (isSubmitting || submittingViaSignatureRef.current) return

    if (!supervisorName.trim()) {
      if (Platform.OS === 'web') window.alert('Please enter the Supervisor Name.')
      else Alert.alert('Missing Name', 'Please enter the Supervisor Name.')
      return
    }

    if (Platform.OS === 'web') {
      if (!signatureBase64) {
        window.alert('Please draw your signature before signing.')
        return
      }
      await doSubmit(signatureBase64)
    } else {
      if (!hasDrawn) {
        Alert.alert('No Signature', 'Please draw your signature before signing.')
        return
      }
      submittingViaSignatureRef.current = true
      sigRef.current?.readSignature()
    }
  }

  const kitTitle = kit ? `${kit.main_contractor} ${kit.project_name} - ${kit.serial_number}` : 'Rescue Kit'
  const nextVersion = kit ? (kit.last_version_number ?? 0) + 1 : 1
  const roleLabel = ROLE_LABELS[role ?? ''] ?? (role ?? 'Supervisor')

  if (isLoading) {
    return (
      <ScreenWrapper edges={['bottom']}>
        <Breadcrumb items={[
          { label: 'Dashboard', href: '/(appointed-person)/' },
          { label: 'Supervisor Checks', href: '/(appointed-person)/supervisor-checks' },
          { label: 'Rescue Kit Checklist', href: '/(appointed-person)/rescue-kit/' },
          { label: 'Loading…' },
        ]} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </ScreenWrapper>
    )
  }

  if (!kit) {
    return (
      <ScreenWrapper edges={['bottom']}>
        <Breadcrumb items={[
          { label: 'Rescue Kit Checklist', href: '/(appointed-person)/rescue-kit/' },
          { label: 'Not found' },
        ]} />
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>Rescue kit not found.</Text>
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
        { label: kitTitle },
      ]} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {alreadySigned && !showReSignForm && (
          <View style={styles.alreadySignedBanner}>
            <Text style={styles.alreadySignedText}>
              This kit has already been signed this week (v{kit.last_version_number}).
            </Text>
            <TouchableOpacity
              style={styles.reSignBtn}
              onPress={() => setShowReSignForm(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.reSignBtnText}>Sign Again</Text>
            </TouchableOpacity>
          </View>
        )}

        {alreadySigned && showReSignForm && (
          <View style={styles.reSignNote}>
            <Text style={styles.reSignNoteText}>
              Re-signing will create v{nextVersion}. The existing v{kit.last_version_number} will remain in the archive.
            </Text>
          </View>
        )}

        {/* Kit summary grid */}
        <View style={styles.card}>
          <Text style={styles.cardSectionTitle}>Kit Details</Text>
          <GridRow label="Main Contractor" value={kit.main_contractor} />
          <GridRow label="Project" value={kit.project_name} />
          <GridRow label="Serial Number" value={kit.serial_number} />
          <GridRow label="Location" value={kit.location_of_kit ?? '—'} />
          <GridRow label="Secured?" value={boolLabel(kit.is_secured)} />
          <GridRow label="How secured" value={kit.how_is_it_secured ?? '—'} />
          <GridRow label="Who has access" value={kit.who_has_access ?? '—'} />
          <GridRow label="Individual/Company Serial No." value={kit.plrk_number || '—'} />
          <GridRow label="Stretcher in bag?" value={boolLabel(kit.is_stretcher_in_bag)} />
          <GridRow label="Pole in bag?" value={boolLabel(kit.is_pole_in_bag)} />
          <GridRow label="Harness count" value={kit.harness_count ?? '—'} />
          <GridRow label="Harness packaging" value={harnessLabel(kit.harness_packaging_status)} />
          <GridRow label="Harness serial numbers" value={kit.harness_serial_numbers ?? '—'} />
          <GridRow label="Certificates" value={kit.certificates_of_conformity ?? '—'} />
          <GridRow label="Box sealed?" value={boolLabel(kit.is_box_sealed)} />
          <GridRow label="Unsealed contents complete?" value={unsealedLabel(kit.unsealed_contents_complete)} />
        </View>

        {/* Checklist document preview */}
        <Text style={styles.previewLabel}>Checklist Document Preview</Text>
        <View style={styles.previewWrapper}>
          <ChecklistPreview kit={kit} supervisorName={supervisorName} />
        </View>

        {(!alreadySigned || showReSignForm) && (
          <>
            {/* Sign section */}
            <View style={styles.card}>
              <Text style={styles.cardSectionTitle}>Weekly Check Sign-Off</Text>
              <Text style={styles.signNote}>
                This will generate v{nextVersion} of the rescue kit check PDF and mark the kit as checked for this week.
              </Text>

              <Text style={styles.fieldLabel}>Supervisor Name <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={styles.input}
                value={supervisorName}
                onChangeText={setSupervisorName}
                placeholder="Full name of supervising person"
                placeholderTextColor={Colors.textMuted}
              />

              <Text style={styles.fieldLabel}>Signature <Text style={styles.required}>*</Text></Text>
              <Text style={styles.fieldHint}>Draw your signature to sign and generate the weekly check PDF.</Text>

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

              <View style={styles.roleNote}>
                <Text style={styles.roleNoteText}>Signing as: {supervisorName || '—'} ({roleLabel})</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.signBtn, isSubmitting && styles.signBtnDisabled]}
              onPress={handleSign}
              disabled={isSubmitting}
              activeOpacity={0.85}
            >
              {isSubmitting
                ? <ActivityIndicator color={Colors.textInverse} />
                : <Text style={styles.signBtnText}>Sign & Generate PDF (v{nextVersion})</Text>
              }
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
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
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: FontSize.sm, color: Colors.danger, textAlign: 'center', padding: Spacing.md },
  scroll: { flex: 1 },
  scrollContent: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  alreadySignedBanner: {
    backgroundColor: Colors.success + '15',
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: Colors.success,
    gap: Spacing.sm,
  },
  alreadySignedText: { fontSize: FontSize.xs, color: Colors.success, fontWeight: '600', lineHeight: 18 },
  reSignBtn: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  reSignBtnText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textInverse },
  reSignNote: {
    backgroundColor: Colors.accent + '12',
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
  },
  reSignNoteText: { fontSize: FontSize.xs, color: Colors.accent, fontWeight: '600', lineHeight: 18 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadow.sm,
  },
  cardSectionTitle: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
  },
  previewLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.xs,
    marginLeft: 2,
  },
  previewWrapper: {
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  signNote: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    lineHeight: 18,
    marginBottom: Spacing.sm,
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
  roleNote: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.primary + '0D',
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  roleNoteText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '500' },
  signBtn: {
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.md,
    ...Shadow.md,
  },
  signBtnDisabled: { opacity: 0.5 },
  signBtnText: { color: Colors.textInverse, fontWeight: '700', fontSize: FontSize.base },
})
