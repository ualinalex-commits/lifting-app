import { Stack } from 'expo-router'
import { Colors, FontSize } from '@/constants/theme'

export default function MainAdminLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.primary },
        headerTintColor: Colors.textInverse,
        headerTitleStyle: { fontWeight: '700', fontSize: FontSize.base },
        contentStyle: { backgroundColor: Colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="companies/archived" options={{ title: 'Archived Companies' }} />
      <Stack.Screen name="companies/[id]/index" options={{ title: 'Company' }} />
      <Stack.Screen name="companies/[id]/sites/[siteId]" options={{ title: 'Site (Read-only)' }} />
      <Stack.Screen name="companies/add" options={{ title: 'Add Company' }} />
      <Stack.Screen name="companies/[id]/edit" options={{ title: 'Edit Company' }} />
      <Stack.Screen name="companies/[id]/company-admin" options={{ title: 'Company Admin' }} />
    </Stack>
  )
}
