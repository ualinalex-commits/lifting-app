import { Platform } from 'react-native'

const MEWP_ONLY_HOSTNAMES = ['mewps.cranebase.app', 'mewps.liftingmanagement.com']

export function isMewpOnlyMode(): boolean {
  if (Platform.OS !== 'web') return false
  if (typeof window === 'undefined') return false
  return MEWP_ONLY_HOSTNAMES.includes(window.location.hostname)
}
