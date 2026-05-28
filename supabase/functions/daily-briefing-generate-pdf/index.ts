// Edge Function: daily-briefing-generate-pdf
console.log('DAILY-BRIEFING-GENERATE-PDF: v6 - table rows render as columns')
//
// Generates an archive PDF for one or more daily briefings.
//
// Called two ways:
//   1. From the app (AP/supervisor): POST { briefing_id: "..." }
//      -> processes that single briefing immediately.
//   2. From pg_cron (daily at 18:00): POST {}
//      -> processes all active briefings created today across all sites.
//
// Page order (fixed in v3):
//   1. Cover page   — title, date, site, creator, weather summary, checklist, sig count
//   2. Content pages — every block parsed from content_html (full boilerplate + dynamic fields)
//   3. Sign-off page — submitter name, actual role, signature image (never cut off)
//   4. Attendees    — Name / Role / Company / Signature image / Signed At (LAST)
//
// Deployment: paste into Supabase Dashboard -> Edge Functions -> daily-briefing-generate-pdf -> Deploy
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
// Uses unicode escape codes (not literal glyphs) so the regex never depends on source
// file encoding. EVERY string drawn to the PDF must pass through this function.
function clean(text: string | null | undefined): string {
  if (!text) return ''
  return String(text)
    .replace(/[—–]/g, '-')   // em-dash, en-dash -> hyphen
    .replace(/[‘’]/g, "'")   // curly single quotes -> straight apostrophe
    .replace(/[“”]/g, '"')   // curly double quotes -> straight
    .replace(/…/g, '...')         // ellipsis -> three dots
    .replace(/[ ]/g, ' ')         // non-breaking space -> regular space
    .replace(/[^\x00-\x7F]/g, '')      // strip any remaining non-ASCII
}

// Parse HTML string into text blocks for PDF rendering.
// Table rows (<tr>) are captured as a single block with a cells[] array so they
// can be drawn side by side. All other elements (h1/h2/h3/p/li) become flat text blocks.
function htmlToPdfBlocks(html: string): { type: string; text: string; cells?: string[] }[] {
  if (!html) return []
  const blocks: { type: string; text: string; cells?: string[] }[] = []

  function decodeEntities(s: string): string {
    return s
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
      .replace(/\s+/g, ' ')
      .trim()
  }

  // Process in document order: match whole <tr> rows and individual h1/h2/h3/p/li elements.
  const tokenRegex = /<tr[^>]*>([\s\S]*?)<\/tr>|<(h1|h2|h3|p|li)[^>]*>([\s\S]*?)<\/\2>/gi
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
    } else {
      // Heading, paragraph, or list item
      const tag = m[2].toLowerCase()
      const text = clean(decodeEntities(m[3]))
      if (text) blocks.push({ type: tag, text })
    }
  }
  return blocks
}

// Wrap a single (already-clean) string into lines that fit within maxWidth pt.
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

const YES_NO_LABELS: [string, keyof BriefingRecord][] = [
  ['Everyone clear on which crane?',     'q1_crane_clear'],
  ['All activities planned?',            'q2_activities_planned'],
  ['All deliveries scheduled?',          'q3_deliveries_scheduled'],
  ['Site changes communicated?',         'q4_changes_communicated'],
  ['Pre-use accessory checks reminded?', 'q5_accessory_checks'],
  ['Safety First communicated?',         'q6_safety_first'],
  ['Crane secured each floor?',          'q7_crane_secured'],
  ['Whistles checked?',                  'q8_whistles_working'],
  ['Radio check completed?',             'q9_radio_check'],
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

  // Resolve creator's actual role from profiles (AP or crane_supervisor)
  let creatorRole = 'appointed_person'
  if (briefing.created_by) {
    const { data: creatorProfile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', briefing.created_by)
      .single<{ role: string }>()
    if (creatorProfile?.role) creatorRole = creatorProfile.role
  }

  // All date/name strings go through clean() so no Unicode leaks into pdf-lib.
  // Title separator is plain hyphen — never an em-dash.
  const siteName   = clean(briefing.site?.name ?? 'Unknown Site')
  const briefDate  = new Date(briefing.briefing_date + 'T00:00:00Z')
  const dayOfWeek  = clean(briefDate.toLocaleDateString('en-GB', { weekday: 'long' }))
  const dateFmt    = clean(briefDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }))
  const dateLong   = clean(briefDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))
  const docTitle   = clean(`Daily Briefing - ${siteName} - ${dayOfWeek} - ${dateFmt}`)

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
  // No raw string ever reaches page.drawText directly.
  function dt(
    pg: any,
    text: string | number | boolean | null | undefined,
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

  // ── PAGE 1: Cover ────────────────────────────────────────────────────────────
  let page = pdfDoc.addPage([pageW, pageH])
  let y = pageH - margin

  // Navy header bar
  page.drawRectangle({ x: 0, y: pageH - 60, width: pageW, height: 60, color: navy })
  dt(page, 'DAILY TEAM BRIEFING: LIFTING OPERATIONS', margin, pageH - 38, 14, true, rgb(1, 1, 1))

  // Centred document title — uses plain hyphens built above
  const titleSize  = 16
  const titleWidth = boldFont.widthOfTextAtSize(docTitle, titleSize)
  const titleX     = Math.max(margin, (pageW - titleWidth) / 2)
  dt(page, docTitle, titleX, pageH - 82, titleSize, true, navy)

  y = pageH - 108

  dt(page, dateLong, margin, y, 12, true)
  y -= 18
  dt(page, `Site: ${siteName}`, margin, y, 10)
  y -= 16
  dt(page, `Appointed Person: ${clean(briefing.ap_name)}`, margin, y, 10)
  y -= 14
  dt(page, `Lifting Supervisor: ${clean(briefing.supervisor_name)}`, margin, y, 10)
  y -= 14
  dt(page, `Submitted By: ${clean(briefing.submitter_name)}`, margin, y, 10)
  y -= 22

  drawHLine(page, y, 1)
  y -= 16

  // Forecast
  dt(page, 'Forecast', margin, y, 11, true, navy)
  y -= 14
  dt(
    page,
    `Wind: ${clean(briefing.wind_speed ?? '-')}   Gust: ${clean(briefing.gust_speed ?? '-')}   Conditions: ${clean(briefing.weather_condition ?? '-')}`,
    margin + 8, y, 9
  )
  y -= 20

  // Site details
  dt(page, 'Site Details', margin, y, 11, true, navy)
  y -= 14
  dt(page, `First Aider: ${clean(briefing.first_aider_name ?? '-')}`, margin + 8, y, 9)
  y -= 12
  dt(page, `Location: ${clean(briefing.site_location ?? '-')}`, margin + 8, y, 9)
  y -= 12
  dt(page, `Muster Point: ${clean(briefing.muster_point ?? '-')}`, margin + 8, y, 9)
  y -= 20

  // Checklist summary
  dt(page, 'Have You Covered the Following?', margin, y, 11, true, navy)
  y -= 14
  for (const [label, key] of YES_NO_LABELS) {
    const val = briefing[key]
    const answer      = val === true ? 'YES' : val === false ? 'NO' : '-'
    const answerColor = val === true ? rgb(0.09, 0.64, 0.29) : val === false ? rgb(0.86, 0.15, 0.15) : grey
    dt(page, label,  margin + 8,         y, 8)
    dt(page, answer, pageW - margin - 30, y, 8, true, answerColor)
    y -= 11
    if (y < 100) break
  }

  y -= 10
  drawHLine(page, y, 0.5)
  y -= 14

  dt(page, `Signatures collected: ${sigs.length}`, margin, y, 9, false, midGrey)
  y -= 12
  const genTime = clean(new Date().toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }))
  dt(page, `PDF generated: ${genTime}`, margin, y, 8, false, grey)

  // ── PAGES 2+: Full briefing content ─────────────────────────────────────────
  // Renders EVERY block from content_html so the archived PDF is a complete record:
  // changes on site, lifting schedule, any other business, all boilerplate sections.
  if (briefing.content_html) {
    const blocks = htmlToPdfBlocks(briefing.content_html)
    if (blocks.length > 0) {
      page = pdfDoc.addPage([pageW, pageH])
      y = pageH - margin

      // Section header bar
      page.drawRectangle({ x: 0, y: pageH - 50, width: pageW, height: 50, color: navy })
      dt(page, 'BRIEFING CONTENT', margin, pageH - 33, 13, true, rgb(1, 1, 1))
      y = pageH - 70

      for (const block of blocks) {
        if (block.type === 'tr' && block.cells) {
          // Draw table row cells side by side, evenly distributed across usable width
          if (y < 70) { page = pdfDoc.addPage([pageW, pageH]); y = pageH - margin }
          const cells = block.cells
          const colWidth = usableWidth / cells.length
          let maxLines = 1
          // Pre-wrap each cell to find the tallest row height
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
          // Draw each cell's lines in its column
          wrappedCells.forEach((cellLines, ci) => {
            const cx = margin + ci * colWidth
            cellLines.forEach((ln, li) => {
              page.drawText(ln, { x: cx, y: y - li * 11, size: 9, font })
            })
          })
          y -= maxLines * 11 + 6
          // Light row separator
          page.drawLine({ start: { x: margin, y: y + 2 }, end: { x: pageW - margin, y: y + 2 }, thickness: 0.3, color: rgb(0.9, 0.9, 0.9) })
          y -= 4
        } else {
          const isBold      = block.type === 'h1' || block.type === 'h2' || block.type === 'h3'
          const size        = block.type === 'h1' ? 16 : block.type === 'h2' ? 13 : block.type === 'h3' ? 11 : 10
          const fnt         = isBold ? boldFont : font
          const prefix      = block.type === 'li' ? '• ' : ''
          const xIndent     = block.type === 'li' ? margin + 12 : margin
          const maxLineW    = usableWidth - (block.type === 'li' ? 12 : 0)
          const lineSpacing = size + 4

          // Extra breathing room above headings
          if (isBold) y -= 6

          // text is already clean() from htmlToPdfBlocks — wrapText just splits
          const lines = wrapText(prefix + block.text, fnt, size, maxLineW)
          for (const line of lines) {
            if (y < 60) {
              page = pdfDoc.addPage([pageW, pageH])
              y = pageH - margin
            }
            // clean() called again here as the zero-exceptions guarantee
            page.drawText(clean(line), { x: xIndent, y, size, font: fnt, color: black })
            y -= lineSpacing
          }

          y -= isBold ? 4 : 2
        }
      }
    }
  }

  // ── Creator sign-off section ──────────────────────────────────────────────────
  // Space required: heading(16) + gap(40) + date(11)+gap(20) + name(11)+gap(20)
  //   + role(11)+gap(30) + label(11)+gap(80) + image(65) + bottom margin(50) ~ 365pt
  // If insufficient room on the current page, start a fresh one.
  if (y < 280) {
    page = pdfDoc.addPage([pageW, pageH])
    y = pageH - 60
  } else {
    // Visual separator from content above
    y -= 20
    drawHLine(page, y, 1)
    y -= 20
  }

  dt(page, 'BRIEFING CREATED AND SIGNED BY', margin, y, 16, true, navy)
  y -= 40
  dt(page, `Date: ${dayOfWeek} ${dateFmt}`, margin, y, 11)
  y -= 20
  dt(page, `Name: ${clean(briefing.submitter_name)}`, margin, y, 11)
  y -= 20
  dt(page, `Role: ${clean(ROLE_LABELS[creatorRole] ?? creatorRole)}`, margin, y, 11)
  y -= 30
  dt(page, 'Signature:', margin, y, 11, true)
  y -= 80  // reserve 80pt so the image renders BELOW the label, never cut off

  // Draw submitter signature image at current y (pdf-lib y = bottom-left of image).
  // Image: 160w x 65h. Bottom at y, top at y+65. Safe as long as y >= 50 (margin).
  if (briefing.submitter_signature_url) {
    try {
      const { data: sigFile } = await adminClient.storage
        .from('daily-briefing-signatures')
        .download(briefing.submitter_signature_url)
      if (sigFile) {
        const sigBytes = await sigFile.arrayBuffer()
        let submitterSigImage
        try { submitterSigImage = await pdfDoc.embedPng(new Uint8Array(sigBytes)) }
        catch { submitterSigImage = await pdfDoc.embedJpg(new Uint8Array(sigBytes)) }
        page.drawImage(submitterSigImage, { x: margin, y, width: 160, height: 65 })
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

  // ── Attendees / Signatures table — LAST ──────────────────────────────────────
  // Kept structurally identical to v2 — operative signature rendering is correct.
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

      dt(page, clean(sig.full_name ?? '').substring(0, 22),                        COL.name,    textY, 9)
      dt(page, clean(ROLE_LABELS[sig.role] ?? sig.role ?? '').substring(0, 18),    COL.role,    textY, 9)
      dt(page, clean(sig.company ?? '').substring(0, 18),                          COL.company, textY, 9)

      // Operative signature image — rendering kept exactly as v2 (confirmed correct)
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

  // ── Upload PDF ───────────────────────────────────────────────────────────────
  const pdfBytes = await pdfDoc.save()
  const pdfPath  = `${briefing.site_id}/${briefingId}.pdf`

  // Always remove then upload — never upsert on storage
  await adminClient.storage.from('daily-briefing-archive').remove([pdfPath])
  const { error: uploadError } = await adminClient.storage
    .from('daily-briefing-archive')
    .upload(pdfPath, pdfBytes, { contentType: 'application/pdf', upsert: false })

  if (uploadError) {
    console.error(`Upload failed for briefing ${briefingId}:`, uploadError.message)
    return
  }

  const { error: updateError } = await adminClient
    .from('daily_briefings')
    .update({
      archive_pdf_url: pdfPath,
      status:          'archived',
      archived_at:     new Date().toISOString(),
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
  try { body = await req.json() } catch { /* empty body is fine for cron mode */ }

  try {
    if (body.briefing_id) {
      await processOneBriefing(adminClient, body.briefing_id)
      return json({ ok: true })
    }

    // Cron mode: find all active briefings created today and archive each one
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
