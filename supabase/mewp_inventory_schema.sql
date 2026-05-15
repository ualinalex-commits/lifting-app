-- ==============================================================
-- MEWP INVENTORY MODULE — SUPABASE SCHEMA
-- Run in: Supabase Dashboard > SQL Editor
-- Depends on: companies, sites, subcontractors, profiles tables
-- ==============================================================


-- ──────────────────────────────────────────────────────────────
-- 1. TABLES
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mewps (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id              UUID        NOT NULL REFERENCES sites(id)          ON DELETE RESTRICT,
  subcontractor_id     UUID                 REFERENCES subcontractors(id) ON DELETE SET NULL,
  mewp_type            TEXT        NOT NULL,
  serial_number        TEXT        NOT NULL,
  thorough_exam_url    TEXT,
  thorough_exam_expiry DATE,
  current_location     TEXT,
  sticker_url          TEXT,
  is_archived          BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mewps_site_id_idx    ON mewps(site_id);
CREATE INDEX IF NOT EXISTS mewps_updated_at_idx ON mewps(updated_at);

-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mewp_location_history (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  mewp_id     UUID        NOT NULL REFERENCES mewps(id)    ON DELETE CASCADE,
  location    TEXT        NOT NULL,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by  UUID                 REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS mewp_location_history_mewp_id_idx ON mewp_location_history(mewp_id);


-- ──────────────────────────────────────────────────────────────
-- 2. UPDATED_AT TRIGGER
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION mewps_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mewps_updated_at ON mewps;
CREATE TRIGGER mewps_updated_at
  BEFORE UPDATE ON mewps
  FOR EACH ROW EXECUTE FUNCTION mewps_set_updated_at();


-- ──────────────────────────────────────────────────────────────
-- 3. ROW LEVEL SECURITY
-- ──────────────────────────────────────────────────────────────

ALTER TABLE mewps                ENABLE ROW LEVEL SECURITY;
ALTER TABLE mewp_location_history ENABLE ROW LEVEL SECURITY;

-- mewps: public SELECT
CREATE POLICY "mewps_select"
  ON mewps FOR SELECT
  USING (true);

-- mewps: appointed_person and subcontractor_admin can INSERT for their site
CREATE POLICY "mewps_insert"
  ON mewps FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('appointed_person', 'subcontractor_admin')
        AND profiles.site_id = mewps.site_id
    )
  );

-- mewps: appointed_person, subcontractor_admin, and main_admin can UPDATE
CREATE POLICY "mewps_update"
  ON mewps FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND (
          profiles.role = 'main_admin'
          OR (
            profiles.role IN ('appointed_person', 'subcontractor_admin')
            AND profiles.site_id = mewps.site_id
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND (
          profiles.role = 'main_admin'
          OR (
            profiles.role IN ('appointed_person', 'subcontractor_admin')
            AND profiles.site_id = mewps.site_id
          )
        )
    )
  );

-- mewps: appointed_person, subcontractor_admin, and main_admin can DELETE
CREATE POLICY "mewps_delete"
  ON mewps FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND (
          profiles.role = 'main_admin'
          OR (
            profiles.role IN ('appointed_person', 'subcontractor_admin')
            AND profiles.site_id = mewps.site_id
          )
        )
    )
  );

-- mewp_location_history: public SELECT, authenticated INSERT
CREATE POLICY "mewp_location_history_select"
  ON mewp_location_history FOR SELECT
  USING (true);

CREATE POLICY "mewp_location_history_insert"
  ON mewp_location_history FOR INSERT
  TO authenticated
  WITH CHECK (true);


-- ──────────────────────────────────────────────────────────────
-- 4. STORAGE BUCKETS
-- ──────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'mewp-thorough-exams',
    'mewp-thorough-exams',
    true,
    20971520, -- 20 MB
    ARRAY['application/pdf', 'image/jpeg', 'image/png']
  ),
  (
    'mewp-stickers',
    'mewp-stickers',
    true,
    10485760, -- 10 MB
    ARRAY['image/jpeg', 'image/png']
  )
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: authenticated INSERT, public SELECT
CREATE POLICY "mewp_thorough_exams_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'mewp-thorough-exams');

CREATE POLICY "mewp_thorough_exams_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'mewp-thorough-exams');

CREATE POLICY "mewp_stickers_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'mewp-stickers');

CREATE POLICY "mewp_stickers_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'mewp-stickers');
