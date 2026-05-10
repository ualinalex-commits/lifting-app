import { Stack } from 'expo-router'
import { Colors, FontSize } from '@/constants/theme'

export default function OperativeLayout() {
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
      <Stack.Screen name="crane-logs/index" options={{ title: 'Crane Logs' }} />
      <Stack.Screen name="crane-logs/[id]" options={{ title: 'Log Detail' }} />
      <Stack.Screen name="crane-logs/open" options={{ title: 'Open Log' }} />
      <Stack.Screen name="supervisor-checks" options={{ title: 'Supervisor Checks' }} />
      <Stack.Screen name="operator-checks" options={{ title: 'Operator Checks' }} />
    </Stack>
  )
}
