-- Daily Briefing Schema
-- Run this in the Supabase Dashboard → SQL Editor before using the Daily Briefing feature.
-- Requires the `sites` and `profiles` tables to exist.

-- Persistent per-site fields edited via the Set Up form
create table if not exists daily_briefing_settings (
  site_id                uuid primary key references sites(id) on delete cascade,
  changes_on_site        text not null default '',
  lifting_schedule       text not null default '',
  any_other_business     text not null default '',
  first_aider_name       text not null default '',
  site_location          text not null default '',
  muster_point           text not null default '',
  updated_at             timestamptz not null default now(),
  updated_by             uuid references profiles(id)
);

-- One briefing per site per day (active)
create table if not exists daily_briefings (
  id                      uuid primary key default gen_random_uuid(),
  site_id                 uuid not null references sites(id) on delete cascade,
  briefing_date           date not null default current_date,

  wind_speed              text,
  gust_speed              text,
  weather_condition       text,

  changes_on_site         text,
  lifting_schedule        text,
  any_other_business      text,
  first_aider_name        text,
  site_location           text,
  muster_point            text,

  q1_crane_clear          boolean,
  q2_activities_planned   boolean,
  q3_deliveries_scheduled boolean,
  q4_changes_communicated boolean,
  q5_accessory_checks     boolean,
  q6_safety_first         boolean,
  q7_crane_secured        boolean,
  q8_whistles_working     boolean,
  q9_radio_check          boolean,

  ap_name                 text not null,
  supervisor_name         text not null,
  submitter_name          text not null,
  submitter_signature_url text not null,

  content_html            text not null,
  archive_pdf_url         text,

  status                  text not null default 'active'
                            check (status in ('active', 'archived', 'deleted')),
  created_by              uuid not null references profiles(id),
  created_at              timestamptz not null default now(),
  archived_at             timestamptz
);

-- Only one active briefing per site per day
create unique index if not exists daily_briefings_site_date_active
  on daily_briefings(site_id, briefing_date)
  where (status = 'active');

-- Read tracking
create table if not exists daily_briefing_reads (
  id           uuid primary key default gen_random_uuid(),
  briefing_id  uuid not null references daily_briefings(id) on delete cascade,
  user_id      uuid not null references profiles(id),
  read_at      timestamptz not null default now(),
  unique(briefing_id, user_id)
);

-- Signature tracking
create table if not exists daily_briefing_signatures (
  id                   uuid primary key default gen_random_uuid(),
  briefing_id          uuid not null references daily_briefings(id) on delete cascade,
  user_id              uuid not null references profiles(id),
  full_name            text not null,
  role                 text not null,
  company              text not null,
  signature_image_url  text not null,
  signed_at            timestamptz not null default now(),
  unique(briefing_id, user_id)
);

-- RLS
alter table daily_briefing_settings   enable row level security;
alter table daily_briefings           enable row level security;
alter table daily_briefing_reads      enable row level security;
alter table daily_briefing_signatures enable row level security;

-- Settings: same-site SELECT; AP and supervisor can update
create policy "daily_briefing_settings_select" on daily_briefing_settings
  for select to authenticated
  using (site_id = (select site_id from profiles where id = auth.uid()));

create policy "daily_briefing_settings_write" on daily_briefing_settings
  for all to authenticated
  using (
    site_id = (select site_id from profiles where id = auth.uid())
    and (select role from profiles where id = auth.uid()) in ('appointed_person','crane_supervisor')
  )
  with check (
    site_id = (select site_id from profiles where id = auth.uid())
    and (select role from profiles where id = auth.uid()) in ('appointed_person','crane_supervisor')
  );

-- Briefings: same-site SELECT; AP and supervisor can insert/update
create policy "daily_briefings_select" on daily_briefings
  for select to authenticated
  using (site_id = (select site_id from profiles where id = auth.uid()));

create policy "daily_briefings_write" on daily_briefings
  for all to authenticated
  using (
    site_id = (select site_id from profiles where id = auth.uid())
    and (select role from profiles where id = auth.uid()) in ('appointed_person','crane_supervisor')
  )
  with check (
    site_id = (select site_id from profiles where id = auth.uid())
    and (select role from profiles where id = auth.uid()) in ('appointed_person','crane_supervisor')
  );

-- Reads: any authenticated user on the same site can insert their own read
create policy "daily_briefing_reads_insert" on daily_briefing_reads
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "daily_briefing_reads_select" on daily_briefing_reads
  for select to authenticated
  using (
    briefing_id in (
      select id from daily_briefings
      where site_id = (select site_id from profiles where id = auth.uid())
    )
  );

-- Signatures: any authenticated user on the same site can insert their own signature
create policy "daily_briefing_signatures_insert" on daily_briefing_signatures
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "daily_briefing_signatures_select" on daily_briefing_signatures
  for select to authenticated
  using (
    briefing_id in (
      select id from daily_briefings
      where site_id = (select site_id from profiles where id = auth.uid())
    )
  );

-- Useful indexes
create index if not exists daily_briefings_site_date on daily_briefings(site_id, briefing_date desc);
create index if not exists daily_briefing_reads_briefing on daily_briefing_reads(briefing_id);
create index if not exists daily_briefing_signatures_briefing on daily_briefing_signatures(briefing_id);

-- pg_cron auto-archive at 18:00 daily.
-- Enable pg_cron first: Database → Extensions → pg_cron. Then run:
-- select cron.schedule(
--   'daily-briefing-auto-archive',
--   '0 17 * * *',
--   $$select net.http_post(
--     url := 'https://<project-ref>.supabase.co/functions/v1/daily-briefing-generate-pdf',
--     headers := '{"Authorization": "Bearer <service_role_key>", "Content-Type": "application/json"}'::jsonb
--   ) as request_id$$
-- );

-- Storage buckets to create manually in the Supabase Dashboard (Storage → New bucket):
--   1. "daily-briefing-signatures"  → private, 5 MB, image/png
--   2. "daily-briefing-archive"     → private, 50 MB, application/pdf
-- Add storage RLS policies on both buckets:
--   INSERT: authenticated role
--   SELECT: authenticated role (signed URLs used at read time)
