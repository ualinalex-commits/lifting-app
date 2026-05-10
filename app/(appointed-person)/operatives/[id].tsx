import { useState, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme'
import { supabase } from '@/lib/supabase'

const ROLE_LABELS: Record<string, string> = {
  crane_supervisor: 'Crane Supervisor',
  crane_operator: 'Crane Operator',
  slinger_signaller: 'Slinger / Signaller',
  subcontractor_admin: 'Subcontractor Admin',
}

export default function EditOperativeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    async function fetchOperative() {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone, role')
        .eq('id', id)
        .single()
      if (error) {
        Alert.alert('Error', error.message)
      } else if (data) {
        setFullName(data.full_name ?? '')
        setEmail(data.email ?? '')
        setPhone(data.phone ?? '')
        setRole(data.role ?? '')
      }
      setIsLoading(false)
    }
    fetchOperative()
  }, [id])

  async function handleSubmit() {
    if (!fullName.trim()) {
      Alert.alert('Validation', 'Full name is required.')
      return
    }
    if (!phone.trim()) {
      Alert.alert('Validation', 'Phone number is required.')
      return
    }

    setIsSubmitting(true)
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName.trim(), phone: phone.trim() })
      .eq('id', id)
    setIsSubmitting(false)

    if (error) {
      Alert.alert('Error', error.message)
    } else {
      router.back()
    }
  }

  if (isLoading) {
    return (
      <ScreenWrapper edges={['bottom']}>
        <ActivityIndicator style={{ marginTop: Spacing.xl }} color={Colors.accent} />
      </ScreenWrapper>
    )
  }

  return (
    <ScreenWrapper edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={formStyles.scroll} keyboardShouldPersistTaps="handled">
          <View style={formStyles.field}>
            <Text style={formStyles.label}>Full Name *</Text>
            <TextInput
              style={formStyles.input}
              value={fullName}
              onChangeText={setFullName}
              placeholder="Full name"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="words"
            />
          </View>

          <View style={formStyles.field}>
            <Text style={formStyles.label}>Email Address</Text>
            <TextInput
              style={[formStyles.input, formStyles.inputDisabled]}
              value={email}
              editable={false}
              placeholderTextColor={Colors.textMuted}
            />
          </View>

          <View style={formStyles.field}>
            <Text style={formStyles.label}>Phone Number *</Text>
            <TextInput
              style={formStyles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="07700 000000"
              placeholderTextColor={Colors.textMuted}
              keyboardType="phone-pad"
            />
          </View>

          <View style={formStyles.field}>
            <Text style={formStyles.label}>Role</Text>
            <View style={[formStyles.input, formStyles.inputDisabled]}>
              <Text style={formStyles.roleText}>{ROLE_LABELS[role] ?? role}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[formStyles.submitBtn, isSubmitting && formStyles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color={Colors.textInverse} />
            ) : (
              <Text style={formStyles.submitBtnText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  )
}

const formStyles = StyleSheet.create({
  scroll: { padding: Spacing.md },
  field: { marginBottom: Spacing.md },
  label: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '500',
    marginBottom: Spacing.xs,
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSize.base,
    color: Colors.text,
  },
  inputDisabled: {
    backgroundColor: Colors.background,
    color: Colors.textMuted,
  },
  roleText: {
    fontSize: FontSize.base,
    color: Colors.textMuted,
  },
  submitBtn: {
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: {
    color: Colors.textInverse,
    fontWeight: '700',
    fontSize: FontSize.base,
  },
})
