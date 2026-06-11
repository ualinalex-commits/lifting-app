-- =============================================================================
-- Rescue Kit Checklist — Database Schema
-- Run this in the Supabase SQL Editor BEFORE using the Rescue Kit feature.
-- Storage buckets are created via the INSERT statements below,
-- or manually via Supabase Dashboard → Storage.
-- =============================================================================

-- rescue_kits: one row per physical rescue kit on site; persists between weeks.
-- last_signed_week_start tracks when the kit was last verified (weekly check).
-- A kit is "pending check this week" when last_signed_week_start IS NULL
-- OR last_signed_week_start < date_trunc('week', now()).

create table if not exists rescue_kits (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,

  main_contractor text not null,
  project_name text not null,
  serial_number text not null,

  location_of_kit text,
  is_secured boolean,
  how_is_it_secured text,
  who_has_access text,
  plrk_number text,

  is_stretcher_in_bag boolean,
  is_pole_in_bag boolean,
  harness_count text,
  harness_packaging_status text check (harness_packaging_status in ('new', 'used')),
  harness_serial_numbers text,

  certificates_of_conformity text,
  is_box_sealed boolean,
  unsealed_contents_complete text check (unsealed_contents_complete in ('yes', 'no', 'n/a')),

  last_signed_week_start date,
  last_version_number integer default 0,

  is_deleted boolean default false,
  created_by uuid not null references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- rescue_kit_signed_checks: one per weekly signing; each generates a versioned PDF.
create table if not exists rescue_kit_signed_checks (
  id uuid primary key default gen_random_uuid(),
  kit_id uuid not null references rescue_kits(id) on delete cascade,
  version_number integer not null,
  supervisor_name text not null,
  supervisor_id uuid not null references profiles(id),
  signature_url text not null,
  pdf_url text not null,
  week_start_date date not null,
  signed_at timestamptz default now(),
  is_archived boolean default false,
  unique(kit_id, version_number)
);

-- ── Row Level Security ────────────────────────────────────────────────────────

alter table rescue_kits enable row level security;
alter table rescue_kit_signed_checks enable row level security;

drop policy if exists "AP and supervisor manage kits" on rescue_kits;
create policy "AP and supervisor manage kits" on rescue_kits
  for all to authenticated
  using (
    site_id = (select site_id from profiles where id = auth.uid())
    and (select role from profiles where id = auth.uid()) in ('appointed_person', 'crane_supervisor')
  )
  with check (
    site_id = (select site_id from profiles where id = auth.uid())
    and (select role from profiles where id = auth.uid()) in ('appointed_person', 'crane_supervisor')
  );

drop policy if exists "AP and supervisor read signed checks" on rescue_kit_signed_checks;
create policy "AP and supervisor read signed checks" on rescue_kit_signed_checks
  for select to authenticated
  using (
    kit_id in (
      select id from rescue_kits
      where site_id = (select site_id from profiles where id = auth.uid())
    )
    and (select role from profiles where id = auth.uid()) in ('appointed_person', 'crane_supervisor')
  );

drop policy if exists "AP and supervisor insert signed checks" on rescue_kit_signed_checks;
create policy "AP and supervisor insert signed checks" on rescue_kit_signed_checks
  for insert to authenticated
  with check (
    kit_id in (
      select id from rescue_kits
      where site_id = (select site_id from profiles where id = auth.uid())
    )
    and (select role from profiles where id = auth.uid()) in ('appointed_person', 'crane_supervisor')
  );

drop policy if exists "AP and supervisor update signed checks" on rescue_kit_signed_checks;
create policy "AP and supervisor update signed checks" on rescue_kit_signed_checks
  for update to authenticated
  using (
    kit_id in (
      select id from rescue_kits
      where site_id = (select site_id from profiles where id = auth.uid())
    )
    and (select role from profiles where id = auth.uid()) in ('appointed_person', 'crane_supervisor')
  )
  with check (
    (select role from profiles where id = auth.uid()) in ('appointed_person', 'crane_supervisor')
  );

-- ── Storage Buckets ───────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('rescue-kit-signatures', 'rescue-kit-signatures', false, 5242880,  array['image/png', 'image/jpeg']),
  ('rescue-kit-archive',    'rescue-kit-archive',    false, 52428800, array['application/pdf'])
on conflict (id) do nothing;

drop policy if exists "Auth users upload rescue-kit signatures" on storage.objects;
create policy "Auth users upload rescue-kit signatures"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'rescue-kit-signatures');

drop policy if exists "Auth users read rescue-kit signatures" on storage.objects;
create policy "Auth users read rescue-kit signatures"
  on storage.objects for select to authenticated
  using (bucket_id = 'rescue-kit-signatures');

drop policy if exists "Auth users upload rescue-kit archive" on storage.objects;
create policy "Auth users upload rescue-kit archive"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'rescue-kit-archive');

drop policy if exists "Auth users read rescue-kit archive" on storage.objects;
create policy "Auth users read rescue-kit archive"
  on storage.objects for select to authenticated
  using (bucket_id = 'rescue-kit-archive');

-- ── pg_cron — weekly Monday reset (informational; weekly rotation is derived) ─
-- The app derives pending/signed status from:
--   last_signed_week_start IS NULL OR last_signed_week_start < date_trunc('week', now())
-- No column update is required; the cron below is a safety-net audit if needed.
--
-- select cron.schedule(
--   'rescue-kit-weekly-rotation',
--   '1 0 * * 1',
--   $$
--     -- No-op: weekly pending status is derived from last_signed_week_start.
--     -- This job exists as a monitoring hook only.
--     select count(*) from rescue_kits
--     where is_deleted = false
--       and (last_signed_week_start is null
--            or last_signed_week_start < date_trunc('week', now()));
--   $$
-- );
