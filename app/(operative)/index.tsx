import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { Colors, Spacing, FontSize, BorderRadius, Shadow } from '@/constants/theme'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

const ROLE_DISPLAY: Record<string, { label: string; color: string }> = {
  crane_supervisor: { label: 'Crane Supervisor', color: '#1D4ED8' },
  crane_operator: { label: 'Crane Operator', color: '#047857' },
  slinger_signaller: { label: 'Slinger / Signaller', color: '#7C3AED' },
  subcontractor_admin: { label: 'Subcontractor Admin', color: '#B45309' },
}

export default function OperativeDashboard() {
  const router = useRouter()
  const { role, signOut, profile } = useAuth()
  const roleInfo = ROLE_DISPLAY[role ?? ''] ?? { label: 'Operative', color: Colors.primary }
  const canOpenLog = role === 'crane_supervisor'
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

      <View style={[styles.roleBar, { backgroundColor: roleInfo.color }]}>
        <Text style={styles.roleText}>{roleInfo.label}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>My Tasks</Text>

        <TouchableOpacity
          style={styles.primaryCard}
          onPress={() => router.push('/(operative)/crane-logs/')}
          activeOpacity={0.8}
        >
          <View style={styles.primaryCardContent}>
            <Text style={styles.primaryCardIcon}>📋</Text>
            <View style={styles.primaryCardText}>
              <Text style={styles.primaryCardTitle}>Crane Logs</Text>
              <Text style={styles.primaryCardDesc}>
                {canOpenLog
                  ? 'Open, manage, and close crane operation logs'
                  : 'View crane operation logs for this site'}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </View>
        </TouchableOpacity>

        {role === 'crane_supervisor' && (
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push('/(operative)/supervisor-checks')}
            activeOpacity={0.8}
          >
            <View style={styles.cardContent}>
              <Text style={styles.cardIcon}>✅</Text>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>Supervisor Checks</Text>
                <Text style={styles.cardDesc}>Pre-lift inspection checklists</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </View>
          </TouchableOpacity>
        )}

        {role === 'crane_operator' && (
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push('/(operative)/operator-checks')}
            activeOpacity={0.8}
          >
            <View style={styles.cardContent}>
              <Text style={styles.cardIcon}>🏗️</Text>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>Operator Checks</Text>
                <Text style={styles.cardDesc}>Daily pre-use crane inspection</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </View>
          </TouchableOpacity>
        )}

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Site management</Text>
          <Text style={styles.infoText}>
            To manage site operatives, cranes, or subcontractors, contact your Appointed Person.
          </Text>
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
  headerLeft: { flex: 1 },
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
  primaryCard: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    ...Shadow.md,
  },
  primaryCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.md,
  },
  primaryCardIcon: { fontSize: 32 },
  primaryCardText: { flex: 1 },
  primaryCardTitle: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.textInverse,
    marginBottom: 3,
  },
  primaryCardDesc: {
    fontSize: FontSize.sm,
    color: Colors.textInverse,
    opacity: 0.75,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    ...Shadow.sm,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.md,
  },
  cardIcon: { fontSize: 28 },
  cardText: { flex: 1 },
  cardTitle: {
    fontSize: FontSize.base,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 2,
  },
  cardDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  chevron: {
    fontSize: 22,
    color: Colors.textMuted,
  },
  infoCard: {
    backgroundColor: Colors.primary + '0D',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  infoTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.primary,
    marginBottom: 4,
  },
  infoText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 19,
  },
})
