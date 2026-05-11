import { supabase } from './supabase'

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
