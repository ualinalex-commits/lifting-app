// Edge Function: extract-docx-text
//
// Downloads a .docx file from toolbox-talk-pdfs storage, extracts plain
// text with mammoth, then updates toolbox_talks.content_text.
//
// Called from the app after a docx talk is created:
//   POST { talk_id: "...", file_url: "library/company-id/file.docx" }

import { createClient } from 'npm:@supabase/supabase-js@^2'
import mammoth from 'npm:mammoth@^1'

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

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let body: { talk_id?: string; file_url?: string } = {}
  try { body = await req.json() } catch { /* empty body */ }

  const { talk_id: talkId, file_url: fileUrl } = body

  if (!talkId || !fileUrl) {
    return json({ error: 'talk_id and file_url are required' }, 400)
  }

  const { data: fileData, error: downloadError } = await adminClient.storage
    .from('toolbox-talk-pdfs')
    .download(fileUrl)

  if (downloadError || !fileData) {
    return json({ error: `Failed to download file: ${downloadError?.message ?? 'unknown'}` }, 500)
  }

  let extractedText = ''
  try {
    const arrayBuffer = await fileData.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer })
    extractedText = result.value.trim()
  } catch (e) {
    console.error('mammoth extraction error:', e)
    return json({ error: `Text extraction failed: ${e}` }, 500)
  }

  const { error: updateError } = await adminClient
    .from('toolbox_talks')
    .update({ content_text: extractedText })
    .eq('id', talkId)

  if (updateError) {
    return json({ error: `Failed to update talk: ${updateError.message}` }, 500)
  }

  console.log(`Extracted ${extractedText.length} chars for talk ${talkId}`)
  return json({ ok: true })
})
