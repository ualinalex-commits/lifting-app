import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Colors, Spacing, FontSize, BorderRadius, Shadow } from '@/constants/theme'

interface Action {
  label: string
  onPress: () => void
  variant?: 'default' | 'danger'
}

interface Props {
  title: string
  subtitle?: string
  meta?: string
  badge?: React.ReactNode
  actions?: Action[]
  onPress?: () => void
}

export function ListCard({ title, subtitle, meta, badge, actions, onPress }: Props) {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress}
    >
      <View style={styles.content}>
        <View style={styles.main}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            {badge}
          </View>
          {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
          {meta ? <Text style={styles.meta}>{meta}</Text> : null}
        </View>
        {onPress && (
          <Text style={styles.chevron}>›</Text>
        )}
      </View>
      {actions && actions.length > 0 && (
        <View style={styles.actions}>
          {actions.map((a) => (
            <TouchableOpacity
              key={a.label}
              style={[styles.actionBtn, a.variant === 'danger' && styles.actionBtnDanger]}
              onPress={a.onPress}
              activeOpacity={0.7}
            >
              <Text style={[styles.actionText, a.variant === 'danger' && styles.actionTextDanger]}>
                {a.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    ...Shadow.sm,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
  },
  main: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: 2,
  },
  title: {
    fontSize: FontSize.base,
    fontWeight: '600',
    color: Colors.text,
    flex: 1,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  meta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  chevron: {
    fontSize: 22,
    color: Colors.textMuted,
    marginLeft: Spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    gap: Spacing.sm,
  },
  actionBtn: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionBtnDanger: {
    borderColor: Colors.danger,
  },
  actionText: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: '500',
  },
  actionTextDanger: {
    color: Colors.danger,
  },
})
