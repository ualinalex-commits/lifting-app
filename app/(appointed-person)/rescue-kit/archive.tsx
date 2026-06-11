import { useState, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Linking, Alert, Platform,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { Breadcrumb } from '@/components/breadcrumb'
import { Colors, Spacing, FontSize, BorderRadius, Shadow } from '@/constants/theme'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

interface SignedCheckRaw {
  id: string
  kit_id: string
  version_number: number
  supervisor_name: string
  pdf_url: string
  signed_at: string
  week_start_date: string
  is_archived: boolean
  rescue_kit: {
    main_contractor: string
    project_name: string
    serial_number: string
    site_id: string
  } | null
}

interface SignedCheckItem {
  id: string
  kit_id: string
  version_number: number
  supervisor_name: string
  pdf_url: string
  signed_at: string
  week_start_date: string
  title: string
}

function formatSignedTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

export default function RescueKitArchive() {
  const { profile } = useAuth()
  const [checks, setChecks] = useState<SignedCheckItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const fetchArchive = useCallback(async () => {
    if (!profile?.site_id) return
    setIsLoading(true)
    setFetchError(null)

    const { data, error } = await supabase
      .from('rescue_kit_signed_checks')
      .select(`
        id, kit_id, version_number, supervisor_name, pdf_url, signed_at, week_start_date, is_archived,
        rescue_kit:rescue_kits(main_contractor, project_name, serial_number, site_id)
      `)
      .eq('is_archived', false)
      .order('signed_at', { ascending: false })

    if (error) {
      setFetchError(error.message)
      setIsLoading(false)
      return
    }

    const raw = (data as unknown as SignedCheckRaw[]) ?? []
    const filtered = raw.filter(c => c.rescue_kit?.site_id === profile.site_id)

    setChecks(
      filtered.map(c => ({
        id: c.id,
        kit_id: c.kit_id,
        version_number: c.version_number,
        supervisor_name: c.supervisor_name,
        pdf_url: c.pdf_url,
        signed_at: c.signed_at,
        week_start_date: c.week_start_date,
        title: `${c.rescue_kit?.main_contractor ?? ''} ${c.rescue_kit?.project_name ?? ''} Rescue Kit Checklist v${c.version_number}`,
      }))
    )
    setIsLoading(false)
  }, [profile?.site_id])

  useFocusEffect(useCallback(() => { fetchArchive() }, [fetchArchive]))

  async function handleViewPdf(check: SignedCheckItem) {
    if (!check.pdf_url) {
      Alert.alert('Not available', 'PDF not available.')
      return
    }
    const { data, error } = await supabase.storage
      .from('rescue-kit-archive')
      .createSignedUrl(check.pdf_url, 3600)

    if (error || !data?.signedUrl) {
      Alert.alert('Error', `Could not load PDF: ${error?.message ?? 'unknown'}`)
      return
    }
    if (Platform.OS === 'web') {
      window.open(data.signedUrl, '_blank')
    } else {
      Linking.openURL(data.signedUrl)
    }
  }

  async function handleDelete(check: SignedCheckItem) {
    const confirmed = Platform.OS === 'web'
      ? window.confirm(`Delete "${check.title}" from the archive?`)
      : await new Promise<boolean>(resolve => {
          Alert.alert(
            'Delete from Archive',
            `Delete "${check.title}" from the archive?`,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
            ],
          )
        })

    if (!confirmed) return

    const { error } = await supabase
      .from('rescue_kit_signed_checks')
      .update({ is_archived: true })
      .eq('id', check.id)

    if (error) {
      Alert.alert('Delete failed', error.message)
      return
    }
    console.log('[RK-ARCHIVE] Soft-deleted check:', check.id)
    fetchArchive()
  }

  return (
    <ScreenWrapper edges={['bottom']}>
      <Breadcrumb items={[
        { label: 'Dashboard', href: '/(appointed-person)/' },
        { label: 'Supervisor Checks', href: '/(appointed-person)/supervisor-checks' },
        { label: 'Rescue Kit Checklist', href: '/(appointed-person)/rescue-kit/' },
        { label: 'Archive' },
      ]} />

      {fetchError ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{fetchError}</Text>
        </View>
      ) : isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={checks}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🗂</Text>
              <Text style={styles.emptyTitle}>No archived rescue kit checks yet</Text>
              <Text style={styles.emptyMsg}>
                Signed weekly checks appear here after the appointed person or crane supervisor signs a rescue kit check.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.cardMeta}>
                Week of {new Date(item.week_start_date + 'T00:00:00Z').toLocaleDateString('en-GB', {
                  day: '2-digit', month: 'short', year: 'numeric',
                })}
                {' · '}
                Signed {formatSignedTime(item.signed_at)}
              </Text>
              <Text style={styles.cardSupervisor}>Supervisor: {item.supervisor_name}</Text>
              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={styles.viewBtn}
                  onPress={() => handleViewPdf(item)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.viewBtnText}>View PDF →</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDelete(item)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.deleteBtnText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: {
    fontSize: FontSize.sm, color: Colors.danger,
    textAlign: 'center', padding: Spacing.md,
  },
  list: { padding: Spacing.md, paddingBottom: 100, flexGrow: 1 },
  emptyContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: Spacing.xl, gap: Spacing.sm, marginTop: Spacing.xxl,
  },
  emptyIcon: { fontSize: 48, marginBottom: Spacing.sm },
  emptyTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text, textAlign: 'center' },
  emptyMsg: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadow.sm,
  },
  cardTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  cardMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: 2 },
  cardSupervisor: { fontSize: FontSize.xs, color: Colors.textSecondary, marginBottom: Spacing.sm },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  viewBtn: { alignSelf: 'flex-start' },
  viewBtnText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '600' },
  deleteBtn: { paddingHorizontal: Spacing.sm, paddingVertical: 4 },
  deleteBtnText: { fontSize: FontSize.xs, color: Colors.danger, fontWeight: '600' },
})
