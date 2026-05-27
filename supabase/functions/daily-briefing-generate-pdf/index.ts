// Edge Function: daily-briefing-generate-pdf
console.log('DAILY-BRIEFING-GENERATE-PDF: v1')
//
// Generates an archive PDF for one or more daily briefings.
//
// Called two ways:
//   1. From the app (AP/supervisor): POST { briefing_id: "..." }
//      → processes that single briefing immediately.
//   2. From pg_cron (daily at 18:00): POST {}
//      → processes all active briefings created today across all sites.
//
// For each eligible briefing the function:
//   1. Fetches the briefing record + all signature records.
//   2. Builds a multi-section PDF with pdf-lib:
//        - Cover page: title, date, site, AP and supervisor, key details
//        - Attendees pages: table with Name / Role / Company / Signature image / Signed At
//        - Briefing content pages: weather, checklist, schedule as formatted text
//        - AP sign-off: submitter name and their signature image
//   3. Uploads the PDF to daily-briefing-archive/{site_id}/{briefing_id}.pdf
//   4. Updates daily_briefings: archive_pdf_url, status = 'archived', archived_at = NOW()
//
// Deployment: supabase functions deploy daily-briefing-generate-pdf
// Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'npm:@supabase/supabase-js@^2'
import { PDFDocument, StandardFonts, rgb, PageSizes } from 'npm:pdf-lib@^1'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

interface BriefingRecord {
  id: string
  site_id: string
  briefing_date: string
  wind_speed: string | null
  gust_speed: string | null
  weather_condition: string | null
  changes_on_site: string | null
  lifting_schedule: string | null
  any_other_business: string | null
  first_aider_name: string | null
  site_location: string | null
  muster_point: string | null
  q1_crane_clear: boolean | null
  q2_activities_planned: boolean | null
  q3_deliveries_scheduled: boolean | null
  q4_changes_communicated: boolean | null
  q5_accessory_checks: boolean | null
  q6_safety_first: boolean | null
  q7_crane_secured: boolean | null
  q8_whistles_working: boolean | null
  q9_radio_check: boolean | null
  ap_name: string
  supervisor_name: string
  submitter_name: string
  submitter_signature_url: string | null
  status: string
  site: { name: string } | null
}

interface SigRecord {
  user_id: string
  full_name: string
  role: string
  company: string
  signature_image_url: string
  signed_at: string
}

const ROLE_LABELS: Record<string, string> = {
  appointed_person:    'Appointed Person',
  crane_supervisor:    'Crane Supervisor',
  crane_operator:      'Crane Operator',
  slinger_signaller:   'Slinger/Signaller',
  subcontractor_admin: 'Sub Admin',
}

const YES_NO_LABELS: [string, keyof BriefingRecord][] = [
  ['Everyone clear on which crane?', 'q1_crane_clear'],
  ['All activities planned?', 'q2_activities_planned'],
  ['All deliveries scheduled?', 'q3_deliveries_scheduled'],
  ['Site changes communicated?', 'q4_changes_communicated'],
  ['Pre-use accessory checks reminded?', 'q5_accessory_checks'],
  ["Safety First communicated?", 'q6_safety_first'],
  ['Crane secured each floor?', 'q7_crane_secured'],
  ['Whistles checked?', 'q8_whistles_working'],
  ['Radio check completed?', 'q9_radio_check'],
]

async function processOneBriefing(
  adminClient: ReturnType<typeof createClient>,
  briefingId: string
): Promise<void> {
  console.log(`Processing briefing: ${briefingId}`)

  const { data: briefing, error: briefingError } = await adminClient
    .from('daily_briefings')
    .select('*, site:sites(name)')
    .eq('id', briefingId)
    .single<BriefingRecord>()

  if (briefingError || !briefing) {
    console.error(`Briefing ${briefingId} not found:`, briefingError?.message)
    return
  }

  const { data: signatures } = await adminClient
    .from('daily_briefing_signatures')
    .select('user_id, full_name, role, company, signature_image_url, signed_at')
    .eq('briefing_id', briefingId)
    .order('signed_at')

  const sigs = (signatures as SigRecord[]) ?? []

  // Build document title used in the PDF header and metadata
  const siteName = briefing.site?.name ?? 'Unknown Site'
  const dayOfWeek = new Date(briefing.briefing_date + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long' })
  const dateFormatted = new Date(briefing.briefing_date + 'T00:00:00Z').toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
  const docTitle = `Daily Briefing — ${siteName} — ${dayOfWeek} — ${dateFormatted}`

  const pdfDoc = await PDFDocument.create()
  pdfDoc.setTitle(docTitle)
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const [pageW, pageH] = PageSizes.A4
  const margin = 50

  function drawText(
    page: ReturnType<typeof pdfDoc.addPage>,
    text: string,
    x: number,
    y: number,
    size: number,
    bold = false,
    color = rgb(0, 0, 0)
  ) {
    page.drawText(String(text ?? '').substring(0, 120), { x, y, size, font: bold ? boldFont : font, color })
  }

  function drawHLine(page: ReturnType<typeof pdfDoc.addPage>, y: number, thick = 0.5) {
    page.drawLine({ start: { x: margin, y }, end: { x: pageW - margin, y }, thickness: thick, color: rgb(0.85, 0.85, 0.85) })
  }

  // ── Cover page ───────────────────────────────────────────────────────────
  let page = pdfDoc.addPage([pageW, pageH])
  let y = pageH - margin

  // Header bar
  page.drawRectangle({ x: 0, y: pageH - 60, width: pageW, height: 60, color: rgb(0.06, 0.15, 0.26) })
  drawText(page, 'DAILY TEAM BRIEFING: LIFTING OPERATIONS', margin, pageH - 38, 14, true, rgb(1, 1, 1))

  // Document title — centred below header bar, 16pt bold
  const titleFontSize = 16
  const titleTextWidth = boldFont.widthOfTextAtSize(docTitle, titleFontSize)
  const titleX = Math.max(margin, (pageW - titleTextWidth) / 2)
  page.drawText(docTitle, { x: titleX, y: pageH - 82, size: titleFontSize, font: boldFont, color: rgb(0.06, 0.15, 0.26) })

  y = pageH - 108  // shifted down from -80 to accommodate the title above

  const dateStr = new Date(briefing.briefing_date + 'T00:00:00Z').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  drawText(page, dateStr, margin, y, 12, true)
  y -= 18
  drawText(page, `Site: ${briefing.site?.name ?? 'Unknown Site'}`, margin, y, 10)
  y -= 16
  drawText(page, `Appointed Person: ${briefing.ap_name}`, margin, y, 10)
  y -= 14
  drawText(page, `Lifting Supervisor: ${briefing.supervisor_name}`, margin, y, 10)
  y -= 14
  drawText(page, `Submitted By: ${briefing.submitter_name}`, margin, y, 10)
  y -= 22

  drawHLine(page, y, 1)
  y -= 16

  // Forecast
  drawText(page, 'Forecast', margin, y, 11, true, rgb(0.06, 0.15, 0.26))
  y -= 14
  drawText(page, `Wind: ${briefing.wind_speed ?? '—'}   Gust: ${briefing.gust_speed ?? '—'}   Conditions: ${briefing.weather_condition ?? '—'}`, margin + 8, y, 9)
  y -= 20

  // Location / First Aider / Muster
  drawText(page, 'Site Details', margin, y, 11, true, rgb(0.06, 0.15, 0.26))
  y -= 14
  drawText(page, `First Aider: ${briefing.first_aider_name ?? '—'}`, margin + 8, y, 9)
  y -= 12
  drawText(page, `Location: ${briefing.site_location ?? '—'}`, margin + 8, y, 9)
  y -= 12
  drawText(page, `Muster Point: ${briefing.muster_point ?? '—'}`, margin + 8, y, 9)
  y -= 20

  // Checklist
  drawText(page, 'Have You Covered the Following?', margin, y, 11, true, rgb(0.06, 0.15, 0.26))
  y -= 14
  for (const [label, key] of YES_NO_LABELS) {
    const val = briefing[key]
    const answer = val === true ? 'YES' : val === false ? 'NO' : '—'
    const answerColor = val === true ? rgb(0.09, 0.64, 0.29) : val === false ? rgb(0.86, 0.15, 0.15) : rgb(0.5, 0.5, 0.5)
    drawText(page, label, margin + 8, y, 8)
    drawText(page, answer, pageW - margin - 30, y, 8, true, answerColor)
    y -= 11
    if (y < 100) break
  }

  y -= 10
  drawHLine(page, y, 0.5)
  y -= 14

  drawText(page, `Signatures collected: ${sigs.length}`, margin, y, 9, false, rgb(0.4, 0.4, 0.4))
  y -= 12
  if (sigs.length > 0) {
    const genTime = new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
    drawText(page, `PDF generated: ${genTime}`, margin, y, 8, false, rgb(0.5, 0.5, 0.5))
  }

  // ── Attendees pages ───────────────────────────────────────────────────────
  if (sigs.length > 0) {
    page = pdfDoc.addPage([pageW, pageH])
    y = pageH - margin

    drawText(page, 'ATTENDEES — SIGNATURES', margin, y, 13, true, rgb(0.06, 0.15, 0.26))
    y -= 8
    drawHLine(page, y, 1)
    y -= 20

    const COL = { name: margin, role: margin + 130, company: margin + 240, signed: margin + 350 }
    const rowH = 60

    function drawHeaders(p: ReturnType<typeof pdfDoc.addPage>, yPos: number) {
      drawText(p, 'Name',      COL.name,    yPos, 9, true)
      drawText(p, 'Role',      COL.role,    yPos, 9, true)
      drawText(p, 'Company',   COL.company, yPos, 9, true)
      drawText(p, 'Signed At', COL.signed,  yPos, 9, true)
    }

    drawHeaders(page, y)
    y -= 8
    drawHLine(page, y)
    y -= 18

    for (const sig of sigs) {
      if (y < rowH + margin) {
        page = pdfDoc.addPage([pageW, pageH])
        y = pageH - margin
        drawHeaders(page, y)
        y -= 8
        drawHLine(page, y)
        y -= 18
      }

      const textY = y - 22

      drawText(page, (sig.full_name ?? '').substring(0, 22), COL.name,    textY, 9)
      drawText(page, (ROLE_LABELS[sig.role] ?? sig.role ?? '').substring(0, 18), COL.role,    textY, 9)
      drawText(page, (sig.company ?? '').substring(0, 18), COL.company, textY, 9)

      // Signature image in the last column
      if (sig.signature_image_url) {
        try {
          const { data: sigFile } = await adminClient.storage
            .from('daily-briefing-signatures')
            .download(sig.signature_image_url)
          if (sigFile) {
            const sigBytes = await sigFile.arrayBuffer()
            let sigImage
            try { sigImage = await pdfDoc.embedPng(new Uint8Array(sigBytes)) }
            catch { sigImage = await pdfDoc.embedJpg(new Uint8Array(sigBytes)) }
            page.drawImage(sigImage, { x: COL.signed, y: y - 18, width: 100, height: 35 })
          }
        } catch (e) {
          console.error('Failed to embed attendee signature:', e)
          drawText(page, '[signature]', COL.signed, textY, 8, false, rgb(0.6, 0.6, 0.6))
        }
      }

      const ts = new Date(sig.signed_at).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false,
      })
      drawText(page, ts, COL.signed, y - 32, 7, false, rgb(0.4, 0.4, 0.4))

      drawHLine(page, y - 38, 0.3)
      y -= rowH
    }
  }

  // ── AP sign-off page ──────────────────────────────────────────────────────
  if (briefing.submitter_signature_url) {
    page = pdfDoc.addPage([pageW, pageH])
    y = pageH - margin

    drawText(page, 'APPOINTED PERSON SIGN-OFF', margin, y, 13, true, rgb(0.06, 0.15, 0.26))
    y -= 8
    drawHLine(page, y, 1)
    y -= 24

    drawText(page, `Date: ${dateStr}`, margin, y, 10)
    y -= 16
    drawText(page, `Name: ${briefing.submitter_name}`, margin, y, 10)
    y -= 16
    drawText(page, `Role: ${briefing.ap_name === briefing.submitter_name ? 'Appointed Person Resident' : 'Crane Supervisor'}`, margin, y, 10)
    y -= 24

    drawText(page, 'Signature:', margin, y, 10, true)
    y -= 8

    try {
      const { data: sigFile } = await adminClient.storage
        .from('daily-briefing-signatures')
        .download(briefing.submitter_signature_url)
      if (sigFile) {
        const sigBytes = await sigFile.arrayBuffer()
        let sigImage
        try { sigImage = await pdfDoc.embedPng(new Uint8Array(sigBytes)) }
        catch { sigImage = await pdfDoc.embedJpg(new Uint8Array(sigBytes)) }
        page.drawImage(sigImage, { x: margin, y: y - 50, width: 200, height: 60 })
      }
    } catch (e) {
      console.error('Failed to embed submitter signature:', e)
      drawText(page, '[signature not available]', margin, y - 20, 9, false, rgb(0.6, 0.6, 0.6))
    }
  }

  // ── Upload PDF ────────────────────────────────────────────────────────────
  const pdfBytes = await pdfDoc.save()
  const pdfPath = `${briefing.site_id}/${briefingId}.pdf`

  // Always remove then upload to avoid stale cached versions
  await adminClient.storage.from('daily-briefing-archive').remove([pdfPath])
  const { error: uploadError } = await adminClient.storage
    .from('daily-briefing-archive')
    .upload(pdfPath, pdfBytes, { contentType: 'application/pdf', upsert: false })

  if (uploadError) {
    console.error(`Upload failed for briefing ${briefingId}:`, uploadError.message)
    return
  }

  // Archive the briefing
  const { error: updateError } = await adminClient
    .from('daily_briefings')
    .update({
      archive_pdf_url: pdfPath,
      status: 'archived',
      archived_at: new Date().toISOString(),
    })
    .eq('id', briefingId)

  if (updateError) {
    console.error(`Failed to archive briefing ${briefingId}:`, updateError.message)
  } else {
    console.log(`Archived briefing ${briefingId}, PDF at: ${pdfPath}`)
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let body: { briefing_id?: string } = {}
  try { body = await req.json() } catch { /* empty body is fine for cron */ }

  try {
    if (body.briefing_id) {
      await processOneBriefing(adminClient, body.briefing_id)
      return json({ ok: true })
    }

    // Cron mode: process all active briefings created today
    const today = new Date().toISOString().split('T')[0]
    const { data: eligible, error } = await adminClient
      .from('daily_briefings')
      .select('id')
      .eq('status', 'active')
      .eq('briefing_date', today)

    if (error) {
      console.error('Failed to fetch eligible briefings:', error.message)
      return json({ error: error.message }, 500)
    }

    const ids = (eligible ?? []).map((b: { id: string }) => b.id)
    for (const id of ids) {
      await processOneBriefing(adminClient, id)
    }

    return json({ ok: true, processed: ids.length, briefing_ids: ids })
  } catch (err) {
    console.error('daily-briefing-generate-pdf unhandled error:', err)
    return json({ error: 'Internal server error' }, 500)
  }
})
