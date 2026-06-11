import { useState, useCallback, useEffect } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  Alert, ActivityIndicator, Platform, Linking,
} from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { Breadcrumb } from '@/components/breadcrumb'
import { Colors, Spacing, FontSize, BorderRadius, Shadow } from '@/constants/theme'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

// IMPORTANT: Before using this feature:
//   1. Run supabase/rescue_kit_schema.sql in the Supabase SQL Editor.
//   2. Create storage buckets: "rescue-kit-signatures" (private, 5 MB, image/png)
//      and "rescue-kit-archive" (private, 50 MB, application/pdf).
//   3. Deploy the rescue-kit-generate-pdf Edge Function via Supabase Dashboard.

interface RescueKit {
  id: string
  main_contractor: string
  project_name: string
  serial_number: string
  last_signed_week_start: string | null
  last_version_number: number
  is_deleted: boolean
  created_at: string
}

interface SignedCheck {
  id: string
  kit_id: string
  version_number: number
  supervisor_name: string
  pdf_url: string
  signed_at: string
  week_start_date: string
}

interface ArchivePreviewRaw {
  id: string
  kit_id: string
  version_number: number
  supervisor_name: string
  pdf_url: string
  signed_at: string
  week_start_date: string
  rescue_kit: {
    main_contractor: string
    project_name: string
    serial_number: string
  } | null
}

interface ArchivePreviewItem {
  id: string
  kit_id: string
  version_number: number
  supervisor_name: string
  pdf_url: string
  signed_at: string
  week_start_date: string
  kitTitle: string
}

function getThisWeekMonday(): string {
  const now = new Date()
  const dow = now.getDay()
  const diff = (dow + 6) % 7
  const monday = new Date(now)
  monday.setDate(now.getDate() - diff)
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
}

function isPendingThisWeek(kit: RescueKit): boolean {
  const thisMonday = getThisWeekMonday()
  return !kit.last_signed_week_start || kit.last_signed_week_start < thisMonday
}

function kitTitle(kit: RescueKit): string {
  return `${kit.main_contractor} ${kit.project_name} - ${kit.serial_number}`
}

function formatSignedTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

export default function RescueKitHome() {
  const router = useRouter()
  const { profile } = useAuth()

  const [kits, setKits] = useState<RescueKit[]>([])
  const [signedChecksThisWeek, setSignedChecksThisWeek] = useState<SignedCheck[]>([])
  const [archivePreview, setArchivePreview] = useState<ArchivePreviewItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)

  const fetchData = useCallback(async () => {
    if (!profile?.site_id) { setIsLoading(false); return }
    setIsLoading(true)
    setFetchError(null)
    setActiveMenuId(null)
    setMenuPos(null)

    const { data: kitData, error: kitError } = await supabase
      .from('rescue_kits')
      .select('id, main_contractor, project_name, serial_number, last_signed_week_start, last_version_number, is_deleted, created_at')
      .eq('site_id', profile.site_id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })

    if (kitError) {
      setFetchError(kitError.message)
      setIsLoading(false)
      return
    }

    const allKits = (kitData as RescueKit[]) ?? []
    setKits(allKits)

    // Fetch signed checks for this week (for signed-this-week sub-area metadata)
    const thisMonday = getThisWeekMonday()
    if (allKits.length > 0) {
      const allKitIds = allKits.map(k => k.id)
      const { data: thisWeekData } = await supabase
        .from('rescue_kit_signed_checks')
        .select('id, kit_id, version_number, supervisor_name, pdf_url, signed_at, week_start_date')
        .in('kit_id', allKitIds)
        .gte('week_start_date', thisMonday)
        .order('signed_at', { ascending: false })
      setSignedChecksThisWeek((thisWeekData as SignedCheck[]) ?? [])
    } else {
      setSignedChecksThisWeek([])
    }

    // Fetch archive preview — latest 5 signed checks for this site (with kit title)
    const { data: archiveData } = await supabase
      .from('rescue_kit_signed_checks')
      .select(`
        id, kit_id, version_number, supervisor_name, pdf_url, signed_at, week_start_date,
        rescue_kit:rescue_kits(main_contractor, project_name, serial_number)
      `)
      .eq('is_archived', false)
      .order('signed_at', { ascending: false })
      .limit(5)

    setArchivePreview(
      ((archiveData ?? []) as unknown as ArchivePreviewRaw[]).map(c => ({
        id: c.id,
        kit_id: c.kit_id,
        version_number: c.version_number,
        supervisor_name: c.supervisor_name,
        pdf_url: c.pdf_url,
        signed_at: c.signed_at,
        week_start_date: c.week_start_date,
        kitTitle: `${c.rescue_kit?.main_contractor ?? ''} ${c.rescue_kit?.project_name ?? ''} - ${c.rescue_kit?.serial_number ?? ''}`.trim(),
      }))
    )

    setIsLoading(false)
  }, [profile?.site_id])

  useFocusEffect(useCallback(() => { fetchData() }, [fetchData]))

  async function handleViewPdf(pdfUrl: string | null) {
    if (!pdfUrl) {
      Alert.alert('Not available', 'PDF not generated yet.')
      return
    }
    const { data, error } = await supabase.storage
      .from('rescue-kit-archive')
      .createSignedUrl(pdfUrl, 3600)

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

  function openMenu(e: any, kitId: string) {
    e?.stopPropagation?.()
    e?.preventDefault?.()
    if (activeMenuId === kitId) {
      setActiveMenuId(null)
      setMenuPos(null)
      return
    }
    if (Platform.OS === 'web') {
      const btn = e.currentTarget as HTMLElement
      const rect = btn.getBoundingClientRect()
      const dropdownHeight = 88
      const spaceBelow = window.innerHeight - rect.bottom
      const top = spaceBelow > dropdownHeight ? rect.bottom + 4 : rect.top - dropdownHeight - 4
      setMenuPos({ top, right: window.innerWidth - rect.right })
    }
    setActiveMenuId(kitId)
  }

  useEffect(() => {
    if (!activeMenuId || Platform.OS !== 'web') return
    function handleClickOutside() {
      setActiveMenuId(null)
      setMenuPos(null)
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [activeMenuId])

  function handleEdit(kit: RescueKit) {
    setActiveMenuId(null)
    setMenuPos(null)
    router.push(`/(appointed-person)/rescue-kit/add?kit_id=${kit.id}` as any)
  }

  async function handleDelete(kit: RescueKit) {
    setActiveMenuId(null)
    setMenuPos(null)
    const confirmed = Platform.OS === 'web'
      ? window.confirm(`Delete "${kitTitle(kit)}"? This cannot be undone.`)
      : await new Promise<boolean>(resolve => {
          Alert.alert(
            'Delete Rescue Kit',
            `Delete "${kitTitle(kit)}"?`,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
            ],
          )
        })

    if (!confirmed) return

    const { error } = await supabase
      .from('rescue_kits')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('id', kit.id)

    if (error) {
      Alert.alert('Delete failed', error.message)
      return
    }
    console.log('[RESCUE-KIT] Deleted kit:', kit.id)
    fetchData()
  }

  const pendingKits = kits.filter(isPendingThisWeek)
  const signedKits = kits.filter(k => !isPendingThisWeek(k))

  function getSignedCheckThisWeek(kit: RescueKit): SignedCheck | undefined {
    return signedChecksThisWeek.find(c => c.kit_id === kit.id)
  }

  function renderKitMenu(kit: RescueKit, index: number, totalCount: number) {
    const isOpen = activeMenuId === kit.id
    const isNearBottom = index >= totalCount - 2

    const webDropdownStyle = menuPos ? {
      position: 'fixed' as any,
      top: menuPos.top,
      right: menuPos.right,
      zIndex: 9999,
      backgroundColor: Colors.surface,
      borderRadius: BorderRadius.sm,
      borderWidth: 1,
      borderColor: Colors.border,
      minWidth: 120,
      ...Shadow.md,
    } : null

    return (
      <>
        <TouchableOpacity
          style={styles.menuBtn}
          onPress={(e: any) => openMenu(e, kit.id)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.menuBtnText}>⋮</Text>
        </TouchableOpacity>

        {isOpen && (Platform.OS !== 'web' || menuPos) && (
          <View
            style={Platform.OS === 'web'
              ? webDropdownStyle!
              : [styles.dropdownMenu, isNearBottom ? styles.dropdownMenuAbove : styles.dropdownMenuBelow]}
            {...(Platform.OS === 'web' ? { onClick: (e: any) => e.stopPropagation() } : {})}
          >
            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={(e: any) => {
                e?.stopPropagation?.()
                e?.preventDefault?.()
                setActiveMenuId(null)
                setMenuPos(null)
                handleEdit(kit)
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.dropdownItemText}>Edit</Text>
            </TouchableOpacity>
            <View style={styles.dropdownDivider} />
            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={(e: any) => {
                e?.stopPropagation?.()
                e?.preventDefault?.()
                setActiveMenuId(null)
                setMenuPos(null)
                handleDelete(kit)
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.dropdownItemText, styles.dropdownItemDanger]}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
      </>
    )
  }

  return (
    <ScreenWrapper edges={['bottom']}>
      <Breadcrumb items={[
        { label: 'Dashboard', href: '/(appointed-person)/' },
        { label: 'Supervisor Checks', href: '/(appointed-person)/supervisor-checks' },
        { label: 'Rescue Kit Checklist' },
      ]} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        onScrollBeginDrag={() => { setActiveMenuId(null); setMenuPos(null) }}
      >
        <Text style={styles.pageTitle}>Rescue Kit Checklist</Text>
        <Text style={styles.pageDesc}>
          Weekly per-site tower crane rescue kit verification. Each kit must be checked and signed every week.
        </Text>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : fetchError ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>Error loading kits: {fetchError}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={fetchData}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* ── Pending Check this week ── */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Pending Check this week</Text>
                <TouchableOpacity
                  style={styles.addBtn}
                  onPress={() => {
                    setActiveMenuId(null)
                    router.push('/(appointed-person)/rescue-kit/add' as any)
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.addBtnText}>+ Add</Text>
                </TouchableOpacity>
              </View>

              {kits.length === 0 ? (
                <Text style={styles.emptyText}>
                  No rescue kits added yet. Tap Add to create the first one.
                </Text>
              ) : (
                <>
                  {/* Kits awaiting check this week */}
                  {pendingKits.length === 0 ? (
                    <Text style={styles.emptyText}>All rescue kits have been checked this week.</Text>
                  ) : (
                    pendingKits.map((kit, index) => (
                      <View key={kit.id} style={styles.kitRow}>
                        <TouchableOpacity
                          style={styles.kitRowMain}
                          onPress={() => {
                            setActiveMenuId(null)
                            setMenuPos(null)
                            router.push(`/(appointed-person)/rescue-kit/detail?kit_id=${kit.id}` as any)
                          }}
                          activeOpacity={0.7}
                        >
                          <View style={styles.kitIcon}>
                            <Text style={styles.kitIconText}>🧰</Text>
                          </View>
                          <View style={styles.kitInfo}>
                            <Text style={styles.kitTitle} numberOfLines={2}>{kitTitle(kit)}</Text>
                            <Text style={styles.kitMeta}>
                              {kit.last_version_number > 0 ? `v${kit.last_version_number} last check` : 'Never checked'}
                            </Text>
                          </View>
                        </TouchableOpacity>
                        {renderKitMenu(kit, index, pendingKits.length)}
                      </View>
                    ))
                  )}

                  {/* Kits already signed this week */}
                  {signedKits.length > 0 && (
                    <>
                      <View style={styles.signedSubheader}>
                        <Text style={styles.signedSubheaderText}>✓ Signed this week</Text>
                      </View>
                      {signedKits.map((kit, index) => {
                        const check = getSignedCheckThisWeek(kit)
                        return (
                          <View key={kit.id} style={[styles.kitRow, styles.kitRowSigned]}>
                            <TouchableOpacity
                              style={styles.kitRowMain}
                              onPress={() => {
                                setActiveMenuId(null)
                                setMenuPos(null)
                                if (check) {
                                  handleViewPdf(check.pdf_url)
                                } else {
                                  router.push(`/(appointed-person)/rescue-kit/detail?kit_id=${kit.id}` as any)
                                }
                              }}
                              activeOpacity={0.7}
                            >
                              <View style={[styles.kitIcon, styles.kitIconSigned]}>
                                <Text style={styles.kitIconText}>✅</Text>
                              </View>
                              <View style={styles.kitInfo}>
                                <Text style={styles.kitTitle} numberOfLines={2}>{kitTitle(kit)}</Text>
                                {check ? (
                                  <Text style={styles.kitMeta}>
                                    Signed {formatSignedTime(check.signed_at)} · {check.supervisor_name}
                                  </Text>
                                ) : (
                                  <Text style={styles.kitMeta}>v{kit.last_version_number} signed</Text>
                                )}
                              </View>
                              <View style={styles.signedBadge}>
                                <Text style={styles.signedBadgeText}>✓ Signed</Text>
                              </View>
                            </TouchableOpacity>
                            {renderKitMenu(kit, index, signedKits.length)}
                          </View>
                        )
                      })}
                    </>
                  )}
                </>
              )}
            </View>

            {/* ── Archive ── */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Archive</Text>
                <TouchableOpacity
                  onPress={() => router.push('/(appointed-person)/rescue-kit/archive' as any)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.viewAllLink}>View All →</Text>
                </TouchableOpacity>
              </View>

              {archivePreview.length === 0 ? (
                <Text style={styles.archiveDesc}>
                  All signed weekly check PDFs are stored in the archive.
                </Text>
              ) : (
                archivePreview.map(item => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.archivePreviewRow}
                    onPress={() => handleViewPdf(item.pdf_url)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.kitInfo}>
                      <Text style={styles.kitTitle} numberOfLines={1}>{item.kitTitle}</Text>
                      <Text style={styles.kitMeta}>
                        Signed {formatSignedTime(item.signed_at)} · {item.supervisor_name}
                      </Text>
                    </View>
                    <View style={styles.signedBadge}>
                      <Text style={styles.signedBadgeText}>✓ Signed</Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  pageTitle: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.text, marginBottom: 2 },
  pageDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20, marginBottom: Spacing.md },
  loadingContainer: { paddingTop: Spacing.xxl, alignItems: 'center' },
  errorContainer: { alignItems: 'center', paddingTop: Spacing.lg, gap: Spacing.sm },
  errorText: { fontSize: FontSize.sm, color: Colors.danger, textAlign: 'center' },
  retryBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.primary + '15',
    borderRadius: BorderRadius.sm,
  },
  retryBtnText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '600' },
  sectionCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    ...Shadow.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  sectionTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text },
  addBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
  },
  addBtnText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textInverse },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    padding: Spacing.md,
    lineHeight: 20,
  },
  // Pending kit row
  kitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    position: 'relative',
  },
  kitRowSigned: {
    backgroundColor: Colors.success + '08',
  },
  kitRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  kitIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: Colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  kitIconSigned: {
    backgroundColor: Colors.success + '12',
  },
  kitIconText: { fontSize: 20 },
  kitInfo: { flex: 1 },
  kitTitle: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, lineHeight: 18 },
  kitMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  menuBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 40,
  },
  menuBtnText: { fontSize: 20, color: Colors.textMuted, lineHeight: 24 },
  dropdownMenu: {
    position: 'absolute',
    right: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    zIndex: 9999,
    minWidth: 120,
    ...Shadow.md,
  },
  dropdownMenuBelow: { top: 40 },
  dropdownMenuAbove: { bottom: 40 },
  dropdownItem: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  dropdownItemText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  dropdownItemDanger: { color: Colors.danger },
  dropdownDivider: { height: 1, backgroundColor: Colors.border },
  // Signed sub-header divider within Pending section
  signedSubheader: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.success + '0A',
  },
  signedSubheaderText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.success,
    letterSpacing: 0.3,
  },
  signedBadge: {
    backgroundColor: Colors.success + '15',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.success + '40',
    flexShrink: 0,
    marginRight: Spacing.xs,
  },
  signedBadgeText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.success },
  // Archive preview
  archiveDesc: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    padding: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  archivePreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  viewAllLink: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.primary },
})
