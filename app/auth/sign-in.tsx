import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '@/lib/auth'
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme'

export default function SignIn() {
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { sendOtp } = useAuth()
  const router = useRouter()

  async function handleSend() {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) {
      setError('Please enter your email address.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid email address.')
      return
    }
    setIsSubmitting(true)
    setError(null)
    const { error } = await sendOtp(trimmed)
    setIsSubmitting(false)
    if (error) {
      setError(error)
    } else {
      router.push({ pathname: '/auth/verify', params: { email: trimmed } })
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.logoMark}>
            <Text style={styles.logoIcon}>⚙</Text>
          </View>
          <Text style={styles.appName}>Lifting App</Text>
          <Text style={styles.tagline}>Crane & Rigging Management</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>Sign in</Text>
          <Text style={styles.subheading}>
            Enter your work email. We'll send a 6-digit PIN to sign you in.
          </Text>

          <Text style={styles.label}>Email address</Text>
          <TextInput
            style={[styles.input, error ? styles.inputError : null]}
            value={email}
            onChangeText={(v) => { setEmail(v); setError(null) }}
            placeholder="your@email.com"
            placeholderTextColor={Colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            returnKeyType="send"
            onSubmitEditing={handleSend}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.button, isSubmitting && styles.buttonDisabled]}
            onPress={handleSend}
            disabled={isSubmitting}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>
              {isSubmitting ? 'Sending PIN…' : 'Send PIN'}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>
          PIN is valid for 10 minutes.{'\n'}
          You must be registered by your company admin to access this app.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xxl * 1.5,
    paddingBottom: Spacing.xxl,
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  logoMark: {
    width: 72,
    height: 72,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  logoIcon: {
    fontSize: 38,
  },
  appName: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.textInverse,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: FontSize.sm,
    color: Colors.textInverse,
    opacity: 0.6,
    marginTop: 4,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  heading: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  subheading: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: Spacing.lg,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  input: {
    height: 52,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.base,
    color: Colors.text,
    backgroundColor: Colors.background,
    marginBottom: Spacing.sm,
  },
  inputError: {
    borderColor: Colors.danger,
  },
  errorText: {
    fontSize: FontSize.sm,
    color: Colors.danger,
    marginBottom: Spacing.sm,
  },
  button: {
    height: 52,
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.textInverse,
    letterSpacing: 0.3,
  },
  footer: {
    textAlign: 'center',
    fontSize: FontSize.xs,
    color: Colors.textInverse,
    opacity: 0.5,
    lineHeight: 18,
  },
})
