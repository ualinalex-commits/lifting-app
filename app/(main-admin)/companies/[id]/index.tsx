import { useState, useCallback } from 'react'
import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { ListCard } from '@/components/list-card'
import { SectionHeader } from '@/components/section-header'
import { EmptyState } from '@/components/empty-state'
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme'
import { supabase } from '@/lib/supabase'

export default function CompanyDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()

  const [company, setCompany] = useState<any>(null)
  const [admin, setAdmin] = useState<any>(null)
  const [sites, setSites] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useFocusEffect(
    useCallback(() => {
      fetchData()
    }, [id])
  )

  async function fetchData() {
    setIsLoading(true)
    const [{ data: companyData }, { data: adminData }, { data: sitesData }] = await Promise.all([
      supabase.from('companies').select('id, name, contact_email, contact_phone, address').eq('id', id).single(),
      supabase.from('profiles').select('id, full_name, email, phone').eq('company_id', id).eq('role', 'company_admin').eq('is_archived', false).maybeSingle(),
      supabase.from('sites').select('id, name, address').eq('company_id', id).eq('is_archived', false).order('name'),
    ])

    const siteIds = (sitesData ?? []).map((s: any) => s.id)
    let aps: any[] = []
    if (siteIds.length > 0) {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, site_id')
        .in('site_id', siteIds)
        .eq('role', 'appointed_person')
        .eq('is_archived', false)
      aps = data ?? []
    }

    setCompany(companyData)
    setAdmin(adminData ?? null)
    setSites(
      (sitesData ?? []).map((s: any) => ({
        ...s,
        appointedPersonName: aps.find((a) => a.site_id === s.id)?.full_name ?? 'No AP assigned',
      }))
    )
    setIsLoading(false)
  }

  async function handleArchiveAdmin() {
    if (!admin) return
    Alert.alert('Archive Admin', `Archive ${admin.full_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('profiles').update({ is_archived: true }).eq('id', admin.id)
          if (error) {
            Alert.alert('Error', error.message)
          } else {
            fetchData()
          }
        },
      },
    ])
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
      <ScrollView contentContainerStyle={styles.scroll}>
        {company && (
          <View style={styles.infoCard}>
            <Text style={styles.companyName}>{company.name}</Text>
            {company.contact_email ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Email</Text>
                <Text style={styles.infoValue}>{company.contact_email}</Text>
              </View>
            ) : null}
            {company.contact_phone ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Phone</Text>
                <Text style={styles.infoValue}>{company.contact_phone}</Text>
              </View>
            ) : null}
            {company.address ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Address</Text>
                <Text style={styles.infoValue}>{company.address}</Text>
              </View>
            ) : null}
          </View>
        )}

        <SectionHeader
          title="Company Admin"
          action={{
            label: admin ? 'Edit' : 'Add',
            onPress: () =>
              router.push({
                pathname: '/(main-admin)/companies/[id]/company-admin',
                params: { id, ...(admin ? { adminId: admin.id } : {}) },
              }),
          }}
        />
        {admin ? (
          <View style={styles.padH}>
            <ListCard
              title={admin.full_name}
              subtitle={admin.email}
              meta={admin.phone}
              actions={[
                {
                  label: 'Edit',
                  onPress: () =>
                    router.push({
                      pathname: '/(main-admin)/companies/[id]/company-admin',
                      params: { id, adminId: admin.id },
                    }),
                },
                { label: 'Archive', variant: 'danger', onPress: handleArchiveAdmin },
              ]}
            />
          </View>
        ) : (
          <EmptyState title="No company admin assigned" icon="👤" />
        )}

        <SectionHeader
          title="Sites"
          count={sites.length}
          action={{ label: 'View Archived', onPress: () => router.push('/(main-admin)/companies/archived') }}
        />
        <View style={styles.padH}>
          {sites.length === 0 ? (
            <EmptyState title="No sites" icon="🏗️" />
          ) : (
            sites.map((site) => (
              <ListCard
                key={site.id}
                title={site.name}
                subtitle={`AP: ${site.appointedPersonName}`}
                onPress={() => router.push(`/(main-admin)/companies/${id}/sites/${site.id}`)}
              />
            ))
          )}
        </View>
      </ScrollView>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  scroll: {
    paddingBottom: Spacing.xxl,
  },
  infoCard: {
    backgroundColor: Colors.surface,
    margin: Spacing.md,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  companyName: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    paddingVertical: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  infoLabel: {
    width: 72,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  infoValue: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.text,
  },
  padH: {
    paddingHorizontal: Spacing.md,
  },
})
