import { supabase } from './supabase'

export async function callExtractDocxText(
  talkId: string,
  fileUrl: string
): Promise<{ error: string | null }> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const { data, error } = await supabase.functions.invoke('extract-docx-text', {
      body: { talk_id: talkId, file_url: fileUrl },
      headers: session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : undefined,
    })
    if (data?.error) return { error: data.error }
    if (error) return { error: error.message }
    return { error: null }
  } catch (err: any) {
    return { error: err?.message ?? 'Failed to extract document text' }
  }
}

export async function callGenerateSignOff(
  talkId?: string
): Promise<{ error: string | null }> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const { data, error } = await supabase.functions.invoke('generate-signoff', {
      body: talkId ? { talk_id: talkId } : {},
      headers: session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : undefined,
    })
    if (data?.error) return { error: data.error }
    if (error) return { error: error.message }
    return { error: null }
  } catch (err: any) {
    return { error: err?.message ?? 'Failed to generate sign-off' }
  }
}

export async function callDailyBriefingGeneratePdf(
  briefingId?: string
): Promise<{ error: string | null }> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const { data, error } = await supabase.functions.invoke('daily-briefing-generate-pdf', {
      body: briefingId ? { briefing_id: briefingId } : {},
      headers: session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : undefined,
    })
    if (data?.error) return { error: data.error }
    if (error) return { error: error.message }
    return { error: null }
  } catch (err: any) {
    return { error: err?.message ?? 'Failed to generate daily briefing archive' }
  }
}

export async function callCraneMeetingGeneratePdf(
  meetingId?: string
): Promise<{ error: string | null }> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const { data, error } = await supabase.functions.invoke('crane-meeting-generate-pdf', {
      body: meetingId ? { meeting_id: meetingId } : {},
      headers: session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : undefined,
    })
    if (data?.error) return { error: data.error }
    if (error) return { error: error.message }
    return { error: null }
  } catch (err: any) {
    return { error: err?.message ?? 'Failed to generate crane meeting archive' }
  }
}

export async function callRescueKitGeneratePdf(params: {
  kit_id: string
  supervisor_name: string
  supervisor_signature_base64: string
  supervisor_id: string
}): Promise<{ error: string | null }> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const { data, error } = await supabase.functions.invoke('rescue-kit-generate-pdf', {
      body: params,
      headers: session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : undefined,
    })
    if (data?.error) return { error: data.error }
    if (error) return { error: error.message }
    return { error: null }
  } catch (err: any) {
    return { error: err?.message ?? 'Failed to generate rescue kit PDF' }
  }
}

export async function callCreateUser(params: {
  full_name: string
  email: string
  phone: string
  role: string
  company_id?: string
  site_id?: string
}): Promise<{ data: { id: string } | null; error: string | null }> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const { data, error } = await supabase.functions.invoke('create-user', {
      body: params,
      headers: session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : undefined,
    })
    // On non-2xx, supabase-js sets error but data still holds the response body.
    // Check data.error first so the caller sees the Edge Function's actual message.
    if (data?.error) return { data: null, error: data.error }
    if (error) return { data: null, error: error.message }
    return { data, error: null }
  } catch (err: any) {
    return { data: null, error: err?.message ?? 'Failed to create user' }
  }
}
