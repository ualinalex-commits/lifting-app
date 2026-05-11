# Lifting App — CLAUDE.md

> This file is the single source of truth for the Lifting App.
> Read it fully before writing any code. Never make assumptions about domain logic — refer here first.

---

## 1. App Overview

Lifting App is a field-first mobile and web app built for crane and rigging teams on construction sites.
It manages lifting operations, site personnel, compliance, and scheduling.
Built for the UK construction industry — roles and responsibilities follow LOLER / BS7121 regulations.

**Target platforms:** iOS, Android, Web
**Stack:** React Native (Expo), Supabase (cloud DB), WatermelonDB (local DB)

---

## 2. User Roles & Hierarchy

```
main_admin
└── company_admin
    └── appointed_person
        ├── crane_supervisor
        ├── crane_operator
        ├── slinger_signaller
        └── subcontractor_admin
```

### Role Definitions

| Role | Scope | Responsibilities |
|---|---|---|
| `main_admin` | Global | Creates companies, creates and assigns company_admins |
| `company_admin` | Company-wide | Creates sites, creates and assigns appointed_persons across all company sites |
| `appointed_person` | Single site | Adds and manages site operatives; legally responsible for lift plans (LOLER/BS7121) |
| `crane_supervisor` | Single site | Supervises lifting operations on site |
| `crane_operator` | Single site | Operates crane equipment |
| `slinger_signaller` | Single site | Attaches loads and signals crane operator |
| `subcontractor_admin` | Single site | External contractor embedded in the site; used for crane scheduling |

### Hierarchy Rules

- `main_admin` is a single superuser role — not tied to any company.
- `company_admin` manages **all sites** under their company.
- `appointed_person` is assigned to and manages **one site at a time**.
- All operative roles (`crane_supervisor`, `crane_operator`, `slinger_signaller`, `subcontractor_admin`) belong to **one site at a time**.
- An `appointed_person` can add **multiple** `subcontractor_admin` users to their site.
- A user cannot hold multiple roles simultaneously.

### Who Creates Who

| Actor | Can Create |
|---|---|
| `main_admin` | Companies, `company_admin` users |
| `company_admin` | Sites (under their company), `appointed_person` users |
| `appointed_person` | `crane_supervisor`, `crane_operator`, `slinger_signaller`, `subcontractor_admin` |

---

## 3. Data Hierarchy

```
Companies
└── Sites (belong to one company)
    └── Operatives (belong to one site at a time)
```

- Each **Company** has a name, contact details, and a list of sites.
- Each **Site** belongs to one company and has its own `appointed_person` and operatives.
- Each **Operative** (user with a site-level role) is scoped to one site at a time.

---

## 4. Authentication

**Method:** Email OTP (one-time PIN) — no passwords.

### Flow

1. User opens app and enters their email address.
2. App sends a **6-digit PIN** to that email.
3. User enters the PIN in the app.
4. PIN is valid for **10 minutes** from the time of issue.
5. On success, user is signed in and session is established.
6. If PIN expires, user must request a new one.

### Rules

- Users do **not** self-register. They are added by the appropriate role (see "Who Creates Who" above).
- When a user is added, their email is registered in the system. They can only sign in if their email exists.
- OTP is handled via **Supabase Auth** (built-in email OTP support).
- Sessions persist locally so operatives do not need to re-authenticate on every app open.

---

## 5. Database Architecture

### Overview

The app is **offline-first**. It must function fully without an internet connection once the user is authenticated and data has been synced.

| Layer | Technology | Role |
|---|---|---|
| Cloud DB | Supabase (PostgreSQL) | Source of truth |
| Local DB | WatermelonDB | On-device, offline-capable |

### Sync Behaviour

- On connection: local DB syncs with Supabase automatically.
- **Conflict resolution: Server wins.** If local and server data conflict, Supabase data always takes priority.
- Append-only records (e.g. lift logs, operational events) never conflict — they are always additive.
- Sync runs in the background; the user does not need to trigger it manually.

### Offline Behaviour

- The app works **fully offline** for all features once data is synced.
- Writes made offline are queued locally and pushed to Supabase when connectivity is restored.
- No feature should be gated behind a live connection.
- The UI should indicate sync status (e.g. last synced time, pending changes).

---

---

## 6. Screens & Navigation

---

### 6.1 main_admin

#### Companies Screen *(home screen for main_admin)*
- List of all **active** companies
- Each company card shows: company name, number of sites, assigned company_admin name
- Buttons: **Add Company**, **View Archived**
- Each company row has: **Edit**, **Archive**
- Tap a company → Company Detail Screen

#### Company Detail Screen
- Shows full company details: name, contact info
- Section: **Company Admin** — shows the assigned company_admin (name, email, phone). Buttons: **Add**, **Edit**, **Archive**
- Section: **Sites** — list of all active sites under this company (name, appointed_person name). Tap a site → Site Detail Screen (read-only view for main_admin)
- Button: **View Archived** (shows archived company_admins for this company)

#### Site Detail Screen *(main_admin view — read only)*
- Shows site name, address, appointed_person
- Shows full list of operatives on the site grouped by role
- No add/edit/archive actions — management is done by company_admin and appointed_person

#### Archived Companies Screen
- List of archived companies
- Each row has: **Restore** (sets back to active) — no permanent delete
- Tap a company → read-only view of that company's details

---

### 6.2 company_admin

#### Sites Screen *(home screen for company_admin)*
- List of all **active** sites under their company
- Each site card shows: site name, address, appointed_person name
- Buttons: **Add Site**, **View Archived**
- Each site row has: **Edit**, **Archive**
- Tap a site → Site Detail Screen

#### Site Detail Screen
- Shows full site details: site name, address
- Section: **Appointed Person** — shows assigned appointed_person (name, email, phone). Buttons: **Add**, **Edit**, **Archive**
- Section: **Operatives** — full list of all operatives on the site, grouped by role:
  - crane_supervisor
  - crane_operator
  - slinger_signaller
  - subcontractor_admin
- Each operative shows: name, email, phone, role
- Button: **View Archived** (shows archived operatives and appointed_persons for this site)

#### Archived Sites Screen
- List of archived sites under their company
- Each row has: **Restore** — no permanent delete
- Tap a site → read-only view of that site's details

---

### 6.3 Archive & Restore Rules

- **Archiving** never permanently deletes any record — data is retained for audit and safety purposes.
- Archived records are hidden from all active lists across all roles.
- Any role that can add or edit a record can also archive it.
- Restoring an archived record makes it fully active again with all previous data intact.
- **Archived items are accessible** via a "View Archived" button on the relevant list screen.

---

### 6.4 User Fields

When adding or editing any user (company_admin, appointed_person, or operative), the form collects:

| Field | Required |
|---|---|
| Full name | Yes |
| Email address | Yes |
| Phone number | Yes |
| Role | Yes (pre-set by context) |

- Email must be unique across the system.
- Role is pre-determined by context (e.g. adding from the company_admin section always assigns the company_admin role).
- On creation, the user receives no password — they sign in via email OTP when they first access the app.

---

---

## 7. Appointed Person — Dashboard & Site Management

---

### 7.1 Dashboard *(home screen for appointed_person)*

The dashboard is the central hub for the appointed_person. It provides an overview of the site and quick access to all functional areas.

Visible sections on the dashboard:
- Site name and status summary
- Quick access cards/buttons for all site screens:
  - Crane Logs
  - Crane Schedule
  - Daily Briefing
  - Toolbox Talk
  - LOLER Register
  - Supervisor Checks
  - Operator Checks

> **Note:** Crane Logs and Toolbox Talk are fully built. Crane Schedule, Daily Briefing, LOLER Register, Supervisor Checks, and Operator Checks are placeholders — navigation and screen shells exist but no logic is implemented.

---

### 7.2 Site Entities

The appointed_person manages three distinct lists on their site:

#### Operatives
Users with roles (crane_supervisor, crane_operator, slinger_signaller, subcontractor_admin).
Managed by company_admin and appointed_person — covered in Section 6.

#### Subcontractors
A list of subcontracting **companies** working on the site. Separate from the subcontractor_admin user role.

| Field | Required |
|---|---|
| Subcontractor name | Yes |

- Added, edited, and archived by the appointed_person.
- Referenced in Crane Logs when crane status is "working".

#### Cranes
A register of cranes on the site.

| Field | Required |
|---|---|
| Crane ID | Yes |

- Added, edited, and archived by the appointed_person.
- Each crane can have **only one open log at a time**.
- Referenced when opening a Crane Log.

---

### 7.3 Crane Logs

A Crane Log tracks the status and activity of a crane during a shift or operational period.

#### Who Can Open a Log
- `appointed_person`
- `crane_supervisor`

#### Log Fields

| Field | Details |
|---|---|
| Crane | Selected from the site crane list |
| Status | Enum: `working`, `service`, `thorough_examination`, `winded_off`, `breaking_down` |
| Subcontractor | Selected from the site subcontractor list — **only shown/required when status is `working`** |
| Job description | Free text |
| Photo | One or more photos attached to the log |
| Start time | Automatically captured when the log is submitted — not manually entered |

#### Log Lifecycle

1. A log is **opened** by submitting the form above. Start time is recorded automatically.
2. The log remains **open** until manually closed.
3. While open, all fields can be **edited** at any time.
4. A crane can have **only one open log at a time**. If a crane already has an open log, a new one cannot be opened for it until the existing one is closed.
5. When **closed**, the end time is automatically recorded and the **duration** is calculated (end time − start time).
6. Closed logs are read-only.

#### Log List Screen
- Shows all crane logs for the site (open and closed)
- Filter by: crane, status, date, open/closed
- Each log card shows: crane ID, status, start time, duration (if closed), subcontractor (if applicable)
- Tap a log → Log Detail Screen

#### Log Detail Screen
- Shows all log fields
- If open: **Edit** and **Close Log** buttons
- If closed: read-only, shows duration

---

*More sections to follow: Crane Schedule, Daily Briefing, LOLER Register, Supervisor Checks, Operator Checks.*

---

## 8. Toolbox Talk

A Toolbox Talk is a short, informal safety briefing held with site operatives before work begins. This feature manages the full lifecycle: creating and distributing a talk, tracking who has read it, collecting drawn signatures, and generating a permanent signed-off PDF record.

---

### 8.1 Data Model

Four tables support this feature. All are defined in `supabase/toolbox_talk_schema.sql`.

#### toolbox_talk_library
Company-level reusable templates. An `appointed_person` or `company_admin` builds up a library of standard talks so they can be reused across sessions without re-entering the content.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `company_id` | UUID | FK → companies |
| `title` | TEXT | Required |
| `content_type` | enum | `text` or `pdf` |
| `body` | TEXT | Populated when `content_type = 'text'`; NULL otherwise |
| `pdf_url` | TEXT | Storage path when `content_type = 'pdf'`; NULL otherwise |
| `created_by` | UUID | FK → profiles |
| `is_archived` | BOOLEAN | Soft-delete |
| `created_at` / `updated_at` | TIMESTAMPTZ | Standard timestamps |

Constraint: exactly one of `body` or `pdf_url` must be non-null — enforced by a CHECK constraint.

#### toolbox_talks
Site-level talk instances. Each time an `appointed_person` or `crane_supervisor` runs a toolbox talk, a row is created here. It may be copied from the library or created ad hoc.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `site_id` | UUID | FK → sites |
| `library_id` | UUID | FK → toolbox_talk_library (nullable — NULL if created manually) |
| `title` | TEXT | Required |
| `content_type` | enum | `text` or `pdf` |
| `body` | TEXT | Text content; NULL for PDF talks |
| `pdf_url` | TEXT | Original PDF Storage path; NULL for text talks |
| `sign_off_pdf_url` | TEXT | Combined sign-off PDF path — set after sign-off is generated |
| `created_by` | UUID | FK → profiles |
| `is_archived` | BOOLEAN | Set to `true` when sign-off PDF is generated |
| `archived_at` | TIMESTAMPTZ | Timestamp of archival |
| `created_at` / `updated_at` | TIMESTAMPTZ | Standard timestamps |

#### toolbox_talk_reads
Records that a specific user has reached the bottom of a talk. One row per user per talk — enforced by a UNIQUE constraint on `(talk_id, user_id)`.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `talk_id` | UUID | FK → toolbox_talks |
| `user_id` | UUID | FK → profiles |
| `read_at` | TIMESTAMPTZ | Automatically set on insert |

#### toolbox_talk_signatures
Stores a drawn signature for a specific user on a specific talk. One row per user per talk — enforced by a UNIQUE constraint on `(talk_id, user_id)`. Immutable once inserted.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `talk_id` | UUID | FK → toolbox_talks |
| `user_id` | UUID | FK → profiles |
| `full_name` | TEXT | Captured at sign time from the user's profile |
| `role` | user_role | Captured at sign time |
| `company_name` | TEXT | Main company name for all roles except `subcontractor_admin`, who shows their subcontractor company name |
| `signature_url` | TEXT | Storage path to the signature PNG (`toolbox-talk-signatures` bucket) |
| `signed_at` | TIMESTAMPTZ | Automatically set on insert |

#### Schema change: profiles.subcontractor_id
A nullable `subcontractor_id UUID` column is added to `profiles` to link `subcontractor_admin` users to their subcontractor company. This is the only way to resolve the correct company name at sign time.

---

### 8.2 Storage Buckets

| Bucket | Contents | Path format |
|---|---|---|
| `toolbox-talk-signatures` | Signature PNG images | `{site_id}/{talk_id}/{user_id}.png` |
| `toolbox-talk-pdfs` | Library PDFs, site talk PDFs, and generated sign-off PDFs | `library/{company_id}/{id}.pdf` · `talks/{site_id}/{id}.pdf` · `signoffs/{site_id}/{talk_id}_signoff.pdf` |

Both buckets are private. Signed URLs are generated client-side via Supabase Storage for any user read.

---

### 8.3 RLS Summary

| Table | Scope | Who can read | Who can write |
|---|---|---|---|
| `toolbox_talk_library` | `company_id` | All roles in that company | `appointed_person`, `company_admin`, `main_admin` |
| `toolbox_talks` | `site_id` | All roles on that site | `appointed_person`, `crane_supervisor` |
| `toolbox_talk_reads` | `talk_id` (site-scoped) | AP + supervisor see all; others see own | Any site role — own record only |
| `toolbox_talk_signatures` | `talk_id` (site-scoped) | AP + supervisor see all; others see own | Any site role — own record only |

---

### 8.4 Screens

All screens live under `app/(appointed-person)/toolbox-talk/` and are registered in the parent `_layout.tsx` Stack.

---

#### Talk List Screen — `toolbox-talk.tsx`
The entry point, accessed from the dashboard.

- Two tabs: **Active** and **Archive**
- **Active tab:** lists all non-archived talks for the site. Each card shows: title, content type badge (Text / PDF), creator name, date created, read count, signed count
- **Archive tab:** lists archived talks (those with a generated sign-off PDF). Same card layout
- **+ New Toolbox Talk** button (visible to `appointed_person` and `crane_supervisor` only) → navigates to `toolbox-talk/new`
- **Library** button → navigates to `toolbox-talk/library`
- Tap any card → navigates to `toolbox-talk/[id]`

---

#### Library Screen — `toolbox-talk/library.tsx`
Company-wide template library. Accessible from the Talk List screen.

- Lists all non-archived library talks for the company
- Each card shows: title, content type badge, creator name, date
- **+ Add to Library** button → opens a modal form:
  - Title (required)
  - Content type: Text or PDF (toggle)
  - If Text: multi-line text input for the full talk content
  - If PDF: text input for the Storage path (user uploads the PDF to Supabase Storage separately, then pastes the path)
- **Preview** action per card:
  - Text talks → opens an inline text preview modal
  - PDF talks → generates a signed URL and opens via `Linking.openURL` in the system browser
- **Archive** action per card → soft-deletes from the library; confirmation alert required

---

#### New Talk Screen — `toolbox-talk/new.tsx`
Two-option form for creating a site-level talk.

**Option A — From Library:**
- Radio list of all non-archived company library talks
- On submit: creates a `toolbox_talks` row copying title, content_type, body, pdf_url from the selected library item; sets `library_id` to link back

**Option B — Create Manually:**
- Title input
- Content type toggle: Text or PDF
- If Text: multi-line text input
- If PDF: Storage path input

On submit → inserts the `toolbox_talks` row, navigates to `toolbox-talk/[id]` via `router.replace`.

---

#### Talk Detail Screen — `toolbox-talk/[id].tsx`
The main reading and action screen.

**Content display:**
- Text talks: full body text rendered in a `ScrollView`
- PDF talks: "View PDF" button that opens the file via a signed URL in the system browser; also shows a "Mark as Read" button since scroll-to-bottom cannot be tracked inside an external viewer

**Scroll-to-bottom gate:**
- For text talks, the `onScroll` event fires continuously. When `layoutMeasurement.height + contentOffset.y >= contentSize.height - 40` the user is deemed to have reached the bottom
- On reaching the bottom: inserts a `toolbox_talk_reads` row (once — guarded by the unique constraint and local state); sets `hasScrolledToBottom = true`
- If the user already has a read record (loaded on mount), `hasScrolledToBottom` is pre-set to `true`

**Sign button logic:**
- Hidden (replaced by locked placeholder) until `hasScrolledToBottom` is true
- Once unlocked: **Sign this Talk** button → navigates to `toolbox-talk/sign?talk_id={id}`
- After the user returns from signing, the screen re-fetches (via `useFocusEffect`) and replaces the button with a **Signed ✓** badge showing the timestamp

**Buttons visible to `appointed_person` and `crane_supervisor` only:**
- **View Status** → navigates to `toolbox-talk/status?talk_id={id}`
- **Generate Sign-Off Page** → confirmation alert, then calls the `generate-signoff` Edge Function; on success shows a confirmation and re-fetches (the talk will now be archived)

**Archived talks:**
- All action buttons are hidden
- If `sign_off_pdf_url` is set: **View Sign-Off PDF** button opens the combined PDF via signed URL

---

#### Signing Screen — `toolbox-talk/sign.tsx`
Presented as a modal (Stack `presentation: 'modal'`).

**Pre-filled read-only fields (populated from the user's profile on mount):**
- Full name
- Role (human-readable label)
- Company — logic:
  - `subcontractor_admin`: fetches their linked subcontractor's name via `profiles.subcontractor_id` → `subcontractors.name`
  - All other roles: fetches their company's name via `profiles.company_id` → `companies.name`

**Drawn signature canvas:**
- Rendered via `react-native-signature-canvas` (WebView-based HTML canvas)
- **Clear** button resets the canvas
- **Confirm Signature** button is disabled until the canvas has received input

**On confirm:**
1. Reads the signature as a base64 PNG data URI from the canvas
2. Decodes and uploads the PNG to the `toolbox-talk-signatures` Storage bucket at `{site_id}/{talk_id}/{user_id}.png`
3. Inserts a `toolbox_talk_signatures` row with full_name, role, company_name, signature_url, and signed_at
4. Handles the unique constraint violation gracefully (already signed → Alert + navigate back)
5. On success: Alert confirmation, then `router.back()`

---

#### Live Status Screen — `toolbox-talk/status.tsx`
Accessible to `appointed_person` and `crane_supervisor` only.

- Displays a table of all non-archived operatives on the site
- Columns: **Name**, **Role**, **Read** (timestamp or "Not yet"), **Signed** (timestamp or "Not yet")
- Summary bar at the bottom: operative count, read count, signed count
- **Live updates** via a Supabase Realtime subscription on `toolbox_talk_reads` and `toolbox_talk_signatures` filtered to `talk_id = {id}` — new rows appear instantly without a manual refresh

---

### 8.5 Sign-Off Generation

#### Edge Function — `supabase/functions/generate-signoff/index.ts`

Accepts a POST request. Two call modes:

**From the app** — body `{ talk_id: "..." }`:
- Processes that single talk immediately
- Used when the AP or supervisor taps "Generate Sign-Off Page"

**From pg_cron** — empty body `{}`:
- Fetches all active talks (`is_archived = false`, `sign_off_pdf_url IS NULL`) that have at least one signature
- Processes each one in sequence

**Processing steps for each talk:**
1. Fetch the `toolbox_talks` row and its linked `sites` row (for site name)
2. Fetch all `toolbox_talk_signatures` rows for that talk, ordered by `signed_at`
3. Build a sign-off PDF page using `pdf-lib` (imported via `npm:pdf-lib@^1` in Deno) containing:
   - Header: "TOOLBOX TALK SIGN-OFF SHEET", talk title, site name, date generated
   - A table of signatories: name, role, company, timestamp, and embedded signature PNG
   - Automatic pagination if the signatory list exceeds one page
4. If the talk is PDF-type and has an original `pdf_url`: download the original PDF and append the sign-off page to it as a combined document
5. Upload the final PDF to `toolbox-talk-pdfs` at `signoffs/{site_id}/{talk_id}_signoff.pdf` (upsert)
6. Update `toolbox_talks`: set `sign_off_pdf_url`, `is_archived = true`, `archived_at = NOW()`

#### pg_cron Scheduled Job

Defined in `supabase/toolbox_talk_schema.sql`. Requires the `pg_cron` and `pg_net` extensions enabled in the Supabase Dashboard.

```sql
SELECT cron.schedule(
  'daily-toolbox-talk-signoff',
  '0 0 * * *',   -- 00:00 UTC every day
  $$ SELECT net.http_post(...) $$
);
```

Replace `<project-ref>` and `<service-role-key>` with real values before running. The service role key must be stored securely — never commit it to version control.

---

### 8.6 Invariants — Never Break These

- **No permanent deletion.** Only soft-archive via `is_archived = true`.
- **One read record per user per talk.** Enforced by `UNIQUE (talk_id, user_id)` on `toolbox_talk_reads`. The UI also guards with local state.
- **One signature record per user per talk.** Enforced by `UNIQUE (talk_id, user_id)` on `toolbox_talk_signatures`. The unique constraint violation is caught and handled gracefully.
- **Sign button is gated behind scroll-to-bottom.** Never show it before `hasScrolledToBottom = true`. PDF talks use a manual "Mark as Read" button since scroll cannot be tracked in an external viewer.
- **subcontractor_admin company field must show their subcontractor company name**, not the main site company. Requires `profiles.subcontractor_id` to be set when the user is created.
- **Signatures are immutable.** No UPDATE or DELETE policy exists on `toolbox_talk_signatures` for any role.
- **Sign-off generation archives the talk.** Once `sign_off_pdf_url` is set and `is_archived = true`, the talk is permanently read-only.

---

## 9. Current Build Status

### Built & Working

| Area | Details |
|---|---|
| **Auth flow** | Email OTP via Supabase Auth — send PIN, verify PIN, session persistence |
| **main_admin screens** | Companies list, Company Detail, Site Detail (read-only), Archived Companies |
| **company_admin screens** | Sites list, Site Detail (with Appointed Person + Operatives sections), Archived Sites |
| **Appointed Person dashboard** | Home screen with quick-access cards to all site areas |
| **Operatives screens** | Add, edit, archive, restore operatives (crane_supervisor, crane_operator, slinger_signaller, subcontractor_admin) |
| **Cranes screens** | Crane register — add, edit, archive, restore cranes |
| **Subcontractors screens** | Subcontractor company list — add, edit, archive, restore |
| **Crane Logs screen** | Open log, edit log, close log, log list with filters, log detail view |
| **Supabase schema** | Tables for companies, sites, users, cranes, subcontractors, crane_logs with RLS policies |
| **Edge Function — user creation** | Creates Supabase Auth user and inserts profile row in a single server-side call |
| **Toolbox Talk feature** | Full end-to-end: library, talk list (Active/Archive tabs), new talk, talk detail with scroll-to-bottom gate, signing modal with drawn signature canvas, live status screen with Realtime, generate-signoff Edge Function, daily pg_cron job |

### Pending / Not Yet Built

| Area | Status |
|---|---|
| **Crane Schedule** | Screen shell only — no logic implemented |
| **Daily Briefing** | Screen shell only — no logic implemented |
| **LOLER Register** | Screen shell only — no logic implemented |
| **Supervisor Checks** | Screen shell only — no logic implemented |
| **Operator Checks** | Screen shell only — no logic implemented |
| **WatermelonDB offline sync** | Package not yet installed; all screens use direct Supabase queries |
