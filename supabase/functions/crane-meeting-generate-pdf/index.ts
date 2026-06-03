// Edge Function: crane-meeting-generate-pdf
console.log('CRANE-MEETING-GENERATE-PDF: v2 - div content captured, newlines preserved')
//
// Generates an archive PDF for one or all active crane meetings.
//
// Called two ways:
//   1. From the app (AP/supervisor): POST { meeting_id: "..." }
//      -> processes that single meeting immediately.
//   2. From pg_cron (Friday 19:59): POST {}
//      -> processes all active meetings that have at least one signature.
//
// Page order:
//   1. Cover page   — title, date, site, creator name & role, project, phase, meeting time, sig count
//   2. Content pages — every section parsed from content_html with word-wrap and page breaks
//   3. Creator sign-off page — submitter name, real role, signature image
//   4. Attendees table — Name / Role / Company / signature image / Signed At (LAST)
//
// IMPORTANT DEPLOYMENT NOTE:
//   After editing this file, you MUST redeploy via Supabase Dashboard:
//   Edge Functions -> crane-meeting-generate-pdf -> Code tab -> paste full code -> Deploy updates.
//   Editing the local file does NOT update the live function.
//   Verify by checking the Logs tab for: CRANE-MEETING-GENERATE-PDF: v2 - div content captured, newlines preserved
//
// Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'npm:@supabase/supabase-js@^2'
import { PDFDocument, PDFFont, StandardFonts, rgb, PageSizes } from 'npm:pdf-lib@^1'

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

// Sanitise ALL text for pdf-lib StandardFonts (WinAnsi — no Unicode above Latin-1).
// EVERY string drawn to the PDF must pass through this function.
function clean(text: string | null | undefined): string {
  if (!text) return ''
  return String(text)
    .replace(/[—–]/g, '-')          // em-dash, en-dash -> hyphen
    .replace(/['']/g, "'")          // curly single quotes -> straight apostrophe
    .replace(/[""]/g, '"')          // curly double quotes -> straight
    .replace(/…/g, '...')           // ellipsis -> three dots
    .replace(/[ ]/g, ' ')           // non-breaking space -> regular space
    .replace(/[^\x00-\x7F]/g, '')   // strip any remaining non-ASCII
}

// Parse HTML string into text blocks for PDF rendering.
// Table rows (<tr>) are captured as a single block with a cells[] array so they
// render side by side. <div class="freetext"> blocks are captured as paragraph text,
// preserving newlines from the original textarea values. All other elements become flat
// text blocks.
function htmlToPdfBlocks(html: string): { type: string; text: string; cells?: string[] }[] {
  if (!html) return []
  const blocks: { type: string; text: string; cells?: string[] }[] = []

  function decodeEntities(s: string): string {
    return s
      .replace(/<br\s*\/?>/gi, '\n')          // convert <br> to newline BEFORE tag strip
      .replace(/<[^>]+>/g, '')
      .replace(/&#10003;|&#x2713;|&check;/gi, '')
      .replace(/&#10007;|&#x2717;/gi, '')
      .replace(/&mdash;|&#8212;|&ndash;|&#8211;|&minus;|&#8722;/gi, '-')
      .replace(/&times;|&#215;/gi, 'x')
      .replace(/&deg;|&#176;/gi, ' deg')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&quot;/gi, '"')
      .replace(/&#\d+;/g, '')
      .replace(/&#x[0-9a-f]+;/gi, '')
      .replace(/&[a-z]+;/gi, '')
      .replace(/[^\S\n]+/g, ' ')              // collapse horizontal whitespace, preserve newlines
      .trim()
  }

  // Match whole <tr> rows, individual h1/h2/h3/p/li elements, and specifically
  // <div class="freetext"> blocks (the user-entered textarea content in each section).
  // Using a targeted class match for freetext avoids noise from nested layout divs.
  const tokenRegex = /<tr[^>]*>([\s\S]*?)<\/tr>|<(h1|h2|h3|p|li)[^>]*>([\s\S]*?)<\/\2>|<div class="freetext"[^>]*>([\s\S]*?)<\/div>/gi
  let m: RegExpExecArray | null
  while ((m = tokenRegex.exec(html)) !== null) {
    if (m[1] !== undefined) {
      // Table row — extract each cell
      const cellRegex = /<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi
      const cells: string[] = []
      let c: RegExpExecArray | null
      while ((c = cellRegex.exec(m[1])) !== null) {
        cells.push(clean(decodeEntities(c[2])))
      }
      if (cells.some(x => x.length > 0)) {
        blocks.push({ type: 'tr', text: '', cells })
      }
    } else if (m[4] !== undefined) {
      // <div class="freetext"> — split on newlines so each textarea line is its own paragraph
      const rawText = decodeEntities(m[4])
      const lines = rawText.split(/\n+/).map(s => s.trim()).filter(s => s.length > 0)
      for (const line of lines) {
        blocks.push({ type: 'p', text: clean(line) })
      }
    } else {
      // h1/h2/h3/p/li — headings and inline elements
      const tag = m[2].toLowerCase()
      const rawText = decodeEntities(m[3])
      if (!rawText) continue
      const lines = rawText.split(/\n+/).map(s => s.trim()).filter(s => s.length > 0)
      if (lines.length === 0) continue
      // Headings and list items: collapse newlines to a single line
      blocks.push({ type: tag, text: clean(lines.join(' ')) })
    }
  }
  return blocks
}

// Wrap a clean string into lines that fit within maxWidth pt.
function wrapText(text: string, fnt: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const test = current ? `${current} ${word}` : word
    if (fnt.widthOfTextAtSize(test, size) > maxWidth) {
      if (current) lines.push(current)
      current = word
    } else {
      current = test
    }
  }
  if (current) lines.push(current)
  return lines.length ? lines : ['']
}

interface MeetingRecord {
  id: string
  site_id: string
  meeting_date: string
  meeting_time: string | null
  project: string | null
  project_no: string | null
  review_text: string | null
  incidents_text: string | null
  revised_methods: string | null
  future_lifts: string | null
  weather_forecast: string | null
  new_methods: string | null
  lifting_equipment: string | null
  any_other_business: string | null
  next_meeting_date: string | null
  submitter_name: string
  submitter_signature_url: string | null
  content_html: string | null
  created_by: string | null
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

async function processOneMeeting(
  adminClient: ReturnType<typeof createClient>,
  meetingId: string
): Promise<void> {
  console.log(`Processing crane meeting: ${meetingId}`)

  const { data: meeting, error: meetingError } = await adminClient
    .from('crane_meetings')
    .select('*, site:sites(name)')
    .eq('id', meetingId)
    .single<MeetingRecord>()

  if (meetingError || !meeting) {
    console.error(`Meeting ${meetingId} not found:`, meetingError?.message)
    return
  }

  const { data: signatures } = await adminClient
    .from('crane_meeting_signatures')
    .select('user_id, full_name, role, company, signature_image_url, signed_at')
    .eq('meeting_id', meetingId)
    .order('signed_at')

  const sigs = (signatures as SigRecord[]) ?? []

  // Resolve creator's real role from profiles
  let creatorRole = 'appointed_person'
  if (meeting.created_by) {
    const { data: creatorProfile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', meeting.created_by)
      .single<{ role: string }>()
    if (creatorProfile?.role) creatorRole = creatorProfile.role
  }

  // All date/name strings pass through clean() — title separators are plain hyphens (Section 10.14).
  const siteName  = clean(meeting.site?.name ?? 'Unknown Site')
  const meetDate  = new Date(meeting.meeting_date + 'T00:00:00Z')
  const dayOfWeek = clean(meetDate.toLocaleDateString('en-GB', { weekday: 'long' }))
  const dateFmt   = clean(meetDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }))
  const dateLong  = clean(meetDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))
  const docTitle  = clean(`Crane Meeting - ${siteName} - ${dayOfWeek} - ${dateFmt}`)

  const pdfDoc  = await PDFDocument.create()
  pdfDoc.setTitle(docTitle)
  const font     = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const [pageW, pageH] = PageSizes.A4
  const margin      = 50
  const usableWidth = pageW - margin * 2
  const navy        = rgb(0.06, 0.15, 0.26)
  const black       = rgb(0, 0, 0)
  const grey        = rgb(0.5, 0.5, 0.5)
  const midGrey     = rgb(0.4, 0.4, 0.4)

  // dt() is the ONLY gateway to page.drawText — applies clean() to every string.
  function dt(
    pg: any,
    text: string | number | null | undefined,
    x: number,
    y: number,
    size: number,
    bold = false,
    color = black,
  ) {
    const safe = clean(String(text ?? ''))
    if (!safe) return
    pg.drawText(safe, { x, y, size, font: bold ? boldFont : font, color })
  }

  function drawHLine(pg: any, y: number, thick = 0.5) {
    pg.drawLine({
      start: { x: margin, y },
      end:   { x: pageW - margin, y },
      thickness: thick,
      color: rgb(0.85, 0.85, 0.85),
    })
  }

  // ── PAGE 1: Cover ─────────────────────────────────────────────────────────────
  let page = pdfDoc.addPage([pageW, pageH])
  let y = pageH - margin

  // Navy header bar
  page.drawRectangle({ x: 0, y: pageH - 60, width: pageW, height: 60, color: navy })
  dt(page, 'CRANE MEETING', margin, pageH - 38, 14, true, rgb(1, 1, 1))

  // Centred document title — plain hyphens, no em-dashes
  const titleSize  = 15
  const titleWidth = boldFont.widthOfTextAtSize(docTitle, titleSize)
  const titleX     = Math.max(margin, (pageW - titleWidth) / 2)
  dt(page, docTitle, titleX, pageH - 82, titleSize, true, navy)

  y = pageH - 108

  dt(page, dateLong, margin, y, 12, true)
  y -= 18
  dt(page, `Site: ${siteName}`, margin, y, 10)
  y -= 14
  dt(page, `Project: ${clean(meeting.project ?? '-')}`, margin, y, 10)
  y -= 14
  dt(page, `Phase / Project No.: ${clean(meeting.project_no ?? '-')}`, margin, y, 10)
  y -= 14
  if (meeting.meeting_time) {
    dt(page, `Meeting Time: ${clean(meeting.meeting_time)}`, margin, y, 10)
    y -= 14
  }
  dt(page, `Created By: ${clean(meeting.submitter_name)}`, margin, y, 10)
  y -= 14
  dt(page, `Creator Role: ${clean(ROLE_LABELS[creatorRole] ?? creatorRole)}`, margin, y, 10)
  y -= 22

  drawHLine(page, y, 1)
  y -= 16

  // Section summary on cover
  const SECTIONS = [
    { label: 'Review of Last Week', value: clean(meeting.review_text ?? '-') },
    { label: 'Incidents / Problems', value: clean(meeting.incidents_text ?? '-') },
    { label: 'Revised Methods',      value: clean(meeting.revised_methods ?? '-') },
    { label: 'Future Lifts',         value: clean(meeting.future_lifts ?? '-') },
    { label: 'Weather Forecast',     value: clean(meeting.weather_forecast ?? '-') },
  ]

  for (const s of SECTIONS) {
    if (y < 100) break
    dt(page, `${s.label}:`, margin, y, 9, true, navy)
    y -= 12
    // Truncate value to single line on cover
    const val = s.value.split('\n')[0].substring(0, 80)
    dt(page, val || '-', margin + 8, y, 8, false, midGrey)
    y -= 14
  }

  y -= 8
  drawHLine(page, y, 0.5)
  y -= 14

  dt(page, `Signatures collected: ${sigs.length}`, margin, y, 9, false, midGrey)
  y -= 12
  const genTime = clean(new Date().toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }))
  dt(page, `PDF generated: ${genTime}`, margin, y, 8, false, grey)

  // ── PAGES 2+: Full meeting content ───────────────────────────────────────────
  if (meeting.content_html) {
    const blocks = htmlToPdfBlocks(meeting.content_html)
    if (blocks.length > 0) {
      page = pdfDoc.addPage([pageW, pageH])
      y = pageH - margin

      // Section header bar
      page.drawRectangle({ x: 0, y: pageH - 50, width: pageW, height: 50, color: navy })
      dt(page, 'CRANE MEETING CONTENT', margin, pageH - 33, 13, true, rgb(1, 1, 1))
      y = pageH - 70

      for (const block of blocks) {
        if (block.type === 'tr' && block.cells) {
          // Draw table row cells side by side, evenly distributed across usable width
          if (y < 70) { page = pdfDoc.addPage([pageW, pageH]); y = pageH - margin }
          const cells = block.cells
          const colWidth = usableWidth / cells.length
          let maxLines = 1

          // Pre-wrap each cell to find tallest row height
          const wrappedCells: string[][] = cells.map((cellText) => {
            const words = cellText.split(' ')
            const cellLines: string[] = []
            let line = ''
            for (const word of words) {
              const test = line ? `${line} ${word}` : word
              if (font.widthOfTextAtSize(test, 9) > colWidth - 8 && line) {
                cellLines.push(line); line = word
              } else { line = test }
            }
            if (line) cellLines.push(line)
            if (cellLines.length > maxLines) maxLines = cellLines.length
            return cellLines
          })

          // Draw each cell in its column
          wrappedCells.forEach((cellLines, ci) => {
            const cx = margin + ci * colWidth
            cellLines.forEach((ln, li) => {
              page.drawText(ln, { x: cx, y: y - li * 11, size: 9, font })
            })
          })
          y -= maxLines * 11 + 6
          page.drawLine({
            start: { x: margin, y: y + 2 },
            end:   { x: pageW - margin, y: y + 2 },
            thickness: 0.3,
            color: rgb(0.9, 0.9, 0.9),
          })
          y -= 4
        } else {
          const isBold      = block.type === 'h1' || block.type === 'h2' || block.type === 'h3'
          const size        = block.type === 'h1' ? 16 : block.type === 'h2' ? 12 : block.type === 'h3' ? 10 : 9
          const fnt         = isBold ? boldFont : font
          const prefix      = block.type === 'li' ? '• ' : ''
          const xIndent     = block.type === 'li' ? margin + 12 : margin
          const maxLineW    = usableWidth - (block.type === 'li' ? 12 : 0)
          const lineSpacing = size + 4

          if (isBold) y -= 6

          const lines = wrapText(prefix + block.text, fnt, size, maxLineW)
          for (const line of lines) {
            if (y < 60) {
              page = pdfDoc.addPage([pageW, pageH])
              y = pageH - margin
            }
            page.drawText(clean(line), { x: xIndent, y, size, font: fnt, color: black })
            y -= lineSpacing
          }

          y -= isBold ? 4 : 2
        }
      }
    }
  }

  // ── Creator sign-off page ─────────────────────────────────────────────────────
  if (y < 280) {
    page = pdfDoc.addPage([pageW, pageH])
    y = pageH - 60
  } else {
    y -= 20
    drawHLine(page, y, 1)
    y -= 20
  }

  dt(page, 'MEETING CREATED AND SIGNED BY', margin, y, 16, true, navy)
  y -= 40
  dt(page, `Date: ${dayOfWeek} ${dateFmt}`, margin, y, 11)
  y -= 20
  dt(page, `Name: ${clean(meeting.submitter_name)}`, margin, y, 11)
  y -= 20
  dt(page, `Role: ${clean(ROLE_LABELS[creatorRole] ?? creatorRole)}`, margin, y, 11)
  y -= 30
  dt(page, 'Signature:', margin, y, 11, true)
  y -= 80  // reserve 80pt so image renders below the label

  if (meeting.submitter_signature_url) {
    try {
      const { data: sigFile } = await adminClient.storage
        .from('crane-meeting-signatures')
        .download(meeting.submitter_signature_url)
      if (sigFile) {
        const sigBytes = await sigFile.arrayBuffer()
        let submitterSigImage
        try { submitterSigImage = await pdfDoc.embedPng(new Uint8Array(sigBytes)) }
        catch { submitterSigImage = await pdfDoc.embedJpg(new Uint8Array(sigBytes)) }
        page.drawImage(submitterSigImage, { x: margin, y, width: 200, height: 60 })
      } else {
        dt(page, '[signature on file]', margin, y + 30, 10, false, grey)
      }
    } catch (e) {
      console.error('Failed to embed submitter signature:', e)
      dt(page, '[signature on file]', margin, y + 30, 10, false, grey)
    }
  } else {
    dt(page, '[signature on file]', margin, y + 30, 10, false, grey)
  }

  // ── Attendees / Signatures table — LAST ───────────────────────────────────────
  if (sigs.length > 0) {
    page = pdfDoc.addPage([pageW, pageH])
    y = pageH - margin

    dt(page, 'ATTENDEES - SIGNATURES', margin, y, 13, true, navy)
    y -= 8
    drawHLine(page, y, 1)
    y -= 20

    const COL = {
      name:    margin,
      role:    margin + 130,
      company: margin + 240,
      signed:  margin + 350,
    }
    const rowH = 60

    function drawHeaders(pg: any, yPos: number) {
      dt(pg, 'Name',      COL.name,    yPos, 9, true)
      dt(pg, 'Role',      COL.role,    yPos, 9, true)
      dt(pg, 'Company',   COL.company, yPos, 9, true)
      dt(pg, 'Signed At', COL.signed,  yPos, 9, true)
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

      dt(page, clean(sig.full_name ?? '').substring(0, 22),                      COL.name,    textY, 9)
      dt(page, clean(ROLE_LABELS[sig.role] ?? sig.role ?? '').substring(0, 18),  COL.role,    textY, 9)
      dt(page, clean(sig.company ?? '').substring(0, 18),                        COL.company, textY, 9)

      // Operative signature image — 100x35px
      if (sig.signature_image_url) {
        try {
          const { data: sigFile } = await adminClient.storage
            .from('crane-meeting-signatures')
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
          dt(page, '[signature]', COL.signed, textY, 8, false, grey)
        }
      }

      const ts = clean(new Date(sig.signed_at).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false,
      }))
      dt(page, ts, COL.signed, y - 32, 7, false, midGrey)

      drawHLine(page, y - 38, 0.3)
      y -= rowH
    }
  }

  // ── Upload PDF ────────────────────────────────────────────────────────────────
  const pdfBytes = await pdfDoc.save()
  const pdfPath  = `${meeting.site_id}/${meetingId}.pdf`

  // Always remove then upload — never upsert on storage
  await adminClient.storage.from('crane-meeting-archive').remove([pdfPath])
  const { error: uploadError } = await adminClient.storage
    .from('crane-meeting-archive')
    .upload(pdfPath, pdfBytes, { contentType: 'application/pdf', upsert: false })

  if (uploadError) {
    console.error(`Upload failed for meeting ${meetingId}:`, uploadError.message)
    return
  }

  const { error: updateError } = await adminClient
    .from('crane_meetings')
    .update({
      archive_pdf_url: pdfPath,
      status:          'archived',
      archived_at:     new Date().toISOString(),
    })
    .eq('id', meetingId)

  if (updateError) {
    console.error(`Failed to archive meeting ${meetingId}:`, updateError.message)
  } else {
    console.log(`Archived crane meeting ${meetingId}, PDF at: ${pdfPath}`)
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let body: { meeting_id?: string } = {}
  try { body = await req.json() } catch { /* empty body is fine for cron mode */ }

  try {
    if (body.meeting_id) {
      await processOneMeeting(adminClient, body.meeting_id)
      return json({ ok: true })
    }

    // Cron mode: find all active meetings that have at least one signature
    const { data: eligible, error } = await adminClient
      .from('crane_meetings')
      .select('id')
      .eq('status', 'active')

    if (error) {
      console.error('Failed to fetch eligible meetings:', error.message)
      return json({ error: error.message }, 500)
    }

    // Only process meetings that have signatures (no point archiving an unsigned meeting)
    const ids: string[] = []
    for (const m of eligible ?? []) {
      const { count } = await adminClient
        .from('crane_meeting_signatures')
        .select('*', { count: 'exact', head: true })
        .eq('meeting_id', m.id)
      if ((count ?? 0) > 0) ids.push(m.id)
    }

    for (const id of ids) {
      await processOneMeeting(adminClient, id)
    }

    return json({ ok: true, processed: ids.length, meeting_ids: ids })
  } catch (err) {
    console.error('crane-meeting-generate-pdf unhandled error:', err)
    return json({ error: 'Internal server error' }, 500)
  }
})
