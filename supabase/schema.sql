-- ==============================================================
-- LIFTING APP — SUPABASE DATABASE SCHEMA
-- ==============================================================
-- Domain: Crane & rigging operations (LOLER / BS7121, UK)
-- Auth:   Email OTP via Supabase Auth — no self-registration.
--         Users are created by admins via the Supabase Admin API
--         (auth.admin.createUser) and a profile row is inserted
--         immediately after. The profiles.id = auth.users.id.
-- Sync:   WatermelonDB offline-first. updated_at is the sync
--         anchor — index all updated_at columns for fast pulls.
-- ==============================================================


-- ──────────────────────────────────────────────────────────────
-- 1. ENUMS
-- ──────────────────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM (
  'main_admin',          -- global superuser, not tied to any company
  'company_admin',       -- manages all sites under one company
  'appointed_person',    -- legally responsible for one site (LOLER)
  'crane_supervisor',    -- supervises lifting ops on one site
  'crane_operator',      -- operates crane on one site
  'slinger_signaller',   -- attaches loads / signals on one site
  'subcontractor_admin'  -- external contractor embedded in one site
);

CREATE TYPE crane_log_status AS ENUM (
  'working',
  'service',
  'thorough_examination',
  'winded_off',
  'breaking_down'
);


-- ──────────────────────────────────────────────────────────────
-- 2. CORE TABLES
-- ──────────────────────────────────────────────────────────────

CREATE TABLE companies (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  contact_email TEXT,
  contact_phone TEXT,
  address       TEXT,
  is_archived   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────

CREATE TABLE sites (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  name        TEXT        NOT NULL,
  address     TEXT,
  is_archived BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────

CREATE TABLE profiles (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT        NOT NULL,
  email       TEXT        NOT NULL UNIQUE,
  phone       TEXT        NOT NULL,
  role        user_role   NOT NULL,
  company_id  UUID        REFERENCES companies(id) ON DELETE RESTRICT,
  site_id     UUID        REFERENCES sites(id)     ON DELETE RESTRICT,
  is_archived BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- main_admin is not scoped to any company or site
  CONSTRAINT chk_main_admin_no_company_or_site CHECK (
    role <> 'main_admin'
    OR (company_id IS NULL AND site_id IS NULL)
  ),

  -- company_admin belongs to a company but is not scoped to a site
  CONSTRAINT chk_company_admin_company_no_site CHECK (
    role <> 'company_admin'
    OR (company_id IS NOT NULL AND site_id IS NULL)
  ),

  -- all site-level roles must have both company and site
  CONSTRAINT chk_site_roles_require_both CHECK (
    role NOT IN (
      'appointed_person', 'crane_supervisor', 'crane_operator',
      'slinger_signaller', 'subcontractor_admin'
    )
    OR (company_id IS NOT NULL AND site_id IS NOT NULL)
  )
);

-- ──────────────────────────────────────────────────────────────

-- Crane register for a site (crane_ref is the human-readable ID)
CREATE TABLE cranes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     UUID        NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
  crane_ref   TEXT        NOT NULL,
  is_archived BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (site_id, crane_ref)
);

-- ──────────────────────────────────────────────────────────────

-- Subcontracting companies working on a site (not user accounts)
CREATE TABLE subcontractors (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     UUID        NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
  name        TEXT        NOT NULL,
  is_archived BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────

CREATE TABLE crane_logs (
  id               UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id          UUID             NOT NULL REFERENCES sites(id)         ON DELETE RESTRICT,
  crane_id         UUID             NOT NULL REFERENCES cranes(id)        ON DELETE RESTRICT,
  opened_by        UUID             NOT NULL REFERENCES profiles(id)      ON DELETE RESTRICT,
  status           crane_log_status NOT NULL,
  subcontractor_id UUID             REFERENCES subcontractors(id)         ON DELETE RESTRICT,
  job_description  TEXT,
  start_time       TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  end_time         TIMESTAMPTZ,
  -- Stored generated column: seconds from open → close (NULL while open)
  duration_seconds INTEGER GENERATED ALWAYS AS (
    EXTRACT(EPOCH FROM (end_time - start_time))::INTEGER
  ) STORED,
  is_closed        BOOLEAN          NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW(),

  -- subcontractor is required when crane is working
  CONSTRAINT chk_working_requires_subcontractor CHECK (
    status <> 'working' OR subcontractor_id IS NOT NULL
  ),
  -- a closed log must record when it ended
  CONSTRAINT chk_closed_requires_end_time CHECK (
    NOT is_closed OR end_time IS NOT NULL
  ),
  -- end time must be after start time
  CONSTRAINT chk_end_time_after_start CHECK (
    end_time IS NULL OR end_time > start_time
  )
);

-- ──────────────────────────────────────────────────────────────

CREATE TABLE crane_log_photos (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  crane_log_id UUID        NOT NULL REFERENCES crane_logs(id) ON DELETE CASCADE,
  -- Object path inside the 'crane-log-photos' Supabase Storage bucket.
  -- Recommended format: {site_id}/{crane_log_id}/{uuid}.jpg
  storage_path TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ──────────────────────────────────────────────────────────────
-- 3. INDEXES
-- ──────────────────────────────────────────────────────────────

-- Foreign key look-ups
CREATE INDEX idx_profiles_company_id       ON profiles(company_id);
CREATE INDEX idx_profiles_site_id          ON profiles(site_id);
CREATE INDEX idx_profiles_role             ON profiles(role);
CREATE INDEX idx_sites_company_id          ON sites(company_id);
CREATE INDEX idx_cranes_site_id            ON cranes(site_id);
CREATE INDEX idx_subcontractors_site_id    ON subcontractors(site_id);
CREATE INDEX idx_crane_logs_site_id        ON crane_logs(site_id);
CREATE INDEX idx_crane_logs_crane_id       ON crane_logs(crane_id);
CREATE INDEX idx_crane_logs_opened_by      ON crane_logs(opened_by);
CREATE INDEX idx_crane_logs_subcontractor  ON crane_logs(subcontractor_id);
CREATE INDEX idx_crane_log_photos_log_id   ON crane_log_photos(crane_log_id);

-- Filter / sort columns
CREATE INDEX idx_companies_is_archived     ON companies(is_archived);
CREATE INDEX idx_sites_is_archived         ON sites(is_archived);
CREATE INDEX idx_cranes_is_archived        ON cranes(is_archived);
CREATE INDEX idx_crane_logs_status         ON crane_logs(status);
CREATE INDEX idx_crane_logs_is_closed      ON crane_logs(is_closed);
CREATE INDEX idx_crane_logs_start_time     ON crane_logs(start_time DESC);

-- WatermelonDB sync: pull records changed since last_pulled_at
CREATE INDEX idx_companies_updated_at      ON companies(updated_at);
CREATE INDEX idx_sites_updated_at          ON sites(updated_at);
CREATE INDEX idx_profiles_updated_at       ON profiles(updated_at);
CREATE INDEX idx_cranes_updated_at         ON cranes(updated_at);
CREATE INDEX idx_subcontractors_updated_at ON subcontractors(updated_at);
CREATE INDEX idx_crane_logs_updated_at     ON crane_logs(updated_at);

-- Business rule: only one OPEN log per crane at any time
CREATE UNIQUE INDEX idx_one_open_log_per_crane
  ON crane_logs(crane_id)
  WHERE NOT is_closed;


-- ──────────────────────────────────────────────────────────────
-- 4. updated_at TRIGGER
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_sites_updated_at
  BEFORE UPDATE ON sites
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_cranes_updated_at
  BEFORE UPDATE ON cranes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_subcontractors_updated_at
  BEFORE UPDATE ON subcontractors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_crane_logs_updated_at
  BEFORE UPDATE ON crane_logs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ──────────────────────────────────────────────────────────────
-- 5. RLS HELPER FUNCTIONS
--
-- STABLE + SECURITY DEFINER: PostgreSQL caches the result once
-- per query (not once per row), so each policy check costs one
-- lookup rather than N lookups.
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION auth_role()
RETURNS user_role LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION auth_company_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION auth_site_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT site_id FROM profiles WHERE id = auth.uid();
$$;

-- Called by the sign-in screen (anon) before attempting OTP.
-- Returns true/false only — no profile data is exposed to unauthenticated callers.
-- Prevents "Database error finding user" from GoTrue surfacing when shouldCreateUser: false
-- is set and the email doesn't exist in auth.users.
CREATE OR REPLACE FUNCTION is_email_registered(p_email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE email = lower(trim(p_email))
  );
$$;

GRANT EXECUTE ON FUNCTION is_email_registered(text) TO anon;


-- ──────────────────────────────────────────────────────────────
-- 6. ROW LEVEL SECURITY
-- ──────────────────────────────────────────────────────────────

ALTER TABLE companies        ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites            ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE cranes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcontractors   ENABLE ROW LEVEL SECURITY;
ALTER TABLE crane_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE crane_log_photos ENABLE ROW LEVEL SECURITY;


-- ── companies ─────────────────────────────────────────────────

CREATE POLICY "companies: main_admin full access"
  ON companies FOR ALL TO authenticated
  USING     (auth_role() = 'main_admin')
  WITH CHECK (auth_role() = 'main_admin');

CREATE POLICY "companies: company_admin reads own company"
  ON companies FOR SELECT TO authenticated
  USING (auth_role() = 'company_admin' AND id = auth_company_id());

CREATE POLICY "companies: site roles read own company"
  ON companies FOR SELECT TO authenticated
  USING (
    auth_role() IN (
      'appointed_person','crane_supervisor','crane_operator',
      'slinger_signaller','subcontractor_admin'
    )
    AND id = auth_company_id()
  );


-- ── sites ─────────────────────────────────────────────────────

CREATE POLICY "sites: main_admin reads all"
  ON sites FOR SELECT TO authenticated
  USING (auth_role() = 'main_admin');

CREATE POLICY "sites: company_admin full access on own company"
  ON sites FOR ALL TO authenticated
  USING     (auth_role() = 'company_admin' AND company_id = auth_company_id())
  WITH CHECK (auth_role() = 'company_admin' AND company_id = auth_company_id());

CREATE POLICY "sites: site roles read own site"
  ON sites FOR SELECT TO authenticated
  USING (
    auth_role() IN (
      'appointed_person','crane_supervisor','crane_operator',
      'slinger_signaller','subcontractor_admin'
    )
    AND id = auth_site_id()
  );


-- ── profiles ──────────────────────────────────────────────────

-- Every authenticated user can always read their own profile
CREATE POLICY "profiles: own profile always readable"
  ON profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

-- main_admin: full access to all profiles
CREATE POLICY "profiles: main_admin full access"
  ON profiles FOR ALL TO authenticated
  USING     (auth_role() = 'main_admin')
  WITH CHECK (auth_role() = 'main_admin');

-- company_admin: read all profiles in their company
CREATE POLICY "profiles: company_admin reads own company"
  ON profiles FOR SELECT TO authenticated
  USING (auth_role() = 'company_admin' AND company_id = auth_company_id());

-- company_admin: may only create / update appointed_person profiles
CREATE POLICY "profiles: company_admin inserts appointed_person"
  ON profiles FOR INSERT TO authenticated
  WITH CHECK (
    auth_role() = 'company_admin'
    AND company_id = auth_company_id()
    AND role = 'appointed_person'
  );

CREATE POLICY "profiles: company_admin updates appointed_person"
  ON profiles FOR UPDATE TO authenticated
  USING (
    auth_role() = 'company_admin'
    AND company_id = auth_company_id()
    AND role = 'appointed_person'
  )
  WITH CHECK (
    auth_role() = 'company_admin'
    AND company_id = auth_company_id()
    AND role = 'appointed_person'
  );

-- appointed_person: read all profiles on their site
CREATE POLICY "profiles: appointed_person reads own site"
  ON profiles FOR SELECT TO authenticated
  USING (auth_role() = 'appointed_person' AND site_id = auth_site_id());

-- appointed_person: may only create / update site operatives
CREATE POLICY "profiles: appointed_person inserts site operatives"
  ON profiles FOR INSERT TO authenticated
  WITH CHECK (
    auth_role() = 'appointed_person'
    AND site_id    = auth_site_id()
    AND company_id = auth_company_id()
    AND role IN ('crane_supervisor','crane_operator','slinger_signaller','subcontractor_admin')
  );

CREATE POLICY "profiles: appointed_person updates site operatives"
  ON profiles FOR UPDATE TO authenticated
  USING (
    auth_role() = 'appointed_person'
    AND site_id = auth_site_id()
    AND role IN ('crane_supervisor','crane_operator','slinger_signaller','subcontractor_admin')
  )
  WITH CHECK (
    auth_role() = 'appointed_person'
    AND site_id = auth_site_id()
    AND role IN ('crane_supervisor','crane_operator','slinger_signaller','subcontractor_admin')
  );

-- site operative roles: read colleagues on the same site
CREATE POLICY "profiles: site roles read own site"
  ON profiles FOR SELECT TO authenticated
  USING (
    auth_role() IN (
      'crane_supervisor','crane_operator','slinger_signaller','subcontractor_admin'
    )
    AND site_id = auth_site_id()
  );


-- ── cranes ────────────────────────────────────────────────────

CREATE POLICY "cranes: main_admin reads all"
  ON cranes FOR SELECT TO authenticated
  USING (auth_role() = 'main_admin');

CREATE POLICY "cranes: company_admin reads own company"
  ON cranes FOR SELECT TO authenticated
  USING (
    auth_role() = 'company_admin'
    AND site_id IN (SELECT id FROM sites WHERE company_id = auth_company_id())
  );

CREATE POLICY "cranes: appointed_person full access on own site"
  ON cranes FOR ALL TO authenticated
  USING     (auth_role() = 'appointed_person' AND site_id = auth_site_id())
  WITH CHECK (auth_role() = 'appointed_person' AND site_id = auth_site_id());

CREATE POLICY "cranes: site roles read own site"
  ON cranes FOR SELECT TO authenticated
  USING (
    auth_role() IN (
      'crane_supervisor','crane_operator','slinger_signaller','subcontractor_admin'
    )
    AND site_id = auth_site_id()
  );


-- ── subcontractors ────────────────────────────────────────────

CREATE POLICY "subcontractors: main_admin reads all"
  ON subcontractors FOR SELECT TO authenticated
  USING (auth_role() = 'main_admin');

CREATE POLICY "subcontractors: company_admin reads own company"
  ON subcontractors FOR SELECT TO authenticated
  USING (
    auth_role() = 'company_admin'
    AND site_id IN (SELECT id FROM sites WHERE company_id = auth_company_id())
  );

CREATE POLICY "subcontractors: appointed_person full access on own site"
  ON subcontractors FOR ALL TO authenticated
  USING     (auth_role() = 'appointed_person' AND site_id = auth_site_id())
  WITH CHECK (auth_role() = 'appointed_person' AND site_id = auth_site_id());

CREATE POLICY "subcontractors: site roles read own site"
  ON subcontractors FOR SELECT TO authenticated
  USING (
    auth_role() IN (
      'crane_supervisor','crane_operator','slinger_signaller','subcontractor_admin'
    )
    AND site_id = auth_site_id()
  );


-- ── crane_logs ────────────────────────────────────────────────

CREATE POLICY "crane_logs: main_admin reads all"
  ON crane_logs FOR SELECT TO authenticated
  USING (auth_role() = 'main_admin');

CREATE POLICY "crane_logs: company_admin reads own company"
  ON crane_logs FOR SELECT TO authenticated
  USING (
    auth_role() = 'company_admin'
    AND site_id IN (SELECT id FROM sites WHERE company_id = auth_company_id())
  );

-- appointed_person: full CRUD (open, edit, close)
CREATE POLICY "crane_logs: appointed_person full access on own site"
  ON crane_logs FOR ALL TO authenticated
  USING     (auth_role() = 'appointed_person' AND site_id = auth_site_id())
  WITH CHECK (auth_role() = 'appointed_person' AND site_id = auth_site_id());

-- crane_supervisor: full CRUD (can open and close logs per spec)
CREATE POLICY "crane_logs: crane_supervisor full access on own site"
  ON crane_logs FOR ALL TO authenticated
  USING     (auth_role() = 'crane_supervisor' AND site_id = auth_site_id())
  WITH CHECK (auth_role() = 'crane_supervisor' AND site_id = auth_site_id());

-- remaining site roles: read-only
CREATE POLICY "crane_logs: other site roles read only"
  ON crane_logs FOR SELECT TO authenticated
  USING (
    auth_role() IN ('crane_operator','slinger_signaller','subcontractor_admin')
    AND site_id = auth_site_id()
  );


-- ── crane_log_photos ──────────────────────────────────────────

CREATE POLICY "crane_log_photos: main_admin reads all"
  ON crane_log_photos FOR SELECT TO authenticated
  USING (auth_role() = 'main_admin');

CREATE POLICY "crane_log_photos: company_admin reads own company"
  ON crane_log_photos FOR SELECT TO authenticated
  USING (
    auth_role() = 'company_admin'
    AND crane_log_id IN (
      SELECT cl.id FROM crane_logs cl
      JOIN   sites    s  ON s.id = cl.site_id
      WHERE  s.company_id = auth_company_id()
    )
  );

-- appointed_person + crane_supervisor: full access to photos on their site's logs
CREATE POLICY "crane_log_photos: ap and supervisor full access"
  ON crane_log_photos FOR ALL TO authenticated
  USING (
    auth_role() IN ('appointed_person','crane_supervisor')
    AND crane_log_id IN (
      SELECT id FROM crane_logs WHERE site_id = auth_site_id()
    )
  )
  WITH CHECK (
    auth_role() IN ('appointed_person','crane_supervisor')
    AND crane_log_id IN (
      SELECT id FROM crane_logs WHERE site_id = auth_site_id()
    )
  );

-- remaining site roles: read-only
CREATE POLICY "crane_log_photos: other site roles read only"
  ON crane_log_photos FOR SELECT TO authenticated
  USING (
    auth_role() IN ('crane_operator','slinger_signaller','subcontractor_admin')
    AND crane_log_id IN (
      SELECT id FROM crane_logs WHERE site_id = auth_site_id()
    )
  );


-- ──────────────────────────────────────────────────────────────
-- 7. STORAGE BUCKET
--
-- Create the bucket in Dashboard → Storage → New Bucket:
--   Name: crane-log-photos
--   Public: NO
--
-- Recommended storage path format so RLS can be tightened later:
--   {site_id}/{crane_log_id}/{uuid}.jpg
--
-- The policies below allow any authenticated user with a site
-- role to operate on the bucket; tighten further by parsing the
-- path prefix against auth_site_id() if needed.
-- ──────────────────────────────────────────────────────────────

-- Uncomment once the bucket exists:
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('crane-log-photos', 'crane-log-photos', false)
-- ON CONFLICT DO NOTHING;

CREATE POLICY "storage crane-log-photos: site members can upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'crane-log-photos'
    AND auth_role() IN ('appointed_person','crane_supervisor')
  );

CREATE POLICY "storage crane-log-photos: authenticated users can read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'crane-log-photos');

CREATE POLICY "storage crane-log-photos: ap and supervisor can delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'crane-log-photos'
    AND auth_role() IN ('appointed_person','crane_supervisor')
  );
