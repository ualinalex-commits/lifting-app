// Edge Function: generate-signoff
//
// Generates a sign-off PDF for one or more toolbox talks.
//
// Called two ways:
//   1. From the app (AP/supervisor): POST { talk_id: "..." }
//      → processes that single talk immediately.
//   2. From pg_cron (daily, service role): POST {}
//      → processes all eligible talks (active, has ≥1 signature, no sign_off_pdf_url).
//
// For each eligible talk the function:
//   1. Fetches the talk record and all signature records.
//   2. Builds a sign-off page PDF with pdf-lib.
//   3. Uploads the combined PDF to Supabase Storage.
//   4. Updates the talk: sign_off_pdf_url, is_archived = true, archived_at = NOW().

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

interface TalkRecord {
  id: string
  site_id: string
  title: string
  content_type: string
  pdf_url: string | null
  sign_off_pdf_url: string | null
  is_archived: boolean
  site: { name: string; company_id: string } | null
}

interface SignatureRecord {
  id: string
  user_id: string
  full_name: string
  role: string
  company_name: string
  signature_url: string
  signed_at: string
}

async function processOneTalk(
  adminClient: ReturnType<typeof createClient>,
  talkId: string
): Promise<void> {
  // Fetch talk
  const { data: talk, error: talkError } = await adminClient
    .from('toolbox_talks')
    .select('id, site_id, title, content_type, pdf_url, sign_off_pdf_url, is_archived, site:sites(name, company_id)')
    .eq('id', talkId)
    .single<TalkRecord>()

  if (talkError || !talk) {
    console.error(`Talk ${talkId} not found:`, talkError?.message)
    return
  }

  // Fetch all signatures for this talk
  const { data: signatures } = await adminClient
    .from('toolbox_talk_signatures')
    .select('id, user_id, full_name, role, company_name, signature_url, signed_at')
    .eq('talk_id', talkId)
    .order('signed_at')

  const sigs = (signatures as SignatureRecord[]) ?? []

  // Build sign-off PDF page
  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const [pageW, pageH] = PageSizes.A4
  const page = pdfDoc.addPage([pageW, pageH])

  const margin = 50
  let y = pageH - margin

  // Helper: draw text
  const drawText = (text: string, x: number, yPos: number, size: number, isBold = false, color = rgb(0, 0, 0)) => {
    page.drawText(text, { x, y: yPos, size, font: isBold ? boldFont : font, color })
  }

  // Title
  drawText('TOOLBOX TALK SIGN-OFF SHEET', margin, y, 16, true, rgb(0.06, 0.15, 0.26))
  y -= 30

  // Talk details
  drawText(`Talk: ${talk.title}`, margin, y, 12, true)
  y -= 18
  drawText(`Site: ${talk.site?.name ?? 'Unknown Site'}`, margin, y, 10)
  y -= 16
  const now = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  drawText(`Date Generated: ${now}`, margin, y, 10)
  y -= 30

  // Divider
  page.drawLine({
    start: { x: margin, y },
    end: { x: pageW - margin, y },
    thickness: 1,
    color: rgb(0.89, 0.91, 0.94),
  })
  y -= 20

  if (sigs.length === 0) {
    drawText('No signatures recorded for this talk.', margin, y, 10, false, rgb(0.4, 0.4, 0.4))
  } else {
    // Column headers
    const colX = { name: margin, role: margin + 180, company: margin + 310, time: margin + 440 }
    drawText('Name', colX.name, y, 9, true)
    drawText('Role', colX.role, y, 9, true)
    drawText('Company', colX.company, y, 9, true)
    drawText('Signed At', colX.time, y, 9, true)
    y -= 14

    page.drawLine({
      start: { x: margin, y },
      end: { x: pageW - margin, y },
      thickness: 0.5,
      color: rgb(0.89, 0.91, 0.94),
    })
    y -= 10

    const ROLE_LABELS: Record<string, string> = {
      appointed_person:    'Appointed Person',
      crane_supervisor:    'Crane Supervisor',
      crane_operator:      'Crane Operator',
      slinger_signaller:   'Slinger/Signaller',
      subcontractor_admin: 'Sub Admin',
    }

    for (const sig of sigs) {
      if (y < margin + 80) {
        // Add a new page if we're running out of space
        const newPage = pdfDoc.addPage([pageW, pageH])
        y = pageH - margin
        // Re-add column headers on new page
        newPage.drawText('Name', { x: colX.name, y, size: 9, font: boldFont, color: rgb(0, 0, 0) })
        newPage.drawText('Role', { x: colX.role, y, size: 9, font: boldFont, color: rgb(0, 0, 0) })
        newPage.drawText('Company', { x: colX.company, y, size: 9, font: boldFont, color: rgb(0, 0, 0) })
        newPage.drawText('Signed At', { x: colX.time, y, size: 9, font: boldFont, color: rgb(0, 0, 0) })
        y -= 20
      }

      // Try to embed signature image
      try {
        const { data: sigImageData } = await adminClient.storage
          .from('toolbox-talk-signatures')
          .download(sig.signature_url)

        if (sigImageData) {
          const imgBytes = await sigImageData.arrayBuffer()
          const sigImage = await pdfDoc.embedPng(new Uint8Array(imgBytes))
          const dims = sigImage.scale(0.15)
          page.drawImage(sigImage, {
            x: colX.name,
            y: y - dims.height,
            width: dims.width,
            height: dims.height,
          })
        }
      } catch {
        // Signature image unavailable — draw placeholder
        drawText('[signature]', colX.name, y - 10, 8, false, rgb(0.6, 0.6, 0.6))
      }

      const signedAt = new Date(sig.signed_at).toLocaleString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
      drawText(sig.full_name, colX.role, y, 9)
      drawText(ROLE_LABELS[sig.role] ?? sig.role, colX.company, y, 9)
      drawText(sig.company_name, colX.time, y, 9)
      drawText(signedAt, colX.name, y - 40, 8, false, rgb(0.4, 0.4, 0.4))

      y -= 60
      page.drawLine({
        start: { x: margin, y: y + 5 },
        end: { x: pageW - margin, y: y + 5 },
        thickness: 0.3,
        color: rgb(0.93, 0.94, 0.96),
      })
      y -= 5
    }
  }

  const pdfBytes = await pdfDoc.save()

  // If the original is a PDF, append sign-off as extra page
  let finalPdfBytes = pdfBytes
  if (talk.content_type === 'pdf' && talk.pdf_url) {
    try {
      const { data: origData } = await adminClient.storage
        .from('toolbox-talk-pdfs')
        .download(talk.pdf_url)

      if (origData) {
        const origBytes = await origData.arrayBuffer()
        const origDoc = await PDFDocument.load(new Uint8Array(origBytes))
        const signOffDoc = await PDFDocument.load(pdfBytes)
        const copiedPages = await origDoc.copyPages(signOffDoc, signOffDoc.getPageIndices())
        for (const p of copiedPages) origDoc.addPage(p)
        finalPdfBytes = await origDoc.save()
      }
    } catch (e) {
      console.warn('Could not merge original PDF, uploading sign-off page only:', e)
    }
  }

  // Upload combined PDF
  const signOffPath = `signoffs/${talk.site_id}/${talkId}_signoff.pdf`
  const { error: uploadError } = await adminClient.storage
    .from('toolbox-talk-pdfs')
    .upload(signOffPath, finalPdfBytes, { contentType: 'application/pdf', upsert: true })

  if (uploadError) {
    console.error(`Upload failed for talk ${talkId}:`, uploadError.message)
    return
  }

  // Update talk record
  const { error: updateError } = await adminClient
    .from('toolbox_talks')
    .update({
      sign_off_pdf_url: signOffPath,
      is_archived: true,
      archived_at: new Date().toISOString(),
    })
    .eq('id', talkId)

  if (updateError) {
    console.error(`Failed to update talk ${talkId}:`, updateError.message)
  } else {
    console.log(`Sign-off generated for talk ${talkId}`)
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let body: { talk_id?: string } = {}
  try { body = await req.json() } catch { /* empty body is fine */ }

  try {
    if (body.talk_id) {
      // Called from app — process single talk
      await processOneTalk(adminClient, body.talk_id)
      return json({ ok: true })
    }

    // Called from cron — process all eligible talks
    const { data: eligible, error } = await adminClient
      .from('toolbox_talks')
      .select('id')
      .eq('is_archived', false)
      .is('sign_off_pdf_url', null)
      .gt('id', '00000000-0000-0000-0000-000000000000') // select all

    if (error) {
      console.error('Failed to fetch eligible talks:', error.message)
      return json({ error: error.message }, 500)
    }

    // Only process talks that have at least one signature
    const talkIds = (eligible ?? []).map((t: { id: string }) => t.id)
    const results: string[] = []

    for (const talkId of talkIds) {
      const { count } = await adminClient
        .from('toolbox_talk_signatures')
        .select('id', { count: 'exact', head: true })
        .eq('talk_id', talkId)
        .then((r) => ({ count: r.count ?? 0 }))

      if (count > 0) {
        await processOneTalk(adminClient, talkId)
        results.push(talkId)
      }
    }

    return json({ ok: true, processed: results.length, talk_ids: results })
  } catch (err) {
    console.error('generate-signoff unhandled error:', err)
    return json({ error: 'Internal server error' }, 500)
  }
})
