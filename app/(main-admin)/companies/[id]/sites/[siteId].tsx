import { useState, useCallback } from 'react'
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useFocusEffect } from 'expo-router'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { SectionHeader } from '@/components/section-header'
import { ListCard } from '@/components/list-card'
import { EmptyState } from '@/components/empty-state'
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme'
import { supabase } from '@/lib/supabase'

const ROLE_LABELS: Record<string, string> = {
  crane_supervisor: 'Crane Supervisor',
  crane_operator: 'Crane Operator',
  slinger_signaller: 'Slinger / Signaller',
  subcontractor_admin: 'Subcontractor Admin',
}

const ROLE_ORDER = ['crane_supervisor', 'crane_operator', 'slinger_signaller', 'subcontractor_admin']

export default function SiteDetailReadOnly() {
  const { siteId } = useLocalSearchParams<{ siteId: string }>()

  const [site, setSite] = useState<any>(null)
  const [ap, setAp] = useState<any>(null)
  const [operatives, setOperatives] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useFocusEffect(
    useCallback(() => {
      fetchData()
    }, [siteId])
  )

  async function fetchData() {
    setIsLoading(true)
    const [{ data: siteData }, { data: apData }, { data: opData }] = await Promise.all([
      supabase.from('sites').select('id, name, address').eq('id', siteId).single(),
      supabase.from('profiles').select('id, full_name, email, phone').eq('site_id', siteId).eq('role', 'appointed_person').eq('is_archived', false).maybeSingle(),
      supabase.from('profiles').select('id, full_name, email, phone, role').eq('site_id', siteId).in('role', ['crane_supervisor', 'crane_operator', 'slinger_signaller', 'subcontractor_admin']).eq('is_archived', false).order('full_name'),
    ])
    setSite(siteData)
    setAp(apData ?? null)
    setOperatives(opData ?? [])
    setIsLoading(false)
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

        <SectionHeader title="Appointed Person" />
        <View style={styles.padH}>
          {ap ? (
            <ListCard
              title={ap.full_name}
              subtitle={ap.email}
              meta={ap.phone}
            />
          ) : (
            <EmptyState title="No appointed person assigned" icon="👤" />
          )}
        </View>

        {ROLE_ORDER.map((role) => {
          const ops = grouped[role]
          if (ops.length === 0) return null
          return (
            <View key={role}>
              <SectionHeader title={ROLE_LABELS[role]} count={ops.length} />
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

        <View style={styles.readOnlyNotice}>
          <Text style={styles.readOnlyText}>Read-only view — site management is handled by the company admin and appointed person.</Text>
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
  readOnlyNotice: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.xl,
    padding: Spacing.md,
    backgroundColor: Colors.divider,
    borderRadius: BorderRadius.md,
  },
  readOnlyText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
})
