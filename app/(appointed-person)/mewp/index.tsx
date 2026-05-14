import React, { useState, useCallback, useEffect } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  Modal, StyleSheet, Alert, ActivityIndicator, Platform,
  useWindowDimensions, Linking,
} from 'react-native'
import { useRouter, useFocusEffect, Stack } from 'expo-router'
import * as DocumentPicker from 'expo-document-picker'
import DateTimePicker from '@react-native-community/datetimepicker'
import { Image } from 'expo-image'
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons'
import { ScreenWrapper } from '@/components/screen-wrapper'
import { Colors, Spacing, FontSize, BorderRadius, Shadow } from '@/constants/theme'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

type MewpStatus = 'valid' | 'exp_soon' | 'no_cert'

interface Mewp {
  id: string
  mewp_type: string
  serial_number: string
  subcontractor_id: string | null
  thorough_exam_url: string | null
  thorough_exam_expiry: string | null
  current_location: string | null
  sticker_url: string | null
  created_at: string
  subcontractor: { id: string; name: string } | null
}

interface PickedFile {
  uri: string
  name: string
  mimeType: string
}

type FilterType = 'all' | 'valid' | 'exp_soon' | 'no_cert'

const PAGE_SIZE = 10

const COL = {
  num: 40, type: 130, serial: 120, sub: 130,
  expiry: 100, location: 110, status: 100, actions: 164,
}

const TABLE_TOTAL_WIDTH =
  COL.num + COL.type + COL.serial + COL.sub + COL.expiry + COL.location + COL.status + COL.actions

const STATUS_META: Record<MewpStatus, { label: string; bg: string; text: string; border: string }> = {
  valid:    { label: 'Valid',     bg: '#F0FDF4', text: '#16A34A', border: '#BBF7D0' },
  exp_soon: { label: 'Exp Soon', bg: '#FEFCE8', text: '#CA8A04', border: '#FDE68A' },
  no_cert:  { label: 'No Cert',  bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' },
}

function isPdf(url: string): boolean {
  return url.toLowerCase().includes('.pdf')
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

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateInput(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function MewpInventory() {
  const router = useRouter()
  const { profile, signOut } = useAuth()
  const { width: windowWidth, height: windowHeight } = useWindowDimensions()

  const [mewps, setMewps] = useState<Mewp[]>([])
  const [archivedMewps, setArchivedMewps] = useState<Mewp[]>([])
  const [siteName, setSiteName] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingArchived, setIsLoadingArchived] = useState(false)

  const [filter, setFilter] = useState<FilterType>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLabel, setPreviewLabel] = useState('')
  const [uploadTarget, setUploadTarget] = useState<Mewp | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const [uploadFile, setUploadFile] = useState<PickedFile | null>(null)
  const [uploadExpiryStr, setUploadExpiryStr] = useState('')
  const [showUploadDatePicker, setShowUploadDatePicker] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  useEffect(() => {
    if (!profile?.site_id) return
    supabase
      .from('sites')
      .select('name')
      .eq('id', profile.site_id)
      .single()
      .then(({ data }) => { if (data) setSiteName(data.name) })
  }, [profile?.site_id])

  const fetchMewps = useCallback(async () => {
    if (!profile?.site_id) return
    setIsLoading(true)
    const { data, error } = await supabase
      .from('mewps')
      .select('*, subcontractor:subcontractors(id, name)')
      .eq('site_id', profile.site_id)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
    if (error) Alert.alert('Error', error.message)
    else setMewps((data ?? []) as Mewp[])
    setIsLoading(false)
  }, [profile?.site_id])

  useFocusEffect(useCallback(() => { fetchMewps() }, [fetchMewps]))

  async function fetchArchivedMewps() {
    if (!profile?.site_id) return
    setIsLoadingArchived(true)
    const { data, error } = await supabase
      .from('mewps')
      .select('*, subcontractor:subcontractors(id, name)')
      .eq('site_id', profile.site_id)
      .eq('is_archived', true)
      .order('created_at', { ascending: false })
    if (error) Alert.alert('Error', error.message)
    else setArchivedMewps((data ?? []) as Mewp[])
    setIsLoadingArchived(false)
  }

  const filtered = mewps.filter((m) => {
    const status = getMewpStatus(m.thorough_exam_expiry)
    if (filter !== 'all' && status !== filter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return (
        m.mewp_type.toLowerCase().includes(q) ||
        m.serial_number.toLowerCase().includes(q) ||
        (m.subcontractor?.name.toLowerCase().includes(q) ?? false) ||
        (m.current_location?.toLowerCase().includes(q) ?? false)
      )
    }
    return true
  })

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const displayed = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const counts = {
    total:    mewps.length,
    valid:    mewps.filter(m => getMewpStatus(m.thorough_exam_expiry) === 'valid').length,
    exp_soon: mewps.filter(m => getMewpStatus(m.thorough_exam_expiry) === 'exp_soon').length,
    no_cert:  mewps.filter(m => getMewpStatus(m.thorough_exam_expiry) === 'no_cert').length,
  }

  function applyFilter(f: FilterType) { setFilter(f); setPage(0) }

  function openUploadSheet(mewp: Mewp) {
    setUploadTarget(mewp)
    setUploadFile(null)
    setUploadExpiryStr(mewp.thorough_exam_expiry ?? '')
    setShowUploadDatePicker(false)
  }

  function handlePreviewPress(url: string, label: string) {
    if (Platform.OS !== 'web' && isPdf(url)) {
      Linking.openURL(url)
      return
    }
    setPreviewUrl(url)
    setPreviewLabel(label)
  }

  function closePreview() { setPreviewUrl(null); setPreviewLabel('') }

  function handleArchive(mewp: Mewp) {
    Alert.alert(
      'Archive MEWP',
      `Archive ${mewp.mewp_type} (${mewp.serial_number})?\n\nIt will be hidden from the active list but can be restored.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive', style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('mewps').update({ is_archived: true }).eq('id', mewp.id)
            if (error) Alert.alert('Error', error.message)
            else fetchMewps()
          },
        },
      ]
    )
  }

  function handleDelete(mewp: Mewp) {
    Alert.alert(
      'Delete MEWP',
      `Permanently delete ${mewp.mewp_type} (${mewp.serial_number})?\n\nThis cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('mewps').delete().eq('id', mewp.id)
            if (error) Alert.alert('Error', error.message)
            else fetchMewps()
          },
        },
      ]
    )
  }

  async function handleRestore(mewp: Mewp) {
    const { error } = await supabase.from('mewps').update({ is_archived: false }).eq('id', mewp.id)
    if (error) { Alert.alert('Error', error.message); return }
    setArchivedMewps(prev => prev.filter(m => m.id !== mewp.id))
    fetchMewps()
  }

  async function pickExamFile() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/jpeg', 'image/png'],
      copyToCacheDirectory: true,
    })
    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0]
      setUploadFile({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? 'application/octet-stream' })
    }
  }

  async function handleUploadSubmit() {
    if (!uploadTarget || !profile?.site_id) return
    if (!uploadFile && !uploadExpiryStr) {
      Alert.alert('Nothing to save', 'Please choose a file or set an expiry date.')
      return
    }
    setIsUploading(true)
    try {
      let examUrl = uploadTarget.thorough_exam_url
      if (uploadFile) {
        const ext = uploadFile.name.split('.').pop() ?? 'pdf'
        const path = `${profile.site_id}/${uploadTarget.id}/${Date.now()}.${ext}`
        const response = await fetch(uploadFile.uri)
        const blob = await response.blob()
        const { error: uploadError } = await supabase.storage
          .from('mewp-thorough-exams')
          .upload(path, blob, { contentType: uploadFile.mimeType, upsert: true })
        if (uploadError) throw uploadError
        const { data: urlData } = supabase.storage.from('mewp-thorough-exams').getPublicUrl(path)
        examUrl = urlData.publicUrl
      }
      const { error: updateError } = await supabase.from('mewps').update({
        thorough_exam_url:    examUrl,
        thorough_exam_expiry: uploadExpiryStr || null,
      }).eq('id', uploadTarget.id)
      if (updateError) throw updateError
      setUploadTarget(null)
      fetchMewps()
    } catch (err: any) {
      Alert.alert('Upload failed', err.message ?? 'Please try again.')
    } finally {
      setIsUploading(false)
    }
  }

  function openArchivedModal() {
    fetchArchivedMewps()
    setShowArchived(true)
  }

  const previewContentHeight = Math.min(windowHeight - 200, 548)
  const previewBoxWidth = Math.min(windowWidth - 32, 480)

  return (
    <ScreenWrapper edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Nav bar */}
      <View style={styles.navBar}>
        <View style={styles.navLeft}>
          <Text style={styles.navTitle}>MEWP Inventory</Text>
          {!!siteName && (
            <Text style={styles.navSiteName} numberOfLines={1}>{siteName}</Text>
          )}
        </View>
        <View style={styles.navRight}>
          {windowWidth > 500 && !!profile?.full_name && (
            <Text style={styles.navUserName} numberOfLines={1}>{profile.full_name}</Text>
          )}
          <TouchableOpacity style={styles.signOutBtn} onPress={signOut} activeOpacity={0.8}>
            <Text style={styles.signOutBtnText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main content */}
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Toolbar */}
        <View style={styles.toolbar}>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => router.push('/(appointed-person)/mewp/add' as any)}
            activeOpacity={0.8}
          >
            <MaterialIcons name="add" size={18} color={Colors.textInverse} />
            <Text style={styles.addBtnText}>Add MEWP</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.viewArchivedBtn} onPress={openArchivedModal} activeOpacity={0.8}>
            <MaterialIcons name="archive" size={16} color={Colors.textSecondary} />
            <Text style={styles.viewArchivedBtnText}>View Archived</Text>
          </TouchableOpacity>
        </View>

        {/* Summary cards */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.summaryRow}>
          <SummaryCard label="Total"    value={counts.total}    bg="#EFF6FF" text="#1D4ED8" />
          <SummaryCard label="Valid"    value={counts.valid}    bg="#F0FDF4" text="#16A34A" />
          <SummaryCard label="Exp Soon" value={counts.exp_soon} bg="#FEFCE8" text="#CA8A04" />
          <SummaryCard label="No Cert"  value={counts.no_cert}  bg="#FEF2F2" text="#DC2626" />
        </ScrollView>

        {/* Filter pills + search */}
        <View style={styles.filterSection}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
            {(['all', 'valid', 'exp_soon', 'no_cert'] as FilterType[]).map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.pill, filter === f && styles.pillActive]}
                onPress={() => applyFilter(f)}
                activeOpacity={0.7}
              >
                <Text style={[styles.pillText, filter === f && styles.pillTextActive]}>
                  {f === 'all' ? 'All' : STATUS_META[f as MewpStatus].label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={(t) => { setSearch(t); setPage(0) }}
            placeholder="Search type, serial, subcontractor…"
            placeholderTextColor={Colors.textMuted}
            clearButtonMode="while-editing"
          />
        </View>

        {/* Table */}
        {isLoading ? (
          <ActivityIndicator style={{ marginTop: Spacing.xl }} color={Colors.accent} />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <TH width={COL.num}>#</TH>
                <TH width={COL.type}>Type</TH>
                <TH width={COL.serial}>Serial</TH>
                <TH width={COL.sub}>Subcontractor</TH>
                <TH width={COL.expiry}>Expiry</TH>
                <TH width={COL.location}>Location</TH>
                <TH width={COL.status}>Status</TH>
                <TH width={COL.actions}>Actions</TH>
              </View>

              {displayed.length === 0 ? (
                <View style={[styles.emptyRow, { width: TABLE_TOTAL_WIDTH }]}>
                  <Text style={styles.emptyRowText}>
                    {filter !== 'all' || search ? 'No MEWPs match this filter.' : 'No MEWPs on this site yet.'}
                  </Text>
                </View>
              ) : (
                displayed.map((mewp, i) => {
                  const status = getMewpStatus(mewp.thorough_exam_expiry)
                  const meta = STATUS_META[status]
                  const hasCert = !!mewp.thorough_exam_url
                  const hasSticker = !!mewp.sticker_url
                  return (
                    <TouchableOpacity
                      key={mewp.id}
                      style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}
                      onPress={() => router.push(`/(appointed-person)/mewp/${mewp.id}` as any)}
                      activeOpacity={0.7}
                    >
                      <TD width={COL.num}>
                        <Text style={styles.tdNum}>{page * PAGE_SIZE + i + 1}</Text>
                      </TD>
                      <TD width={COL.type}>
                        <Text style={styles.tdText} numberOfLines={1}>{mewp.mewp_type}</Text>
                      </TD>
                      <TD width={COL.serial}>
                        <Text style={styles.tdMono} numberOfLines={1}>{mewp.serial_number}</Text>
                      </TD>
                      <TD width={COL.sub}>
                        <Text style={styles.tdText} numberOfLines={1}>
                          {mewp.subcontractor?.name ?? 'Site-owned'}
                        </Text>
                      </TD>
                      <TD width={COL.expiry}>
                        <Text style={styles.tdText}>{formatDate(mewp.thorough_exam_expiry)}</Text>
                      </TD>
                      <TD width={COL.location}>
                        <Text style={styles.tdText} numberOfLines={1}>{mewp.current_location ?? '—'}</Text>
                      </TD>
                      <TD width={COL.status}>
                        <View style={[styles.statusPill, { backgroundColor: meta.bg, borderColor: meta.border }]}>
                          <Text style={[styles.statusPillText, { color: meta.text }]}>{meta.label}</Text>
                        </View>
                      </TD>
                      <TD width={COL.actions}>
                        <View style={styles.actionBtns}>
                          <TouchableOpacity
                            style={styles.actionBtn}
                            onPress={(e) => { e.stopPropagation?.(); openUploadSheet(mewp) }}
                            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                          >
                            <MaterialIcons name="upload-file" size={17} color={Colors.primary} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.actionBtn}
                            onPress={(e) => { e.stopPropagation?.(); router.push(`/(appointed-person)/mewp/${mewp.id}/edit` as any) }}
                            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                          >
                            <MaterialIcons name="edit" size={17} color={Colors.textSecondary} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.actionBtn}
                            onPress={(e) => { e.stopPropagation?.(); hasCert && handlePreviewPress(mewp.thorough_exam_url!, 'Certificate') }}
                            disabled={!hasCert}
                            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                          >
                            <MaterialCommunityIcons
                              name="certificate"
                              size={17}
                              color={hasCert ? Colors.primary : Colors.textMuted}
                            />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.actionBtn}
                            onPress={(e) => { e.stopPropagation?.(); hasSticker && handlePreviewPress(mewp.sticker_url!, 'Sticker') }}
                            disabled={!hasSticker}
                            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                          >
                            <MaterialIcons
                              name="photo"
                              size={17}
                              color={hasSticker ? Colors.textSecondary : Colors.textMuted}
                            />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.actionBtn}
                            onPress={(e) => { e.stopPropagation?.(); handleArchive(mewp) }}
                            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                          >
                            <MaterialIcons name="archive" size={17} color={Colors.warning} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.actionBtn}
                            onPress={(e) => { e.stopPropagation?.(); handleDelete(mewp) }}
                            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                          >
                            <MaterialIcons name="delete-outline" size={17} color={Colors.danger} />
                          </TouchableOpacity>
                        </View>
                      </TD>
                    </TouchableOpacity>
                  )
                })
              )}
            </View>
          </ScrollView>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <View style={styles.pagination}>
            <TouchableOpacity
              style={[styles.pageBtn, page === 0 && styles.pageBtnDisabled]}
              onPress={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <MaterialIcons name="chevron-left" size={20} color={page === 0 ? Colors.textMuted : Colors.primary} />
            </TouchableOpacity>
            <Text style={styles.pageText}>Page {page + 1} of {totalPages}</Text>
            <TouchableOpacity
              style={[styles.pageBtn, page >= totalPages - 1 && styles.pageBtnDisabled]}
              onPress={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              <MaterialIcons name="chevron-right" size={20} color={page >= totalPages - 1 ? Colors.textMuted : Colors.primary} />
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Preview modal — centered, max 480×600 */}
      <Modal visible={!!previewUrl} transparent animationType="fade" onRequestClose={closePreview}>
        <View style={styles.previewOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={closePreview} activeOpacity={1} />
          <View style={[styles.previewBox, { width: previewBoxWidth }]}>
            <View style={styles.previewBoxHeader}>
              <Text style={styles.previewBoxTitle}>{previewLabel}</Text>
              <TouchableOpacity onPress={closePreview} style={styles.previewBoxCloseBtn} activeOpacity={0.7}>
                <MaterialIcons name="close" size={22} color={Colors.text} />
              </TouchableOpacity>
            </View>
            {!!previewUrl && (
              <View style={{ height: previewContentHeight }}>
                {Platform.OS === 'web' && isPdf(previewUrl)
                  ? React.createElement('iframe', {
                      src: previewUrl,
                      style: { width: '100%', height: '100%', border: 'none', display: 'block' },
                      title: previewLabel,
                    })
                  : <Image
                      source={{ uri: previewUrl }}
                      style={{ width: '100%', height: '100%' }}
                      contentFit="contain"
                    />
                }
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Upload exam sheet */}
      <Modal
        visible={uploadTarget !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setUploadTarget(null)}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => !isUploading && setUploadTarget(null)}
        />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Upload Thorough Exam</Text>
          {uploadTarget && (
            <Text style={styles.sheetSubtitle}>{uploadTarget.mewp_type} — {uploadTarget.serial_number}</Text>
          )}
          {uploadTarget?.thorough_exam_url && (
            <View style={styles.sheetCurrentRow}>
              <MaterialIcons name="check-circle" size={16} color={Colors.success} />
              <Text style={styles.sheetCurrentText}>Certificate on file</Text>
            </View>
          )}
          <Text style={styles.sheetLabel}>Certificate (PDF, JPG, PNG)</Text>
          <TouchableOpacity style={styles.sheetFilePicker} onPress={pickExamFile} activeOpacity={0.8}>
            <MaterialIcons name="attach-file" size={20} color={Colors.primary} />
            <Text style={styles.sheetFilePickerText} numberOfLines={1}>
              {uploadFile ? uploadFile.name : 'Choose file or photo'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.sheetLabel}>Expiry Date</Text>
          {Platform.OS === 'web' ? (
            // @ts-ignore
            <input
              type="date"
              value={uploadExpiryStr}
              onChange={(e: any) => setUploadExpiryStr(e.target.value)}
              style={{
                padding: 10, borderRadius: BorderRadius.sm, border: '0.5px solid #E2E8F0',
                fontSize: 14, marginBottom: Spacing.md, width: '100%', boxSizing: 'border-box',
              }}
            />
          ) : (
            <>
              <TouchableOpacity
                style={styles.sheetDateBtn}
                onPress={() => setShowUploadDatePicker(true)}
                activeOpacity={0.8}
              >
                <MaterialIcons name="event" size={18} color={Colors.textSecondary} />
                <Text style={styles.sheetDateBtnText}>
                  {uploadExpiryStr ? formatDateInput(uploadExpiryStr) : 'Select expiry date'}
                </Text>
              </TouchableOpacity>
              {showUploadDatePicker && (
                <DateTimePicker
                  value={uploadExpiryStr ? new Date(uploadExpiryStr + 'T00:00:00') : new Date()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(_, date) => {
                    setShowUploadDatePicker(false)
                    if (date) {
                      const y = date.getFullYear()
                      const m = String(date.getMonth() + 1).padStart(2, '0')
                      const d = String(date.getDate()).padStart(2, '0')
                      setUploadExpiryStr(`${y}-${m}-${d}`)
                    }
                  }}
                />
              )}
            </>
          )}
          <TouchableOpacity
            style={[styles.sheetUploadBtn, isUploading && { opacity: 0.6 }]}
            onPress={handleUploadSubmit}
            disabled={isUploading}
            activeOpacity={0.8}
          >
            {isUploading ? (
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

      {/* Archived MEWPs modal */}
      <Modal visible={showArchived} animationType="slide" onRequestClose={() => setShowArchived(false)}>
        <ScreenWrapper edges={['top', 'bottom']}>
          <View style={styles.archivedNavBar}>
            <Text style={styles.archivedNavTitle}>Archived MEWPs</Text>
            <TouchableOpacity onPress={() => setShowArchived(false)} style={styles.archivedNavClose} activeOpacity={0.7}>
              <MaterialIcons name="close" size={22} color={Colors.textInverse} />
            </TouchableOpacity>
          </View>
          {isLoadingArchived ? (
            <ActivityIndicator style={{ marginTop: Spacing.xl }} color={Colors.accent} />
          ) : archivedMewps.length === 0 ? (
            <View style={styles.archivedEmpty}>
              <MaterialIcons name="archive" size={40} color={Colors.textMuted} />
              <Text style={styles.archivedEmptyText}>No archived MEWPs</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.archivedList}>
              {archivedMewps.map((mewp) => {
                const status = getMewpStatus(mewp.thorough_exam_expiry)
                const meta = STATUS_META[status]
                return (
                  <View key={mewp.id} style={styles.archivedCard}>
                    <View style={styles.archivedCardInfo}>
                      <Text style={styles.archivedCardType}>{mewp.mewp_type}</Text>
                      <Text style={styles.archivedCardSerial}>{mewp.serial_number}</Text>
                      {mewp.subcontractor && (
                        <Text style={styles.archivedCardSub}>{mewp.subcontractor.name}</Text>
                      )}
                      <View style={[styles.statusPill, { backgroundColor: meta.bg, borderColor: meta.border, marginTop: 6 }]}>
                        <Text style={[styles.statusPillText, { color: meta.text }]}>{meta.label}</Text>
                      </View>
                    </View>
                    <TouchableOpacity style={styles.restoreBtn} onPress={() => handleRestore(mewp)} activeOpacity={0.8}>
                      <MaterialIcons name="restore" size={16} color={Colors.primary} />
                      <Text style={styles.restoreBtnText}>Restore</Text>
                    </TouchableOpacity>
                  </View>
                )
              })}
            </ScrollView>
          )}
        </ScreenWrapper>
      </Modal>
    </ScreenWrapper>
  )
}

function SummaryCard({ label, value, bg, text }: { label: string; value: number; bg: string; text: string }) {
  return (
    <View style={[styles.summaryCard, { backgroundColor: bg }]}>
      <Text style={[styles.summaryValue, { color: text }]}>{value}</Text>
      <Text style={[styles.summaryLabel, { color: text }]}>{label}</Text>
    </View>
  )
}

function TH({ children, width }: { children: React.ReactNode; width: number }) {
  return (
    <View style={[styles.th, { width, minWidth: width }]}>
      <Text style={styles.thText} numberOfLines={1}>{children}</Text>
    </View>
  )
}

function TD({ children, width }: { children: React.ReactNode; width: number }) {
  return <View style={[styles.td, { width }]}>{children}</View>
}

const styles = StyleSheet.create({
  // Nav bar
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    minHeight: 56,
    gap: Spacing.sm,
  },
  navLeft: {
    flex: 1,
    gap: 2,
  },
  navTitle: {
    fontSize: FontSize.base,
    fontWeight: '800',
    color: Colors.textInverse,
    letterSpacing: 0.2,
  },
  navSiteName: {
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.65)',
    fontWeight: '500',
  },
  navRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexShrink: 0,
  },
  navUserName: {
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
    maxWidth: 140,
  },
  signOutBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  signOutBtnText: {
    fontSize: FontSize.xs,
    color: Colors.textInverse,
    fontWeight: '600',
  },
  // Main
  container: {
    paddingBottom: Spacing.xxl,
  },
  toolbar: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  addBtnText: {
    color: Colors.textInverse,
    fontWeight: '700',
    fontSize: FontSize.sm,
  },
  viewArchivedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
  },
  viewArchivedBtnText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  summaryRow: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  summaryCard: {
    width: 100,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  summaryValue: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    lineHeight: 32,
  },
  summaryLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    marginTop: 2,
  },
  filterSection: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  pillRow: {
    gap: Spacing.xs,
    paddingBottom: 2,
  },
  pill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  pillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  pillText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  pillTextActive: {
    color: Colors.textInverse,
  },
  searchInput: {
    backgroundColor: Colors.surface,
    borderWidth: 0.5,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSize.sm,
    color: Colors.text,
  },
  // Table
  table: {
    marginHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    ...Shadow.sm,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: Colors.background,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.divider,
    backgroundColor: Colors.surface,
  },
  tableRowAlt: {
    backgroundColor: '#FAFBFD',
  },
  th: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    justifyContent: 'center',
    borderRightWidth: 0.5,
    borderRightColor: Colors.border,
  },
  thText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  td: {
    paddingVertical: 10,
    paddingHorizontal: Spacing.sm,
    justifyContent: 'center',
    borderRightWidth: 0.5,
    borderRightColor: Colors.divider,
  },
  tdText: {
    fontSize: FontSize.xs,
    color: Colors.text,
  },
  tdMono: {
    fontSize: FontSize.xs,
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  tdNum: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  actionBtns: {
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
  },
  actionBtn: {
    padding: 3,
  },
  emptyRow: {
    paddingVertical: Spacing.xl,
    alignItems: 'center',
  },
  emptyRowText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingTop: Spacing.md,
  },
  pageBtn: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  pageBtnDisabled: {
    opacity: 0.4,
  },
  pageText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  // Preview modal
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
  },
  previewBox: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    ...Shadow.md,
  },
  previewBoxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  previewBoxTitle: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.text,
  },
  previewBoxCloseBtn: {
    padding: 4,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.border,
  },
  // Upload sheet
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    ...Shadow.md,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  sheetTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 4,
  },
  sheetSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  sheetCurrentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
    backgroundColor: '#F0FDF4',
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
  },
  sheetCurrentText: {
    fontSize: FontSize.sm,
    color: Colors.success,
    fontWeight: '600',
  },
  sheetLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  sheetFilePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    borderStyle: 'dashed',
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  sheetFilePickerText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    flex: 1,
    fontWeight: '500',
  },
  sheetDateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    backgroundColor: Colors.background,
  },
  sheetDateBtnText: {
    fontSize: FontSize.sm,
    color: Colors.text,
  },
  sheetUploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    marginTop: Spacing.sm,
  },
  sheetUploadBtnText: {
    color: Colors.textInverse,
    fontWeight: '700',
    fontSize: FontSize.base,
  },
  // Archived modal
  archivedNavBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    minHeight: 56,
  },
  archivedNavTitle: {
    fontSize: FontSize.base,
    fontWeight: '800',
    color: Colors.textInverse,
  },
  archivedNavClose: {
    padding: 4,
  },
  archivedEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingBottom: Spacing.xxl,
  },
  archivedEmptyText: {
    fontSize: FontSize.base,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  archivedList: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  archivedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 0.5,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.md,
    ...Shadow.sm,
  },
  archivedCardInfo: {
    flex: 1,
  },
  archivedCardType: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
  },
  archivedCardSerial: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  archivedCardSub: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  restoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    paddingVertical: 7,
    paddingHorizontal: 12,
    flexShrink: 0,
  },
  restoreBtnText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: '700',
  },
})
