import { View, Text, StyleSheet } from 'react-native'
import { Colors, FontSize, BorderRadius, Spacing } from '@/constants/theme'

type LogStatus = 'working' | 'service' | 'thorough_examination' | 'winded_off' | 'breaking_down'

const STATUS_LABELS: Record<LogStatus, string> = {
  working: 'Working',
  service: 'Service',
  thorough_examination: 'Thorough Exam',
  winded_off: 'Winded Off',
  breaking_down: 'Breaking Down',
}

interface Props {
  status: LogStatus | string
  size?: 'sm' | 'md'
}

export function StatusBadge({ status, size = 'md' }: Props) {
  const color = Colors.logStatus[status as LogStatus] ?? Colors.textSecondary
  const label = STATUS_LABELS[status as LogStatus] ?? status

  return (
    <View style={[styles.badge, { backgroundColor: color + '20', borderColor: color + '60' }, size === 'sm' && styles.badgeSm]}>
      <View style={[styles.dot, { backgroundColor: color }, size === 'sm' && styles.dotSm]} />
      <Text style={[styles.label, { color }, size === 'sm' && styles.labelSm]}>{label}</Text>
    </View>
  )
}

interface OpenClosedProps {
  isOpen: boolean
}

export function OpenClosedBadge({ isOpen }: OpenClosedProps) {
  const color = isOpen ? Colors.success : Colors.textSecondary
  return (
    <View style={[styles.badge, { backgroundColor: color + '20', borderColor: color + '60' }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.label, { color }]}>{isOpen ? 'Open' : 'Closed'}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  badgeSm: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotSm: {
    width: 5,
    height: 5,
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  labelSm: {
    fontSize: 11,
  },
})
