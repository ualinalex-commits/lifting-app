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

export default function EditSite() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()

  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    async function fetchSite() {
      const { data, error } = await supabase
        .from('sites')
        .select('name, address')
        .eq('id', id)
        .single()
      if (error) {
        Alert.alert('Error', error.message)
      } else if (data) {
        setName(data.name ?? '')
        setAddress(data.address ?? '')
      }
      setIsLoading(false)
    }
    fetchSite()
  }, [id])

  async function handleSubmit() {
    if (!name.trim()) {
      Alert.alert('Validation', 'Site name is required.')
      return
    }
    setIsSubmitting(true)
    const { error } = await supabase
      .from('sites')
      .update({ name: name.trim(), address: address.trim() || null })
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
            <Text style={formStyles.label}>Site Name *</Text>
            <TextInput
              style={formStyles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Canary Wharf Tower 4"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="words"
            />
          </View>

          <View style={formStyles.field}>
            <Text style={formStyles.label}>Address</Text>
            <TextInput
              style={[formStyles.input, formStyles.inputMultiline]}
              value={address}
              onChangeText={setAddress}
              placeholder="Site address"
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
