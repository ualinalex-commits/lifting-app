import { Redirect } from 'expo-router'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { useAuth, OPERATIVE_ROLES } from '@/lib/auth'
import { Colors } from '@/constants/theme'

export default function Index() {
  const { session, role, isLoading } = useAuth()

  if (isLoading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    )
  }

  if (!session) return <Redirect href="/auth/sign-in" />

  if (role === 'main_admin') return <Redirect href="/(main-admin)" />
  if (role === 'company_admin') return <Redirect href="/(company-admin)" />
  if (role === 'appointed_person') return <Redirect href="/(appointed-person)" />
  if (role && OPERATIVE_ROLES.includes(role)) return <Redirect href="/(operative)" />

  // Role not yet loaded — show loader briefly; auth state change will re-render
  return (
    <View style={styles.loader}>
      <ActivityIndicator size="large" color={Colors.primary} />
    </View>
  )
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
})
