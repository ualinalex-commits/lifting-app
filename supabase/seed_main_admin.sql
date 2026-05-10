-- ==============================================================
-- SEED: main_admin user
-- Run this in the Supabase SQL Editor (requires service_role /
-- direct DB access — auth.users is not accessible via the anon key).
--
-- Idempotent: safe to run more than once; skips if the email
-- already exists in either table.
-- ==============================================================

DO $$
DECLARE
  v_user_id UUID := gen_random_uuid();
  v_email   TEXT := 'ualinalex@gmail.com';
BEGIN

  -- ── 1. Guard: skip if this email is already registered ──────
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_email) THEN
    RAISE NOTICE 'User % already exists — skipping.', v_email;
    RETURN;
  END IF;

  -- ── 2. Insert into auth.users ────────────────────────────────
  -- encrypted_password is empty: OTP-only sign-in, no password needed.
  -- email_confirmed_at is set so Supabase treats the account as
  -- verified and will send OTP codes without a separate confirmation step.
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    v_email,
    '',                                                -- no password (OTP only)
    NOW(),                                             -- pre-confirm so OTP works immediately
    '{"provider": "email", "providers": ["email"]}',
    '{}',
    FALSE,
    NOW(),
    NOW()
  );

  -- ── 3. Insert into public.profiles ──────────────────────────
  -- main_admin constraint: company_id and site_id must both be NULL.
  INSERT INTO public.profiles (
    id,
    full_name,
    email,
    phone,
    role,
    company_id,
    site_id,
    is_archived,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
    'Alin Ungureanu',
    v_email,
    '07763236306',
    'main_admin',
    NULL,
    NULL,
    FALSE,
    NOW(),
    NOW()
  );

  RAISE NOTICE 'main_admin created: id=%, email=%', v_user_id, v_email;

END $$;
