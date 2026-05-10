import { useState, useCallback } from 'react'
import {
  View,
  Text,
  FlatList,
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

type Subcontractor = {
  id: string
  name: string
}

export default function SubcontractorsScreen() {
  const router = useRouter()
  const { profile } = useAuth()
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchSubcontractors = useCallback(async () => {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('subcontractors')
      .select('id, name')
      .eq('site_id', profile?.site_id)
      .eq('is_archived', false)
      .order('name')
    if (error) {
      Alert.alert('Error', error.message)
    } else {
      setSubcontractors((data ?? []) as Subcontractor[])
    }
    setIsLoading(false)
  }, [profile?.site_id])

  useFocusEffect(useCallback(() => { fetchSubcontractors() }, [fetchSubcontractors]))

  async function handleArchive(sub: Subcontractor) {
    Alert.alert(
      'Archive Subcontractor',
      `Are you sure you want to archive ${sub.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('subcontractors')
              .update({ is_archived: true })
              .eq('id', sub.id)
            if (error) {
              Alert.alert('Error', error.message)
            } else {
              fetchSubcontractors()
            }
          },
        },
      ]
    )
  }

  return (
    <ScreenWrapper edges={['bottom']}>
      <View style={styles.toolbar}>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push('/(appointed-person)/subcontractors/add')}
          activeOpacity={0.8}
        >
          <Text style={styles.addBtnText}>Add Subcontractor</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.archivedBtn}
          onPress={() => router.push('/(appointed-person)/subcontractors/archived')}
          activeOpacity={0.8}
        >
          <Text style={styles.archivedBtnText}>View Archived</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: Spacing.xl }} color={Colors.accent} />
      ) : (
        <FlatList
          data={subcontractors}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<EmptyState title="No subcontractors yet" icon="🤝" />}
          renderItem={({ item }) => (
            <ListCard
              title={item.name}
              actions={[
                {
                  label: 'Edit',
                  onPress: () => router.push(`/(appointed-person)/subcontractors/${item.id}` as any),
                },
                {
                  label: 'Archive',
                  onPress: () => handleArchive(item),
                  variant: 'danger',
                },
              ]}
            />
          )}
        />
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
    flexGrow: 1,
  },
})
