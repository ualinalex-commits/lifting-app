import { useState, useCallback } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { ListCard } from '@/components/list-card'
import { EmptyState } from '@/components/empty-state'
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

type SiteRow = {
  id: string
  name: string
  address: string
  appointedPersonName: string
}

export default function SitesScreen() {
  const router = useRouter()
  const { signOut, profile } = useAuth()
  const [sites, setSites] = useState<SiteRow[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useFocusEffect(
    useCallback(() => {
      if (profile?.company_id) fetchSites()
    }, [profile?.company_id])
  )

  async function fetchSites() {
    setIsLoading(true)
    const [{ data: sitesData }, { data: apsData }] = await Promise.all([
      supabase
        .from('sites')
        .select('id, name, address')
        .eq('company_id', profile!.company_id)
        .eq('is_archived', false)
        .order('name'),
      supabase
        .from('profiles')
        .select('id, full_name, site_id')
        .eq('company_id', profile!.company_id)
        .eq('role', 'appointed_person')
        .eq('is_archived', false),
    ])
    setSites(
      (sitesData ?? []).map((s) => ({
        ...s,
        appointedPersonName:
          (apsData ?? []).find((a) => a.site_id === s.id)?.full_name ?? 'No AP assigned',
      }))
    )
    setIsLoading(false)
  }

  function handleArchive(id: string, name: string) {
    Alert.alert('Archive Site', `Archive ${name}? It will be hidden from active lists.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('sites').update({ is_archived: true }).eq('id', id)
          if (error) {
            Alert.alert('Error', error.message)
          } else {
            setSites((prev) => prev.filter((s) => s.id !== id))
          }
        },
      },
    ])
  }

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Sites</Text>
          <Text style={styles.headerSub}>Company Admin</Text>
        </View>
        <TouchableOpacity onPress={signOut} style={styles.signOutBtn}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.toolbar}>
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/(company-admin)/sites/add')}>
          <Text style={styles.addBtnText}>+ Add Site</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.archivedBtn} onPress={() => router.push('/(company-admin)/sites/archived')}>
          <Text style={styles.archivedBtnText}>View Archived</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: Spacing.xl }} color={Colors.accent} />
      ) : (
        <FlatList
          data={sites}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState title="No sites yet" message="Add your first site to get started." icon="🏗️" />}
          renderItem={({ item }) => (
            <ListCard
              title={item.name}
              subtitle={item.address}
              meta={`AP: ${item.appointedPersonName}`}
              onPress={() => router.push(`/(company-admin)/sites/${item.id}`)}
              actions={[
                { label: 'Edit', onPress: () => router.push(`/(company-admin)/sites/${item.id}/edit`) },
                { label: 'Archive', variant: 'danger', onPress: () => handleArchive(item.id, item.name) },
              ]}
            />
          )}
        />
      )}
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  headerTitle: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.textInverse,
  },
  headerSub: {
    fontSize: FontSize.xs,
    color: Colors.textInverse,
    opacity: 0.6,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  signOutBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.textInverse,
    opacity: 0.7,
  },
  signOutText: {
    color: Colors.textInverse,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
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
  list: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xl,
  },
})
