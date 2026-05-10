import { useState, useCallback } from 'react'
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useFocusEffect } from 'expo-router'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { ListCard } from '@/components/list-card'
import { SectionHeader } from '@/components/section-header'
import { EmptyState } from '@/components/empty-state'
import { Colors, Spacing, FontSize } from '@/constants/theme'
import { supabase } from '@/lib/supabase'

const ROLE_LABELS: Record<string, string> = {
  appointed_person: 'Appointed Persons',
  crane_supervisor: 'Crane Supervisors',
  crane_operator: 'Crane Operators',
  slinger_signaller: 'Slingers / Signallers',
  subcontractor_admin: 'Subcontractor Admins',
}

const ROLE_ORDER = [
  'appointed_person',
  'crane_supervisor',
  'crane_operator',
  'slinger_signaller',
  'subcontractor_admin',
]

export default function ArchivedOperatives() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [operatives, setOperatives] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useFocusEffect(
    useCallback(() => {
      fetchOperatives()
    }, [id])
  )

  async function fetchOperatives() {
    setIsLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone, role')
      .eq('site_id', id)
      .in('role', ['appointed_person', 'crane_supervisor', 'crane_operator', 'slinger_signaller', 'subcontractor_admin'])
      .eq('is_archived', true)
      .order('full_name')
    setOperatives(data ?? [])
    setIsLoading(false)
  }

  if (isLoading) {
    return (
      <ScreenWrapper edges={['bottom']}>
        <ActivityIndicator style={{ marginTop: Spacing.xl }} color={Colors.accent} />
      </ScreenWrapper>
    )
  }

  const grouped = ROLE_ORDER.reduce<Record<string, any[]>>((acc, role) => {
    acc[role] = operatives.filter((op) => op.role === role)
    return acc
  }, {})

  const hasAny = operatives.length > 0

  return (
    <ScreenWrapper edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {!hasAny && (
          <EmptyState title="No archived operatives" icon="🗂️" />
        )}

        {ROLE_ORDER.map((role) => {
          const ops = grouped[role]
          if (ops.length === 0) return null
          return (
            <View key={role}>
              <SectionHeader title={ROLE_LABELS[role]} count={ops.length} />
              <View style={styles.padH}>
                {ops.map((op) => (
                  <ListCard
                    key={op.id}
                    title={op.full_name}
                    subtitle={op.email}
                    meta={op.phone}
                  />
                ))}
              </View>
            </View>
          )
        })}
      </ScrollView>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  scroll: {
    paddingBottom: Spacing.xxl,
  },
  padH: {
    paddingHorizontal: Spacing.md,
  },
})
