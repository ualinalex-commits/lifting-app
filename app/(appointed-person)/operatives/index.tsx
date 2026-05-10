import { useState, useCallback } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { ListCard } from '@/components/list-card'
import { EmptyState } from '@/components/empty-state'
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

type Operative = {
  id: string
  full_name: string
  email: string
  phone: string
  role: 'crane_supervisor' | 'crane_operator' | 'slinger_signaller' | 'subcontractor_admin'
}

const ROLE_LABELS: Record<string, string> = {
  crane_supervisor: 'Crane Supervisors',
  crane_operator: 'Crane Operators',
  slinger_signaller: 'Slingers / Signallers',
  subcontractor_admin: 'Subcontractor Admins',
}

const ROLE_ORDER = ['crane_supervisor', 'crane_operator', 'slinger_signaller', 'subcontractor_admin']

export default function OperativesScreen() {
  const router = useRouter()
  const { profile } = useAuth()
  const [operatives, setOperatives] = useState<Operative[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchOperatives = useCallback(async () => {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone, role')
      .eq('site_id', profile?.site_id)
      .in('role', ROLE_ORDER)
      .eq('is_archived', false)
      .order('full_name')
    if (error) {
      Alert.alert('Error', error.message)
    } else {
      setOperatives((data ?? []) as Operative[])
    }
    setIsLoading(false)
  }, [profile?.site_id])

  useFocusEffect(useCallback(() => { fetchOperatives() }, [fetchOperatives]))

  async function handleArchive(op: Operative) {
    Alert.alert(
      'Archive Operative',
      `Are you sure you want to archive ${op.full_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('profiles')
              .update({ is_archived: true })
              .eq('id', op.id)
            if (error) {
              Alert.alert('Error', error.message)
            } else {
              fetchOperatives()
            }
          },
        },
      ]
    )
  }

  const grouped = ROLE_ORDER.reduce<Record<string, Operative[]>>((acc, role) => {
    acc[role] = operatives.filter((op) => op.role === role)
    return acc
  }, {})

  const isEmpty = operatives.length === 0

  return (
    <ScreenWrapper edges={['bottom']}>
      <View style={styles.toolbar}>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push('/(appointed-person)/operatives/add')}
          activeOpacity={0.8}
        >
          <Text style={styles.addBtnText}>Add Operative</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.archivedBtn}
          onPress={() => router.push('/(appointed-person)/operatives/archived')}
          activeOpacity={0.8}
        >
          <Text style={styles.archivedBtnText}>View Archived</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: Spacing.xl }} color={Colors.accent} />
      ) : isEmpty ? (
        <EmptyState title="No operatives yet" icon="👷" />
      ) : (
        <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
          {ROLE_ORDER.map((role) => {
            const items = grouped[role]
            if (!items || items.length === 0) return null
            return (
              <View key={role}>
                <View style={styles.roleHeader}>
                  <Text style={styles.roleLabel}>{ROLE_LABELS[role]}</Text>
                </View>
                {items.map((op) => (
                  <ListCard
                    key={op.id}
                    title={op.full_name}
                    subtitle={op.email}
                    meta={op.phone}
                    actions={[
                      {
                        label: 'Edit',
                        onPress: () => router.push(`/(appointed-person)/operatives/${op.id}` as any),
                      },
                      {
                        label: 'Archive',
                        onPress: () => handleArchive(op),
                        variant: 'danger',
                      },
                    ]}
                  />
                ))}
              </View>
            )
          })}
        </ScrollView>
      )}
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  addBtn: {
    flex: 1,
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  addBtnText: {
    color: Colors.textInverse,
    fontWeight: '700',
    fontSize: FontSize.sm,
  },
  archivedBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  archivedBtnText: {
    color: Colors.textSecondary,
    fontWeight: '600',
    fontSize: FontSize.sm,
  },
  listContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  roleHeader: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  roleLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
})
