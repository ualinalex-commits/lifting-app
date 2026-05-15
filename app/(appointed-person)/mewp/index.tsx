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
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'

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

interface Subcontractor {
  id: string
  name: string
  site_id: string
  is_archived: boolean
  created_at: string
}

interface PickedFile {
  uri: string
  name: string
  mimeType: string
}

type FilterType = 'all' | 'valid' | 'exp_soon' | 'no_cert'

const PAGE_SIZE = 50

const COL_MOB = {
  num: 40, type: 130, serial: 120, sub: 130,
  expiry: 100, location: 110, status: 100, actions: 164,
}

const COL_WEB_FLEX = {
  num: 0.5, type: 1.5, serial: 1.3, sub: 1.5,
  expiry: 1.2, location: 1.3, status: 1.1,
  cert: 0.9, sticker: 0.9, actions: 2.5,
}

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

  const isWeb = Platform.OS === 'web'
  const isMobileLayout = windowWidth < 768
  const TABLE_MOB_TOTAL = Object.values(COL_MOB).reduce((a: number, b: number) => a + b, 0)

  // MEWP state
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

  const [hoverInfo, setHoverInfo] = useState<{
    url: string; isPdf: boolean; label: string
    x: number; y: number; above: boolean
  } | null>(null)

  // Subcontractor state
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([])
  const [archivedSubs, setArchivedSubs] = useState<Subcontractor[]>([])
  const [isLoadingSubs, setIsLoadingSubs] = useState(false)
  const [isLoadingArchivedSubs, setIsLoadingArchivedSubs] = useState(false)
  const [showSubForm, setShowSubForm] = useState(false)
  const [editingSub, setEditingSub] = useState<Subcontractor | null>(null)
  const [subNameInput, setSubNameInput] = useState('')
  const [isSavingSub, setIsSavingSub] = useState(false)
  const [showArchivedSubs, setShowArchivedSubs] = useState(false)

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

  const fetchSubcontractors = useCallback(async () => {
    if (!profile?.site_id) return
    setIsLoadingSubs(true)
    const { data, error } = await supabase
      .from('subcontractors')
      .select('*')
      .eq('site_id', profile.site_id)
      .eq('is_archived', false)
      .order('name', { ascending: true })
    if (error) Alert.alert('Error', error.message)
    else setSubcontractors((data ?? []) as Subcontractor[])
    setIsLoadingSubs(false)
  }, [profile?.site_id])

  useFocusEffect(useCallback(() => {
    fetchMewps()
    fetchSubcontractors()
  }, [fetchMewps, fetchSubcontractors]))

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

  async function fetchArchivedSubs() {
    if (!profile?.site_id) return
    setIsLoadingArchivedSubs(true)
    const { data, error } = await supabase
      .from('subcontractors')
      .select('*')
      .eq('site_id', profile.site_id)
      .eq('is_archived', true)
      .order('name', { ascending: true })
    if (error) Alert.alert('Error', error.message)
    else setArchivedSubs((data ?? []) as Subcontractor[])
    setIsLoadingArchivedSubs(false)
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

  function showHover(e: any, url: string, isPdfUrl: boolean, label: string) {
    const rect = e.currentTarget.getBoundingClientRect()
    const above = rect.top > window.innerHeight / 2
    setHoverInfo({
      url, isPdf: isPdfUrl, label,
      x: rect.left + rect.width / 2,
      y: above ? rect.top : rect.bottom,
      above,
    })
  }

  function hideHover() { setHoverInfo(null) }
  function applyFilter(f: FilterType) { setFilter(f); setPage(0) }

  function openUploadSheet(mewp: Mewp) {
    setUploadTarget(mewp)
    setUploadFile(null)
    setUploadExpiryStr(mewp.thorough_exam_expiry ?? '')
    setShowUploadDatePicker(false)
  }

  function handlePreviewPress(url: string, label: string) {
    if (Platform.OS !== 'web' && isPdf(url)) { Linking.openURL(url); return }
    setPreviewUrl(url)
    setPreviewLabel(label)
  }

  function closePreview() { setPreviewUrl(null); setPreviewLabel('') }

  async function handleArchive(mewp: Mewp) {
    const response = await supabase.from('mewps').update({ is_archived: true }).eq('id', mewp.id)
    console.log('[Archive] data:', response.data, 'error:', response.error, 'status:', response.status)
    if (!response.error) {
      setMewps(prev => prev.filter(m => m.id !== mewp.id))
    }
  }

  async function handleDelete(mewp: Mewp) {
    if (!confirm(`Delete ${mewp.mewp_type} (${mewp.serial_number})? This cannot be undone.`)) return
    const response = await supabase.from('mewps').delete().eq('id', mewp.id)
    console.log('[Delete] data:', response.data, 'error:', response.error, 'status:', response.status)
    if (!response.error) {
      setMewps(prev => prev.filter(m => m.id !== mewp.id))
    }
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

  // Subcontractor handlers
  function openAddSub() {
    setEditingSub(null)
    setSubNameInput('')
    setShowSubForm(true)
  }

  function openEditSub(sub: Subcontractor) {
    setEditingSub(sub)
    setSubNameInput(sub.name)
    setShowSubForm(true)
  }

  async function handleSaveSub() {
    if (!subNameInput.trim() || !profile?.site_id) return
    setIsSavingSub(true)
    try {
      if (editingSub) {
        const { error } = await supabase
          .from('subcontractors')
          .update({ name: subNameInput.trim() })
          .eq('id', editingSub.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('subcontractors')
          .insert({ site_id: profile.site_id, name: subNameInput.trim() })
        if (error) throw error
      }
      setShowSubForm(false)
      fetchSubcontractors()
    } catch (err: any) {
      Alert.alert('Error', err.message)
    } finally {
      setIsSavingSub(false)
    }
  }

  function handleArchiveSub(sub: Subcontractor) {
    Alert.alert(
      'Archive Subcontractor',
      `Archive "${sub.name}"?\n\nIt will be hidden from the active list but can be restored.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive', style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('subcontractors').update({ is_archived: true }).eq('id', sub.id)
            if (error) Alert.alert('Error', error.message)
            else fetchSubcontractors()
          },
        },
      ]
    )
  }

  async function handleRestoreSub(sub: Subcontractor) {
    const { error } = await supabase.from('subcontractors').update({ is_archived: false }).eq('id', sub.id)
    if (error) { Alert.alert('Error', error.message); return }
    setArchivedSubs(prev => prev.filter(s => s.id !== sub.id))
    fetchSubcontractors()
  }

  function openArchivedModal() { fetchArchivedMewps(); setShowArchived(true) }
  function openArchivedSubsModal() { fetchArchivedSubs(); setShowArchivedSubs(true) }

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)

  async function handleGeneratePdf() {
    setIsGeneratingPdf(true)
    try {
      const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })

      const tableRows = mewps.map((m, i) => {
        const status = getMewpStatus(m.thorough_exam_expiry)
        const statusLabel = status === 'valid' ? 'VALID' : status === 'exp_soon' ? 'EXP SOON' : 'NO CERT / EXPIRED'
        const statusColor = status === 'valid' ? '#16A34A' : status === 'exp_soon' ? '#CA8A04' : '#DC2626'
        return `
          <tr>
            <td>${i + 1}</td>
            <td>${m.mewp_type}</td>
            <td class="mono">${m.serial_number}</td>
            <td>${m.subcontractor?.name ?? 'Site-owned'}</td>
            <td>${formatDate(m.thorough_exam_expiry)}</td>
            <td>${m.current_location ?? '—'}</td>
            <td style="color:${statusColor};font-weight:700;">${statusLabel}</td>
          </tr>`
      }).join('')

      const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; padding: 32px; color: #1F2937; font-size: 13px; }
  h1 { font-size: 26px; font-weight: 800; margin-bottom: 4px; }
  .meta { font-size: 12px; color: #6B7280; margin-bottom: 24px; }
  .summary { display: flex; gap: 12px; margin-bottom: 24px; }
  .summary-card { flex: 1; padding: 14px 16px; border-radius: 8px; text-align: center; }
  .summary-count { font-size: 30px; font-weight: 800; line-height: 1; }
  .summary-label { font-size: 11px; font-weight: 700; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th { background: #F9FAFB; padding: 9px 10px; border-bottom: 1.5px solid #E5E7EB; font-size: 10px; text-transform: uppercase; letter-spacing: 0.6px; color: #6B7280; text-align: left; font-weight: 700; }
  td { padding: 8px 10px; border-bottom: 1px solid #F3F4F6; font-size: 12px; vertical-align: middle; }
  tr:nth-child(even) td { background: #FAFBFC; }
  .mono { font-family: monospace; }
  .footer { border-top: 1.5px solid #E5E7EB; padding-top: 14px; }
  .totals { display: flex; gap: 28px; font-size: 13px; font-weight: 700; margin-bottom: 10px; }
  .legend { font-size: 11px; color: #6B7280; line-height: 1.9; }
  .legend strong { color: #374151; }
</style>
</head>
<body>
  <h1>${siteName || 'MEWP Inventory'}</h1>
  <div class="meta">Generated: ${dateStr}&nbsp;&nbsp;|&nbsp;&nbsp;Total Units: ${mewps.length}</div>

  <div class="summary">
    <div class="summary-card" style="background:#F0FDF4;">
      <div class="summary-count" style="color:#16A34A;">${counts.valid}</div>
      <div class="summary-label" style="color:#16A34A;">Valid</div>
    </div>
    <div class="summary-card" style="background:#FEFCE8;">
      <div class="summary-count" style="color:#CA8A04;">${counts.exp_soon}</div>
      <div class="summary-label" style="color:#CA8A04;">Exp Soon</div>
    </div>
    <div class="summary-card" style="background:#FEF2F2;">
      <div class="summary-count" style="color:#DC2626;">${counts.no_cert}</div>
      <div class="summary-label" style="color:#DC2626;">No Cert / Expired</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>MEWP Type</th>
        <th>Serial Number</th>
        <th>Subcontractor</th>
        <th>Thorough Exam Expiry</th>
        <th>Location</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>

  <div class="footer">
    <div class="totals">
      <span>Total: ${mewps.length}</span>
      <span style="color:#16A34A;">Valid: ${counts.valid}</span>
      <span style="color:#CA8A04;">Expiring Soon: ${counts.exp_soon}</span>
      <span style="color:#DC2626;">Action Required: ${counts.no_cert}</span>
    </div>
    <div class="legend">
      <strong>VALID</strong> = Thorough Exam current&nbsp;&nbsp;&nbsp;
      <strong>EXP SOON</strong> = expires within 30 days&nbsp;&nbsp;&nbsp;
      <strong>NO CERT / EXPIRED</strong> = immediate action required, unit must not be used
    </div>
  </div>
</body>
</html>`

      if (Platform.OS === 'web') {
        const blob = new Blob([html], { type: 'text/html' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'mewp-inventory.pdf'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      } else {
        const { uri } = await Print.printToFileAsync({ html, base64: false })
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'MEWP Inventory Report' })
      }
    } catch (err: any) {
      Alert.alert('PDF Error', err.message ?? 'Could not generate report.')
    } finally {
      setIsGeneratingPdf(false)
    }
  }

  const previewContentHeight = Math.min(windowHeight - 200, 548)
  const previewBoxWidth = Math.min(windowWidth - 32, 480)

  const hoverLeft = isWeb && hoverInfo && typeof window !== 'undefined'
    ? Math.max(8, Math.min(window.innerWidth - 328, hoverInfo.x - 160))
    : 0
  const hoverTop = isWeb && hoverInfo
    ? (hoverInfo.above ? hoverInfo.y - 408 : hoverInfo.y + 8)
    : 0

  function renderMewpRow(mewp: Mewp, i: number) {
    const status = getMewpStatus(mewp.thorough_exam_expiry)
    const meta = STATUS_META[status]
    const hasCert = !!mewp.thorough_exam_url
    const hasSticker = !!mewp.sticker_url
    const certIsPdf = hasCert && isPdf(mewp.thorough_exam_url!)

    if (!isMobileLayout) {
      return (
        <TouchableOpacity
          key={mewp.id}
          style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}
          onPress={() => router.push(`/(appointed-person)/mewp/${mewp.id}` as any)}
          activeOpacity={0.7}
        >
          <TD flex={COL_WEB_FLEX.num}><Text style={styles.tdNum}>{page * PAGE_SIZE + i + 1}</Text></TD>
          <TD flex={COL_WEB_FLEX.type}><Text style={styles.tdText} numberOfLines={1}>{mewp.mewp_type}</Text></TD>
          <TD flex={COL_WEB_FLEX.serial}><Text style={styles.tdMono} numberOfLines={1}>{mewp.serial_number}</Text></TD>
          <TD flex={COL_WEB_FLEX.sub}>
            <Text style={styles.tdText} numberOfLines={1}>{mewp.subcontractor?.name ?? 'Site-owned'}</Text>
          </TD>
          <TD flex={COL_WEB_FLEX.expiry}><Text style={styles.tdText}>{formatDate(mewp.thorough_exam_expiry)}</Text></TD>
          <TD flex={COL_WEB_FLEX.location}>
            <Text style={styles.tdText} numberOfLines={1}>{mewp.current_location ?? '—'}</Text>
          </TD>
          <TD flex={COL_WEB_FLEX.status}>
            <View style={[styles.statusPill, { backgroundColor: meta.bg, borderColor: meta.border }]}>
              <Text style={[styles.statusPillText, { color: meta.text }]}>{meta.label}</Text>
            </View>
          </TD>
          <TD flex={COL_WEB_FLEX.cert}>
            {hasCert ? (
              <View
                style={styles.thumbWrap}
                {...({
                  onMouseEnter: (e: any) => showHover(e, mewp.thorough_exam_url!, certIsPdf, 'Certificate'),
                  onMouseLeave: hideHover,
                } as any)}
              >
                {certIsPdf
                  ? <View style={styles.pdfThumb}><MaterialCommunityIcons name="file-pdf-box" size={20} color="#DC2626" /></View>
                  : <Image source={{ uri: mewp.thorough_exam_url! }} style={styles.thumb} contentFit="cover" />
                }
              </View>
            ) : <Text style={styles.tdMuted}>—</Text>}
          </TD>
          <TD flex={COL_WEB_FLEX.sticker}>
            {hasSticker ? (
              <View
                style={styles.thumbWrap}
                {...({
                  onMouseEnter: (e: any) => showHover(e, mewp.sticker_url!, false, 'Sticker'),
                  onMouseLeave: hideHover,
                } as any)}
              >
                <Image source={{ uri: mewp.sticker_url! }} style={styles.thumb} contentFit="cover" />
              </View>
            ) : <Text style={styles.tdMuted}>—</Text>}
          </TD>
          <TD flex={COL_WEB_FLEX.actions}>
            <View style={styles.webActionBtns}>
              <TouchableOpacity
                style={styles.webActionIcon}
                onPress={(e) => { e.stopPropagation?.(); openUploadSheet(mewp) }}
              >
                <MaterialIcons name="upload-file" size={16} color={Colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.webActionIcon}
                onPress={(e) => { e.stopPropagation?.(); router.push(`/(appointed-person)/mewp/${mewp.id}/edit` as any) }}
              >
                <MaterialIcons name="edit" size={16} color={Colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.webActionBtnGrey}
                onPress={(e) => { e.stopPropagation?.(); handleArchive(mewp) }}
              >
                <Text style={styles.webActionTextGrey}>Archive</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.webActionBtnRed}
                onPress={(e) => { e.stopPropagation?.(); handleDelete(mewp) }}
              >
                <Text style={styles.webActionTextRed}>Delete</Text>
              </TouchableOpacity>
            </View>
          </TD>
        </TouchableOpacity>
      )
    }

    // Mobile card — native or web viewport < 768px
    return (
      <TouchableOpacity
        key={mewp.id}
        style={styles.mewpCard}
        onPress={() => router.push(`/(appointed-person)/mewp/${mewp.id}` as any)}
        activeOpacity={0.7}
      >
        <View style={styles.mewpCardHeader}>
          <Text style={styles.mewpCardNum}>#{page * PAGE_SIZE + i + 1}</Text>
          <View style={[styles.statusPill, { backgroundColor: meta.bg, borderColor: meta.border }]}>
            <Text style={[styles.statusPillText, { color: meta.text }]}>{meta.label}</Text>
          </View>
        </View>
        <Text style={styles.mewpCardType}>{mewp.mewp_type}</Text>
        <Text style={styles.mewpCardSerial}>{mewp.serial_number}</Text>
        <View style={styles.mewpCardDivider} />
        <View style={styles.mewpCardRow}>
          <Text style={styles.mewpCardLabel}>Subcontractor</Text>
          <Text style={styles.mewpCardValue} numberOfLines={1}>{mewp.subcontractor?.name ?? 'Site-owned'}</Text>
        </View>
        <View style={styles.mewpCardRow}>
          <Text style={styles.mewpCardLabel}>Expiry</Text>
          <Text style={styles.mewpCardValue}>{formatDate(mewp.thorough_exam_expiry)}</Text>
        </View>
        <View style={styles.mewpCardRow}>
          <Text style={styles.mewpCardLabel}>Location</Text>
          <Text style={styles.mewpCardValue} numberOfLines={1}>{mewp.current_location ?? '—'}</Text>
        </View>
        <View style={styles.mewpCardActions}>
          <TouchableOpacity
            style={styles.cardActionUpload}
            onPress={(e) => { e.stopPropagation?.(); openUploadSheet(mewp) }}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            <MaterialIcons name="upload-file" size={14} color={Colors.primary} />
            <Text style={styles.cardActionUploadText}>Upload</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cardActionEdit}
            onPress={(e) => { e.stopPropagation?.(); router.push(`/(appointed-person)/mewp/${mewp.id}/edit` as any) }}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            <MaterialIcons name="edit" size={14} color={Colors.textSecondary} />
            <Text style={styles.cardActionEditText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cardActionArchive}
            onPress={(e) => { e.stopPropagation?.(); handleArchive(mewp) }}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            <Text style={styles.cardActionArchiveText}>Archive</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cardActionDelete}
            onPress={(e) => { e.stopPropagation?.(); handleDelete(mewp) }}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            <Text style={styles.cardActionDeleteText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <ScreenWrapper edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Nav bar */}
      <View style={styles.navBar}>
        <View style={styles.navLeft}>
          <Text style={styles.navTitle}>MEWP Inventory</Text>
          {!!siteName && <Text style={styles.navSiteName} numberOfLines={1}>{siteName}</Text>}
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

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* 80% centered on desktop web, full width on mobile */}
        <View style={isWeb && !isMobileLayout ? styles.centeredContent : styles.fullContent}>

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
            <TouchableOpacity
              style={[styles.pdfBtn, (isGeneratingPdf || mewps.length === 0) && { opacity: 0.5 }]}
              onPress={handleGeneratePdf}
              disabled={isGeneratingPdf || mewps.length === 0}
              activeOpacity={0.8}
            >
              {isGeneratingPdf
                ? <ActivityIndicator size="small" color="#7C3AED" />
                : <MaterialIcons name="picture-as-pdf" size={16} color="#7C3AED" />
              }
              <Text style={styles.pdfBtnText}>{isGeneratingPdf ? 'Generating…' : 'PDF Report'}</Text>
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

          {/* MEWP Table / Cards */}
          {isLoading ? (
            <ActivityIndicator style={{ marginTop: Spacing.xl }} color={Colors.accent} />
          ) : !isMobileLayout ? (
            <View style={styles.tableWebContainer}>
              <View style={[styles.table, styles.tableWebFull]}>
                <View style={styles.tableHeader}>
                  <TH flex={COL_WEB_FLEX.num}>#</TH>
                  <TH flex={COL_WEB_FLEX.type}>Type</TH>
                  <TH flex={COL_WEB_FLEX.serial}>Serial</TH>
                  <TH flex={COL_WEB_FLEX.sub}>Subcontractor</TH>
                  <TH flex={COL_WEB_FLEX.expiry}>Expiry</TH>
                  <TH flex={COL_WEB_FLEX.location}>Location</TH>
                  <TH flex={COL_WEB_FLEX.status}>Status</TH>
                  <TH flex={COL_WEB_FLEX.cert}>Cert</TH>
                  <TH flex={COL_WEB_FLEX.sticker}>Sticker</TH>
                  <TH flex={COL_WEB_FLEX.actions}>Actions</TH>
                </View>
                {displayed.length === 0 ? (
                  <View style={styles.emptyRow}>
                    <Text style={styles.emptyRowText}>
                      {filter !== 'all' || search ? 'No MEWPs match this filter.' : 'No MEWPs on this site yet.'}
                    </Text>
                  </View>
                ) : (
                  displayed.map((mewp, i) => renderMewpRow(mewp, i))
                )}
              </View>
            </View>
          ) : (
            <View style={styles.cardList}>
              {displayed.length === 0 ? (
                <View style={styles.emptyRow}>
                  <Text style={styles.emptyRowText}>
                    {filter !== 'all' || search ? 'No MEWPs match this filter.' : 'No MEWPs on this site yet.'}
                  </Text>
                </View>
              ) : (
                displayed.map((mewp, i) => renderMewpRow(mewp, i))
              )}
            </View>
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

          {/* ── Subcontractors Section ── */}
          <View style={styles.sectionDivider} />

          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Subcontractors</Text>
              <Text style={styles.sectionSubtitle}>{subcontractors.length} active</Text>
            </View>
            <View style={styles.sectionActions}>
              <TouchableOpacity style={styles.viewArchivedBtn} onPress={openArchivedSubsModal} activeOpacity={0.8}>
                <MaterialIcons name="archive" size={16} color={Colors.textSecondary} />
                <Text style={styles.viewArchivedBtnText}>View Archived</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addBtn} onPress={openAddSub} activeOpacity={0.8}>
                <MaterialIcons name="add" size={18} color={Colors.textInverse} />
                <Text style={styles.addBtnText}>Add Subcontractor</Text>
              </TouchableOpacity>
            </View>
          </View>

          {isLoadingSubs ? (
            <ActivityIndicator style={{ marginTop: Spacing.lg }} color={Colors.accent} />
          ) : subcontractors.length === 0 ? (
            <View style={styles.subsEmpty}>
              <Text style={styles.subsEmptyText}>No subcontractors on this site yet.</Text>
            </View>
          ) : (
            <View style={styles.subsList}>
              {subcontractors.map((sub, i) => (
                <View key={sub.id} style={[styles.subRow, i === subcontractors.length - 1 && { borderBottomWidth: 0 }]}>
                  <Text style={styles.subName}>{sub.name}</Text>
                  <View style={styles.subRowActions}>
                    <TouchableOpacity style={styles.subEditBtn} onPress={() => openEditSub(sub)} activeOpacity={0.8}>
                      <MaterialIcons name="edit" size={14} color={Colors.textSecondary} />
                      <Text style={styles.subEditBtnText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.subArchiveBtn} onPress={() => handleArchiveSub(sub)} activeOpacity={0.8}>
                      <MaterialIcons name="archive" size={14} color="#6B7280" />
                      <Text style={styles.subArchiveBtnText}>Archive</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

        </View>
      </ScrollView>

      {/* Preview modal */}
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
                  : <Image source={{ uri: previewUrl }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
                }
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Upload exam sheet */}
      <Modal visible={uploadTarget !== null} transparent animationType="slide" onRequestClose={() => setUploadTarget(null)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => !isUploading && setUploadTarget(null)} />
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
              <TouchableOpacity style={styles.sheetDateBtn} onPress={() => setShowUploadDatePicker(true)} activeOpacity={0.8}>
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
            {isUploading
              ? <ActivityIndicator color={Colors.textInverse} size="small" />
              : <>
                  <MaterialIcons name="cloud-upload" size={18} color={Colors.textInverse} />
                  <Text style={styles.sheetUploadBtnText}>Save Certificate</Text>
                </>
            }
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

      {/* Add / Edit Subcontractor modal */}
      <Modal visible={showSubForm} transparent animationType="slide" onRequestClose={() => !isSavingSub && setShowSubForm(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => !isSavingSub && setShowSubForm(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{editingSub ? 'Edit Subcontractor' : 'Add Subcontractor'}</Text>
          <Text style={styles.sheetLabel}>Company Name</Text>
          <TextInput
            style={styles.subFormInput}
            value={subNameInput}
            onChangeText={setSubNameInput}
            placeholder="e.g. Smith Cranes Ltd"
            placeholderTextColor={Colors.textMuted}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleSaveSub}
          />
          <TouchableOpacity
            style={[styles.sheetUploadBtn, (!subNameInput.trim() || isSavingSub) && { opacity: 0.5 }]}
            onPress={handleSaveSub}
            disabled={!subNameInput.trim() || isSavingSub}
            activeOpacity={0.8}
          >
            {isSavingSub
              ? <ActivityIndicator color={Colors.textInverse} size="small" />
              : <Text style={styles.sheetUploadBtnText}>{editingSub ? 'Save Changes' : 'Add Subcontractor'}</Text>
            }
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Archived Subcontractors modal */}
      <Modal visible={showArchivedSubs} animationType="slide" onRequestClose={() => setShowArchivedSubs(false)}>
        <ScreenWrapper edges={['top', 'bottom']}>
          <View style={styles.archivedNavBar}>
            <Text style={styles.archivedNavTitle}>Archived Subcontractors</Text>
            <TouchableOpacity onPress={() => setShowArchivedSubs(false)} style={styles.archivedNavClose} activeOpacity={0.7}>
              <MaterialIcons name="close" size={22} color={Colors.textInverse} />
            </TouchableOpacity>
          </View>
          {isLoadingArchivedSubs ? (
            <ActivityIndicator style={{ marginTop: Spacing.xl }} color={Colors.accent} />
          ) : archivedSubs.length === 0 ? (
            <View style={styles.archivedEmpty}>
              <MaterialIcons name="archive" size={40} color={Colors.textMuted} />
              <Text style={styles.archivedEmptyText}>No archived subcontractors</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.archivedList}>
              {archivedSubs.map((sub) => (
                <View key={sub.id} style={styles.archivedCard}>
                  <View style={styles.archivedCardInfo}>
                    <Text style={styles.archivedCardType}>{sub.name}</Text>
                  </View>
                  <TouchableOpacity style={styles.restoreBtn} onPress={() => handleRestoreSub(sub)} activeOpacity={0.8}>
                    <MaterialIcons name="restore" size={16} color={Colors.primary} />
                    <Text style={styles.restoreBtnText}>Restore</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}
        </ScreenWrapper>
      </Modal>

      {/* Hover thumbnail popup — desktop web only, fixed to viewport */}
      {isWeb && hoverInfo && (
        <View style={{
          position: 'fixed' as any,
          left: hoverLeft,
          top: hoverTop,
          width: 320,
          maxHeight: 400,
          backgroundColor: Colors.surface,
          borderRadius: BorderRadius.md,
          borderWidth: 0.5,
          borderColor: Colors.border,
          overflow: 'hidden',
          zIndex: 9999,
          ...Shadow.md,
        }}>
          {hoverInfo.isPdf ? (
            <>
              {React.createElement('iframe', {
                src: hoverInfo.url,
                style: { width: '100%', height: 368, border: 'none', display: 'block' },
                title: hoverInfo.label,
              })}
              {React.createElement('a', {
                href: hoverInfo.url,
                target: '_blank',
                rel: 'noopener noreferrer',
                style: {
                  display: 'block',
                  padding: '6px 12px',
                  fontSize: 12,
                  color: Colors.primary,
                  textDecoration: 'none',
                  borderTop: `0.5px solid ${Colors.border}`,
                  backgroundColor: Colors.background,
                },
              }, 'View PDF ↗')}
            </>
          ) : (
            <Image source={{ uri: hoverInfo.url }} style={{ width: 320, height: 400 }} contentFit="contain" />
          )}
        </View>
      )}
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

function TH({ children, width, flex }: { children: React.ReactNode; width?: number; flex?: number }) {
  return (
    <View style={[styles.th, flex !== undefined ? { flex } : { width, minWidth: width }]}>
      <Text style={styles.thText} numberOfLines={1}>{children}</Text>
    </View>
  )
}

function TD({ children, width, flex }: { children: React.ReactNode; width?: number; flex?: number }) {
  return <View style={[styles.td, flex !== undefined ? { flex } : { width }]}>{children}</View>
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
  navLeft: { flex: 1, gap: 2 },
  navTitle: { fontSize: FontSize.base, fontWeight: '800', color: Colors.textInverse, letterSpacing: 0.2 },
  navSiteName: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.65)', fontWeight: '500' },
  navRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexShrink: 0 },
  navUserName: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.8)', fontWeight: '500', maxWidth: 140 },
  signOutBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  signOutBtnText: { fontSize: FontSize.xs, color: Colors.textInverse, fontWeight: '600' },

  // Layout
  scrollContainer: { flexGrow: 1 },
  centeredContent: {
    width: '80%' as any,
    marginLeft: 'auto' as any,
    marginRight: 'auto' as any,
    paddingBottom: Spacing.xxl,
  },
  fullContent: { paddingBottom: Spacing.xxl },

  // Toolbar
  toolbar: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap' as any,
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
  addBtnText: { color: Colors.textInverse, fontWeight: '700', fontSize: FontSize.sm },
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
  viewArchivedBtnText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600' },
  pdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: '#F5F3FF',
  },
  pdfBtnText: { fontSize: FontSize.sm, color: '#7C3AED', fontWeight: '600' },

  // Summary cards
  summaryRow: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, gap: Spacing.sm },
  summaryCard: { width: 100, borderRadius: BorderRadius.md, padding: Spacing.md, alignItems: 'center', marginRight: Spacing.sm },
  summaryValue: { fontSize: FontSize.xxl, fontWeight: '800', lineHeight: 32 },
  summaryLabel: { fontSize: FontSize.xs, fontWeight: '600', marginTop: 2 },

  // Filters
  filterSection: { paddingHorizontal: Spacing.md, marginBottom: Spacing.sm, gap: Spacing.sm },
  pillRow: { gap: Spacing.xs, paddingBottom: 2 },
  pill: {
    paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  pillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  pillText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textSecondary },
  pillTextActive: { color: Colors.textInverse },
  searchInput: {
    backgroundColor: Colors.surface, borderWidth: 0.5, borderColor: Colors.border,
    borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    fontSize: FontSize.sm, color: Colors.text,
  },

  // Table — web
  tableWebContainer: { width: '100%' as any, marginVertical: Spacing.xs },
  tableWebFull: { marginHorizontal: 0, width: '100%' as any },

  // Table — shared
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
  tableRowAlt: { backgroundColor: '#FAFBFD' },
  th: {
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.sm,
    justifyContent: 'center', borderRightWidth: 0.5, borderRightColor: Colors.border,
  },
  thText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  td: {
    paddingVertical: 10, paddingHorizontal: Spacing.sm,
    justifyContent: 'center', borderRightWidth: 0.5, borderRightColor: Colors.divider,
  },
  tdText: { fontSize: FontSize.xs, color: Colors.text },
  tdMono: { fontSize: FontSize.xs, color: Colors.text, fontVariant: ['tabular-nums'] },
  tdNum: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center' },
  tdMuted: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center' },

  // Thumbnails
  thumbWrap: { width: 40, height: 28, borderRadius: 3, overflow: 'hidden' },
  thumb: { width: 40, height: 28 },
  pdfThumb: { width: 40, height: 28, borderRadius: 3, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },

  // Status pill
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.full, borderWidth: 1, alignSelf: 'flex-start' },
  statusPillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },

  // Mobile action buttons
  actionBtns: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  actionBtn: { padding: 3 },

  // Web action buttons
  webActionBtns: { flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' as any },
  webActionIcon: { padding: 4, borderRadius: BorderRadius.sm },
  webActionBtnGrey: {
    paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  webActionBtnRed: {
    paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  webActionTextGrey: { fontSize: 11, fontWeight: '600', color: '#6B7280' },
  webActionTextRed: { fontSize: 11, fontWeight: '600', color: '#DC2626' },

  // Empty row
  emptyRow: { paddingVertical: Spacing.xl, alignItems: 'center' },
  emptyRowText: { fontSize: FontSize.sm, color: Colors.textMuted },

  // Pagination
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.md, paddingTop: Spacing.md },
  pageBtn: {
    width: 36, height: 36, borderRadius: BorderRadius.sm, borderWidth: 1,
    borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface,
  },
  pageBtnDisabled: { opacity: 0.4 },
  pageText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600' },

  // Subcontractors section
  sectionDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.xl,
    marginHorizontal: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    flexWrap: 'wrap' as any,
    gap: Spacing.sm,
  },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  sectionSubtitle: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  sectionActions: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  subsEmpty: {
    marginHorizontal: Spacing.md,
    paddingVertical: Spacing.xl,
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 0.5,
    borderColor: Colors.border,
  },
  subsEmptyText: { fontSize: FontSize.sm, color: Colors.textMuted },
  subsList: {
    marginHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 0.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.divider,
  },
  subName: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, flex: 1 },
  subRowActions: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  subEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  subEditBtnText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textSecondary },
  subArchiveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F3F4F6',
  },
  subArchiveBtnText: { fontSize: FontSize.xs, fontWeight: '600', color: '#6B7280' },
  subFormInput: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSize.base,
    color: Colors.text,
    marginBottom: Spacing.md,
  },

  // Preview modal
  previewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: Spacing.md },
  previewBox: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, overflow: 'hidden', ...Shadow.md },
  previewBoxHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 14,
    borderBottomWidth: 0.5, borderBottomColor: Colors.border, backgroundColor: Colors.background,
  },
  previewBoxTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text },
  previewBoxCloseBtn: { padding: 4, borderRadius: BorderRadius.sm, backgroundColor: Colors.border },

  // Upload / Sub form sheet
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    ...Shadow.md,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: Spacing.md },
  sheetTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text, marginBottom: 4 },
  sheetSubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.md },
  sheetCurrentRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    marginBottom: Spacing.md, backgroundColor: '#F0FDF4', borderRadius: BorderRadius.sm, padding: Spacing.sm,
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
    backgroundColor: Colors.primary, borderRadius: BorderRadius.md, paddingVertical: Spacing.md, marginTop: Spacing.sm,
  },
  sheetUploadBtnText: { color: Colors.textInverse, fontWeight: '700', fontSize: FontSize.base },

  // Mobile MEWP cards
  cardList: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  mewpCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 0.5,
    borderColor: Colors.border,
    padding: Spacing.md,
    ...Shadow.sm,
  },
  mewpCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  mewpCardNum: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  mewpCardType: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 2,
  },
  mewpCardSerial: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
    marginBottom: Spacing.sm,
  },
  mewpCardDivider: {
    height: 0.5,
    backgroundColor: Colors.divider,
    marginBottom: Spacing.sm,
  },
  mewpCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  mewpCardLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '600',
    flex: 1,
  },
  mewpCardValue: {
    fontSize: FontSize.xs,
    color: Colors.text,
    flex: 2,
    textAlign: 'right',
  },
  mewpCardActions: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginTop: Spacing.md,
    flexWrap: 'wrap' as any,
  },
  cardActionUpload: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: '#EFF6FF',
  },
  cardActionUploadText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.primary,
  },
  cardActionEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  cardActionEditText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  cardActionArchive: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F3F4F6',
  },
  cardActionArchiveText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: '#6B7280',
  },
  cardActionDelete: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  cardActionDeleteText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: '#DC2626',
  },

  // Archived modal
  archivedNavBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.primary, paddingHorizontal: Spacing.md, paddingVertical: 14, minHeight: 56,
  },
  archivedNavTitle: { fontSize: FontSize.base, fontWeight: '800', color: Colors.textInverse },
  archivedNavClose: { padding: 4 },
  archivedEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingBottom: Spacing.xxl },
  archivedEmptyText: { fontSize: FontSize.base, color: Colors.textMuted, fontWeight: '500' },
  archivedList: { padding: Spacing.md, gap: Spacing.sm },
  archivedCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    borderWidth: 0.5, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.md, ...Shadow.sm,
  },
  archivedCardInfo: { flex: 1 },
  archivedCardType: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  archivedCardSerial: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2, fontVariant: ['tabular-nums'] },
  archivedCardSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  restoreBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: Colors.primary, borderRadius: BorderRadius.sm,
    paddingVertical: 7, paddingHorizontal: 12, flexShrink: 0,
  },
  restoreBtnText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '700' },
})
