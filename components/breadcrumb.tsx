import { ScrollView, Text, TouchableOpacity, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Colors, FontSize, Spacing } from '@/constants/theme'

export interface BreadcrumbItem {
  label: string
  href?: string
}

interface BreadcrumbProps {
  items: BreadcrumbItem[]
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  const router = useRouter()

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.row}
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1
        const tappable = !!item.href && !isLast

        return (
          <View key={index} style={styles.item}>
            {index > 0 && <Text style={styles.chevron}>›</Text>}
            {tappable ? (
              <TouchableOpacity onPress={() => router.push(item.href as any)} activeOpacity={0.7}>
                <Text style={styles.link}>{item.label}</Text>
              </TouchableOpacity>
            ) : (
              <Text style={[styles.link, styles.current]}>{item.label}</Text>
            )}
          </View>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: {
    height: 36,
    flexGrow: 0,
    backgroundColor: Colors.surface,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chevron: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginHorizontal: Spacing.xs,
  },
  link: {
    fontSize: FontSize.xs,
    color: Colors.primary,
  },
  current: {
    color: Colors.text,
    fontWeight: '600',
  },
})
