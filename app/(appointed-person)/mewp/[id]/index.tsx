import React, { useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, Linking, Platform, useWindowDimensions, Modal,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useFocusEffect } from 'expo-router'
import { Image } from 'expo-image'
import { MaterialIcons } from '@expo/vector-icons'
import * as DocumentPicker from 'expo-document-picker'
import DateTimePicker from '@react-native-community/datetimepicker'
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

interface PickedFile {
  uri: string
  name: string
  mimeType: string
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

function formatDateInput(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
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
  const { width } = useWindowDimensions()
  const isDesktop = Platform.OS === 'web' && width >= 768

  const [mewp, setMewp] = useState<MewpDetail | null>(null)
  const [history, setHistory] = useState<LocationEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isArchiving, setIsArchiving] = useState(false)

  // Cert upload state
  const [showCertUpload, setShowCertUpload] = useState(false)
  const [certFile, setCertFile] = useState<PickedFile | null>(null)
  const [certExpiryStr, setCertExpiryStr] = useState('')
  const [isUploadingCert, setIsUploadingCert] = useState(false)
  const [showCertDatePicker, setShowCertDatePicker] = useState(false)

  // Sticker upload state
  const [showStickerUpload, setShowStickerUpload] = useState(false)
  const [stickerFile, setStickerFile] = useState<PickedFile | null>(null)
  const [isUploadingSticker, setIsUploadingSticker] = useState(false)

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
            console.log('[MEWP Archive] mewp.id:', mewp.id, 'role:', profile?.role, 'site_id:', profile?.site_id)
            const { data, error } = await supabase
              .from('mewps')
              .update({ is_archived: true })
              .eq('id', mewp.id)
              .select()
            setIsArchiving(false)
            if (error) {
              console.error('[MEWP Archive] Supabase error:', JSON.stringify(error))
              Alert.alert('Archive Failed', `${error.message}\nCode: ${error.code}\nDetails: ${error.details ?? '—'}`)
            } else if (!data || data.length === 0) {
              console.warn('[MEWP Archive] Zero rows updated — RLS may be blocking UPDATE. role:', profile?.role, 'site_id:', profile?.site_id)
              Alert.alert('Archive Failed', 'No rows were updated. The RLS policy may not allow this role to UPDATE mewps — check Supabase policies for appointed_person.')
            } else {
              console.log('[MEWP Archive] Success:', JSON.stringify(data))
              router.back()
            }
          },
        },
      ]
    )
  }

  async function pickCertFile() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/jpeg', 'image/png'],
      copyToCacheDirectory: true,
    })
    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0]
      setCertFile({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? 'application/octet-stream' })
    }
  }

  async function handleCertUploadSubmit() {
    if (!mewp || !profile?.site_id) return
    if (!certFile && !certExpiryStr) {
      Alert.alert('Nothing to save', 'Please choose a file or set an expiry date.')
      return
    }
    setIsUploadingCert(true)
    try {
      let examUrl = mewp.thorough_exam_url
      if (certFile) {
        const ext = certFile.name.split('.').pop() ?? 'pdf'
        const path = `${profile.site_id}/${mewp.id}/${Date.now()}.${ext}`
        const response = await fetch(certFile.uri)
        const blob = await response.blob()
        const { error: uploadError } = await supabase.storage
          .from('mewp-thorough-exams')
          .upload(path, blob, { contentType: certFile.mimeType, upsert: true })
        if (uploadError) throw uploadError
        const { data: urlData } = supabase.storage.from('mewp-thorough-exams').getPublicUrl(path)
        examUrl = urlData.publicUrl
      }
      const { error: updateError } = await supabase.from('mewps').update({
        thorough_exam_url: examUrl,
        thorough_exam_expiry: certExpiryStr || null,
      }).eq('id', mewp.id)
      if (updateError) throw updateError
      setShowCertUpload(false)
      fetchData()
    } catch (err: any) {
      Alert.alert('Upload failed', err.message ?? 'Please try again.')
    } finally {
      setIsUploadingCert(false)
    }
  }

  async function pickStickerFile() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/jpeg', 'image/png'],
      copyToCacheDirectory: true,
    })
    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0]
      setStickerFile({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? 'image/jpeg' })
    }
  }

  async function handleStickerUploadSubmit() {
    if (!mewp || !stickerFile || !profile?.site_id) return
    setIsUploadingSticker(true)
    try {
      const ext = stickerFile.name.split('.').pop() ?? 'jpg'
      const path = `${profile.site_id}/${mewp.id}/sticker.${ext}`
      const response = await fetch(stickerFile.uri)
      const blob = await response.blob()
      const { error: uploadError } = await supabase.storage
        .from('mewp-stickers')
        .upload(path, blob, { contentType: stickerFile.mimeType, upsert: true })
      if (uploadError) throw uploadError
      const { data: urlData } = supabase.storage.from('mewp-stickers').getPublicUrl(path)
      const { error: updateError } = await supabase.from('mewps').update({
        sticker_url: urlData.publicUrl,
      }).eq('id', mewp.id)
      if (updateError) throw updateError
      setShowStickerUpload(false)
      fetchData()
    } catch (err: any) {
      Alert.alert('Upload failed', err.message ?? 'Please try again.')
    } finally {
      setIsUploadingSticker(false)
    }
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

  const identityCard = (
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
  )

  const detailsSection = (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Details</Text>
      <View style={styles.detailCard}>
        <DetailRow icon="business" label="Subcontractor" value={mewp.subcontractor?.name ?? 'None / Site-owned'} />
        <View style={styles.divider} />
        <DetailRow icon="place" label="Current Location" value={mewp.current_location ?? '—'} />
        <View style={styles.divider} />
        <DetailRow
          icon="event"
          label="Expiry Date"
          value={formatDate(mewp.thorough_exam_expiry)}
          valueStyle={{ color: meta.text, fontWeight: '700' }}
        />
        <View style={styles.divider} />
        <DetailRow icon="calendar-today" label="Added" value={formatDate(mewp.created_at)} />
      </View>
    </View>
  )

  const locationHistorySection = (
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
  )

  // Right-column cert section (desktop) — preview only, no expiry row (that's in detailsSection)
  const certSection = (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Certificate</Text>
      <View style={styles.detailCard}>
        {mewp.thorough_exam_url ? (
          isImageUrl(mewp.thorough_exam_url) ? (
            <Image
              source={{ uri: mewp.thorough_exam_url }}
              style={styles.desktopCertPreview}
              contentFit="contain"
            />
          ) : Platform.OS === 'web' ? (
            React.createElement('iframe', {
              src: mewp.thorough_exam_url,
              style: { width: '100%', height: 300, border: 'none', display: 'block' },
              title: 'Certificate',
            })
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
          )
        ) : (
          <View style={styles.noCertRow}>
            <MaterialIcons name="warning" size={16} color={Colors.warning} />
            <Text style={styles.noCertText}>No certificate uploaded</Text>
          </View>
        )}
        <View style={styles.divider} />
        <TouchableOpacity
          style={styles.uploadBtnRow}
          onPress={() => {
            setCertFile(null)
            setCertExpiryStr(mewp.thorough_exam_expiry ?? '')
            setShowCertUpload(true)
          }}
          activeOpacity={0.8}
        >
          <MaterialIcons name="upload-file" size={16} color={Colors.primary} />
          <Text style={styles.uploadBtnRowText}>
            {mewp.thorough_exam_url ? 'Replace Certificate' : 'Upload Certificate'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )

  const stickerSection = (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>MEWP Sticker</Text>
      <View style={styles.detailCard}>
        {mewp.sticker_url ? (
          <Image
            source={{ uri: mewp.sticker_url }}
            style={isDesktop ? styles.desktopStickerPreview : styles.stickerPreview}
            contentFit="contain"
          />
        ) : (
          <View style={styles.noCertRow}>
            <MaterialIcons name="photo" size={16} color={Colors.textMuted} />
            <Text style={styles.noCertText}>No sticker photo uploaded</Text>
          </View>
        )}
        <View style={styles.divider} />
        <TouchableOpacity
          style={styles.uploadBtnRow}
          onPress={() => {
            setStickerFile(null)
            setShowStickerUpload(true)
          }}
          activeOpacity={0.8}
        >
          <MaterialIcons name="photo-camera" size={16} color={Colors.primary} />
          <Text style={styles.uploadBtnRowText}>
            {mewp.sticker_url ? 'Replace Sticker Photo' : 'Upload Sticker Photo'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )

  return (
    <ScreenWrapper edges={['bottom']}>
      <ScrollView
        contentContainerStyle={[styles.scroll, isDesktop && styles.scrollDesktop]}
        showsVerticalScrollIndicator={false}
      >
        {isDesktop ? (
          <View style={styles.desktopWrapper}>
            <View style={styles.desktopRow}>
              {/* Left: details + location history */}
              <View style={styles.desktopLeft}>
                {identityCard}
                {detailsSection}
                {locationHistorySection}
              </View>
              {/* Right: certificate + sticker */}
              <View style={styles.desktopRight}>
                {certSection}
                {stickerSection}
              </View>
            </View>
          </View>
        ) : (
          <>
            {identityCard}
            {detailsSection}

            {/* Thorough Examination — mobile only (expiry + preview) */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Thorough Examination</Text>
              <View style={styles.detailCard}>
                {mewp.thorough_exam_url ? (
                  isImageUrl(mewp.thorough_exam_url) ? (
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
                  )
                ) : (
                  <View style={styles.noCertRow}>
                    <MaterialIcons name="warning" size={16} color={Colors.warning} />
                    <Text style={styles.noCertText}>No certificate uploaded</Text>
                  </View>
                )}
                <View style={styles.divider} />
                <TouchableOpacity
                  style={styles.uploadBtnRow}
                  onPress={() => {
                    setCertFile(null)
                    setCertExpiryStr(mewp.thorough_exam_expiry ?? '')
                    setShowCertUpload(true)
                  }}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="upload-file" size={16} color={Colors.primary} />
                  <Text style={styles.uploadBtnRowText}>
                    {mewp.thorough_exam_url ? 'Replace Certificate' : 'Upload Certificate'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {stickerSection}
            {locationHistorySection}
          </>
        )}
      </ScrollView>

      {/* Certificate upload modal */}
      <Modal
        visible={showCertUpload}
        transparent
        animationType="slide"
        onRequestClose={() => !isUploadingCert && setShowCertUpload(false)}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => !isUploadingCert && setShowCertUpload(false)}
        />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Upload Certificate</Text>
          <Text style={styles.sheetSubtitle}>{mewp.mewp_type} — {mewp.serial_number}</Text>
          {mewp.thorough_exam_url && (
            <View style={styles.sheetCurrentRow}>
              <MaterialIcons name="check-circle" size={16} color={Colors.success} />
              <Text style={styles.sheetCurrentText}>Certificate on file</Text>
            </View>
          )}
          <Text style={styles.sheetLabel}>Certificate (PDF, JPG, PNG)</Text>
          <TouchableOpacity style={styles.sheetFilePicker} onPress={pickCertFile} activeOpacity={0.8}>
            <MaterialIcons name="attach-file" size={20} color={Colors.primary} />
            <Text style={styles.sheetFilePickerText} numberOfLines={1}>
              {certFile ? certFile.name : 'Choose file or photo'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.sheetLabel}>Expiry Date</Text>
          {Platform.OS === 'web' ? (
            // @ts-ignore
            <input
              type="date"
              value={certExpiryStr}
              onChange={(e: any) => setCertExpiryStr(e.target.value)}
              style={{
                padding: 10, borderRadius: BorderRadius.sm, border: '0.5px solid #E2E8F0',
                fontSize: 14, marginBottom: Spacing.md, width: '100%', boxSizing: 'border-box',
              }}
            />
          ) : (
            <>
              <TouchableOpacity
                style={styles.sheetDateBtn}
                onPress={() => setShowCertDatePicker(true)}
                activeOpacity={0.8}
              >
                <MaterialIcons name="event" size={18} color={Colors.textSecondary} />
                <Text style={styles.sheetDateBtnText}>
                  {certExpiryStr ? formatDateInput(certExpiryStr) : 'Select expiry date'}
                </Text>
              </TouchableOpacity>
              {showCertDatePicker && (
                <DateTimePicker
                  value={certExpiryStr ? new Date(certExpiryStr + 'T00:00:00') : new Date()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(_, date) => {
                    setShowCertDatePicker(false)
                    if (date) {
                      const y = date.getFullYear()
                      const m = String(date.getMonth() + 1).padStart(2, '0')
                      const d = String(date.getDate()).padStart(2, '0')
                      setCertExpiryStr(`${y}-${m}-${d}`)
                    }
                  }}
                />
              )}
            </>
          )}
          <TouchableOpacity
            style={[styles.sheetUploadBtn, isUploadingCert && { opacity: 0.6 }]}
            onPress={handleCertUploadSubmit}
            disabled={isUploadingCert}
            activeOpacity={0.8}
          >
            {isUploadingCert ? (
              <ActivityIndicator color={Colors.textInverse} size="small" />
            ) : (
              <>
                <MaterialIcons name="cloud-upload" size={18} color={Colors.textInverse} />
                <Text style={styles.sheetUploadBtnText}>Save Certificate</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Sticker upload modal */}
      <Modal
        visible={showStickerUpload}
        transparent
        animationType="slide"
        onRequestClose={() => !isUploadingSticker && setShowStickerUpload(false)}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => !isUploadingSticker && setShowStickerUpload(false)}
        />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Upload Sticker Photo</Text>
          <Text style={styles.sheetSubtitle}>{mewp.mewp_type} — {mewp.serial_number}</Text>
          {mewp.sticker_url && (
            <View style={styles.sheetCurrentRow}>
              <MaterialIcons name="check-circle" size={16} color={Colors.success} />
              <Text style={styles.sheetCurrentText}>Sticker photo on file</Text>
            </View>
          )}
          <Text style={styles.sheetLabel}>Sticker Photo (JPG, PNG)</Text>
          <TouchableOpacity style={styles.sheetFilePicker} onPress={pickStickerFile} activeOpacity={0.8}>
            <MaterialIcons name="attach-file" size={20} color={Colors.primary} />
            <Text style={styles.sheetFilePickerText} numberOfLines={1}>
              {stickerFile ? stickerFile.name : 'Choose photo'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sheetUploadBtn, (!stickerFile || isUploadingSticker) && { opacity: 0.5 }]}
            onPress={handleStickerUploadSubmit}
            disabled={!stickerFile || isUploadingSticker}
            activeOpacity={0.8}
          >
            {isUploadingSticker ? (
              <ActivityIndicator color={Colors.textInverse} size="small" />
            ) : (
              <>
                <MaterialIcons name="cloud-upload" size={18} color={Colors.textInverse} />
                <Text style={styles.sheetUploadBtnText}>Save Sticker Photo</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </Modal>
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
  // Layout
  scroll: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  scrollDesktop: {
    padding: 0,
    paddingBottom: 0,
  },
  desktopWrapper: {
    width: '80%' as any,
    alignSelf: 'center' as any,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  desktopRow: {
    flexDirection: 'row',
    gap: Spacing.xl,
    alignItems: 'flex-start',
  },
  desktopLeft: { flex: 1 },
  desktopRight: { flex: 1 },

  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
  },

  // Identity card
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

  // Sections
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

  // Upload button row (inside card)
  uploadBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
  },
  uploadBtnRowText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: '600',
  },

  // Certificate / sticker previews
  desktopCertPreview: {
    width: '100%',
    height: 260,
    backgroundColor: Colors.background,
  },
  desktopStickerPreview: {
    width: '100%',
    height: 220,
    backgroundColor: Colors.background,
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

  // Location history timeline
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

  // Upload modal sheet
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    ...Shadow.md,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.border, alignSelf: 'center', marginBottom: Spacing.md,
  },
  sheetTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text, marginBottom: 4 },
  sheetSubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.md },
  sheetCurrentRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    marginBottom: Spacing.md, backgroundColor: '#F0FDF4',
    borderRadius: BorderRadius.sm, padding: Spacing.sm,
  },
  sheetCurrentText: { fontSize: FontSize.sm, color: Colors.success, fontWeight: '600' },
  sheetLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, marginBottom: Spacing.xs },
  sheetFilePicker: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    borderWidth: 1.5, borderColor: Colors.primary, borderRadius: BorderRadius.sm,
    borderStyle: 'dashed', padding: Spacing.md, marginBottom: Spacing.md,
  },
  sheetFilePickerText: { fontSize: FontSize.sm, color: Colors.primary, flex: 1, fontWeight: '500' },
  sheetDateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.sm,
    padding: Spacing.md, marginBottom: Spacing.md, backgroundColor: Colors.background,
  },
  sheetDateBtnText: { fontSize: FontSize.sm, color: Colors.text },
  sheetUploadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    backgroundColor: Colors.primary, borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md, marginTop: Spacing.sm,
  },
  sheetUploadBtnText: { color: Colors.textInverse, fontWeight: '700', fontSize: FontSize.base },
})
