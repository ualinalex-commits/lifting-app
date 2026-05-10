import { Stack } from 'expo-router'
import { Colors, FontSize } from '@/constants/theme'

export default function CompanyAdminLayout() {
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
      <Stack.Screen name="sites/archived" options={{ title: 'Archived Sites' }} />
      <Stack.Screen name="sites/[id]/index" options={{ title: 'Site' }} />
      <Stack.Screen name="sites/add" options={{ title: 'Add Site' }} />
      <Stack.Screen name="sites/[id]/edit" options={{ title: 'Edit Site' }} />
      <Stack.Screen name="sites/[id]/appointed-person" options={{ title: 'Appointed Person' }} />
      <Stack.Screen name="sites/[id]/archived-operatives" options={{ title: 'Archived' }} />
    </Stack>
  )
}
