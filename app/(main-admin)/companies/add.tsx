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
import { supabase } from '@/lib/supabase'

export default function AddCompany() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [address, setAddress] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit() {
    if (!name.trim()) {
      Alert.alert('Validation', 'Company name is required.')
      return
    }
    setIsSubmitting(true)
    const { error } = await supabase.from('companies').insert({
      name: name.trim(),
      contact_email: contactEmail.trim() || null,
      contact_phone: contactPhone.trim() || null,
      address: address.trim() || null,
    })
    setIsSubmitting(false)
    if (error) {
      Alert.alert('Error', error.message)
    } else {
      router.back()
    }
  }

  return (
    <ScreenWrapper edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={formStyles.scroll} keyboardShouldPersistTaps="handled">
          <View style={formStyles.field}>
            <Text style={formStyles.label}>Company Name *</Text>
            <TextInput
              style={formStyles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Apex Crane Services Ltd"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="words"
            />
          </View>

          <View style={formStyles.field}>
            <Text style={formStyles.label}>Contact Email</Text>
            <TextInput
              style={formStyles.input}
              value={contactEmail}
              onChangeText={setContactEmail}
              placeholder="contact@company.co.uk"
              placeholderTextColor={Colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={formStyles.field}>
            <Text style={formStyles.label}>Contact Phone</Text>
            <TextInput
              style={formStyles.input}
              value={contactPhone}
              onChangeText={setContactPhone}
              placeholder="07700 000000"
              placeholderTextColor={Colors.textMuted}
              keyboardType="phone-pad"
            />
          </View>

          <View style={formStyles.field}>
            <Text style={formStyles.label}>Address</Text>
            <TextInput
              style={[formStyles.input, formStyles.inputMultiline]}
              value={address}
              onChangeText={setAddress}
              placeholder="Company address"
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={3}
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
              <Text style={formStyles.submitBtnText}>Add Company</Text>
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
