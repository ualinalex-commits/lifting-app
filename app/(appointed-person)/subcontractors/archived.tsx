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

type Subcontractor = {
  id: string
  name: string
}

export default function ArchivedSubcontractorsScreen() {
  const { profile } = useAuth()
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchSubcontractors = useCallback(async () => {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('subcontractors')
      .select('id, name')
      .eq('site_id', profile?.site_id)
      .eq('is_archived', true)
      .order('name')
    if (error) {
      Alert.alert('Error', error.message)
    } else {
      setSubcontractors((data ?? []) as Subcontractor[])
    }
    setIsLoading(false)
  }, [profile?.site_id])

  useFocusEffect(useCallback(() => { fetchSubcontractors() }, [fetchSubcontractors]))

  async function handleRestore(sub: Subcontractor) {
    const { error } = await supabase
      .from('subcontractors')
      .update({ is_archived: false })
      .eq('id', sub.id)
    if (error) {
      Alert.alert('Error', error.message)
    } else {
      fetchSubcontractors()
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
        data={subcontractors}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<EmptyState title="No archived subcontractors" icon="🗂️" />}
        renderItem={({ item }) => (
          <ListCard
            title={item.name}
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
