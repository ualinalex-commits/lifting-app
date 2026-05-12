-- ==============================================================
-- LIFTING APP — TOOLBOX TALK SCHEMA MIGRATION
-- ==============================================================
-- Run this after the main schema.sql has been applied.
-- ==============================================================


-- ──────────────────────────────────────────────────────────────
-- 1. ENUM
-- ──────────────────────────────────────────────────────────────

CREATE TYPE toolbox_talk_content_type AS ENUM ('text', 'pdf');


-- ──────────────────────────────────────────────────────────────
-- 2. ADD subcontractor_id TO PROFILES
--    Allows subcontractor_admin users to be linked to their
--    subcontractor company so the correct name appears on sign-off.
-- ──────────────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS subcontractor_id UUID
    REFERENCES subcontractors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_subcontractor_id ON profiles(subcontractor_id);


-- ──────────────────────────────────────────────────────────────
-- 3. TABLES
-- ──────────────────────────────────────────────────────────────

-- Company-wide template library for reusable toolbox talks
CREATE TABLE toolbox_talk_library (
  id            UUID                      PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID                      NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  title         TEXT                      NOT NULL,
  content_type  toolbox_talk_content_type NOT NULL,
  body          TEXT,          -- populated when content_type = 'text'
  pdf_url       TEXT,          -- Storage path when content_type = 'pdf'
  created_by    UUID                      NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  is_archived   BOOLEAN                   NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ               NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_library_content CHECK (
    (content_type = 'text' AND body IS NOT NULL AND pdf_url IS NULL) OR
    (content_type = 'pdf'  AND pdf_url IS NOT NULL AND body IS NULL)
  )
);

-- Site-level toolbox talk instances
CREATE TABLE toolbox_talks (
  id               UUID                      PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id          UUID                      NOT NULL REFERENCES sites(id)   ON DELETE RESTRICT,
  library_id       UUID                      REFERENCES toolbox_talk_library(id) ON DELETE SET NULL,
  title            TEXT                      NOT NULL,
  content_type     toolbox_talk_content_type NOT NULL,
  body             TEXT,          -- text content (NULL for pdf talks)
  pdf_url          TEXT,          -- original PDF Storage path (NULL for text talks)
  sign_off_pdf_url TEXT,          -- combined sign-off PDF path after archiving
  created_by       UUID                      NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  is_archived      BOOLEAN                   NOT NULL DEFAULT FALSE,
  archived_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ               NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_talk_content CHECK (
    (content_type = 'text' AND body IS NOT NULL AND pdf_url IS NULL) OR
    (content_type = 'pdf'  AND pdf_url IS NOT NULL AND body IS NULL)
  ),
  CONSTRAINT chk_archived_has_timestamp CHECK (
    NOT is_archived OR archived_at IS NOT NULL
  )
);

-- Records when a user reads (scrolls to bottom of) a talk — once per user per talk
CREATE TABLE toolbox_talk_reads (
  id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  talk_id   UUID        NOT NULL REFERENCES toolbox_talks(id) ON DELETE CASCADE,
  user_id   UUID        NOT NULL REFERENCES profiles(id)      ON DELETE CASCADE,
  read_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (talk_id, user_id)
);

-- Drawn signature records — once per user per talk
CREATE TABLE toolbox_talk_signatures (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  talk_id         UUID        NOT NULL REFERENCES toolbox_talks(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES profiles(id)      ON DELETE CASCADE,
  full_name       TEXT        NOT NULL,
  role            user_role   NOT NULL,
  company_name    TEXT        NOT NULL, -- main company name or subcontractor company name
  signature_url   TEXT        NOT NULL, -- Supabase Storage path to signature PNG
  signed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (talk_id, user_id)
);


-- ──────────────────────────────────────────────────────────────
-- 4. INDEXES
-- ──────────────────────────────────────────────────────────────

CREATE INDEX idx_toolbox_talk_library_company_id  ON toolbox_talk_library(company_id);
CREATE INDEX idx_toolbox_talk_library_is_archived  ON toolbox_talk_library(is_archived);
CREATE INDEX idx_toolbox_talk_library_updated_at   ON toolbox_talk_library(updated_at);

CREATE INDEX idx_toolbox_talks_site_id             ON toolbox_talks(site_id);
CREATE INDEX idx_toolbox_talks_library_id          ON toolbox_talks(library_id);
CREATE INDEX idx_toolbox_talks_created_by          ON toolbox_talks(created_by);
CREATE INDEX idx_toolbox_talks_is_archived         ON toolbox_talks(is_archived);
CREATE INDEX idx_toolbox_talks_updated_at          ON toolbox_talks(updated_at);

CREATE INDEX idx_toolbox_talk_reads_talk_id        ON toolbox_talk_reads(talk_id);
CREATE INDEX idx_toolbox_talk_reads_user_id        ON toolbox_talk_reads(user_id);

CREATE INDEX idx_toolbox_talk_signatures_talk_id   ON toolbox_talk_signatures(talk_id);
CREATE INDEX idx_toolbox_talk_signatures_user_id   ON toolbox_talk_signatures(user_id);


-- ──────────────────────────────────────────────────────────────
-- 5. updated_at TRIGGERS
-- ──────────────────────────────────────────────────────────────

CREATE TRIGGER trg_toolbox_talk_library_updated_at
  BEFORE UPDATE ON toolbox_talk_library
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_toolbox_talks_updated_at
  BEFORE UPDATE ON toolbox_talks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ──────────────────────────────────────────────────────────────
-- 6. ROW LEVEL SECURITY
-- ──────────────────────────────────────────────────────────────

ALTER TABLE toolbox_talk_library   ENABLE ROW LEVEL SECURITY;
ALTER TABLE toolbox_talks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE toolbox_talk_reads     ENABLE ROW LEVEL SECURITY;
ALTER TABLE toolbox_talk_signatures ENABLE ROW LEVEL SECURITY;


-- ── toolbox_talk_library ──────────────────────────────────────

CREATE POLICY "toolbox_talk_library: main_admin full access"
  ON toolbox_talk_library FOR ALL TO authenticated
  USING     (auth_role() = 'main_admin')
  WITH CHECK (auth_role() = 'main_admin');

CREATE POLICY "toolbox_talk_library: company_admin full access on own company"
  ON toolbox_talk_library FOR ALL TO authenticated
  USING     (auth_role() = 'company_admin' AND company_id = auth_company_id())
  WITH CHECK (auth_role() = 'company_admin' AND company_id = auth_company_id());

-- appointed_person can read and add library items for their company
CREATE POLICY "toolbox_talk_library: appointed_person full access on own company"
  ON toolbox_talk_library FOR ALL TO authenticated
  USING     (auth_role() = 'appointed_person' AND company_id = auth_company_id())
  WITH CHECK (auth_role() = 'appointed_person' AND company_id = auth_company_id());

-- crane_supervisor can add library items for their company (required for upload cascade)
CREATE POLICY "toolbox_talk_library: crane_supervisor insert on own company"
  ON toolbox_talk_library FOR INSERT TO authenticated
  WITH CHECK (auth_role() = 'crane_supervisor' AND company_id = auth_company_id());

-- Site roles can read the library to choose talks
CREATE POLICY "toolbox_talk_library: site roles read own company"
  ON toolbox_talk_library FOR SELECT TO authenticated
  USING (
    auth_role() IN ('crane_supervisor','crane_operator','slinger_signaller','subcontractor_admin')
    AND company_id = auth_company_id()
  );


-- ── toolbox_talks ─────────────────────────────────────────────

CREATE POLICY "toolbox_talks: main_admin reads all"
  ON toolbox_talks FOR SELECT TO authenticated
  USING (auth_role() = 'main_admin');

CREATE POLICY "toolbox_talks: company_admin reads own company"
  ON toolbox_talks FOR SELECT TO authenticated
  USING (
    auth_role() = 'company_admin'
    AND site_id IN (SELECT id FROM sites WHERE company_id = auth_company_id())
  );

-- appointed_person: full CRUD on their site
CREATE POLICY "toolbox_talks: appointed_person full access on own site"
  ON toolbox_talks FOR ALL TO authenticated
  USING     (auth_role() = 'appointed_person' AND site_id = auth_site_id())
  WITH CHECK (auth_role() = 'appointed_person' AND site_id = auth_site_id());

-- crane_supervisor: full CRUD (can create and archive talks)
CREATE POLICY "toolbox_talks: crane_supervisor full access on own site"
  ON toolbox_talks FOR ALL TO authenticated
  USING     (auth_role() = 'crane_supervisor' AND site_id = auth_site_id())
  WITH CHECK (auth_role() = 'crane_supervisor' AND site_id = auth_site_id());

-- Remaining site roles: read-only
CREATE POLICY "toolbox_talks: other site roles read own site"
  ON toolbox_talks FOR SELECT TO authenticated
  USING (
    auth_role() IN ('crane_operator','slinger_signaller','subcontractor_admin')
    AND site_id = auth_site_id()
  );


-- ── toolbox_talk_reads ────────────────────────────────────────

CREATE POLICY "toolbox_talk_reads: main_admin reads all"
  ON toolbox_talk_reads FOR SELECT TO authenticated
  USING (auth_role() = 'main_admin');

CREATE POLICY "toolbox_talk_reads: company_admin reads own company"
  ON toolbox_talk_reads FOR SELECT TO authenticated
  USING (
    auth_role() = 'company_admin'
    AND talk_id IN (
      SELECT t.id FROM toolbox_talks t
      JOIN   sites   s ON s.id = t.site_id
      WHERE  s.company_id = auth_company_id()
    )
  );

-- AP + supervisor: read all reads on their site's talks
CREATE POLICY "toolbox_talk_reads: ap and supervisor read own site"
  ON toolbox_talk_reads FOR SELECT TO authenticated
  USING (
    auth_role() IN ('appointed_person','crane_supervisor')
    AND talk_id IN (SELECT id FROM toolbox_talks WHERE site_id = auth_site_id())
  );

-- All site roles: insert their own read record
CREATE POLICY "toolbox_talk_reads: site roles insert own read"
  ON toolbox_talk_reads FOR INSERT TO authenticated
  WITH CHECK (
    auth_role() IN (
      'appointed_person','crane_supervisor','crane_operator',
      'slinger_signaller','subcontractor_admin'
    )
    AND user_id = auth.uid()
    AND talk_id IN (SELECT id FROM toolbox_talks WHERE site_id = auth_site_id())
  );

-- Users can read their own read record
CREATE POLICY "toolbox_talk_reads: own record readable"
  ON toolbox_talk_reads FOR SELECT TO authenticated
  USING (user_id = auth.uid());


-- ── toolbox_talk_signatures ───────────────────────────────────

CREATE POLICY "toolbox_talk_signatures: main_admin reads all"
  ON toolbox_talk_signatures FOR SELECT TO authenticated
  USING (auth_role() = 'main_admin');

CREATE POLICY "toolbox_talk_signatures: company_admin reads own company"
  ON toolbox_talk_signatures FOR SELECT TO authenticated
  USING (
    auth_role() = 'company_admin'
    AND talk_id IN (
      SELECT t.id FROM toolbox_talks t
      JOIN   sites   s ON s.id = t.site_id
      WHERE  s.company_id = auth_company_id()
    )
  );

-- AP + supervisor: read all signatures on their site's talks
CREATE POLICY "toolbox_talk_signatures: ap and supervisor read own site"
  ON toolbox_talk_signatures FOR SELECT TO authenticated
  USING (
    auth_role() IN ('appointed_person','crane_supervisor')
    AND talk_id IN (SELECT id FROM toolbox_talks WHERE site_id = auth_site_id())
  );

-- All site roles: insert their own signature
CREATE POLICY "toolbox_talk_signatures: site roles insert own signature"
  ON toolbox_talk_signatures FOR INSERT TO authenticated
  WITH CHECK (
    auth_role() IN (
      'appointed_person','crane_supervisor','crane_operator',
      'slinger_signaller','subcontractor_admin'
    )
    AND user_id = auth.uid()
    AND talk_id IN (SELECT id FROM toolbox_talks WHERE site_id = auth_site_id())
  );

-- Users can read their own signature
CREATE POLICY "toolbox_talk_signatures: own record readable"
  ON toolbox_talk_signatures FOR SELECT TO authenticated
  USING (user_id = auth.uid());


-- ──────────────────────────────────────────────────────────────
-- 7. STORAGE BUCKETS
--
-- Create in Dashboard → Storage → New Bucket:
--   toolbox-talk-signatures  (private)
--   toolbox-talk-pdfs        (private)
--
-- Recommended paths:
--   signatures: {site_id}/{talk_id}/{user_id}.png
--   pdfs:       library/{company_id}/{library_id}.pdf
--               talks/{site_id}/{talk_id}.pdf
--               signoffs/{site_id}/{talk_id}_signoff.pdf
-- ──────────────────────────────────────────────────────────────

CREATE POLICY "toolbox-talk-signatures: site members can upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'toolbox-talk-signatures'
    AND auth_role() IN (
      'appointed_person','crane_supervisor','crane_operator',
      'slinger_signaller','subcontractor_admin'
    )
  );

CREATE POLICY "toolbox-talk-signatures: authenticated users can read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'toolbox-talk-signatures');

CREATE POLICY "toolbox-talk-pdfs: ap and supervisor can upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'toolbox-talk-pdfs'
    AND auth_role() IN ('appointed_person','crane_supervisor')
  );

CREATE POLICY "toolbox-talk-pdfs: authenticated users can read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'toolbox-talk-pdfs');


-- ──────────────────────────────────────────────────────────────
-- 8. pg_cron SCHEDULED JOB
--
-- Requires pg_cron extension enabled in Supabase Dashboard.
-- Enable via: Dashboard → Database → Extensions → pg_cron
--
-- Replace 'https://<project-ref>.supabase.co' with your project URL.
-- Replace '<service-role-key>' with your service role key (store
-- securely — never commit to version control).
-- ──────────────────────────────────────────────────────────────

SELECT cron.schedule(
  'daily-toolbox-talk-signoff',
  '0 0 * * *',   -- 00:00 UTC every day
  $$
  SELECT
    net.http_post(
      url    := 'https://<project-ref>.supabase.co/functions/v1/generate-signoff',
      body   := '{}',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer <service-role-key>'
      )
    )
  $$
);


-- ==============================================================
-- MIGRATION 2: docx support and content_text column
-- ==============================================================
-- Run each statement individually (not in a transaction) because
-- ALTER TYPE ... ADD VALUE cannot execute inside a transaction.
-- ==============================================================

-- 1. Add docx variant to the content type enum
ALTER TYPE toolbox_talk_content_type ADD VALUE IF NOT EXISTS 'docx';

-- 2. Replace library CHECK constraint to allow docx
--    (docx stores its file path in pdf_url, same as pdf)
ALTER TABLE toolbox_talk_library
  DROP CONSTRAINT chk_library_content;
ALTER TABLE toolbox_talk_library
  ADD CONSTRAINT chk_library_content CHECK (
    (content_type = 'text'               AND body    IS NOT NULL AND pdf_url IS NULL)
    OR (content_type IN ('pdf', 'docx')  AND pdf_url IS NOT NULL AND body    IS NULL)
  );

-- 3. Replace toolbox_talks CHECK constraint to allow docx
ALTER TABLE toolbox_talks
  DROP CONSTRAINT chk_talk_content;
ALTER TABLE toolbox_talks
  ADD CONSTRAINT chk_talk_content CHECK (
    (content_type = 'text'               AND body    IS NOT NULL AND pdf_url IS NULL)
    OR (content_type IN ('pdf', 'docx')  AND pdf_url IS NOT NULL AND body    IS NULL)
  );

-- 4. Add content_text for extracted docx plain text (populated by extract-docx-text Edge Function)
ALTER TABLE toolbox_talks
  ADD COLUMN IF NOT EXISTS content_text TEXT;
