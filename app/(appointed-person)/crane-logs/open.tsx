import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { EmptyState } from '@/components/empty-state'
import { Colors, Spacing, FontSize, BorderRadius, Shadow } from '@/constants/theme'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

type LogStatus = 'working' | 'service' | 'thorough_examination' | 'winded_off' | 'breaking_down'

interface Crane {
  id: string
  crane_ref: string
  hasOpenLog: boolean
}

interface Subcontractor {
  id: string
  name: string
}

const STATUSES: { value: LogStatus; label: string }[] = [
  { value: 'working', label: 'Working' },
  { value: 'service', label: 'Service' },
  { value: 'thorough_examination', label: 'Thorough Examination' },
  { value: 'winded_off', label: 'Winded Off' },
  { value: 'breaking_down', label: 'Breaking Down' },
]

export default function OpenCraneLog() {
  const router = useRouter()
  const { profile } = useAuth()
  const [cranes, setCranes] = useState<Crane[]>([])
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([])
  const [isLoadingData, setIsLoadingData] = useState(true)
  const [craneId, setCraneId] = useState('')
  const [status, setStatus] = useState<LogStatus | ''>('')
  const [subcontractorId, setSubcontractorId] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!profile?.site_id) return

    Promise.all([
      supabase
        .from('cranes')
        .select('id, crane_ref')
        .eq('site_id', profile.site_id)
        .eq('is_archived', false)
        .order('crane_ref'),
      supabase
        .from('crane_logs')
        .select('crane_id')
        .eq('site_id', profile.site_id)
        .eq('is_closed', false),
      supabase
        .from('subcontractors')
        .select('id, name')
        .eq('site_id', profile.site_id)
        .eq('is_archived', false)
        .order('name'),
    ]).then(([cranesRes, openLogsRes, subcontractorsRes]) => {
      const openCraneIds = new Set((openLogsRes.data ?? []).map((r: { crane_id: string }) => r.crane_id))
      const mappedCranes: Crane[] = (cranesRes.data ?? []).map((c: { id: string; crane_ref: string }) => ({
        id: c.id,
        crane_ref: c.crane_ref,
        hasOpenLog: openCraneIds.has(c.id),
      }))
      setCranes(mappedCranes)
      setSubcontractors(subcontractorsRes.data ?? [])
      setIsLoadingData(false)
    })
  }, [profile?.site_id])

  function validate() {
    if (!craneId) { Alert.alert('Required', 'Please select a crane.'); return false }
    if (!status) { Alert.alert('Required', 'Please select a status.'); return false }
    if (status === 'working' && !subcontractorId) { Alert.alert('Required', 'Please select a subcontractor for a working log.'); return false }
    if (!jobDescription.trim()) { Alert.alert('Required', 'Please enter a job description.'); return false }
    return true
  }

  async function handleSubmit() {
    if (!validate()) return
    setIsSubmitting(true)
    const { error } = await supabase.from('crane_logs').insert({
      site_id: profile!.site_id,
      crane_id: craneId,
      opened_by: profile!.id,
      status,
      subcontractor_id: status === 'working' ? subcontractorId : null,
      job_description: jobDescription.trim(),
      start_time: new Date().toISOString(),
    })
    setIsSubmitting(false)
    if (error) {
      Alert.alert('Error', 'Failed to open log. Please try again.')
      return
    }
    router.back()
  }

  if (isLoadingData) {
    return (
      <ScreenWrapper edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </ScreenWrapper>
    )
  }

  if (cranes.length === 0) {
    return (
      <ScreenWrapper edges={['bottom']}>
        <EmptyState
          title="No cranes set up"
          message="No cranes have been set up for this site. Go to Site Management → Cranes to add one."
          icon="🏗️"
        />
      </ScreenWrapper>
    )
  }

  return (
    <ScreenWrapper edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <FormLabel label="Crane" required />
          <View style={styles.optionGrid}>
            {cranes.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={[
                  styles.optionBtn,
                  craneId === c.id && styles.optionBtnActive,
                  c.hasOpenLog && styles.optionBtnDisabled,
                ]}
                onPress={() => { if (!c.hasOpenLog) setCraneId(c.id) }}
                activeOpacity={c.hasOpenLog ? 1 : 0.8}
              >
                <Text style={[
                  styles.optionBtnText,
                  craneId === c.id && styles.optionBtnTextActive,
                  c.hasOpenLog && styles.optionBtnTextDisabled,
                ]}>
                  {c.crane_ref}
                </Text>
                {c.hasOpenLog && (
                  <Text style={styles.optionBtnSubtext}>Log open</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <FormLabel label="Status" required />
          <View style={styles.statusList}>
            {STATUSES.map((s) => (
              <TouchableOpacity
                key={s.value}
                style={[styles.statusRow, status === s.value && styles.statusRowActive]}
                onPress={() => setStatus(s.value)}
              >
                <View style={[styles.radio, status === s.value && styles.radioActive]}>
                  {status === s.value && <View style={styles.radioDot} />}
                </View>
                <Text style={[styles.statusLabel, status === s.value && styles.statusLabelActive]}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {status === 'working' && (
          <View style={styles.card}>
            <FormLabel label="Subcontractor" required />
            <View style={styles.statusList}>
              {subcontractors.map((sub) => (
                <TouchableOpacity
                  key={sub.id}
                  style={[styles.statusRow, subcontractorId === sub.id && styles.statusRowActive]}
                  onPress={() => setSubcontractorId(sub.id)}
                >
                  <View style={[styles.radio, subcontractorId === sub.id && styles.radioActive]}>
                    {subcontractorId === sub.id && <View style={styles.radioDot} />}
                  </View>
                  <Text style={[styles.statusLabel, subcontractorId === sub.id && styles.statusLabelActive]}>{sub.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View style={styles.card}>
          <FormLabel label="Job Description" required />
          <TextInput
            style={styles.textArea}
            value={jobDescription}
            onChangeText={setJobDescription}
            placeholder="Describe the lifting operation..."
            placeholderTextColor={Colors.textMuted}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        <View style={styles.noteCard}>
          <Text style={styles.noteText}>Start time will be recorded automatically when this log is submitted.</Text>
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}
          activeOpacity={0.8}
        >
          <Text style={styles.submitBtnText}>{isSubmitting ? 'Opening Log…' : 'Open Log'}</Text>
        </TouchableOpacity>
      </ScrollView>
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
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadow.sm,
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  optionBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    alignItems: 'center',
  },
  optionBtnActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  optionBtnDisabled: {
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    opacity: 0.5,
  },
  optionBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textSecondary,
    letterSpacing: 0.5,
  },
  optionBtnTextActive: {
    color: Colors.textInverse,
  },
  optionBtnTextDisabled: {
    color: Colors.textMuted,
  },
  optionBtnSubtext: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  statusList: {
    gap: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  statusRowActive: {
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
  statusLabel: {
    fontSize: FontSize.base,
    color: Colors.text,
  },
  statusLabelActive: {
    fontWeight: '600',
    color: Colors.primary,
  },
  textArea: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    fontSize: FontSize.base,
    color: Colors.text,
    backgroundColor: Colors.background,
    minHeight: 100,
  },
  noteCard: {
    backgroundColor: Colors.primary + '0D',
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  noteText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    lineHeight: 18,
  },
  submitBtn: {
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
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
