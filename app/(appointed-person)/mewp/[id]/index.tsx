import { useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, Linking,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useFocusEffect } from 'expo-router'
import { Image } from 'expo-image'
import { MaterialIcons } from '@expo/vector-icons'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { Colors, Spacing, FontSize, BorderRadius, Shadow } from '@/constants/theme'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

type MewpStatus = 'valid' | 'exp_soon' | 'no_cert'

interface MewpDetail {
  id: string
  site_id: string
  mewp_type: string
  serial_number: string
  thorough_exam_url: string | null
  thorough_exam_expiry: string | null
  current_location: string | null
  sticker_url: string | null
  is_archived: boolean
  created_at: string
  subcontractor: { id: string; name: string } | null
}

interface LocationEntry {
  id: string
  location: string
  changed_at: string
  changed_by: { full_name: string } | null
}

const STATUS_META: Record<MewpStatus, { label: string; bg: string; text: string; border: string }> = {
  valid:    { label: 'Valid',     bg: '#F0FDF4', text: '#16A34A', border: '#BBF7D0' },
  exp_soon: { label: 'Exp Soon', bg: '#FEFCE8', text: '#CA8A04', border: '#FDE68A' },
  no_cert:  { label: 'No Cert',  bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' },
}

function getMewpStatus(expiry: string | null): MewpStatus {
  if (!expiry) return 'no_cert'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expiryDate = new Date(expiry + 'T00:00:00')
  if (expiryDate < today) return 'no_cert'
  const diffDays = Math.floor((expiryDate.getTime() - today.getTime()) / 86400000)
  return diffDays <= 30 ? 'exp_soon' : 'valid'
}

function formatDate(str: string | null): string {
  if (!str) return '—'
  const d = new Date(str.includes('T') ? str : str + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateTime(str: string): string {
  return new Date(str).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function isImageUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(url)
}

export default function MewpDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { profile } = useAuth()

  const [mewp, setMewp] = useState<MewpDetail | null>(null)
  const [history, setHistory] = useState<LocationEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isArchiving, setIsArchiving] = useState(false)

  const fetchData = useCallback(async () => {
    if (!id) return
    setIsLoading(true)
    const [mewpRes, historyRes] = await Promise.all([
      supabase
        .from('mewps')
        .select('*, subcontractor:subcontractors(id, name)')
        .eq('id', id)
        .single(),
      supabase
        .from('mewp_location_history')
        .select('id, location, changed_at, changed_by:profiles(full_name)')
        .eq('mewp_id', id)
        .order('changed_at', { ascending: false }),
    ])
    if (mewpRes.data) setMewp(mewpRes.data as unknown as MewpDetail)
    if (historyRes.data) setHistory(historyRes.data as unknown as LocationEntry[])
    setIsLoading(false)
  }, [id])

  useFocusEffect(useCallback(() => { fetchData() }, [fetchData]))

  function handleArchive() {
    if (!mewp) return
    Alert.alert(
      'Archive MEWP',
      `Archive ${mewp.mewp_type} — ${mewp.serial_number}? It will be hidden from the inventory.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            setIsArchiving(true)
            const { error } = await supabase
              .from('mewps')
              .update({ is_archived: true })
              .eq('id', mewp.id)
            setIsArchiving(false)
            if (error) {
              Alert.alert('Error', error.message)
            } else {
              router.back()
            }
          },
        },
      ]
    )
  }

  if (isLoading) {
    return (
      <ScreenWrapper edges={['bottom']}>
        <ActivityIndicator style={{ marginTop: Spacing.xl }} color={Colors.primary} />
      </ScreenWrapper>
    )
  }

  if (!mewp) {
    return (
      <ScreenWrapper edges={['bottom']}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>MEWP not found.</Text>
        </View>
      </ScreenWrapper>
    )
  }

  const status = getMewpStatus(mewp.thorough_exam_expiry)
  const meta = STATUS_META[status]

  return (
    <ScreenWrapper edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Identity card */}
        <View style={styles.identityCard}>
          <View style={styles.identityRow}>
            <View style={styles.identityMain}>
              <Text style={styles.mewpType}>{mewp.mewp_type}</Text>
              <Text style={styles.serial}>{mewp.serial_number}</Text>
            </View>
            <View style={[styles.statusPill, { backgroundColor: meta.bg, borderColor: meta.border }]}>
              <Text style={[styles.statusPillText, { color: meta.text }]}>{meta.label}</Text>
            </View>
          </View>
          <View style={styles.editRow}>
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => router.push(`/(appointed-person)/mewp/${id}/edit` as any)}
              activeOpacity={0.8}
            >
              <MaterialIcons name="edit" size={16} color={Colors.primary} />
              <Text style={styles.editBtnText}>Edit MEWP</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.archiveBtn}
              onPress={handleArchive}
              disabled={isArchiving}
              activeOpacity={0.8}
            >
              {isArchiving ? (
                <ActivityIndicator size="small" color={Colors.danger} />
              ) : (
                <>
                  <MaterialIcons name="archive" size={16} color={Colors.danger} />
                  <Text style={styles.archiveBtnText}>Archive</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Details</Text>
          <View style={styles.detailCard}>
            <DetailRow icon="business" label="Subcontractor" value={mewp.subcontractor?.name ?? 'None / Site-owned'} />
            <View style={styles.divider} />
            <DetailRow icon="place" label="Current Location" value={mewp.current_location ?? '—'} />
            <View style={styles.divider} />
            <DetailRow icon="calendar-today" label="Added" value={formatDate(mewp.created_at)} />
          </View>
        </View>

        {/* Thorough Examination */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Thorough Examination</Text>
          <View style={styles.detailCard}>
            <DetailRow
              icon="event"
              label="Expiry Date"
              value={formatDate(mewp.thorough_exam_expiry)}
              valueStyle={{ color: meta.text, fontWeight: '700' }}
            />
            {mewp.thorough_exam_url ? (
              <>
                <View style={styles.divider} />
                {isImageUrl(mewp.thorough_exam_url) ? (
                  <View style={styles.imagePreviewWrap}>
                    <Text style={styles.imageLabel}>Certificate</Text>
                    <Image
                      source={{ uri: mewp.thorough_exam_url }}
                      style={styles.imagePreview}
                      contentFit="contain"
                    />
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.docLinkBtn}
                    onPress={() => Linking.openURL(mewp.thorough_exam_url!)}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name="picture-as-pdf" size={20} color={Colors.danger} />
                    <Text style={styles.docLinkText}>View Certificate (PDF)</Text>
                    <MaterialIcons name="open-in-new" size={16} color={Colors.textSecondary} />
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <>
                <View style={styles.divider} />
                <View style={styles.noCertRow}>
                  <MaterialIcons name="warning" size={16} color={Colors.warning} />
                  <Text style={styles.noCertText}>No certificate uploaded</Text>
                </View>
              </>
            )}
          </View>
        </View>

        {/* Sticker Photo */}
        {mewp.sticker_url ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>MEWP Sticker</Text>
            <View style={styles.detailCard}>
              <Image
                source={{ uri: mewp.sticker_url }}
                style={styles.stickerPreview}
                contentFit="contain"
              />
            </View>
          </View>
        ) : null}

        {/* Location History */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location History</Text>
          {history.length === 0 ? (
            <View style={styles.detailCard}>
              <Text style={styles.emptyText}>No location history recorded.</Text>
            </View>
          ) : (
            <View style={styles.timeline}>
              {history.map((entry, i) => (
                <View key={entry.id} style={styles.timelineItem}>
                  <View style={styles.timelineLeft}>
                    <View style={styles.timelineDot} />
                    {i < history.length - 1 && <View style={styles.timelineLine} />}
                  </View>
                  <View style={styles.timelineContent}>
                    <Text style={styles.timelineLocation}>{entry.location}</Text>
                    <Text style={styles.timelineMeta}>
                      {formatDateTime(entry.changed_at)}
                      {entry.changed_by ? ` · ${entry.changed_by.full_name}` : ''}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

      </ScrollView>
    </ScreenWrapper>
  )
}

function DetailRow({
  icon, label, value, valueStyle,
}: {
  icon: string
  label: string
  value: string
  valueStyle?: object
}) {
  return (
    <View style={styles.detailRow}>
      <MaterialIcons name={icon as any} size={18} color={Colors.textSecondary} style={styles.detailIcon} />
      <View style={styles.detailRowContent}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={[styles.detailValue, valueStyle]}>{value}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  scroll: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
  },
  identityCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadow.sm,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  identityMain: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  mewpType: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.text,
    lineHeight: 26,
  },
  serial: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  statusPillText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  editRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  editBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.sm,
  },
  editBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.primary,
  },
  archiveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.danger,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  archiveBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.danger,
  },
  section: {
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.xs,
    marginLeft: 2,
  },
  detailCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
  },
  detailIcon: {
    marginRight: Spacing.sm,
    marginTop: 1,
  },
  detailRowContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: '500',
  },
  divider: {
    height: 0.5,
    backgroundColor: Colors.divider,
    marginHorizontal: Spacing.md,
  },
  imagePreviewWrap: {
    padding: Spacing.md,
  },
  imageLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  imagePreview: {
    width: '100%',
    height: 200,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.background,
  },
  stickerPreview: {
    width: '100%',
    height: 160,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.background,
  },
  docLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
  },
  docLinkText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: '600',
  },
  noCertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
  },
  noCertText: {
    fontSize: FontSize.sm,
    color: Colors.warning,
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    padding: Spacing.md,
    textAlign: 'center',
  },
  timeline: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    ...Shadow.sm,
  },
  timelineItem: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  timelineLeft: {
    alignItems: 'center',
    width: 16,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.primary,
    borderWidth: 2,
    borderColor: Colors.textInverse,
    marginTop: 3,
    ...Shadow.sm,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: Colors.border,
    marginTop: 4,
    marginBottom: 4,
    minHeight: 20,
  },
  timelineContent: {
    flex: 1,
    paddingBottom: Spacing.md,
  },
  timelineLocation: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    lineHeight: 18,
  },
  timelineMeta: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 3,
  },
})
