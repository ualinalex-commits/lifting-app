import { useEffect, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { Colors, Spacing, FontSize, BorderRadius, Shadow } from '@/constants/theme'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

const QUICK_ACCESS = [
  { key: 'crane-logs', label: 'Crane Logs', icon: '📋', description: 'Open and manage crane logs', color: Colors.primary, route: '/(appointed-person)/crane-logs/' },
  { key: 'crane-schedule', label: 'Crane Schedule', icon: '📅', description: 'Plan and view crane schedules', color: '#1D4ED8', route: '/(appointed-person)/crane-schedule' },
  { key: 'daily-briefing', label: 'Daily Briefing', icon: '📢', description: 'Record daily safety briefings', color: '#047857', route: '/(appointed-person)/daily-briefing' },
  { key: 'toolbox-talk', label: 'Toolbox Talk', icon: '🔧', description: 'Log toolbox talk sessions', color: '#7C3AED', route: '/(appointed-person)/toolbox-talk' },
  { key: 'loler-register', label: 'LOLER Register', icon: '📑', description: 'Lifting equipment register', color: '#B45309', route: '/(appointed-person)/loler-register' },
  { key: 'supervisor-checks', label: 'Supervisor Checks', icon: '✅', description: 'Pre-lift supervisor inspections', color: '#0F766E', route: '/(appointed-person)/supervisor-checks' },
  { key: 'operator-checks', label: 'Operator Checks', icon: '🏗️', description: 'Operator pre-use checks', color: '#BE185D', route: '/(appointed-person)/operator-checks' },
]

export default function Dashboard() {
  const router = useRouter()
  const { signOut, profile } = useAuth()
  const [site, setSite] = useState<{ name: string; address: string | null } | null>(null)

  useEffect(() => {
    if (!profile?.site_id) return
    supabase
      .from('sites')
      .select('name, address')
      .eq('id', profile.site_id)
      .single()
      .then(({ data }) => { if (data) setSite(data) })
  }, [profile?.site_id])

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.siteName}>{site?.name ?? '—'}</Text>
          {site?.address ? <Text style={styles.siteAddress}>{site.address}</Text> : null}
        </View>
        <TouchableOpacity onPress={signOut} style={styles.signOutBtn}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.roleBar}>
        <Text style={styles.roleText}>Appointed Person</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Site Operations</Text>
        <View style={styles.grid}>
          {QUICK_ACCESS.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={styles.card}
              onPress={() => router.push(item.route as any)}
              activeOpacity={0.8}
            >
              <View style={[styles.cardIconWrap, { backgroundColor: item.color + '15' }]}>
                <Text style={styles.cardIcon}>{item.icon}</Text>
              </View>
              <Text style={styles.cardLabel}>{item.label}</Text>
              <Text style={styles.cardDesc}>{item.description}</Text>
              <View style={[styles.cardAccent, { backgroundColor: item.color }]} />
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Site Management</Text>
        <View style={styles.mgmtRow}>
          {[
            { label: 'Operatives', icon: '👷', route: '/(appointed-person)/operatives' },
            { label: 'Cranes', icon: '🏗️', route: '/(appointed-person)/cranes' },
            { label: 'Subcontractors', icon: '🤝', route: '/(appointed-person)/subcontractors' },
          ].map((item) => (
            <TouchableOpacity
              key={item.label}
              style={styles.mgmtCard}
              onPress={() => router.push(item.route as any)}
              activeOpacity={0.8}
            >
              <Text style={styles.mgmtIcon}>{item.icon}</Text>
              <Text style={styles.mgmtLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

      </ScrollView>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  headerLeft: {
    flex: 1,
  },
  siteName: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.textInverse,
    lineHeight: 22,
  },
  siteAddress: {
    fontSize: FontSize.xs,
    color: Colors.textInverse,
    opacity: 0.6,
    marginTop: 2,
  },
  signOutBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.textInverse,
    opacity: 0.7,
  },
  signOutText: {
    color: Colors.textInverse,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  roleBar: {
    backgroundColor: Colors.accent,
    paddingVertical: 5,
    paddingHorizontal: Spacing.md,
  },
  roleText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textInverse,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  scroll: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  card: {
    width: '47.5%',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  cardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  cardIcon: {
    fontSize: 22,
  },
  cardLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 3,
  },
  cardDesc: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    lineHeight: 15,
  },
  cardAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 3,
    height: '100%',
    borderTopLeftRadius: BorderRadius.md,
    borderBottomLeftRadius: BorderRadius.md,
  },
  mgmtRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  mgmtCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    gap: Spacing.xs,
    ...Shadow.sm,
  },
  mgmtIcon: {
    fontSize: 24,
  },
  mgmtLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
  },
})
