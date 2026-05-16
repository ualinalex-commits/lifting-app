import { View, Text, StyleSheet } from 'react-native'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { Breadcrumb } from '@/components/breadcrumb'
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme'

export default function LolerRegister() {
  return (
    <ScreenWrapper>
      <Breadcrumb items={[
        { label: 'Dashboard', href: '/(appointed-person)/' },
        { label: 'LOLER Register' },
      ]} />
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          <Text style={styles.icon}>📑</Text>
        </View>
        <Text style={styles.title}>LOLER Register</Text>
        <Text style={styles.desc}>
          Maintain the lifting equipment register required under LOLER 1998.{'\n'}
          Track thorough examination dates, certificates, and equipment status.
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
    backgroundColor: '#B4530920',
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
