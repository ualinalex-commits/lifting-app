import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { Breadcrumb } from '@/components/breadcrumb'
import { Colors, Spacing, FontSize, BorderRadius, Shadow } from '@/constants/theme'

export default function SupervisorChecks() {
  const router = useRouter()

  return (
    <ScreenWrapper>
      <Breadcrumb items={[
        { label: 'Dashboard', href: '/(appointed-person)/' },
        { label: 'Supervisor Checks' },
      ]} />

      <View style={styles.container}>
        <Text style={styles.pageTitle}>Supervisor Checks</Text>
        <Text style={styles.pageDesc}>
          Pre-lift inspection checklists and safety meetings completed by the crane supervisor.
        </Text>

        {/* Crane Meeting — fully built */}
        <TouchableOpacity
          style={styles.featureCard}
          onPress={() => router.push('/(appointed-person)/crane-meeting/' as any)}
          activeOpacity={0.8}
        >
          <View style={styles.featureCardLeft}>
            <Text style={styles.featureIcon}>🏗</Text>
          </View>
          <View style={styles.featureCardBody}>
            <Text style={styles.featureTitle}>Crane Meeting</Text>
            <Text style={styles.featureDesc}>
              Weekly lifting operations meeting — set up, read, sign, and archive.
            </Text>
          </View>
          <Text style={styles.featureChevron}>›</Text>
        </TouchableOpacity>

        {/* Other checks — placeholder */}
        <View style={styles.comingSoonCard}>
          <Text style={styles.comingSoonTitle}>Pre-Lift Inspection Checklists</Text>
          <Text style={styles.comingSoonDesc}>
            Covers site conditions, exclusion zones, communication, and equipment readiness.
          </Text>
          <View style={styles.comingSoonBadge}>
            <Text style={styles.comingSoonBadgeText}>Coming soon</Text>
          </View>
        </View>
      </View>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  pageTitle: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 2,
  },
  pageDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: Spacing.sm,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.md,
    ...Shadow.sm,
  },
  featureCardLeft: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureIcon: { fontSize: 26 },
  featureCardBody: { flex: 1 },
  featureTitle: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    lineHeight: 16,
  },
  featureChevron: {
    fontSize: 22,
    color: Colors.textMuted,
    fontWeight: '300',
  },
  comingSoonCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.xs,
    ...Shadow.sm,
    opacity: 0.6,
  },
  comingSoonTitle: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.text,
  },
  comingSoonDesc: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    lineHeight: 16,
  },
  comingSoonBadge: {
    alignSelf: 'flex-start',
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    backgroundColor: Colors.border,
    borderRadius: BorderRadius.full,
  },
  comingSoonBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
})
