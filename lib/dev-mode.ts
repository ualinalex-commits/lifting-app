import { Platform } from 'react-native'

declare var __DEV__: boolean

export function isDevMode(): boolean {
  // Never show on the production domain, even in a dev build
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (window.location.hostname.includes('cranebase.app')) return false
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') return true
  }
  // __DEV__ is true when running with Expo Go / Metro dev server / simulators
  return typeof __DEV__ !== 'undefined' && __DEV__ === true
}
