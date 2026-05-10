import { useState, useCallback } from 'react'
import { FlatList, Alert, StyleSheet, ActivityIndicator } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { ListCard } from '@/components/list-card'
import { EmptyState } from '@/components/empty-state'
import { Colors, Spacing } from '@/constants/theme'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

type ArchivedSite = { id: string; name: string; address: string }

export default function ArchivedSites() {
  const { profile } = useAuth()
  const [sites, setSites] = useState<ArchivedSite[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useFocusEffect(
    useCallback(() => {
      if (profile?.company_id) fetchSites()
    }, [profile?.company_id])
  )

  async function fetchSites() {
    setIsLoading(true)
    const { data } = await supabase
      .from('sites')
      .select('id, name, address')
      .eq('company_id', profile!.company_id)
      .eq('is_archived', true)
      .order('name')
    setSites(data ?? [])
    setIsLoading(false)
  }

  function handleRestore(id: string, name: string) {
    Alert.alert('Restore Site', `Restore ${name} to active?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Restore',
        onPress: async () => {
          const { error } = await supabase.from('sites').update({ is_archived: false }).eq('id', id)
          if (error) {
            Alert.alert('Error', error.message)
          } else {
            fetchSites()
          }
        },
      },
    ])
  }

  if (isLoading) {
    return (
      <ScreenWrapper>
        <ActivityIndicator style={{ marginTop: Spacing.xl }} color={Colors.accent} />
      </ScreenWrapper>
    )
  }

  return (
    <ScreenWrapper>
      <FlatList
        data={sites}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<EmptyState title="No archived sites" icon="🗂️" />}
        renderItem={({ item }) => (
          <ListCard
            title={item.name}
            subtitle={item.address}
            actions={[
              { label: 'Restore', onPress: () => handleRestore(item.id, item.name) },
            ]}
          />
        )}
      />
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  list: {
    padding: Spacing.md,
  },
})
