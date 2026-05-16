import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider } from '@/lib/auth'
import { DevRoleSwitcher } from '@/components/dev-role-switcher'
import { Colors } from '@/constants/theme'

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="(main-admin)" />
        <Stack.Screen name="(company-admin)" />
        <Stack.Screen name="(appointed-person)" />
        <Stack.Screen name="(operative)" />
        <Stack.Screen name="(mewp)" />
      </Stack>
      <StatusBar style="auto" />
      <DevRoleSwitcher />
    </AuthProvider>
  )
}
