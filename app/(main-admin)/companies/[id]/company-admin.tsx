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
import { callCreateUser } from '@/lib/api'

export default function CompanyAdminForm() {
  const { id, adminId } = useLocalSearchParams<{ id: string; adminId?: string }>()
  const router = useRouter()
  const isEdit = Boolean(adminId)

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [isLoading, setIsLoading] = useState(isEdit)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!isEdit) return
    async function fetchAdmin() {
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, email, phone')
        .eq('id', adminId)
        .single()
      if (error) {
        Alert.alert('Error', error.message)
      } else if (data) {
        setFullName(data.full_name ?? '')
        setEmail(data.email ?? '')
        setPhone(data.phone ?? '')
      }
      setIsLoading(false)
    }
    fetchAdmin()
  }, [adminId, isEdit])

  async function handleSubmit() {
    if (!fullName.trim()) {
      Alert.alert('Validation', 'Full name is required.')
      return
    }
    if (!isEdit && !email.trim()) {
      Alert.alert('Validation', 'Email address is required.')
      return
    }
    if (!phone.trim()) {
      Alert.alert('Validation', 'Phone number is required.')
      return
    }

    setIsSubmitting(true)

    if (isEdit) {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName.trim(), phone: phone.trim() })
        .eq('id', adminId)
      setIsSubmitting(false)
      if (error) {
        Alert.alert('Error', error.message)
      } else {
        router.back()
      }
    } else {
      const { error } = await callCreateUser({
        full_name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        role: 'company_admin',
        company_id: id,
      })
      setIsSubmitting(false)
      if (error) {
        Alert.alert('Error', error)
      } else {
        router.back()
      }
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
            <Text style={formStyles.label}>Email Address {!isEdit && '*'}</Text>
            <TextInput
              style={[formStyles.input, isEdit && formStyles.inputDisabled]}
              value={email}
              onChangeText={setEmail}
              placeholder="email@company.co.uk"
              placeholderTextColor={Colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!isEdit}
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

          <TouchableOpacity
            style={[formStyles.submitBtn, isSubmitting && formStyles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color={Colors.textInverse} />
            ) : (
              <Text style={formStyles.submitBtnText}>
                {isEdit ? 'Save Changes' : 'Add Company Admin'}
              </Text>
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
  inputMultiline: {
    height: 88,
    textAlignVertical: 'top',
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
