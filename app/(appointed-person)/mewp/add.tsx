import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator, Platform, useWindowDimensions,
} from 'react-native'
import { useRouter } from 'expo-router'
import * as DocumentPicker from 'expo-document-picker'
import DateTimePicker from '@react-native-community/datetimepicker'
import { MaterialIcons } from '@expo/vector-icons'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { Colors, Spacing, FontSize, BorderRadius, Shadow } from '@/constants/theme'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

interface Subcontractor {
  id: string
  name: string
}

interface PickedFile {
  uri: string
  name: string
  mimeType: string
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
  req:   { color: Colors.danger },
})

function formatDateDisplay(str: string): string {
  if (!str) return ''
  const d = new Date(str + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function AddMewp() {
  const router = useRouter()
  const { profile } = useAuth()
  const { width } = useWindowDimensions()
  const isDesktop = Platform.OS === 'web' && width >= 768

  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([])
  const [isLoadingData, setIsLoadingData] = useState(true)

  // Form fields
  const [mewpType, setMewpType]             = useState('')
  const [serialNumber, setSerialNumber]     = useState('')
  const [subcontractorId, setSubcontractorId] = useState<string | null>(null) // null = site-owned
  const [currentLocation, setCurrentLocation] = useState('')

  // Thorough exam
  const [examFile, setExamFile]         = useState<PickedFile | null>(null)
  const [expiryStr, setExpiryStr]       = useState('')
  const [showDatePicker, setShowDatePicker] = useState(false)

  // Sticker photo
  const [stickerFile, setStickerFile] = useState<PickedFile | null>(null)

  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!profile?.site_id) return
    supabase
      .from('subcontractors')
      .select('id, name')
      .eq('site_id', profile.site_id)
      .eq('is_archived', false)
      .order('name')
      .then(({ data }) => {
        setSubcontractors((data ?? []) as Subcontractor[])
        setIsLoadingData(false)
      })
  }, [profile?.site_id])

  async function pickExamFile() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/jpeg', 'image/png'],
      copyToCacheDirectory: true,
    })
    if (!result.canceled && result.assets.length > 0) {
      const a = result.assets[0]
      setExamFile({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/octet-stream' })
    }
  }

  async function pickStickerPhoto() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/jpeg', 'image/png'],
      copyToCacheDirectory: true,
    })
    if (!result.canceled && result.assets.length > 0) {
      const a = result.assets[0]
      setStickerFile({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'image/jpeg' })
    }
  }

  async function uploadFile(
    bucket: string,
    path: string,
    file: PickedFile,
  ): Promise<string> {
    const response = await fetch(file.uri)
    const blob = await response.blob()
    const { error } = await supabase.storage.from(bucket).upload(path, blob, {
      contentType: file.mimeType,
      upsert: true,
    })
    if (error) throw error
    const { data } = supabase.storage.from(bucket).getPublicUrl(path)
    return data.publicUrl
  }

  function validate(): boolean {
    if (!mewpType.trim())     { Alert.alert('Required', 'Please enter the MEWP type.'); return false }
    if (!serialNumber.trim()) { Alert.alert('Required', 'Please enter the serial number.'); return false }
    return true
  }

  async function handleSubmit() {
    if (!validate() || !profile?.site_id) return
    setIsSubmitting(true)
    try {
      // 1. Insert MEWP row
      const { data: newMewp, error: insertError } = await supabase
        .from('mewps')
        .insert({
          site_id:          profile.site_id,
          subcontractor_id: subcontractorId,
          mewp_type:        mewpType.trim(),
          serial_number:    serialNumber.trim(),
          current_location: currentLocation.trim() || null,
        })
        .select('id')
        .single()

      if (insertError) throw insertError
      const mewpId = newMewp.id

      // 2. Upload files if provided
      let examUrl: string | null = null
      let stickerUrl: string | null = null

      if (examFile) {
        const ext = examFile.name.split('.').pop() ?? 'pdf'
        examUrl = await uploadFile(
          'mewp-thorough-exams',
          `${profile.site_id}/${mewpId}/${Date.now()}.${ext}`,
          examFile,
        )
      }

      if (stickerFile) {
        const ext = stickerFile.name.split('.').pop() ?? 'jpg'
        stickerUrl = await uploadFile(
          'mewp-stickers',
          `${profile.site_id}/${mewpId}/sticker.${ext}`,
          stickerFile,
        )
      }

      // 3. Update with file URLs if any
      if (examUrl || stickerUrl || expiryStr) {
        await supabase.from('mewps').update({
          ...(examUrl    ? { thorough_exam_url: examUrl }         : {}),
          ...(expiryStr  ? { thorough_exam_expiry: expiryStr }    : {}),
          ...(stickerUrl ? { sticker_url: stickerUrl }            : {}),
        }).eq('id', mewpId)
      }

      // 4. Insert initial location history if location was set
      if (currentLocation.trim()) {
        await supabase.from('mewp_location_history').insert({
          mewp_id:    mewpId,
          location:   currentLocation.trim(),
          changed_by: profile.id,
        })
      }

      router.back()
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to add MEWP. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoadingData) {
    return (
      <ScreenWrapper edges={['bottom']}>
        <ActivityIndicator style={{ marginTop: Spacing.xl }} color={Colors.primary} />
      </ScreenWrapper>
    )
  }

  return (
    <ScreenWrapper edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={isDesktop ? styles.formDesktop : styles.formMobile}>

        <View style={styles.card}>
          <FormLabel label="MEWP Type" required />
          <TextInput
            style={styles.input}
            value={mewpType}
            onChangeText={setMewpType}
            placeholder="e.g. Scissor Lift, Boom Lift, Pecolift"
            placeholderTextColor={Colors.textMuted}
          />
        </View>

        <View style={styles.card}>
          <FormLabel label="Serial Number" required />
          <TextInput
            style={styles.input}
            value={serialNumber}
            onChangeText={setSerialNumber}
            placeholder="e.g. SL-001-2024"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="characters"
          />
        </View>

        <View style={styles.card}>
          <FormLabel label="Subcontractor" />
          <View style={styles.optionList}>
            <TouchableOpacity
              style={[styles.optionRow, subcontractorId === null && styles.optionRowActive]}
              onPress={() => setSubcontractorId(null)}
            >
              <View style={[styles.radio, subcontractorId === null && styles.radioActive]}>
                {subcontractorId === null && <View style={styles.radioDot} />}
              </View>
              <Text style={[styles.optionLabel, subcontractorId === null && styles.optionLabelActive]}>
                None / Site-owned
              </Text>
            </TouchableOpacity>
            {subcontractors.map((sub) => (
              <TouchableOpacity
                key={sub.id}
                style={[styles.optionRow, subcontractorId === sub.id && styles.optionRowActive]}
                onPress={() => setSubcontractorId(sub.id)}
              >
                <View style={[styles.radio, subcontractorId === sub.id && styles.radioActive]}>
                  {subcontractorId === sub.id && <View style={styles.radioDot} />}
                </View>
                <Text style={[styles.optionLabel, subcontractorId === sub.id && styles.optionLabelActive]}>
                  {sub.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <FormLabel label="Current Location" />
          <TextInput
            style={styles.input}
            value={currentLocation}
            onChangeText={setCurrentLocation}
            placeholder="e.g. Basement, Level 2, Car Park"
            placeholderTextColor={Colors.textMuted}
          />
        </View>

        <View style={styles.card}>
          <FormLabel label="Thorough Examination Certificate" />
          <TouchableOpacity style={styles.filePicker} onPress={pickExamFile} activeOpacity={0.8}>
            <MaterialIcons name="attach-file" size={20} color={Colors.primary} />
            <Text style={styles.filePickerText} numberOfLines={1}>
              {examFile ? examFile.name : 'Choose PDF or photo (optional)'}
            </Text>
          </TouchableOpacity>

          <FormLabel label="Expiry Date" />
          {Platform.OS === 'web' ? (
            // @ts-ignore
            <input
              type="date"
              value={expiryStr}
              onChange={(e: any) => setExpiryStr(e.target.value)}
              style={{
                padding: 10, borderRadius: BorderRadius.sm, border: '1px solid #E2E8F0',
                fontSize: 14, width: '100%', boxSizing: 'border-box',
              }}
            />
          ) : (
            <>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)} activeOpacity={0.8}>
                <MaterialIcons name="event" size={18} color={Colors.textSecondary} />
                <Text style={styles.dateBtnText}>
                  {expiryStr ? formatDateDisplay(expiryStr) : 'Select expiry date (optional)'}
                </Text>
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={expiryStr ? new Date(expiryStr + 'T00:00:00') : new Date()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(_, date) => {
                    setShowDatePicker(false)
                    if (date) {
                      const y = date.getFullYear()
                      const mo = String(date.getMonth() + 1).padStart(2, '0')
                      const d = String(date.getDate()).padStart(2, '0')
                      setExpiryStr(`${y}-${mo}-${d}`)
                    }
                  }}
                />
              )}
            </>
          )}
        </View>

        <View style={styles.card}>
          <FormLabel label="MEWP Sticker Photo" />
          <TouchableOpacity style={styles.filePicker} onPress={pickStickerPhoto} activeOpacity={0.8}>
            <MaterialIcons name="photo-camera" size={20} color={Colors.primary} />
            <Text style={styles.filePickerText} numberOfLines={1}>
              {stickerFile ? stickerFile.name : 'Choose photo (optional)'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}
          activeOpacity={0.8}
        >
          {isSubmitting ? (
            <ActivityIndicator color={Colors.textInverse} size="small" />
          ) : (
            <Text style={styles.submitBtnText}>Add MEWP</Text>
          )}
        </TouchableOpacity>
        </View>
      </ScrollView>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    paddingBottom: Spacing.xxl,
  },
  formMobile: {
    padding: Spacing.md,
    paddingBottom: 0,
  },
  formDesktop: {
    width: '80%' as any,
    alignSelf: 'center' as any,
    paddingTop: Spacing.lg,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadow.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSize.base,
    color: Colors.text,
    backgroundColor: Colors.background,
  },
  optionList: {
    gap: 2,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  optionRowActive: {
    backgroundColor: Colors.primary + '0D',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: {
    borderColor: Colors.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  optionLabel: {
    fontSize: FontSize.base,
    color: Colors.text,
  },
  optionLabelActive: {
    fontWeight: '600',
    color: Colors.primary,
  },
  filePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    borderStyle: 'dashed',
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  filePickerText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    flex: 1,
    fontWeight: '500',
  },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    backgroundColor: Colors.background,
  },
  dateBtnText: {
    fontSize: FontSize.sm,
    color: Colors.text,
  },
  submitBtn: {
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
    ...Shadow.md,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.textInverse,
    letterSpacing: 0.3,
  },
})
