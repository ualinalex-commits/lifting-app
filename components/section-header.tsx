import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Colors, Spacing, FontSize } from '@/constants/theme'

interface Props {
  title: string
  action?: { label: string; onPress: () => void }
  count?: number
}

export function SectionHeader({ title, action, count }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <Text style={styles.title}>{title}</Text>
        {count !== undefined && <Text style={styles.count}>{count}</Text>}
      </View>
      {action && (
        <TouchableOpacity onPress={action.onPress} activeOpacity={0.7}>
          <Text style={styles.action}>{action.label}</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  title: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  count: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textMuted,
    backgroundColor: Colors.border,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
  },
  action: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.accent,
  },
})
