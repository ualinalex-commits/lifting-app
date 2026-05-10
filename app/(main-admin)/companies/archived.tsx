import { useState, useCallback } from 'react'
import { FlatList, Alert, StyleSheet, ActivityIndicator, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { ListCard } from '@/components/list-card'
import { EmptyState } from '@/components/empty-state'
import { Colors, Spacing } from '@/constants/theme'
import { supabase } from '@/lib/supabase'

type ArchivedCompany = { id: string; name: string }

export default function ArchivedCompanies() {
  const [companies, setCompanies] = useState<ArchivedCompany[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useFocusEffect(
    useCallback(() => {
      fetchCompanies()
    }, [])
  )

  async function fetchCompanies() {
    setIsLoading(true)
    const { data } = await supabase
      .from('companies')
      .select('id, name')
      .eq('is_archived', true)
      .order('name')
    setCompanies(data ?? [])
    setIsLoading(false)
  }

  function handleRestore(id: string, name: string) {
    Alert.alert('Restore Company', `Restore ${name} to active?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Restore',
        onPress: async () => {
          const { error } = await supabase.from('companies').update({ is_archived: false }).eq('id', id)
          if (error) {
            Alert.alert('Error', error.message)
          } else {
            fetchCompanies()
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
        data={companies}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<EmptyState title="No archived companies" icon="🗂️" />}
        renderItem={({ item }) => (
          <ListCard
            title={item.name}
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
