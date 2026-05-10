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

export default function EditCraneScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const [craneRef, setCraneRef] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    async function fetchCrane() {
      const { data, error } = await supabase
        .from('cranes')
        .select('id, crane_ref')
        .eq('id', id)
        .single()
      if (error) {
        Alert.alert('Error', error.message)
      } else if (data) {
        setCraneRef(data.crane_ref ?? '')
      }
      setIsLoading(false)
    }
    fetchCrane()
  }, [id])

  async function handleSubmit() {
    if (!craneRef.trim()) {
      Alert.alert('Validation', 'Crane ID is required.')
      return
    }

    setIsSubmitting(true)
    const { error } = await supabase
      .from('cranes')
      .update({ crane_ref: craneRef.trim().toUpperCase() })
      .eq('id', id)
    setIsSubmitting(false)

    if (error) {
      if (error.message.includes('unique') || error.message.includes('23505')) {
        Alert.alert('Error', 'A crane with this ID already exists on this site.')
      } else {
        Alert.alert('Error', error.message)
      }
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
            <Text style={formStyles.label}>Crane ID *</Text>
            <TextInput
              style={formStyles.input}
              value={craneRef}
              onChangeText={setCraneRef}
              placeholder="e.g. TC-01"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="characters"
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
