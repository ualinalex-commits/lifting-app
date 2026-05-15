import { Platform } from 'react-native'

export function isMewpOnlyMode(): boolean {
  if (Platform.OS !== 'web') return false
  if (typeof window === 'undefined') return false
  const hostname = window.location.hostname
  return hostname === 'mewps.cranebase.app' || hostname.includes('mewp')
}
