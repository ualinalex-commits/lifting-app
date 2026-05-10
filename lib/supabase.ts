import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

export const isSupabaseConfigured = Boolean(supabaseUrl) && Boolean(supabaseAnonKey)

// expo-secure-store has a 2048-byte value limit; large tokens are chunked
const CHUNK_SIZE = 1800

const SecureStoreAdapter = {
  async getItem(key: string): Promise<string | null> {
    const chunkCount = await SecureStore.getItemAsync(`${key}_chunks`)
    if (chunkCount) {
      let value = ''
      for (let i = 0; i < parseInt(chunkCount, 10); i++) {
        const chunk = await SecureStore.getItemAsync(`${key}_chunk_${i}`)
        value += chunk ?? ''
      }
      return value
    }
    return SecureStore.getItemAsync(key)
  },
  async setItem(key: string, value: string): Promise<void> {
    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value)
      return
    }
    const chunks = Math.ceil(value.length / CHUNK_SIZE)
    for (let i = 0; i < chunks; i++) {
      await SecureStore.setItemAsync(`${key}_chunk_${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE))
    }
    await SecureStore.setItemAsync(`${key}_chunks`, String(chunks))
  },
  async removeItem(key: string): Promise<void> {
    const chunkCount = await SecureStore.getItemAsync(`${key}_chunks`)
    if (chunkCount) {
      for (let i = 0; i < parseInt(chunkCount, 10); i++) {
        await SecureStore.deleteItemAsync(`${key}_chunk_${i}`)
      }
      await SecureStore.deleteItemAsync(`${key}_chunks`)
    } else {
      await SecureStore.deleteItemAsync(key)
    }
  },
}

const memoryStore = new Map<string, string>()
const isLocalStorageAvailable = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'

const WebStorageAdapter = {
  getItem: (key: string): Promise<string | null> =>
    Promise.resolve(isLocalStorageAvailable ? localStorage.getItem(key) : (memoryStore.get(key) ?? null)),
  setItem: (key: string, value: string): Promise<void> => {
    if (isLocalStorageAvailable) localStorage.setItem(key, value)
    else memoryStore.set(key, value)
    return Promise.resolve()
  },
  removeItem: (key: string): Promise<void> => {
    if (isLocalStorageAvailable) localStorage.removeItem(key)
    else memoryStore.delete(key)
    return Promise.resolve()
  },
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS === 'web' ? WebStorageAdapter : SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

// Required Supabase tables:
// profiles(id uuid references auth.users, role text, full_name text, phone text, site_id uuid, company_id uuid)
// companies(id uuid, name text, contact_name text, contact_email text, contact_phone text, archived boolean)
// sites(id uuid, company_id uuid, name text, address text, archived boolean)
// cranes(id uuid, site_id uuid, crane_id text, archived boolean)
// subcontractors(id uuid, site_id uuid, name text, archived boolean)
// crane_logs(id uuid, site_id uuid, crane_id uuid, status text, subcontractor_id uuid, job_description text, start_time timestamptz, end_time timestamptz, opened_by uuid)
