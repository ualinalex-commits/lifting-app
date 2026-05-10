import { useState, useCallback } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { ListCard } from '@/components/list-card'
import { EmptyState } from '@/components/empty-state'
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

type CompanyRow = {
  id: string
  name: string
  siteCount: number
  adminName: string
}

export default function CompaniesScreen() {
  const router = useRouter()
  const { signOut } = useAuth()
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useFocusEffect(
    useCallback(() => {
      fetchCompanies()
    }, [])
  )

  async function fetchCompanies() {
    setIsLoading(true)
    const [
      { data: companiesData },
      { data: sitesData },
      { data: adminsData },
    ] = await Promise.all([
      supabase.from('companies').select('id, name').eq('is_archived', false).order('name'),
      supabase.from('sites').select('id, company_id').eq('is_archived', false),
      supabase.from('profiles').select('id, full_name, company_id').eq('role', 'company_admin').eq('is_archived', false),
    ])

    const merged: CompanyRow[] = (companiesData ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      siteCount: (sitesData ?? []).filter((s) => s.company_id === c.id).length,
      adminName: (adminsData ?? []).find((a) => a.company_id === c.id)?.full_name ?? 'No admin assigned',
    }))

    setCompanies(merged)
    setIsLoading(false)
  }

  function handleArchive(id: string, name: string) {
    Alert.alert('Archive Company', `Archive ${name}? It will be hidden from active lists.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('companies').update({ is_archived: true }).eq('id', id)
          if (error) {
            Alert.alert('Error', error.message)
          } else {
            setCompanies((prev) => prev.filter((c) => c.id !== id))
          }
        },
      },
    ])
  }

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Companies</Text>
          <Text style={styles.headerSub}>Main Admin</Text>
        </View>
        <TouchableOpacity onPress={signOut} style={styles.signOutBtn}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.toolbar}>
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/(main-admin)/companies/add')}>
          <Text style={styles.addBtnText}>+ Add Company</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.archivedBtn} onPress={() => router.push('/(main-admin)/companies/archived')}>
          <Text style={styles.archivedBtnText}>View Archived</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: Spacing.xl }} color={Colors.accent} />
      ) : (
        <FlatList
          data={companies}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState title="No companies yet" message="Add your first company to get started." icon="🏗️" />}
          renderItem={({ item }) => (
            <ListCard
              title={item.name}
              subtitle={`Admin: ${item.adminName}`}
              meta={`${item.siteCount} site${item.siteCount !== 1 ? 's' : ''}`}
              onPress={() => router.push(`/(main-admin)/companies/${item.id}`)}
              actions={[
                { label: 'Edit', onPress: () => router.push(`/(main-admin)/companies/${item.id}/edit`) },
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
