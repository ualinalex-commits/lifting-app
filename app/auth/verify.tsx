import { useState, useRef, useEffect, useCallback } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useAuth } from '@/lib/auth'
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme'

const OTP_LENGTH = 6
const EXPIRY_SECONDS = 600 // 10 minutes

export default function Verify() {
  const { email } = useLocalSearchParams<{ email: string }>()
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''))
  const [isVerifying, setIsVerifying] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(EXPIRY_SECONDS)
  const inputRefs = useRef<(TextInput | null)[]>(Array(OTP_LENGTH).fill(null))
  const verifyInFlightRef = useRef(false)
  const { verifyOtp, sendOtp } = useAuth()
  const router = useRouter()

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) { clearInterval(interval); return 0 }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  const handleChange = useCallback((index: number, value: string) => {
    const char = value.replace(/\D/g, '').slice(-1)
    setDigits((prev) => {
      const next = [...prev]
      next[index] = char
      return next
    })
    setError(null)
    if (char && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus()
    }
  }, [])

  const handleKeyPress = useCallback((index: number, key: string) => {
    if (key === 'Backspace' && !digits[index] && index > 0) {
      setDigits((prev) => {
        const next = [...prev]
        next[index - 1] = ''
        return next
      })
      inputRefs.current[index - 1]?.focus()
    }
  }, [digits])

  async function handleVerify() {
    if (verifyInFlightRef.current) return
    const token = digits.join('')
    if (token.length < OTP_LENGTH) {
      setError('Please enter the full 6-digit PIN.')
      return
    }
    if (secondsLeft === 0) {
      setError('This PIN has expired. Please request a new one.')
      return
    }
    verifyInFlightRef.current = true
    setIsVerifying(true)
    setError(null)
    const { error } = await verifyOtp(email!, token)
    verifyInFlightRef.current = false
    setIsVerifying(false)
    if (error) {
      setError('Incorrect PIN. Please try again.')
      setDigits(Array(OTP_LENGTH).fill(''))
      inputRefs.current[0]?.focus()
    } else {
      router.replace('/')
    }
  }

  async function handleResend() {
    setIsResending(true)
    setError(null)
    const { error } = await sendOtp(email!)
    setIsResending(false)
    if (error) {
      setError(error)
    } else {
      verifyInFlightRef.current = false
      setDigits(Array(OTP_LENGTH).fill(''))
      setSecondsLeft(EXPIRY_SECONDS)
      inputRefs.current[0]?.focus()
    }
  }

  const pin = digits.join('')
  useEffect(() => {
    if (pin.length === OTP_LENGTH) handleVerify()
  }, [pin])

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.card}>
          <Text style={styles.heading}>Enter PIN</Text>
          <Text style={styles.subheading}>
            We sent a 6-digit PIN to{'\n'}
            <Text style={styles.email}>{email}</Text>
          </Text>

          <View style={styles.otpRow}>
            {digits.map((d, i) => (
              <TextInput
                key={i}
                ref={(ref) => { inputRefs.current[i] = ref }}
                style={[styles.otpInput, d ? styles.otpFilled : null, error ? styles.otpError : null]}
                value={d}
                onChangeText={(v) => handleChange(i, v)}
                onKeyPress={({ nativeEvent }) => handleKeyPress(i, nativeEvent.key)}
                keyboardType="number-pad"
                maxLength={1}
                selectTextOnFocus
                autoFocus={i === 0}
                caretHidden
              />
            ))}
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.timerRow}>
            {secondsLeft > 0 ? (
              <Text style={styles.timer}>PIN expires in {formatTime(secondsLeft)}</Text>
            ) : (
              <Text style={[styles.timer, styles.timerExpired]}>PIN expired</Text>
            )}
          </View>

          <TouchableOpacity
            style={[styles.button, (isVerifying || pin.length < OTP_LENGTH) && styles.buttonDisabled]}
            onPress={handleVerify}
            disabled={isVerifying || pin.length < OTP_LENGTH}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>
              {isVerifying ? 'Verifying…' : 'Verify PIN'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.resendBtn}
            onPress={handleResend}
            disabled={isResending}
          >
            <Text style={styles.resendText}>
              {isResending ? 'Sending…' : "Didn't receive it? Resend PIN"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  inner: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.xxl,
  },
  back: {
    marginBottom: Spacing.xl,
  },
  backText: {
    color: Colors.textInverse,
    opacity: 0.7,
    fontSize: FontSize.base,
    fontWeight: '600',
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
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
    marginBottom: Spacing.xl,
  },
  email: {
    fontWeight: '600',
    color: Colors.text,
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  otpInput: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 52,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    textAlign: 'center',
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.text,
    backgroundColor: Colors.background,
  },
  otpFilled: {
    borderColor: Colors.primary,
    backgroundColor: Colors.surface,
  },
  otpError: {
    borderColor: Colors.danger,
  },
  errorText: {
    fontSize: FontSize.sm,
    color: Colors.danger,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  timerRow: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  timer: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  timerExpired: {
    color: Colors.danger,
    fontWeight: '600',
  },
  button: {
    height: 52,
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.textInverse,
    letterSpacing: 0.3,
  },
  resendBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  resendText: {
    fontSize: FontSize.sm,
    color: Colors.accent,
    fontWeight: '600',
  },
})
