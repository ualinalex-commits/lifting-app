import { View, Text, StyleSheet } from 'react-native'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme'

export default function OperativeSupervisorChecks() {
  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          <Text style={styles.icon}>✅</Text>
        </View>
        <Text style={styles.title}>Supervisor Checks</Text>
        <Text style={styles.desc}>
          Pre-lift inspection checklists for crane supervisors.{'\n'}
          Covers site conditions, exclusion zones, communication, and equipment readiness.
        </Text>
        <View style={styles.comingSoon}>
          <Text style={styles.comingSoonText}>Coming soon</Text>
        </View>
      </View>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxl },
  iconWrap: { width: 80, height: 80, borderRadius: 20, backgroundColor: '#0F766E20', alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.lg },
  icon: { fontSize: 40 },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text, marginBottom: Spacing.sm },
  desc: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 21, marginBottom: Spacing.lg },
  comingSoon: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, backgroundColor: Colors.border, borderRadius: BorderRadius.full },
  comingSoonText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
})
