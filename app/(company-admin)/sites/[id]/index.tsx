import { useState, useCallback } from 'react'
import { View, Text, ScrollView, Alert, StyleSheet, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { ListCard } from '@/components/list-card'
import { SectionHeader } from '@/components/section-header'
import { EmptyState } from '@/components/empty-state'
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme'
import { supabase } from '@/lib/supabase'

const ROLE_LABELS: Record<string, string> = {
  crane_supervisor: 'Crane Supervisors',
  crane_operator: 'Crane Operators',
  slinger_signaller: 'Slingers / Signallers',
  subcontractor_admin: 'Subcontractor Admins',
}

const ROLE_ORDER = ['crane_supervisor', 'crane_operator', 'slinger_signaller', 'subcontractor_admin']

export default function SiteDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()

  const [site, setSite] = useState<any>(null)
  const [ap, setAp] = useState<any>(null)
  const [operatives, setOperatives] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useFocusEffect(
    useCallback(() => {
      fetchData()
    }, [id])
  )

  async function fetchData() {
    setIsLoading(true)
    const [{ data: siteData }, { data: apData }, { data: opData }] = await Promise.all([
      supabase.from('sites').select('id, name, address').eq('id', id).single(),
      supabase
        .from('profiles')
        .select('id, full_name, email, phone')
        .eq('site_id', id)
        .eq('role', 'appointed_person')
        .eq('is_archived', false)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('id, full_name, email, phone, role')
        .eq('site_id', id)
        .in('role', ['crane_supervisor', 'crane_operator', 'slinger_signaller', 'subcontractor_admin'])
        .eq('is_archived', false)
        .order('full_name'),
    ])
    setSite(siteData)
    setAp(apData ?? null)
    setOperatives(opData ?? [])
    setIsLoading(false)
  }

  async function handleArchiveAp() {
    if (!ap) return
    Alert.alert('Archive Appointed Person', `Archive ${ap.full_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase
            .from('profiles')
            .update({ is_archived: true })
            .eq('id', ap.id)
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

  const grouped = ROLE_ORDER.reduce<Record<string, any[]>>((acc, role) => {
    acc[role] = operatives.filter((op) => op.role === role)
    return acc
  }, {})

  return (
    <ScreenWrapper edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {site && (
          <View style={styles.infoCard}>
            <Text style={styles.siteName}>{site.name}</Text>
            {site.address ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Address</Text>
                <Text style={styles.infoValue}>{site.address}</Text>
              </View>
            ) : null}
          </View>
        )}

        <SectionHeader
          title="Appointed Person"
          action={{
            label: ap ? 'Edit' : 'Add',
            onPress: () =>
              router.push({
                pathname: '/(company-admin)/sites/[id]/appointed-person',
                params: { id, ...(ap ? { apId: ap.id } : {}) },
              }),
          }}
        />
        <View style={styles.padH}>
          {ap ? (
            <ListCard
              title={ap.full_name}
              subtitle={ap.email}
              meta={ap.phone}
              actions={[
                {
                  label: 'Edit',
                  onPress: () =>
                    router.push({
                      pathname: '/(company-admin)/sites/[id]/appointed-person',
                      params: { id, apId: ap.id },
                    }),
                },
                { label: 'Archive', variant: 'danger', onPress: handleArchiveAp },
              ]}
            />
          ) : (
            <EmptyState title="No appointed person assigned" icon="👤" />
          )}
        </View>

        <SectionHeader
          title="Operatives"
          count={operatives.length}
          action={{
            label: 'View Archived',
            onPress: () => router.push(`/(company-admin)/sites/${id}/archived-operatives`),
          }}
        />

        {ROLE_ORDER.map((role) => {
          const ops = grouped[role]
          if (ops.length === 0) return null
          return (
            <View key={role}>
              <View style={styles.roleHeader}>
                <Text style={styles.roleLabel}>{ROLE_LABELS[role]}</Text>
              </View>
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
  infoCard: {
    backgroundColor: Colors.surface,
    margin: Spacing.md,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  siteName: {
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
