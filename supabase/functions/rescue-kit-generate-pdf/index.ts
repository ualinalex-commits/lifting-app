// Edge Function: rescue-kit-generate-pdf
console.log('RESCUE-KIT-GENERATE-PDF: v2 - branding removed, PLRK renamed and optional')
//
// Generates a signed weekly check PDF for a rescue kit.
//
// Called from the app when an AP or crane_supervisor signs the kit check:
//   POST { kit_id: "uuid", supervisor_name: "...", supervisor_signature_base64: "data:image/png;base64,..." }
//
// The function:
//   1. Fetches the rescue_kits record
//   2. Increments version_number by 1
//   3. Decodes the base64 signature and uploads to rescue-kit-signatures/{kit_id}/v{N}.png
//   4. Composes the PDF
//   5. Uploads the PDF to rescue-kit-archive/{site_id}/{kit_id}_v{N}.pdf
//   6. Inserts a rescue_kit_signed_checks record
//   7. Updates rescue_kits: last_signed_week_start = this_week_monday, last_version_number = N
//
// IMPORTANT DEPLOYMENT NOTE:
//   After editing this file, you MUST redeploy via Supabase Dashboard:
//   Edge Functions -> rescue-kit-generate-pdf -> Code tab -> paste full code -> Deploy updates.
//   Editing the local file does NOT update the live function.
//   Verify by checking the Logs tab for: RESCUE-KIT-GENERATE-PDF: v2 - branding removed, PLRK renamed and optional
//
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

// Sanitise ALL text for pdf-lib StandardFonts (WinAnsi — Latin-1 only).
// EVERY string drawn to the PDF must pass through clean().
function clean(text: string | null | undefined): string {
  if (!text) return ''
  return String(text)
    .replace(/[—–]/g, '-')
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .replace(/…/g, '...')
    .replace(/[ ]/g, ' ')
    .replace(/[^\x00-\x7F]/g, '')
}

// Decode a base64 data URI (data:image/png;base64,...) to Uint8Array.
function base64ToUint8Array(base64: string): Uint8Array {
  // Strip data URI prefix if present
  const b64 = base64.includes(',') ? base64.split(',')[1] : base64
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const result: number[] = []
  let i = 0
  const str = b64.replace(/=/g, '')
  while (i < str.length) {
    const enc1 = chars.indexOf(str[i++])
    const enc2 = chars.indexOf(str[i++])
    const enc3 = chars.indexOf(str[i++])
    const enc4 = chars.indexOf(str[i++])
    result.push((enc1 << 2) | (enc2 >> 4))
    if (enc3 !== -1) result.push(((enc2 & 15) << 4) | (enc3 >> 2))
    if (enc4 !== -1) result.push(((enc3 & 3) << 6) | enc4)
  }
  return new Uint8Array(result)
}

// Return the ISO date string for the Monday of the current week.
function getThisWeekMonday(): string {
  const now = new Date()
  const dow = now.getUTCDay() // 0=Sun, 1=Mon, ..6=Sat
  const diff = (dow + 6) % 7  // days back to Monday
  const monday = new Date(now)
  monday.setUTCDate(now.getUTCDate() - diff)
  return monday.toISOString().split('T')[0]
}

interface KitRecord {
  id: string
  site_id: string
  main_contractor: string
  project_name: string
  serial_number: string
  location_of_kit: string | null
  is_secured: boolean | null
  how_is_it_secured: string | null
  who_has_access: string | null
  plrk_number: string | null
  is_stretcher_in_bag: boolean | null
  is_pole_in_bag: boolean | null
  harness_count: string | null
  harness_packaging_status: string | null
  harness_serial_numbers: string | null
  certificates_of_conformity: string | null
  is_box_sealed: boolean | null
  unsealed_contents_complete: string | null
  last_version_number: number
  created_by: string | null
  site: { name: string } | null
}

const ROLE_LABELS: Record<string, string> = {
  appointed_person:  'Appointed Person',
  crane_supervisor:  'Crane Supervisor',
  crane_operator:    'Crane Operator',
  slinger_signaller: 'Slinger/Signaller',
  subcontractor_admin: 'Sub Admin',
}

function boolAnswer(v: boolean | null | undefined): string {
  if (v === true) return 'Yes'
  if (v === false) return 'No'
  return '-'
}

function harnessPackagingAnswer(v: string | null | undefined): string {
  if (v === 'new') return 'Still new in packaging'
  if (v === 'used') return 'Been used'
  return '-'
}

function unsealedAnswer(v: string | null | undefined): string {
  if (v === 'yes') return 'Yes'
  if (v === 'no') return 'No'
  if (v === 'n/a') return 'N/A'
  return '-'
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let body: { kit_id?: string; supervisor_name?: string; supervisor_signature_base64?: string; supervisor_id?: string } = {}
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON body' }, 400) }

  const { kit_id, supervisor_name, supervisor_signature_base64, supervisor_id } = body
  if (!kit_id || !supervisor_name || !supervisor_signature_base64 || !supervisor_id) {
    return json({ error: 'Missing required fields: kit_id, supervisor_name, supervisor_signature_base64, supervisor_id' }, 400)
  }

  try {
    console.log(`[rescue-kit] Processing kit: ${kit_id}`)

    // Fetch kit record
    const { data: kit, error: kitError } = await adminClient
      .from('rescue_kits')
      .select('*, site:sites(name)')
      .eq('id', kit_id)
      .single<KitRecord>()

    if (kitError || !kit) {
      console.error(`[rescue-kit] Kit not found: ${kitError?.message}`)
      return json({ error: `Kit not found: ${kitError?.message}` }, 404)
    }

    // Resolve supervisor role
    let supervisorRole = 'Crane Supervisor'
    const { data: supervisorProfile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', supervisor_id)
      .single<{ role: string }>()
    if (supervisorProfile?.role) {
      supervisorRole = ROLE_LABELS[supervisorProfile.role] ?? supervisorProfile.role
    }

    const newVersion = (kit.last_version_number ?? 0) + 1
    const thisMonday = getThisWeekMonday()
    const siteName = clean(kit.site?.name ?? 'Unknown Site')
    const contractor = clean(kit.main_contractor)
    const projectName = clean(kit.project_name)
    const serialNumber = clean(kit.serial_number)
    const docTitle = `${contractor} ${projectName} - ${serialNumber}`
    const docRef = `${contractor} ${projectName} Rescue Kit Checklist v${newVersion}`
    const signedDate = new Date().toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    })

    console.log(`[rescue-kit] Generating v${newVersion} for kit: ${docTitle}`)

    // Upload supervisor signature
    const sigBytes = base64ToUint8Array(supervisor_signature_base64)
    const sigPath = `${kit_id}/v${newVersion}.png`

    await adminClient.storage.from('rescue-kit-signatures').remove([sigPath])
    const { error: sigUploadError } = await adminClient.storage
      .from('rescue-kit-signatures')
      .upload(sigPath, sigBytes, { contentType: 'image/png', upsert: false })

    if (sigUploadError) {
      console.error(`[rescue-kit] Signature upload failed: ${sigUploadError.message}`)
      return json({ error: `Signature upload failed: ${sigUploadError.message}` }, 500)
    }
    console.log(`[rescue-kit] Signature uploaded to: ${sigPath}`)

    // ── Build PDF ────────────────────────────────────────────────────────────
    const pdfDoc = await PDFDocument.create()
    pdfDoc.setTitle(docRef)

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

    const [pageW, pageH] = PageSizes.A4
    const margin = 50
    const usableWidth = pageW - margin * 2
    const navy = rgb(0.06, 0.15, 0.26)
    const black = rgb(0, 0, 0)
    const grey = rgb(0.5, 0.5, 0.5)
    const lightGrey = rgb(0.9, 0.9, 0.9)
    const midGrey = rgb(0.4, 0.4, 0.4)
    const darkNavy = rgb(0.04, 0.10, 0.20)

    function dt(pg: any, text: string | null | undefined, x: number, y: number, size: number, bold = false, color = black) {
      const safe = clean(String(text ?? ''))
      if (!safe) return
      pg.drawText(safe, { x, y, size, font: bold ? boldFont : font, color })
    }

    function drawHLine(pg: any, y: number, thick = 0.5, color = lightGrey) {
      pg.drawLine({
        start: { x: margin, y },
        end: { x: pageW - margin, y },
        thickness: thick,
        color,
      })
    }

    // Word-wrap helper
    function wrapText(text: string, fnt: any, size: number, maxWidth: number): string[] {
      const words = String(text).split(' ')
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

    // Draw a 2-cell table row with background alternation
    function drawTableRow2(pg: any, yPos: number, col1: string, col2: string, isHeader: boolean, isAlt: boolean): number {
      const col1Width = usableWidth * 0.55
      const col2Width = usableWidth * 0.45
      const cellPadding = 6
      const fontSize = isHeader ? 9 : 9

      // Wrap each cell
      const lines1 = wrapText(col1, isHeader ? boldFont : font, fontSize, col1Width - cellPadding * 2)
      const lines2 = wrapText(col2, font, fontSize, col2Width - cellPadding * 2)
      const maxLines = Math.max(lines1.length, lines2.length)
      const rowHeight = maxLines * 12 + cellPadding * 2

      // Background
      if (isHeader) {
        pg.drawRectangle({ x: margin, y: yPos - rowHeight, width: usableWidth, height: rowHeight, color: navy })
      } else if (isAlt) {
        pg.drawRectangle({ x: margin, y: yPos - rowHeight, width: usableWidth, height: rowHeight, color: rgb(0.96, 0.97, 0.99) })
      }

      // Cell borders
      pg.drawRectangle({ x: margin, y: yPos - rowHeight, width: col1Width, height: rowHeight, borderColor: lightGrey, borderWidth: 0.5, color: undefined })
      pg.drawRectangle({ x: margin + col1Width, y: yPos - rowHeight, width: col2Width, height: rowHeight, borderColor: lightGrey, borderWidth: 0.5, color: undefined })

      const textColor = isHeader ? rgb(1, 1, 1) : black
      const textY = yPos - cellPadding - 10

      for (let li = 0; li < lines1.length; li++) {
        pg.drawText(clean(lines1[li]), { x: margin + cellPadding, y: textY - li * 12, size: fontSize, font: isHeader ? boldFont : font, color: textColor })
      }
      for (let li = 0; li < lines2.length; li++) {
        pg.drawText(clean(lines2[li]), { x: margin + col1Width + cellPadding, y: textY - li * 12, size: fontSize, font, color: textColor })
      }

      return rowHeight
    }

    // Draw a 4-cell info row (used for supervisor table and signature box rows)
    function drawTableRow4(pg: any, yPos: number, c1: string, c2: string, c3: string, c4: string, rowH: number, c1Bold = false, hasImage = false) {
      const colW = usableWidth / 4

      // Row background
      pg.drawRectangle({ x: margin, y: yPos - rowH, width: usableWidth, height: rowH, borderColor: lightGrey, borderWidth: 0.5, color: undefined })

      const cellPad = 6
      const textY = yPos - cellPad - 10

      dt(pg, c1, margin + cellPad, textY, 9, c1Bold, midGrey)
      if (!hasImage) dt(pg, c2, margin + colW + cellPad, textY, 9, false, black)
      dt(pg, c3, margin + colW * 2 + cellPad, textY, 9, c1Bold, midGrey)
      dt(pg, c4, margin + colW * 3 + cellPad, textY, 9, false, black)

      // Vertical dividers
      for (let i = 1; i <= 3; i++) {
        pg.drawLine({
          start: { x: margin + colW * i, y: yPos },
          end: { x: margin + colW * i, y: yPos - rowH },
          thickness: 0.5,
          color: lightGrey,
        })
      }
    }

    // ── Page 1 ───────────────────────────────────────────────────────────────
    const page = pdfDoc.addPage([pageW, pageH])
    let y = pageH - margin

    // Navy header bar
    page.drawRectangle({ x: 0, y: pageH - 55, width: pageW, height: 55, color: navy })
    dt(page, 'TOWER CRANE RESCUE KIT CHECKLIST', margin, pageH - 36, 13, true, rgb(1, 1, 1))

    y = pageH - 75

    // Document title (centred)
    const titleSize = 12
    const titleWidth = boldFont.widthOfTextAtSize(docTitle, titleSize)
    const titleX = Math.max(margin, (pageW - titleWidth) / 2)
    dt(page, docTitle, titleX, y, titleSize, true, darkNavy)
    y -= 18

    // Subtitle centred
    const subtitle = 'Tower Crane Rescue Kit Checklist'
    const subWidth = font.widthOfTextAtSize(subtitle, 10)
    dt(page, subtitle, (pageW - subWidth) / 2, y, 10, false, midGrey)
    y -= 20

    drawHLine(page, y, 1, navy)
    y -= 16

    // ── Supervisor & Site row (4-cell table) ─────────────────────────────────
    drawTableRow4(page, y, 'Name of lift Supervisor', clean(supervisor_name), 'Site', projectName, 28, true)
    y -= 28
    y -= 10

    // ── Main checklist table ─────────────────────────────────────────────────
    const QUESTIONS: [string, string][] = [
      ['Location of Rescue Kit?',                               clean(kit.location_of_kit ?? '-')],
      ['Is it secured?',                                        boolAnswer(kit.is_secured)],
      ['How is it secured? (key/Code)',                        clean(kit.how_is_it_secured ?? '-')],
      ['Who has access to the key/Code?',                       clean(kit.who_has_access ?? '-')],
      ['What is the serial number on the seal?',                serialNumber],
      ['What is the individual / company specific serial number?', clean(kit.plrk_number || '-')],
      ['Is the Stretcher in the bag?',                          boolAnswer(kit.is_stretcher_in_bag)],
      ['Is the pole in the bag?',                               boolAnswer(kit.is_pole_in_bag)],
      ['How many Harness are with the kit?',                    clean(kit.harness_count ?? '-')],
      ['Are they still new in packaging or have they been used?', harnessPackagingAnswer(kit.harness_packaging_status)],
      ['What are the serial numbers of the harness?',           clean(kit.harness_serial_numbers ?? '-')],
      ['Are all certificates of conformity / thorough examination with the kit? (Include Expiry Date)', clean(kit.certificates_of_conformity ?? '-')],
      ['Is the box still sealed?',                              boolAnswer(kit.is_box_sealed)],
      ['If the box is unsealed are all the contents still in the box as listed on the certificate of conformity?', unsealedAnswer(kit.unsealed_contents_complete)],
    ]

    // Table header
    const headerH = drawTableRow2(page, y, 'Question', 'Answer', true, false)
    y -= headerH

    for (let qi = 0; qi < QUESTIONS.length; qi++) {
      const [q, a] = QUESTIONS[qi]
      if (y < 80) {
        // Should not be needed for single page, but safety guard
        console.log('[rescue-kit] Warning: content near page bottom, may clip')
        break
      }
      const rowH = drawTableRow2(page, y, q, a, false, qi % 2 === 1)
      y -= rowH
    }

    y -= 14

    // ── Footer notes ─────────────────────────────────────────────────────────
    if (y < 120) {
      // Notes might clip — they'll still render but may be cut off
      console.log('[rescue-kit] Warning: footer notes near page bottom')
    }

    const note1 = 'If you are in doubt of answers to any of the above questions or you suspect that items within the rescue kit are missing/damaged/out of date, then please contact the Appointed Person and/or Health & Safety Manager immediately.'
    const note2 = "It is the lift Supervisor's responsibility to ensure that this rescue kit is intact and available immediately should a rescue situation transpire."

    const noteLines1 = wrapText(note1, font, 8, usableWidth)
    for (const ln of noteLines1) {
      if (y < 60) break
      page.drawText(clean(ln), { x: margin, y, size: 8, font, color: midGrey })
      y -= 11
    }
    y -= 4
    const noteLines2 = wrapText(note2, font, 8, usableWidth)
    for (const ln of noteLines2) {
      if (y < 60) break
      page.drawText(clean(ln), { x: margin, y, size: 8, font, color: midGrey })
      y -= 11
    }

    y -= 14

    // ── Signature box (2-row, 4-cell table) ───────────────────────────────────
    const sigBoxRowH = 50

    // Row 1: Signature of responsible Person | [signature image] | Job Title | {role}
    drawTableRow4(page, y, 'Signature of responsible Person', '', 'Job Title', clean(supervisorRole), sigBoxRowH, true, true)

    // Embed signature image in column 2
    const colW4 = usableWidth / 4
    try {
      let sigImage
      try { sigImage = await pdfDoc.embedPng(sigBytes) }
      catch { sigImage = await pdfDoc.embedJpg(sigBytes) }
      page.drawImage(sigImage, {
        x: margin + colW4 + 6,
        y: y - sigBoxRowH + 6,
        width: colW4 - 12,
        height: sigBoxRowH - 12,
      })
    } catch (e) {
      console.error('[rescue-kit] Failed to embed signature image:', e)
      dt(page, '[signature]', margin + colW4 + 6, y - sigBoxRowH / 2, 8, false, grey)
    }

    y -= sigBoxRowH

    // Row 2: Print Name | {supervisor_name} | Date | {signed_date}
    drawTableRow4(page, y, 'Print Name', clean(supervisor_name), 'Date', clean(signedDate), 26, true)
    y -= 26

    y -= 10

    // ── Page footer ───────────────────────────────────────────────────────────
    drawHLine(page, y, 0.5, lightGrey)
    y -= 14

    dt(page, 'Page 1 of 1', pageW / 2 - 20, y, 8, false, grey)
    const refWidth = font.widthOfTextAtSize(docRef, 8)
    dt(page, docRef, pageW - margin - refWidth, y, 8, false, grey)

    // ── Upload PDF ────────────────────────────────────────────────────────────
    const pdfBytes = await pdfDoc.save()
    const pdfPath = `${kit.site_id}/${kit_id}_v${newVersion}.pdf`

    await adminClient.storage.from('rescue-kit-archive').remove([pdfPath])
    const { error: uploadError } = await adminClient.storage
      .from('rescue-kit-archive')
      .upload(pdfPath, pdfBytes, { contentType: 'application/pdf', upsert: false })

    if (uploadError) {
      console.error(`[rescue-kit] PDF upload failed: ${uploadError.message}`)
      return json({ error: `PDF upload failed: ${uploadError.message}` }, 500)
    }
    console.log(`[rescue-kit] PDF uploaded to: ${pdfPath}`)

    // ── Insert signed check record ────────────────────────────────────────────
    const { error: insertError } = await adminClient
      .from('rescue_kit_signed_checks')
      .insert({
        kit_id,
        version_number: newVersion,
        supervisor_name: clean(supervisor_name),
        supervisor_id,
        signature_url: sigPath,
        pdf_url: pdfPath,
        week_start_date: thisMonday,
      })

    if (insertError) {
      console.error(`[rescue-kit] Insert signed check failed: ${insertError.message}`)
      return json({ error: `Insert signed check failed: ${insertError.message}` }, 500)
    }

    // ── Update rescue_kits record ─────────────────────────────────────────────
    const { error: updateError } = await adminClient
      .from('rescue_kits')
      .update({
        last_signed_week_start: thisMonday,
        last_version_number: newVersion,
        updated_at: new Date().toISOString(),
      })
      .eq('id', kit_id)

    if (updateError) {
      console.error(`[rescue-kit] Update kit record failed: ${updateError.message}`)
      // Non-fatal — PDF and check record are already saved
    }

    console.log(`[rescue-kit] Done: kit ${kit_id} v${newVersion} signed, PDF at ${pdfPath}`)
    return json({ ok: true, version_number: newVersion, pdf_url: pdfPath })

  } catch (err) {
    console.error('[rescue-kit] Unhandled error:', err)
    return json({ error: 'Internal server error' }, 500)
  }
})
