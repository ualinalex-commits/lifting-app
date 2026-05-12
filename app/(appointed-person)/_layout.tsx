import { Stack } from 'expo-router'
import { Colors, FontSize } from '@/constants/theme'

export default function AppointedPersonLayout() {
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
      <Stack.Screen name="crane-schedule" options={{ title: 'Crane Schedule' }} />
      <Stack.Screen name="daily-briefing" options={{ title: 'Daily Briefing' }} />
      <Stack.Screen name="toolbox-talk" options={{ title: 'Toolbox Talks' }} />
      <Stack.Screen name="toolbox-talk/library" options={{ title: 'Talk Library' }} />
      <Stack.Screen name="toolbox-talk/new" options={{ title: 'New Toolbox Talk' }} />
      <Stack.Screen name="toolbox-talk/[id]" options={{ title: 'Toolbox Talk' }} />
      <Stack.Screen name="toolbox-talk/archive" options={{ title: 'Archive' }} />
      <Stack.Screen name="toolbox-talk/sign" options={{ title: 'Sign Talk', presentation: 'modal' }} />
      <Stack.Screen name="toolbox-talk/status" options={{ title: 'Sign-off Status' }} />
      <Stack.Screen name="loler-register" options={{ title: 'LOLER Register' }} />
      <Stack.Screen name="supervisor-checks" options={{ title: 'Supervisor Checks' }} />
      <Stack.Screen name="operator-checks" options={{ title: 'Operator Checks' }} />
      <Stack.Screen name="operatives/index" options={{ title: 'Operatives' }} />
      <Stack.Screen name="operatives/add" options={{ title: 'Add Operative' }} />
      <Stack.Screen name="operatives/[id]" options={{ title: 'Edit Operative' }} />
      <Stack.Screen name="operatives/archived" options={{ title: 'Archived Operatives' }} />
      <Stack.Screen name="cranes/index" options={{ title: 'Cranes' }} />
      <Stack.Screen name="cranes/add" options={{ title: 'Add Crane' }} />
      <Stack.Screen name="cranes/[id]" options={{ title: 'Edit Crane' }} />
      <Stack.Screen name="cranes/archived" options={{ title: 'Archived Cranes' }} />
      <Stack.Screen name="subcontractors/index" options={{ title: 'Subcontractors' }} />
      <Stack.Screen name="subcontractors/add" options={{ title: 'Add Subcontractor' }} />
      <Stack.Screen name="subcontractors/[id]" options={{ title: 'Edit Subcontractor' }} />
      <Stack.Screen name="subcontractors/archived" options={{ title: 'Archived Subcontractors' }} />
    </Stack>
  )
}
