import React, { createContext, useContext, useEffect, useState } from 'react'
import { Session } from '@supabase/supabase-js'
import { router } from 'expo-router'
import { supabase, isSupabaseConfigured } from './supabase'
import { isDevMode } from './dev-mode'

export type UserRole =
  | 'main_admin'
  | 'company_admin'
  | 'appointed_person'
  | 'crane_supervisor'
  | 'crane_operator'
  | 'slinger_signaller'
  | 'subcontractor_admin'
  | null

export const OPERATIVE_ROLES: UserRole[] = [
  'crane_supervisor',
  'crane_operator',
  'slinger_signaller',
  'subcontractor_admin',
]

export interface Profile {
  id: string
  full_name: string
  email: string
  phone: string
  role: UserRole
  company_id: string | null
  site_id: string | null
}

interface AuthContextType {
  session: Session | null
  role: UserRole
  profile: Profile | null
  isLoading: boolean
  sendOtp: (email: string) => Promise<{ error: string | null }>
  verifyOtp: (email: string, token: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  // Dev-only role override (undefined = not overridden, use real role)
  devRole: UserRole | undefined
  setDevRole: (role: UserRole | undefined) => void
  // The real Supabase role, unaffected by dev override
  actualRole: UserRole
}

const AuthContext = createContext<AuthContextType | null>(null)

function isNetworkError(message: string): boolean {
  const m = message.toLowerCase()
  return (
    m.includes('failed to fetch') ||
    m.includes('network request failed') ||
    m.includes('networkerror') ||
    m.includes('connection refused') ||
    m.includes('etimedout') ||
    m.includes('econnrefused')
  )
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [actualRole, setActualRole] = useState<UserRole>(null)
  const [devRoleOverride, setDevRoleOverride] = useState<UserRole | undefined>(undefined)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const role: UserRole = (isDevMode() && devRoleOverride !== undefined) ? devRoleOverride : actualRole

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) {
        fetchProfile(session.user.id)
      } else {
        setIsLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) {
        fetchProfile(session.user.id)
      } else {
        setActualRole(null)
        setProfile(null)
        setIsLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId: string) {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone, role, company_id, site_id')
        .eq('id', userId)
        .single()
      if (data) {
        setProfile(data as Profile)
        setActualRole(data.role as UserRole)
      }
    } finally {
      setIsLoading(false)
    }
  }

  async function sendOtp(email: string): Promise<{ error: string | null }> {
    if (!isSupabaseConfigured) {
      console.error('[sendOtp] Supabase not configured — check EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY')
      return { error: 'App configuration is missing. Please contact support.' }
    }

    console.log('[sendOtp] attempting for:', email)

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    })

    if (otpError) {
      console.error('[sendOtp] signInWithOtp error:', {
        message: otpError.message,
        status: otpError.status,
        code: (otpError as any).code,
        name: otpError.name,
      })
      if (isNetworkError(otpError.message)) {
        return { error: 'Unable to connect. Please check your internet connection and try again.' }
      }
      return { error: `Failed to send PIN: ${otpError.message}` }
    }

    console.log('[sendOtp] OTP sent successfully')
    return { error: null }
  }

  async function verifyOtp(email: string, token: string): Promise<{ error: string | null }> {
    console.log('[verifyOtp] attempting for:', email, 'token length:', token.length)
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    })
    // Supabase can return both a session and an error simultaneously; a session means success.
    if (data?.session) {
      console.log('[verifyOtp] success')
      return { error: null }
    }
    if (error) {
      console.error('[verifyOtp] error:', { message: error.message, status: error.status, code: (error as any).code })
      return { error: error.message }
    }
    return { error: null }
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.replace('/auth/sign-in')
  }

  return (
    <AuthContext.Provider value={{
      session, role, profile, isLoading, sendOtp, verifyOtp, signOut,
      devRole: devRoleOverride,
      setDevRole: setDevRoleOverride,
      actualRole,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
