import { View, Text, StyleSheet } from 'react-native'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme'

export default function CraneSchedule() {
  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          <Text style={styles.icon}>📅</Text>
        </View>
        <Text style={styles.title}>Crane Schedule</Text>
        <Text style={styles.desc}>
          Plan and manage crane usage across the site.{'\n'}
          Allocate crane time to subcontractors, schedule lifts, and prevent crane conflicts.
        </Text>
        <View style={styles.comingSoon}>
          <Text style={styles.comingSoonText}>Coming soon</Text>
        </View>
      </View>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxl,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: '#1D4ED820',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  icon: { fontSize: 40 },
  title: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  desc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: Spacing.lg,
  },
  comingSoon: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.border,
    borderRadius: BorderRadius.full,
  },
  comingSoonText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
})
