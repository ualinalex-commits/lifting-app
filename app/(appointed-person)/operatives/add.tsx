import { useState } from 'react'
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
import { useRouter } from 'expo-router'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme'
import { callCreateUser } from '@/lib/api'
import { useAuth } from '@/lib/auth'

type OperativeRole = 'crane_supervisor' | 'crane_operator' | 'slinger_signaller' | 'subcontractor_admin'

const ROLE_OPTIONS: { value: OperativeRole; label: string }[] = [
  { value: 'crane_supervisor', label: 'Crane Supervisor' },
  { value: 'crane_operator', label: 'Crane Operator' },
  { value: 'slinger_signaller', label: 'Slinger / Signaller' },
  { value: 'subcontractor_admin', label: 'Subcontractor Admin' },
]

export default function AddOperativeScreen() {
  const router = useRouter()
  const { profile } = useAuth()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<OperativeRole | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit() {
    if (!fullName.trim()) {
      Alert.alert('Validation', 'Full name is required.')
      return
    }
    if (!email.trim()) {
      Alert.alert('Validation', 'Email address is required.')
      return
    }
    if (!phone.trim()) {
      Alert.alert('Validation', 'Phone number is required.')
      return
    }
    if (!role) {
      Alert.alert('Validation', 'Please select a role.')
      return
    }

    setIsSubmitting(true)
    const { error } = await callCreateUser({
      full_name: fullName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      role,
      site_id: profile?.site_id ?? undefined,
      company_id: profile?.company_id ?? undefined,
    })
    setIsSubmitting(false)

    if (error) {
      Alert.alert('Error', error)
    } else {
      router.back()
    }
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
            <Text style={formStyles.label}>Email Address *</Text>
            <TextInput
              style={formStyles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="email@company.co.uk"
              placeholderTextColor={Colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
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
            <Text style={formStyles.label}>Role *</Text>
            <View style={formStyles.roleGrid}>
              {ROLE_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[formStyles.roleBtn, role === opt.value && formStyles.roleBtnSelected]}
                  onPress={() => setRole(opt.value)}
                  activeOpacity={0.7}
                >
                  <Text style={[formStyles.roleBtnText, role === opt.value && formStyles.roleBtnTextSelected]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
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
              <Text style={formStyles.submitBtnText}>Add Operative</Text>
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
  roleGrid: {
    gap: Spacing.sm,
  },
  roleBtn: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  roleBtnSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  roleBtnText: {
    fontSize: FontSize.base,
    color: Colors.text,
    fontWeight: '500',
  },
  roleBtnTextSelected: {
    color: Colors.textInverse,
    fontWeight: '700',
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
