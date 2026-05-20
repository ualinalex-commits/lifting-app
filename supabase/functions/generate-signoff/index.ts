// Edge Function: generate-signoff
console.log('GENERATE-SIGNOFF: v2 with fixed column layout')
//
// Generates a sign-off PDF for one or more toolbox talks.
//
// Called two ways:
//   1. From the app (AP/supervisor): POST { talk_id: "..." }
//      → processes that single talk immediately.
//   2. From pg_cron (daily at 18:00 UTC): POST {}
//      → processes all active talks that have ≥1 signature.
//
// For each eligible talk the function:
//   1. Fetches the talk record and all signature records.
//   2. Builds a sign-off PDF page with pdf-lib.
//   3. If the talk is PDF-type, appends the sign-off page to the original PDF.
//   4. Uploads the combined PDF to Supabase Storage.
//   5. Updates the talk: sign_off_pdf_url, status = 'archived', archived_at = NOW().

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
  status: string
  site: { name: string; company_id: string } | null
}

interface SignatureRecord {
  id: string
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

async function processOneTalk(
  adminClient: ReturnType<typeof createClient>,
  talkId: string
): Promise<void> {
  const { data: talk, error: talkError } = await adminClient
    .from('toolbox_talks')
    .select('id, site_id, title, content_type, pdf_url, sign_off_pdf_url, status, site:sites(name, company_id)')
    .eq('id', talkId)
    .single<TalkRecord>()

  if (talkError || !talk) {
    console.error(`Talk ${talkId} not found:`, talkError?.message)
    return
  }

  const { data: signatures } = await adminClient
    .from('toolbox_talk_signatures')
    .select('id, user_id, full_name, role, company, signature_image_url, signed_at')
    .eq('talk_id', talkId)
    .order('signed_at')

  const sigs = (signatures as SignatureRecord[]) ?? []

  // Build sign-off PDF page
  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const [pageW, pageH] = PageSizes.A4
  let page = pdfDoc.addPage([pageW, pageH])

  const margin = 50
  let y = pageH - margin

  function drawText(
    targetPage: typeof page,
    text: string,
    x: number,
    yPos: number,
    size: number,
    isBold = false,
    color = rgb(0, 0, 0)
  ) {
    targetPage.drawText(text, { x, y: yPos, size, font: isBold ? boldFont : font, color })
  }

  drawText(page, 'TOOLBOX TALK SIGN-OFF SHEET', margin, y, 16, true, rgb(0.06, 0.15, 0.26))
  y -= 30

  drawText(page, `Talk: ${talk.title}`, margin, y, 12, true)
  y -= 18
  drawText(page, `Site: ${talk.site?.name ?? 'Unknown Site'}`, margin, y, 10)
  y -= 16
  const dateStr = new Date().toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
  drawText(page, `Date Generated: ${dateStr}`, margin, y, 10)
  y -= 30

  page.drawLine({
    start: { x: margin, y },
    end: { x: pageW - margin, y },
    thickness: 1,
    color: rgb(0.89, 0.91, 0.94),
  })
  y -= 20

  // Attached document reference
  drawText(page, 'Attached Document', margin, y, 9, true, rgb(0.3, 0.3, 0.3))
  y -= 14
  const docTypeLabel = talk.content_type === 'pdf' ? 'PDF'
    : talk.content_type === 'docx' ? 'Word Document' : 'Document'
  drawText(page, `${talk.title}  (${docTypeLabel})`, margin + 8, y, 9)
  y -= 12

  if (talk.pdf_url) {
    try {
      const { data: urlData } = await adminClient.storage
        .from('toolbox-talk-pdfs')
        .createSignedUrl(talk.pdf_url, 60 * 60 * 24 * 7)
      if (urlData?.signedUrl) {
        const url = urlData.signedUrl
        const maxLen = 95
        const displayUrl = url.length > maxLen ? url.substring(0, maxLen - 3) + '...' : url
        drawText(page, displayUrl, margin + 8, y, 6, false, rgb(0.15, 0.35, 0.75))
        y -= 10
        drawText(page, '(link valid for 7 days — access permanent copy via the Lifting App library)', margin + 8, y, 6, false, rgb(0.55, 0.55, 0.55))
        y -= 14
      }
    } catch (e) {
      console.warn(`Could not generate signed URL for document in talk ${talkId}:`, e)
      y -= 4
    }
  } else {
    y -= 4
  }

  page.drawLine({
    start: { x: margin, y },
    end: { x: pageW - margin, y },
    thickness: 0.5,
    color: rgb(0.89, 0.91, 0.94),
  })
  y -= 20

  if (sigs.length === 0) {
    drawText(page, 'No signatures recorded for this talk.', margin, y, 10, false, rgb(0.4, 0.4, 0.4))
  } else {
    // Explicit column X positions — each value must land under its header
    const COL = { name: 50, role: 200, company: 320, signedAt: 450 }
    const rowHeight = 60

    function drawRowHeaders(targetPage: typeof page, yPos: number) {
      drawText(targetPage, 'Name',      COL.name,     yPos, 9, true)
      drawText(targetPage, 'Role',      COL.role,     yPos, 9, true)
      drawText(targetPage, 'Company',   COL.company,  yPos, 9, true)
      drawText(targetPage, 'Signed At', COL.signedAt, yPos, 9, true)
    }

    drawRowHeaders(page, y)
    y -= 8

    page.drawLine({
      start: { x: margin, y },
      end: { x: pageW - margin, y },
      thickness: 0.5,
      color: rgb(0, 0, 0),
    })
    y -= 20

    for (const sig of sigs) {
      if (y < 100) {
        page = pdfDoc.addPage([pageW, pageH])
        y = pageH - margin
        drawRowHeaders(page, y)
        y -= 8
        page.drawLine({
          start: { x: margin, y },
          end: { x: pageW - margin, y },
          thickness: 0.5,
          color: rgb(0, 0, 0),
        })
        y -= 20
      }

      // Text sits in the lower portion of the row, below the signature image
      const textY = y - 20

      // Name — left column
      drawText(page, (sig.full_name ?? '').substring(0, 25), COL.name, textY, 10)

      // Role — second column
      drawText(page, (ROLE_LABELS[sig.role] ?? sig.role ?? '').substring(0, 18), COL.role, textY, 10)

      // Company — third column
      drawText(page, (sig.company ?? '').substring(0, 22), COL.company, textY, 10)

      // Signed At — fourth column: signature image above timestamp text
      if (sig.signature_image_url) {
        try {
          const { data: sigFile } = await adminClient.storage
            .from('toolbox-talk-signatures')
            .download(sig.signature_image_url)
          if (sigFile) {
            const sigBytes = await sigFile.arrayBuffer()
            let sigImage
            try {
              sigImage = await pdfDoc.embedPng(new Uint8Array(sigBytes))
            } catch {
              sigImage = await pdfDoc.embedJpg(new Uint8Array(sigBytes))
            }
            page.drawImage(sigImage, {
              x: COL.signedAt,
              y: y - 15,
              width: 100,
              height: 35,
            })
          }
        } catch (e) {
          console.error('Failed to embed signature:', e)
          drawText(page, '[signature]', COL.signedAt, textY, 8, false, rgb(0.6, 0.6, 0.6))
        }
      }

      // Timestamp — below signature image, 24-hour format
      const tsText = new Date(sig.signed_at).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
      drawText(page, tsText, COL.signedAt, y - 28, 8, false, rgb(0.4, 0.4, 0.4))

      // Row separator
      page.drawLine({
        start: { x: margin, y: y - 35 },
        end: { x: pageW - margin, y: y - 35 },
        thickness: 0.3,
        color: rgb(0.85, 0.85, 0.85),
      })

      y -= rowHeight
    }
  }

  const signOffBytes = await pdfDoc.save()

  // If original is a PDF, append sign-off as extra pages
  let finalPdfBytes = signOffBytes
  if (talk.content_type === 'pdf' && talk.pdf_url) {
    try {
      const { data: origData, error: dlError } = await adminClient.storage
        .from('toolbox-talk-pdfs')
        .download(talk.pdf_url)

      if (dlError) {
        console.error(`Failed to download original PDF for talk ${talkId} (path: ${talk.pdf_url}):`, dlError.message)
      } else if (origData) {
        const origBytes = await origData.arrayBuffer()
        const origDoc = await PDFDocument.load(new Uint8Array(origBytes))
        const signOffDoc = await PDFDocument.load(signOffBytes)
        const copiedPages = await origDoc.copyPages(signOffDoc, signOffDoc.getPageIndices())
        for (const p of copiedPages) origDoc.addPage(p)
        finalPdfBytes = await origDoc.save()
        console.log(`Merged original PDF with sign-off for talk ${talkId}`)
      } else {
        console.warn(`Download returned no data for talk ${talkId} (path: ${talk.pdf_url})`)
      }
    } catch (e) {
      console.error(`Could not merge original PDF for talk ${talkId}, uploading sign-off only:`, e)
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

  // Archive the talk
  const { error: updateError } = await adminClient
    .from('toolbox_talks')
    .update({
      sign_off_pdf_url: signOffPath,
      status: 'archived',
      archived_at: new Date().toISOString(),
    })
    .eq('id', talkId)

  if (updateError) {
    console.error(`Failed to archive talk ${talkId}:`, updateError.message)
  } else {
    console.log(`Sign-off generated and talk archived: ${talkId}`)
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
      await processOneTalk(adminClient, body.talk_id)
      return json({ ok: true })
    }

    // Cron mode: process all active talks that have at least one signature
    const { data: eligible, error } = await adminClient
      .from('toolbox_talks')
      .select('id')
      .eq('status', 'active')
      .is('sign_off_pdf_url', null)

    if (error) {
      console.error('Failed to fetch eligible talks:', error.message)
      return json({ error: error.message }, 500)
    }

    const talkIds = (eligible ?? []).map((t: { id: string }) => t.id)
    const processed: string[] = []

    for (const talkId of talkIds) {
      const { count } = await adminClient
        .from('toolbox_talk_signatures')
        .select('id', { count: 'exact', head: true })
        .eq('talk_id', talkId)
        .then((r: { count: number | null }) => ({ count: r.count ?? 0 }))

      if (count > 0) {
        await processOneTalk(adminClient, talkId)
        processed.push(talkId)
      }
    }

    return json({ ok: true, processed: processed.length, talk_ids: processed })
  } catch (err) {
    console.error('generate-signoff unhandled error:', err)
    return json({ error: 'Internal server error' }, 500)
  }
})
