-- ==============================================================
-- LIFTING APP — TOOLBOX TALK SCHEMA v2
-- ==============================================================
-- Complete rebuild. Drop existing tables first if re-running.
-- Run this after main schema.sql has been applied.
-- ==============================================================

-- 1. DROP old tables (order matters — FK dependencies)
drop table if exists toolbox_talk_signatures cascade;
drop table if exists toolbox_talk_reads cascade;
drop table if exists toolbox_talks cascade;
drop table if exists toolbox_talk_library cascade;

-- Drop old enum if it exists
drop type if exists toolbox_talk_content_type cascade;


-- 2. ADD subcontractor_id TO profiles (if not already present)
--    Links subcontractor_admin users to their subcontractor company.
--    Required so the correct company name appears on sign-off sheets.
alter table profiles
  add column if not exists subcontractor_id uuid
    references subcontractors(id) on delete set null;

create index if not exists idx_profiles_subcontractor_id on profiles(subcontractor_id);


-- 3. TABLES

-- Company-level reusable templates
create table toolbox_talk_library (
  id            uuid        primary key default gen_random_uuid(),
  company_id    uuid        not null references companies(id),
  title         text        not null,
  content_type  text        not null check (content_type in ('pdf', 'docx', 'text')),
  content_text  text,
  pdf_url       text,
  created_by    uuid        not null references profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  is_archived   boolean     not null default false
);

-- Site-level talk instances
create table toolbox_talks (
  id               uuid        primary key default gen_random_uuid(),
  site_id          uuid        not null references sites(id),
  library_id       uuid        references toolbox_talk_library(id),
  title            text        not null,
  content_type     text        not null check (content_type in ('pdf', 'docx', 'text')),
  content_text     text,
  pdf_url          text,
  sign_off_pdf_url text,
  status           text        not null check (status in ('active', 'archived')) default 'active',
  created_by       uuid        not null references profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  archived_at      timestamptz
);

-- Read tracking — one row per user per talk
create table toolbox_talk_reads (
  id       uuid        primary key default gen_random_uuid(),
  talk_id  uuid        not null references toolbox_talks(id) on delete cascade,
  user_id  uuid        not null references profiles(id) on delete cascade,
  read_at  timestamptz not null default now(),
  unique (talk_id, user_id)
);

-- Drawn signature records — immutable, one per user per talk
create table toolbox_talk_signatures (
  id                uuid        primary key default gen_random_uuid(),
  talk_id           uuid        not null references toolbox_talks(id) on delete cascade,
  user_id           uuid        not null references profiles(id) on delete cascade,
  full_name         text        not null,
  role              text        not null,
  company           text        not null,  -- main company or subcontractor company name
  signature_image_url text      not null,  -- Storage path in toolbox-talk-signatures bucket
  signed_at         timestamptz not null default now(),
  unique (talk_id, user_id)
);


-- 4. INDEXES

create index idx_toolbox_talk_library_company_id on toolbox_talk_library(company_id);
create index idx_toolbox_talk_library_is_archived on toolbox_talk_library(is_archived);
create index idx_toolbox_talk_library_updated_at  on toolbox_talk_library(updated_at);

create index idx_toolbox_talks_site_id    on toolbox_talks(site_id);
create index idx_toolbox_talks_status     on toolbox_talks(status);
create index idx_toolbox_talks_updated_at on toolbox_talks(updated_at);

create index idx_toolbox_talk_reads_talk_id on toolbox_talk_reads(talk_id);
create index idx_toolbox_talk_reads_user_id on toolbox_talk_reads(user_id);

create index idx_toolbox_talk_signatures_talk_id on toolbox_talk_signatures(talk_id);
create index idx_toolbox_talk_signatures_user_id on toolbox_talk_signatures(user_id);


-- 5. UPDATED_AT TRIGGERS
--    Requires the set_updated_at() function from main schema.sql.

create trigger trg_toolbox_talk_library_updated_at
  before update on toolbox_talk_library
  for each row execute function set_updated_at();

create trigger trg_toolbox_talks_updated_at
  before update on toolbox_talks
  for each row execute function set_updated_at();


-- 6. ROW LEVEL SECURITY

alter table toolbox_talk_library    enable row level security;
alter table toolbox_talks           enable row level security;
alter table toolbox_talk_reads      enable row level security;
alter table toolbox_talk_signatures enable row level security;

-- toolbox_talk_library
create policy "toolbox_talk_library: main_admin full access"
  on toolbox_talk_library for all to authenticated
  using     (auth_role() = 'main_admin')
  with check (auth_role() = 'main_admin');

create policy "toolbox_talk_library: company_admin full access on own company"
  on toolbox_talk_library for all to authenticated
  using     (auth_role() = 'company_admin' and company_id = auth_company_id())
  with check (auth_role() = 'company_admin' and company_id = auth_company_id());

create policy "toolbox_talk_library: appointed_person full access on own company"
  on toolbox_talk_library for all to authenticated
  using     (auth_role() = 'appointed_person' and company_id = auth_company_id())
  with check (auth_role() = 'appointed_person' and company_id = auth_company_id());

create policy "toolbox_talk_library: crane_supervisor insert on own company"
  on toolbox_talk_library for insert to authenticated
  with check (auth_role() = 'crane_supervisor' and company_id = auth_company_id());

create policy "toolbox_talk_library: crane_supervisor read own company"
  on toolbox_talk_library for select to authenticated
  using (auth_role() = 'crane_supervisor' and company_id = auth_company_id());

create policy "toolbox_talk_library: other site roles read own company"
  on toolbox_talk_library for select to authenticated
  using (
    auth_role() in ('crane_operator', 'slinger_signaller', 'subcontractor_admin')
    and company_id = auth_company_id()
  );

-- toolbox_talks
create policy "toolbox_talks: main_admin reads all"
  on toolbox_talks for select to authenticated
  using (auth_role() = 'main_admin');

create policy "toolbox_talks: company_admin reads own company"
  on toolbox_talks for select to authenticated
  using (
    auth_role() = 'company_admin'
    and site_id in (select id from sites where company_id = auth_company_id())
  );

create policy "toolbox_talks: appointed_person full access on own site"
  on toolbox_talks for all to authenticated
  using     (auth_role() = 'appointed_person' and site_id = auth_site_id())
  with check (auth_role() = 'appointed_person' and site_id = auth_site_id());

create policy "toolbox_talks: crane_supervisor full access on own site"
  on toolbox_talks for all to authenticated
  using     (auth_role() = 'crane_supervisor' and site_id = auth_site_id())
  with check (auth_role() = 'crane_supervisor' and site_id = auth_site_id());

create policy "toolbox_talks: other site roles read own site"
  on toolbox_talks for select to authenticated
  using (
    auth_role() in ('crane_operator', 'slinger_signaller', 'subcontractor_admin')
    and site_id = auth_site_id()
  );

-- toolbox_talk_reads
create policy "toolbox_talk_reads: main_admin reads all"
  on toolbox_talk_reads for select to authenticated
  using (auth_role() = 'main_admin');

create policy "toolbox_talk_reads: company_admin reads own company"
  on toolbox_talk_reads for select to authenticated
  using (
    auth_role() = 'company_admin'
    and talk_id in (
      select t.id from toolbox_talks t
      join sites s on s.id = t.site_id
      where s.company_id = auth_company_id()
    )
  );

create policy "toolbox_talk_reads: ap and supervisor read own site"
  on toolbox_talk_reads for select to authenticated
  using (
    auth_role() in ('appointed_person', 'crane_supervisor')
    and talk_id in (select id from toolbox_talks where site_id = auth_site_id())
  );

create policy "toolbox_talk_reads: site roles insert own read"
  on toolbox_talk_reads for insert to authenticated
  with check (
    auth_role() in (
      'appointed_person', 'crane_supervisor', 'crane_operator',
      'slinger_signaller', 'subcontractor_admin'
    )
    and user_id = auth.uid()
    and talk_id in (select id from toolbox_talks where site_id = auth_site_id())
  );

create policy "toolbox_talk_reads: own record readable"
  on toolbox_talk_reads for select to authenticated
  using (user_id = auth.uid());

-- toolbox_talk_signatures
create policy "toolbox_talk_signatures: main_admin reads all"
  on toolbox_talk_signatures for select to authenticated
  using (auth_role() = 'main_admin');

create policy "toolbox_talk_signatures: company_admin reads own company"
  on toolbox_talk_signatures for select to authenticated
  using (
    auth_role() = 'company_admin'
    and talk_id in (
      select t.id from toolbox_talks t
      join sites s on s.id = t.site_id
      where s.company_id = auth_company_id()
    )
  );

create policy "toolbox_talk_signatures: ap and supervisor read own site"
  on toolbox_talk_signatures for select to authenticated
  using (
    auth_role() in ('appointed_person', 'crane_supervisor')
    and talk_id in (select id from toolbox_talks where site_id = auth_site_id())
  );

create policy "toolbox_talk_signatures: site roles insert own signature"
  on toolbox_talk_signatures for insert to authenticated
  with check (
    auth_role() in (
      'appointed_person', 'crane_supervisor', 'crane_operator',
      'slinger_signaller', 'subcontractor_admin'
    )
    and user_id = auth.uid()
    and talk_id in (select id from toolbox_talks where site_id = auth_site_id())
  );

create policy "toolbox_talk_signatures: own record readable"
  on toolbox_talk_signatures for select to authenticated
  using (user_id = auth.uid());


-- 7. STORAGE BUCKET POLICIES
--
-- Create these buckets in Supabase Dashboard → Storage → New Bucket:
--   toolbox-talk-signatures  (private)
--   toolbox-talk-pdfs        (private)
--
-- Storage paths used by the app:
--   Signatures:   {talk_id}/{user_id}.png        (bucket: toolbox-talk-signatures)
--   PDFs/DOCX:    library/{company_id}/{ts}_{filename}  (bucket: toolbox-talk-pdfs)
--   Sign-off PDFs: signoffs/{site_id}/{talk_id}_signoff.pdf  (bucket: toolbox-talk-pdfs)

create policy "toolbox-talk-signatures: site members can upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'toolbox-talk-signatures'
    and auth_role() in (
      'appointed_person', 'crane_supervisor', 'crane_operator',
      'slinger_signaller', 'subcontractor_admin'
    )
  );

create policy "toolbox-talk-signatures: authenticated users can read"
  on storage.objects for select to authenticated
  using (bucket_id = 'toolbox-talk-signatures');

create policy "toolbox-talk-pdfs: managers can upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'toolbox-talk-pdfs'
    and auth_role() in ('appointed_person', 'crane_supervisor')
  );

create policy "toolbox-talk-pdfs: authenticated users can read"
  on storage.objects for select to authenticated
  using (bucket_id = 'toolbox-talk-pdfs');


-- 8. AUTO-ARCHIVE CRON JOB
--
-- Requires pg_cron and pg_net extensions enabled in Supabase Dashboard.
-- Enable via: Dashboard → Database → Extensions.
--
-- Runs at 18:00 UTC — update the schedule string if your site's working
-- day ends at a different local time (adjust for UTC offset).
--
-- Replace <project-ref> and <service-role-key> before running.
-- NEVER commit the service role key to version control.

select cron.schedule(
  'auto-archive-toolbox-talks',
  '0 18 * * *',   -- 18:00 UTC daily
  $$
  select net.http_post(
    url     := 'https://<project-ref>.supabase.co/functions/v1/generate-signoff',
    body    := '{}',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <service-role-key>'
    )
  ) as request_id
  $$
);
