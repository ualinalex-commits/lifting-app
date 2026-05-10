// Edge Function: create-user
//
// Called by an authenticated admin to create a new user.
// Validates the caller's role, creates the auth.users record via the
// Admin API, then inserts the matching profiles row in one operation.
// If the profile insert fails the auth user is deleted (rollback).
//
// POST /functions/v1/create-user
// Authorization: Bearer <caller_jwt>
// Body: { full_name, email, phone, role, company_id?, site_id? }

import { createClient } from 'npm:@supabase/supabase-js@^2'

// ── Types ────────────────────────────────────────────────────────────────────

type UserRole =
  | 'main_admin'
  | 'company_admin'
  | 'appointed_person'
  | 'crane_supervisor'
  | 'crane_operator'
  | 'slinger_signaller'
  | 'subcontractor_admin'

interface CreateUserBody {
  full_name: string
  email: string
  phone: string
  role: UserRole
  company_id?: string
  site_id?: string
}

interface CallerProfile {
  id: string
  role: UserRole
  company_id: string | null
  site_id: string | null
}

// ── Constants ────────────────────────────────────────────────────────────────

// Which roles each caller is permitted to create
const CREATION_PERMISSIONS: Record<UserRole, UserRole[]> = {
  main_admin: ['company_admin'],
  company_admin: ['appointed_person'],
  appointed_person: [
    'crane_supervisor',
    'crane_operator',
    'slinger_signaller',
    'subcontractor_admin',
  ],
  // operative roles cannot create users
  crane_supervisor: [],
  crane_operator: [],
  slinger_signaller: [],
  subcontractor_admin: [],
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function validateBody(
  body: Partial<CreateUserBody>,
): string | null {
  if (!body.full_name?.trim()) return 'full_name is required'
  if (!body.email?.trim()) return 'email is required'
  if (!body.phone?.trim()) return 'phone is required'
  if (!body.role) return 'role is required'

  const validRoles: UserRole[] = [
    'main_admin',
    'company_admin',
    'appointed_person',
    'crane_supervisor',
    'crane_operator',
    'slinger_signaller',
    'subcontractor_admin',
  ]
  if (!validRoles.includes(body.role)) return `Invalid role: ${body.role}`

  return null
}

// Resolve the company_id / site_id that the new profile row should receive,
// based on the caller's role and the fields they supplied.
function resolveScope(
  caller: CallerProfile,
  body: CreateUserBody,
): { company_id: string | null; site_id: string | null } | { error: string } {
  switch (caller.role) {
    case 'main_admin':
      // main_admin must explicitly pass company_id; new user gets no site
      if (!body.company_id) {
        return { error: 'company_id is required when creating a company_admin' }
      }
      return { company_id: body.company_id, site_id: null }

    case 'company_admin':
      // company_admin must specify which site the new appointed_person joins
      if (!body.site_id) {
        return {
          error: 'site_id is required when creating an appointed_person',
        }
      }
      return { company_id: caller.company_id, site_id: body.site_id }

    case 'appointed_person':
      // Operatives always inherit the appointed_person's own company + site
      return { company_id: caller.company_id, site_id: caller.site_id }

    default:
      return { error: 'Caller does not have permission to create users' }
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return json({ error: 'Missing Authorization header' }, 401)
  }

  try {
    // User-scoped client — validates the caller's JWT and reads their profile
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    // Admin client — service role, bypasses RLS for auth.admin operations
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── 1. Verify caller ───────────────────────────────────────────────────

    const { data: { user: callerUser }, error: authError } =
      await userClient.auth.getUser()

    if (authError || !callerUser) {
      return json({ error: 'Invalid or expired token' }, 401)
    }

    const { data: caller, error: profileError } = await userClient
      .from('profiles')
      .select('id, role, company_id, site_id')
      .eq('id', callerUser.id)
      .single<CallerProfile>()

    if (profileError || !caller) {
      return json({ error: 'Caller profile not found' }, 403)
    }

    // ── 2. Parse and validate request body ────────────────────────────────

    let body: Partial<CreateUserBody>
    try {
      body = await req.json()
    } catch {
      return json({ error: 'Invalid JSON body' }, 400)
    }

    const validationError = validateBody(body)
    if (validationError) {
      return json({ error: validationError }, 400)
    }

    const safeBody = body as CreateUserBody

    // ── 3. Authorise — caller role vs requested role ───────────────────────

    const permittedRoles = CREATION_PERMISSIONS[caller.role]
    if (!permittedRoles.includes(safeBody.role)) {
      return json(
        { error: `A ${caller.role} is not permitted to create a ${safeBody.role}` },
        403,
      )
    }

    // ── 4. Resolve the new user's company / site scope ────────────────────

    const scope = resolveScope(caller, safeBody)
    if ('error' in scope) {
      return json({ error: scope.error }, 400)
    }

    // ── 5. Create auth.users record ───────────────────────────────────────

    const normalizedEmail = safeBody.email.trim().toLowerCase()

    const { data: authData, error: createAuthError } =
      await adminClient.auth.admin.createUser({
        email: normalizedEmail,
        // No password — this user authenticates exclusively via Email OTP.
        // email_confirm: true so Supabase does not require a separate
        // confirmation click; the OTP flow handles identity verification.
        email_confirm: true,
        user_metadata: { full_name: safeBody.full_name.trim() },
      })

    if (createAuthError) {
      const status =
        createAuthError.message.toLowerCase().includes('already registered') ||
        createAuthError.message.toLowerCase().includes('already exists')
          ? 409
          : 400
      return json({ error: createAuthError.message }, status)
    }

    const newUserId = authData.user.id

    // ── 6. Insert profiles row ────────────────────────────────────────────

    const { error: insertError } = await adminClient.from('profiles').insert({
      id: newUserId,           // must equal auth.users.id
      full_name: safeBody.full_name.trim(),
      email: normalizedEmail,
      phone: safeBody.phone.trim(),
      role: safeBody.role,
      company_id: scope.company_id,
      site_id: scope.site_id,
    })

    if (insertError) {
      // Roll back: delete the auth user so auth and profiles stay in sync
      await adminClient.auth.admin.deleteUser(newUserId)
      console.error('Profile insert failed — auth user deleted:', insertError)
      return json(
        { error: `Could not create profile: ${insertError.message}` },
        500,
      )
    }

    // ── 7. Return the new user's public details ───────────────────────────

    return json(
      {
        id: newUserId,
        email: normalizedEmail,
        role: safeBody.role,
        company_id: scope.company_id,
        site_id: scope.site_id,
      },
      201,
    )
  } catch (err) {
    console.error('create-user unhandled error:', err)
    return json({ error: 'Internal server error' }, 500)
  }
})
