-- crane_meeting_schema.sql
-- Run this in the Supabase SQL Editor before using the Crane Meeting feature.
-- Also manually create the following Storage buckets in the Supabase Dashboard:
--   "crane-meeting-signatures"  private, 5 MB,  image/png
--   "crane-meeting-archive"     private, 50 MB, application/pdf
-- Then run the storage bucket + RLS SQL below in the SQL Editor.

-- ── Tables ─────────────────────────────────────────────────────────────────────

-- Per-site persistent settings — pre-filled into every new Set Up form.
create table if not exists crane_meeting_settings (
  site_id             uuid primary key references sites(id) on delete cascade,
  project             text default '',
  project_no          text default '',
  review_text         text default '',
  incidents_text      text default '',
  revised_methods     text default '',
  future_lifts        text default '',
  weather_forecast    text default '',
  new_methods         text default '',
  lifting_equipment   text default '',
  any_other_business  text default '',
  next_meeting_date   date,
  updated_at          timestamptz default now(),
  updated_by          uuid references profiles(id)
);

-- One active meeting per site at a time, enforced by unique partial index below.
create table if not exists crane_meetings (
  id                       uuid primary key default gen_random_uuid(),
  site_id                  uuid not null references sites(id) on delete cascade,
  meeting_date             date not null,
  meeting_time             text,

  -- Snapshot of form fields at submission time
  project                  text,
  project_no               text,
  review_text              text,
  incidents_text           text,
  revised_methods          text,
  future_lifts             text,
  weather_forecast         text,
  new_methods              text,
  lifting_equipment        text,
  any_other_business       text,
  next_meeting_date        date,

  -- Creator identity
  submitter_name           text not null,
  submitter_signature_url  text,

  -- Full assembled HTML — never null after creation
  content_html             text not null,

  -- Archive
  archive_pdf_url          text,
  status                   text default 'active' check (status in ('active', 'archived', 'deleted')),
  created_by               uuid not null references profiles(id),
  created_at               timestamptz default now(),
  archived_at              timestamptz
);

-- Only one active meeting per site at any time.
create unique index if not exists crane_meetings_site_active
  on crane_meetings(site_id)
  where (status = 'active');

create table if not exists crane_meeting_reads (
  id          uuid primary key default gen_random_uuid(),
  meeting_id  uuid not null references crane_meetings(id) on delete cascade,
  user_id     uuid not null references profiles(id),
  read_at     timestamptz default now(),
  unique(meeting_id, user_id)
);

create table if not exists crane_meeting_signatures (
  id                    uuid primary key default gen_random_uuid(),
  meeting_id            uuid not null references crane_meetings(id) on delete cascade,
  user_id               uuid not null references profiles(id),
  full_name             text not null,
  role                  text not null,
  company               text not null,
  signature_image_url   text not null,
  signed_at             timestamptz default now(),
  unique(meeting_id, user_id)
);

-- ── RLS ────────────────────────────────────────────────────────────────────────

alter table crane_meeting_settings  enable row level security;
alter table crane_meetings          enable row level security;
alter table crane_meeting_reads     enable row level security;
alter table crane_meeting_signatures enable row level security;

-- Settings: same-site read; AP and supervisor can write
create policy "Same site read crane meeting settings"
  on crane_meeting_settings for select to authenticated
  using (site_id = (select site_id from profiles where id = auth.uid()));

create policy "AP and supervisor manage crane meeting settings"
  on crane_meeting_settings for all to authenticated
  using (
    site_id = (select site_id from profiles where id = auth.uid())
    and (select role from profiles where id = auth.uid()) in ('appointed_person', 'crane_supervisor')
  )
  with check (
    site_id = (select site_id from profiles where id = auth.uid())
    and (select role from profiles where id = auth.uid()) in ('appointed_person', 'crane_supervisor')
  );

-- Meetings: same-site read; AP and supervisor can write
create policy "Same site read crane meetings"
  on crane_meetings for select to authenticated
  using (site_id = (select site_id from profiles where id = auth.uid()));

create policy "AP and supervisor manage crane meetings"
  on crane_meetings for all to authenticated
  using (
    site_id = (select site_id from profiles where id = auth.uid())
    and (select role from profiles where id = auth.uid()) in ('appointed_person', 'crane_supervisor')
  )
  with check (
    site_id = (select site_id from profiles where id = auth.uid())
    and (select role from profiles where id = auth.uid()) in ('appointed_person', 'crane_supervisor')
  );

-- Reads: any authenticated user may insert their own read; managers can select
create policy "Insert own crane meeting read"
  on crane_meeting_reads for insert to authenticated
  with check (user_id = auth.uid());

create policy "Read crane meeting attendance"
  on crane_meeting_reads for select to authenticated
  using (
    meeting_id in (
      select id from crane_meetings
      where site_id = (select site_id from profiles where id = auth.uid())
    )
  );

-- Signatures: any authenticated user may insert their own; managers can select
create policy "Insert own crane meeting signature"
  on crane_meeting_signatures for insert to authenticated
  with check (user_id = auth.uid());

create policy "Read crane meeting signatures"
  on crane_meeting_signatures for select to authenticated
  using (
    meeting_id in (
      select id from crane_meetings
      where site_id = (select site_id from profiles where id = auth.uid())
    )
  );

-- ── Storage buckets (run this if creating via SQL rather than Dashboard) ───────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('crane-meeting-signatures', 'crane-meeting-signatures', false, 5242880,  array['image/png', 'image/jpeg']),
  ('crane-meeting-archive',    'crane-meeting-archive',    false, 52428800, array['application/pdf'])
on conflict (id) do nothing;

create policy "Auth users upload crane-meeting signatures"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'crane-meeting-signatures');

create policy "Auth users read crane-meeting signatures"
  on storage.objects for select to authenticated
  using (bucket_id = 'crane-meeting-signatures');

create policy "Auth users upload crane-meeting archive"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'crane-meeting-archive');

create policy "Auth users read crane-meeting archive"
  on storage.objects for select to authenticated
  using (bucket_id = 'crane-meeting-archive');

-- ── pg_cron auto-archive schedule ─────────────────────────────────────────────
-- Enable pg_cron extension first in Dashboard -> Database -> Extensions.
-- Then run these two cron jobs:

-- Auto-generate PDF and archive at 19:59 every Friday
-- select cron.schedule(
--   'crane-meeting-friday-auto-archive',
--   '59 19 * * 5',
--   $$select net.http_post(
--     url := 'https://<project-ref>.supabase.co/functions/v1/crane-meeting-generate-pdf',
--     headers := '{"Authorization": "Bearer <service_role_key>", "Content-Type": "application/json"}'::jsonb,
--     body := '{}'::jsonb
--   ) as request_id$$
-- );

-- Safety net: force-archive any remaining active meetings at 20:00 Friday
-- select cron.schedule(
--   'crane-meeting-friday-reset',
--   '0 20 * * 5',
--   $$update crane_meetings set status = 'archived', archived_at = now()
--     where status = 'active'$$
-- );
