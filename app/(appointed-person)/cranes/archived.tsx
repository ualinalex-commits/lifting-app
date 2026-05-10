import { useState, useCallback } from 'react'
import {
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { ListCard } from '@/components/list-card'
import { EmptyState } from '@/components/empty-state'
import { Colors, Spacing } from '@/constants/theme'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

type Crane = {
  id: string
  crane_ref: string
}

export default function ArchivedCranesScreen() {
  const { profile } = useAuth()
  const [cranes, setCranes] = useState<Crane[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchCranes = useCallback(async () => {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('cranes')
      .select('id, crane_ref')
      .eq('site_id', profile?.site_id)
      .eq('is_archived', true)
      .order('crane_ref')
    if (error) {
      Alert.alert('Error', error.message)
    } else {
      setCranes((data ?? []) as Crane[])
    }
    setIsLoading(false)
  }, [profile?.site_id])

  useFocusEffect(useCallback(() => { fetchCranes() }, [fetchCranes]))

  async function handleRestore(crane: Crane) {
    const { error } = await supabase
      .from('cranes')
      .update({ is_archived: false })
      .eq('id', crane.id)
    if (error) {
      Alert.alert('Error', error.message)
    } else {
      fetchCranes()
    }
  }

  if (isLoading) {
    return (
      <ScreenWrapper edges={['bottom']}>
        <ActivityIndicator style={{ marginTop: Spacing.xl }} color={Colors.accent} />
      </ScreenWrapper>
    )
  }

  return (
    <ScreenWrapper edges={['bottom']}>
      <FlatList
        data={cranes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<EmptyState title="No archived cranes" icon="🗂️" />}
        renderItem={({ item }) => (
          <ListCard
            title={item.crane_ref}
            actions={[
              {
                label: 'Restore',
                onPress: () => handleRestore(item),
              },
            ]}
          />
        )}
      />
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xxl,
    flexGrow: 1,
  },
})
