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

## 8. Current Build Status

> Last updated: 2026-05-26

| Feature | Status | Detail |
|---|---|---|
| **Crane Logs** | Built & Working | Open/close logs, edit while open, filter by crane/status/date/open-closed, analytics screen with subcontractor usage breakdown and date-range filters |
| **Crane Schedule** | Built & Working | Subcontractor crane booking requests, appointed person approval flow |
| **Toolbox Talk** | Built & Working | Upload PDF or Word file from device with client-side HTML extraction (mammoth convertToHtml), auto-saves to company library with duplicate detection, embedded inline viewer for PDF (iframe on web, native button on mobile to open externally) and DOCX (rendered as styled HTML preserving headings, lists, tables), scroll-to-bottom on outer ScrollView marks read instantly, drawn signature (HTML5 canvas on web, react-native-signature-canvas on native), Attendance modal showing Read + Signed in real time via Supabase Realtime, delete active talk + delete library entries + delete archived talks (all soft-delete via status flags), Generate Sign-Off Edge Function builds combined PDF with correctly-aligned columns (Name, Role, Company, Signed At with signature image and timestamp), auto-archive at 18:00 via pg_cron |
| **Daily Briefing** | Built & Working | Per-site daily safety briefing. Set Up form (AP/supervisor only) with Weather Forecast (daily reset), Site Details + Any Other Business + Lifting Schedule + First Aider/Muster Point (persistent), Yes/No checklist (9 questions), AP/supervisor signature on submission. Document assembled as HTML using mixed dynamic + boilerplate template, embedded inline on home page like Toolbox Talk. Bar chart showing operatives signed per company. Scroll-to-bottom read tracking, drawn signature canvas, Attendance modal with live Read + Signed counts. Auto-archive at 18:00 via pg_cron or manual generate, produces multi-page PDF with attendees table + briefing content + AP sign-off page using pdf-lib Edge Function |
| **LOLER Register** | Placeholder | Shell screen only — not yet built |
| **Supervisor Checks** | Placeholder | Shell screen only — not yet built |
| **Operator Checks** | Placeholder | Shell screen only — not yet built |

---

## 9. Toolbox Talk

---

### 9.1 Overview

The Toolbox Talk feature allows `appointed_person` and `crane_supervisor` users to upload a safety briefing document (PDF or Word), display it inline for all site operatives to read, track who has read and signed it, and generate a signed-off archive PDF at the end of the briefing.

Each site has **one active toolbox talk at a time**. Past talks are stored in an archive. The company library retains all documents ever uploaded so they can be reused across sites and dates.

---

### 9.2 Roles & Permissions

| Role | Permissions |
|---|---|
| `appointed_person` | Upload talk, delete active talk, view attendance, generate sign-off, access library, access archive |
| `crane_supervisor` | Upload talk, delete active talk, view attendance, generate sign-off, access library, access archive |
| `crane_operator` | Read active talk, sign active talk |
| `slinger_signaller` | Read active talk, sign active talk |
| `subcontractor_admin` | Read active talk, sign active talk |

---

### 9.3 Screens

| Screen | Path | Description |
|---|---|---|
| Home | `/(appointed-person)/toolbox-talk/` | Active talk display, action buttons (Upload, Library, Attendance, Archive), Sign Off button |
| Sign | `/(appointed-person)/toolbox-talk/sign` | Signature canvas — draw and submit signature |
| Library | `/(appointed-person)/toolbox-talk/library` | Company-wide talk library, reuse or delete entries |
| Attendance | `/(appointed-person)/toolbox-talk/attendance` | Live Read + Signed status per operative |
| Archive | `/(appointed-person)/toolbox-talk/archive` | Past archived talks with sign-off PDF download |

The home screen refreshes on focus via `useFocusEffect` — the Signed ✓ badge and Sign Off button always reflect the latest state when navigating back from the sign screen.

---

### 9.4 Upload Flow

1. User picks a PDF or DOCX file via `DocumentPicker.getDocumentAsync`.
2. **For DOCX only:** text is extracted client-side using the `mammoth` library **before** the file is uploaded to Storage. If extraction fails, an alert is shown and the upload is aborted — never silently swallowed.
3. File is uploaded to the `toolbox-talk-pdfs` Storage bucket under `library/{companyId}/{timestamp}_{filename}.{ext}`.
4. The system checks `toolbox_talk_library` for an existing record with the same title (case-insensitive) in the same company.
5. **Duplicate found:** prompt the user to use the existing library entry or cancel. If cancelled, the just-uploaded file is deleted from Storage to prevent orphans.
6. **No duplicate:** a new `toolbox_talk_library` record is inserted with `content_text` populated (for DOCX) and `pdf_url` pointing to the storage path.
7. A `toolbox_talks` record is inserted with `content_text`, `pdf_url`, `library_id`, and `status = 'active'`.
8. The home screen reloads and displays the new talk immediately — `content_text` is already present so no further extraction step is needed.

---

### 9.5 Document Viewer

**Platform-specific rendering:**

- **Web — PDF:** rendered via `<iframe src={signedUrl} />` at 480px height.
- **Web — DOCX:** rendered inline via `<div className="docx-content" dangerouslySetInnerHTML={...}>` with a custom CSS stylesheet for h1/h2/h3, p, ol/ul, li, strong, em, and table styling.
- **Native — PDF:** opens externally via a button (`Linking.openURL`) — WebView rendering was removed.
- **Native — DOCX:** rendered inside a `WebView` with the HTML wrapped in a styled HTML document.

**DOCX HTML extraction:**

DOCX content is extracted client-side using `mammoth.convertToHtml()` (not `extractRawText`) which preserves document structure: headings, paragraphs, numbered lists, bold, italic, indentation, and tables. The extracted HTML is stored in the `content_text` column — no schema change required, the column already holds text.

The extraction handles three asset formats:

- Web `File` object (`asset.file.arrayBuffer()`)
- Base64 data URI (`asset.uri` starts with `data:`)
- Native file URI (fetched via `fetch(asset.uri).arrayBuffer()`)

Legacy plain-text records are detected via `isHtmlContent()` (checks if content starts with `<`) — if content does not start with `<`, it is rendered through the `normaliseDocxText()` fallback which preserves plain text display.

If a legacy `toolbox_talks` record has `content_type = 'docx'` but `content_text` is null, the viewer shows: *"Document text not available — tap View as PDF to open the original file."* — never an infinite spinner.

The `maxHeight` and `overflowY` constraints have been removed from the DOCX div so the outer React Native `ScrollView` handles scrolling — this allows scroll-to-bottom read tracking to fire correctly via `onScroll`.

**Read tracking:**

Read is recorded (`toolbox_talk_reads` INSERT) via the outer `ScrollView`'s `onScroll` handler — the DOCX div no longer scrolls internally, so all scroll events bubble up:

- Triggered when `layoutMeasurement.height + contentOffset.y >= contentSize.height - 50`
- `setMyRead(true)` is called immediately on detection — the Sign Off button appears instantly without waiting for the database round-trip
- DB insert runs in the background; unique constraint code `23505` is ignored as expected
- For DOCX content where the rendered HTML fits entirely on screen without scrolling, the read is marked immediately on render so the user is not gated behind an impossible scroll
- A `myReadRef` is used in scroll handlers to avoid React closure stale-state bugs
- Tapping "View as PDF ↗" also records read via the existing `recordRead()` function

---

### 9.6 Signing

**Web — HTML5 canvas:**
- Custom `<canvas>` element with mouse and touch event handlers.
- Pen colour `#000000`, canvas background `#FFFFFF`.
- `destination-over` composite operation on `mouseup`/`touchend` to bake a white background under strokes before export.
- Exported as base64 PNG via `canvas.toDataURL('image/png')`.
- The `onSave` callback fires on every stroke end, keeping `signatureBase64` state current.

**Native — react-native-signature-canvas:**
- `react-native-signature-canvas` component with matching black-on-white CSS injected via `webStyle`.
- `onOK` callback receives the base64 PNG and immediately calls `handleConfirm`.

**Storage upload:**
- Base64 data URI is converted to a `Blob` (`dataURItoBlob`) before passing to Supabase Storage.
- Uploaded to `toolbox-talk-signatures` bucket at path `{talkId}/{userId}.png`.
- Uses `upsert: true` to allow a user to re-sign if needed.

**After successful signature:**
- A `toolbox_talk_signatures` row is inserted (unique on `(talk_id, user_id)`).
- If the insert returns a `23505` (unique violation), "Already Signed" is shown and the user is navigated back.
- On success: `Alert.alert('Thank You', 'Thank you for signing the toolbox talk.')` is shown, and on OK the user is sent to the Toolbox Talk home screen via `router.replace('/(appointed-person)/toolbox-talk/')`.
- `router.replace` is used (not `router.back`) so the user cannot navigate back to the sign screen.

---

### 9.7 Attendance

Accessible from the home screen via the **Attendance** button (only visible to `appointed_person` and `crane_supervisor`). Requires an active talk to be present — if no active talk exists, an alert is shown.

The attendance screen receives `talk_id` as a query parameter and displays a live list of all operatives on the site, each showing:
- **Name** and **role**
- **Read** — whether a `toolbox_talk_reads` row exists for this user and talk
- **Signed** — whether a `toolbox_talk_signatures` row exists for this user and talk

The list refreshes in real time via a Supabase realtime subscription (or polling on platforms that do not support realtime).

---

### 9.8 Sign-Off Page

The **Generate Sign-Off** button (visible to `appointed_person` and `crane_supervisor` when an active talk exists) calls the `generate-signoff` Supabase Edge Function via `callGenerateSignOff(talkId)` in `lib/api.ts`.

The Edge Function:
1. Fetches all `toolbox_talk_signatures` for the talk, including full_name, role, company, and signature image.
2. Loads the original PDF from `toolbox-talk-pdfs` Storage.
3. Uses `pdf-lib` to compose a sign-off page listing all signatories with their drawn signature images appended to the original PDF.
4. Uploads the combined PDF back to `toolbox-talk-pdfs` under a new path.
5. Sets `toolbox_talks.status = 'archived'` and stores the sign-off PDF URL.

**Deployment notes:**
- The Edge Function must be manually deployed: `supabase functions deploy generate-signoff`.
- CORS headers are required on the Edge Function response for web client invocation (`Access-Control-Allow-Origin: *`, `Access-Control-Allow-Headers: authorization, content-type`).
- The function is invoked via `supabase.functions.invoke('generate-signoff', { body: { talk_id } })` with the user's session token in the `Authorization` header.

**Sign-off page column layout:**

The sign-off page table columns are explicitly positioned:
- Name at x = 50
- Role at x = 200
- Company at x = 320
- Signed At at x = 450 — contains the drawn signature image (100×35px) above a timestamp formatted as `DD MMM YYYY, HH:MM` (24-hour) using `toLocaleString('en-GB')`

Each row is 60px tall to accommodate the signature image plus the timestamp. Text fields are truncated to fit within their column widths to prevent overflow.

After generation, the user is navigated to the Archive screen to view the completed sign-off PDF.

---

### 9.9 Library

The Library screen (`/toolbox-talk/library`) shows all non-archived entries in `toolbox_talk_library` for the user's company, ordered by most recent first.

Each entry shows: title, content type badge (PDF / DOCX / Text), creator name, and creation date.

**Use This Talk:** inserts a new `toolbox_talks` record for the current site linked to the library entry, carrying through `content_text`, `content_type`, and `pdf_url`. Navigates back to the home screen, which reloads and shows the new active talk.

**Delete:** sets `toolbox_talk_library.is_archived = true` — the library entry disappears from the list but existing `toolbox_talks` records that reference it are not affected.

`content_text` is selected from `toolbox_talk_library` and passed to the `toolbox_talks` insert so DOCX text is immediately available without any extraction step.

---

### 9.10 Database Schema

#### `toolbox_talk_library`
| column | type | notes |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| company_id | uuid FK → companies | |
| title | text | |
| content_type | text | CHECK IN ('pdf', 'docx', 'text') |
| content_text | text | Extracted plain text — populated for DOCX at upload time via mammoth |
| pdf_url | text | Storage path in `toolbox-talk-pdfs` bucket |
| is_archived | boolean | default false |
| created_by | uuid FK → profiles | |
| created_at | timestamptz | default now() |

#### `toolbox_talks`
| column | type | notes |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| site_id | uuid FK → sites | |
| library_id | uuid FK → toolbox_talk_library | |
| title | text | |
| content_type | text | CHECK IN ('pdf', 'docx', 'text') |
| content_text | text | Populated for DOCX at creation — never null-then-patched |
| pdf_url | text | Storage path in `toolbox-talk-pdfs` bucket |
| status | text | CHECK IN ('active', 'archived', 'deleted') |
| created_by | uuid FK → profiles | |
| created_at | timestamptz | default now() |

> **Status values:** `active` = currently live on site; `archived` = sign-off generated, read-only; `deleted` = soft-deleted by appointed person or supervisor (was previously `CHECK IN ('active', 'archived')` — `'deleted'` was added to support the Delete Talk action without hard-deleting).

#### `toolbox_talk_reads`
| column | type | notes |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| talk_id | uuid FK → toolbox_talks | |
| user_id | uuid FK → profiles | |
| read_at | timestamptz | default now() |

**UNIQUE constraint:** `(talk_id, user_id)` — one read record per user per talk.

#### `toolbox_talk_signatures`
| column | type | notes |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| talk_id | uuid FK → toolbox_talks | |
| user_id | uuid FK → profiles | |
| full_name | text | Denormalised from profiles at sign time |
| role | text | Denormalised from auth context at sign time |
| company | text | Company or subcontractor name at sign time |
| signature_image_url | text | Storage path in `toolbox-talk-signatures` bucket |
| signed_at | timestamptz | default now() |

**UNIQUE constraint:** `(talk_id, user_id)` — one signature record per user per talk.

---

### 9.11 WatermelonDB Models

No WatermelonDB model changes are required for the Toolbox Talk feature. The existing models match the schema including the new `'deleted'` status enum value — WatermelonDB stores status as a plain string field with no enum constraint at the model layer.

---

### 9.12 Auto-Archive

A `pg_cron` job runs daily at 18:00 (site local time, configured as UTC equivalent) and sets `status = 'archived'` on any `toolbox_talks` records that are still `'active'` and were created before today. This ensures talks do not remain active indefinitely if the appointed person forgets to generate sign-off.

The `pg_cron` extension must be enabled in **Database → Extensions** in the Supabase Dashboard before this job can be created.

---

### 9.13 Delete and Duplicate Handling

#### Delete Active Talk

- `appointed_person` and `crane_supervisor` can delete the active talk on their site via the **Delete** button on the home screen.
- Sets `toolbox_talks.status = 'deleted'` — never a hard delete.
- The library entry referenced by `library_id` is **not** affected.
- A confirmation prompt is shown before deletion (native: `Alert.alert`; web: `window.confirm`).
- If the Supabase UPDATE returns zero rows, an error alert is shown explaining the likely RLS block.

#### Delete Library Talk

- `appointed_person` and `crane_supervisor` can delete a library entry from the Library screen.
- Sets `toolbox_talk_library.is_archived = true` — never a hard delete.
- Existing `toolbox_talks` records that reference the library entry remain fully functional and unaffected.

#### Delete from Archive

- `appointed_person` and `crane_supervisor` can delete any talk from the Archive screen.
- Sets `toolbox_talks.status = 'deleted'` — never a hard delete.
- The talk disappears from the archive list immediately on success.
- Confirmation prompt before deletion (platform-aware: `window.confirm` on web, `Alert.alert` on native).
- Useful for removing accidental duplicates or test entries from the historical record.

#### Duplicate Prevention

- On upload, before inserting a new library record, the system queries `toolbox_talk_library` for any non-archived entry with the same title (case-insensitive via `.ilike`) in the same company.
- **Duplicate found:** the user is prompted — "A toolbox talk titled 'X' already exists in the library. Use the existing one?"
  - **Yes:** the just-uploaded file is deleted from Storage via `supabase.storage.remove([filePath])` to avoid orphans. The new site talk is linked to the existing library record using its `pdf_url`, `content_type`, and `content_text`.
  - **No / Cancel:** the just-uploaded file is deleted from Storage and the upload is fully aborted.
- **No duplicate:** the upload proceeds normally.

---

### 9.14 Required Supabase Setup

The following must be configured in the Supabase Dashboard **before** the Toolbox Talk feature will work. None of these are applied automatically.

#### Storage Buckets
Create two **private** buckets:

| Bucket | Size limit | Allowed MIME types |
|---|---|---|
| `toolbox-talk-pdfs` | 50 MB | `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| `toolbox-talk-signatures` | 5 MB | `image/png`, `image/jpeg` |

#### Storage RLS Policies
For both buckets, add policies allowing:
- **INSERT:** `authenticated` role
- **UPDATE:** `authenticated` role
- **SELECT:** `authenticated` role (or public if signed URLs are sufficient)

#### Database Tables
Run `supabase/toolbox_talk_schema.sql` to create all four tables with their constraints and indexes.

#### Table RLS Policies
RLS policies are applied as part of the schema SQL. Key rules:
- `toolbox_talk_library`: authenticated SELECT and INSERT; UPDATE/DELETE restricted to the `created_by` user or roles with site management permissions.
- `toolbox_talks`: SELECT for all authenticated users on the same site; INSERT/UPDATE for `appointed_person` and `crane_supervisor` on the site; INSERT for reads and signatures by any authenticated user on the site.
- `toolbox_talk_reads`: authenticated INSERT (own user only); SELECT for managers on the site.
- `toolbox_talk_signatures`: authenticated INSERT (own user only, enforced by unique constraint); SELECT for managers on the site.

#### Edge Function Deployment
Deploy the sign-off generator:
```
supabase functions deploy generate-signoff
```
The function requires `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` environment variables set in the Supabase Dashboard → Edge Functions → Secrets.

#### pg_cron Extension
Enable in **Database → Extensions** to activate the 18:00 auto-archive job.

---

### 9.15 Edge Function Deployment via Dashboard

If the project owner cannot share their Supabase login or CLI access, Edge Functions can be deployed via the web dashboard:

1. Open the project at `https://supabase.com/dashboard/project/{project-ref}/functions`
2. Open the function (e.g. `generate-signoff`) in the dashboard editor
3. Paste the contents of the local file from `supabase/functions/{name}/index.ts`
4. Click **Deploy**

No CLI required. This is the recommended approach when multiple developers work on the project but only one owns the Supabase project.

---

## 10. Daily Briefing

---

### 10.1 Overview

The Daily Briefing feature delivers a morning safety briefing for crane and lifting operations on site. Each day, the `appointed_person` or `crane_supervisor` completes a Set Up form covering the weather forecast, site conditions, lifting schedule, and a 9-question yes/no safety checklist. Submitting the form assembles a full HTML briefing document and makes it available to all site operatives to read and sign.

**Daily lifecycle:**
1. AP or supervisor opens the Set Up form and fills in the day's details.
2. The completed briefing document is embedded inline on the home screen for all operatives.
3. Operatives scroll to the bottom (read tracking) and tap **Sign Off** to draw their signature.
4. AP or supervisor can monitor attendance via the **Who Signed** modal with live Realtime updates.
5. At 18:00 daily, the briefing is automatically archived via `pg_cron` — or the AP can trigger archiving manually via the **Generate Archive PDF** button, which produces a multi-page PDF and marks the briefing as archived.

Each site has **one active briefing per day**. Enforced by a partial unique index on `(site_id, briefing_date) WHERE status = 'active'`. Soft-delete only — no records are ever hard-deleted.

**Persistent settings:** Site Details, First Aider/Muster Point, Any Other Business, and Lifting Schedule are stored in `daily_briefing_settings` (one row per site) and pre-filled each day. Weather Forecast and the 9-question checklist reset each day.

---

### 10.2 Roles & Permissions

| Role | Permissions |
|---|---|
| `appointed_person` | Set Up briefing, edit briefing (within the day), view Who Signed, generate archive PDF, delete active briefing |
| `crane_supervisor` | Set Up briefing, edit briefing (within the day), view Who Signed, generate archive PDF, delete active briefing |
| `crane_operator` | Read active briefing, sign active briefing |
| `slinger_signaller` | Read active briefing, sign active briefing |
| `subcontractor_admin` | Read active briefing, sign active briefing |

---

### 10.3 Screens

| Screen | Path | Description |
|---|---|---|
| Home | `/(appointed-person)/daily-briefing/` | Bar chart, Set Up / Who Signed buttons, Muster Point + First Aider cards, inline briefing document, fixed Sign Off bar |
| Set Up | `/(appointed-person)/daily-briefing/setup` | Multi-section form to create or edit today's briefing |
| Sign | `/(appointed-person)/daily-briefing/sign` | Drawn signature modal — presented as a stack screen with `presentation: 'modal'` |
| Attendance | `/(appointed-person)/daily-briefing/attendance` | Who Signed modal showing Read + Signed per operative, live via Supabase Realtime |

All four routes are registered in `app/(appointed-person)/_layout.tsx`.

---

### 10.4 Home Screen Layout

The home screen is the central view for all roles. It refreshes on focus via `useFocusEffect`.

**Top section — two columns:**
- Left (flex:3): Bar chart card showing Total Operatives vs. Operatives Signed, grouped by company (see Section 10.8).
- Right (flex:2): Action column with **Set Up** button (AP/supervisor only) and **Who Signed** button (AP/supervisor only).

**Info row — two cards side by side:**
- **Muster Point** card (blue left border): displays `daily_briefing_settings.muster_point` for the site.
- **First Aider** card (amber left border): displays `daily_briefing_settings.first_aider_name` for the site.

**Document area:**
- If no active briefing exists: prompt to set up today's briefing (AP/supervisor) or message that no briefing has been set up yet (other roles).
- If an active briefing exists: the full `content_html` is rendered inline using the same HTML viewer pattern as Toolbox Talk DOCX content — `dangerouslySetInnerHTML` on web, `WebView` with a full HTML shell on native.
- The outer `ScrollView` handles all scrolling — the briefing div has no internal scroll.

**Fixed bottom bar:**
- If not yet read: "Scroll to the bottom to unlock sign-off" message.
- If read but not signed: **Sign Off** button → navigates to `/(appointed-person)/daily-briefing/sign?briefing_id={id}`.
- If already signed: **Signed ✓** badge (green, non-interactive).
- Delete button (AP/supervisor only, soft-delete with confirmation).

---

### 10.5 Set Up Form

File: `app/(appointed-person)/daily-briefing/setup.tsx`

The Set Up form is a single scrollable screen with six sections. On load, if today's active briefing already exists, the form pre-fills from that briefing (edit mode). Otherwise, persistent fields are pre-filled from `daily_briefing_settings` and weather/checklist fields start blank.

**Edit mode** is detected by checking for a `briefing_id` URL param OR querying for today's active briefing on load. An edit mode banner is shown at the top of the form.

After successful submission the screen navigates to `router.replace('/(appointed-person)/daily-briefing/')`.

#### Section 1 — Weather Forecast *(resets daily)*
| Field | Type |
|---|---|
| Wind Speed | Text input (e.g. "12 km/h") |
| Gust Speed | Text input (e.g. "18 km/h") |
| Weather Condition | Text input (e.g. "Partly cloudy, 14°C") |

#### Section 2 — Site Details *(persistent)*
| Field | Type |
|---|---|
| Changes on Site | Multi-line text (layout changes, new restrictions, new starters, etc.) |
| Lifting Schedule | Multi-line text (details of planned lifts for the day) |

#### Section 3 — Any Other Business *(persistent)*
| Field | Type |
|---|---|
| Any Other Business | Multi-line text |

#### Section 4 — First Aider / Muster Point *(persistent)*
| Field | Type |
|---|---|
| First Aider Name | Text input |
| Site Location | Text input (location of first aider on site) |
| Muster Point Location | Text input |

#### Section 5 — Have You Covered the Following? *(resets daily)*
Nine yes/no toggle questions. Each answer is stored as a boolean on the `daily_briefings` record. Toggle buttons render green **YES** / red **NO**.

| # | Question |
|---|---|
| 1 | Is everyone clear on which crane they are responsible for? |
| 2 | Are all activities planned? |
| 3 | Are all expected deliveries scheduled? |
| 4 | Have you communicated any site / environmental changes? |
| 5 | Have you reminded everyone to carry out the daily pre-use accessory checks? |
| 6 | Is everyone clear on 'Safety First', if unsure stop the lifting operation and re-assess? |
| 7 | Is tower crane secured each floor for unauthorised personnel to access the crane? |
| 8 | Do all Slinger/Crane Supervisor have handheld Whistles and checked they are working? |
| 9 | Has a radio check been completed for all lifting operatives? |

All nine questions must be answered before the form can be submitted.

#### Section 6 — AP and Supervisors *(filled each day)*
| Field | Type |
|---|---|
| Appointed Person Name | Text input — pre-filled from profile |
| Lifting Supervisor Name | Text input |
| Your Name | Text input — pre-filled from profile (the person submitting) |
| Signature | Drawn signature canvas (embedded inline in the form) |

**Embedded signature canvas behaviour:**
- On web: custom HTML5 canvas component (`WebSignatureCanvas`) embedded inside the ScrollView.
- On native: `react-native-signature-canvas` (`NativeSignatureCanvas`) with hidden footer CSS, embedded inside a fixed-height container inside the ScrollView. A `submittingViaSignatureRef` ref prevents the `onOK` callback from triggering submission prematurely — `onOK` only calls `doSubmit(sig)` when the submit button has set `submittingViaSignatureRef.current = true`.

**Submit flow (`doSubmit`):**
1. Validate all required fields (returns array of error strings).
2. Upload signature PNG to `daily-briefing-signatures` bucket at `setup/{site_id}/{today_date}_submitter.png` (upsert:true).
3. Call `buildBriefingHtml(data)` from `lib/daily-briefing-template.ts` to assemble `content_html`.
4. INSERT or UPDATE `daily_briefings` record.
5. UPSERT `daily_briefing_settings` with the persistent fields (`onConflict: 'site_id'`).
6. Navigate to home screen.

---

### 10.6 Document Rendering

The briefing document is assembled as a single HTML string by `buildBriefingHtml(data: BriefingTemplateData)` in `lib/daily-briefing-template.ts`. This function is the **single source of truth** for all HTML structure and boilerplate text in the briefing document. Never scatter briefing HTML across screen files.

**Template sections:**
1. Risk Statement (fixed boilerplate paragraph)
2. Part 1 — Forecast (dynamic: wind speed, gust speed, weather condition)
3. Part 2 — Site Details (dynamic: first aider, location, muster point)
4. Changes (dynamic: `changes_on_site` free text)
5. Wind Speed Limits by Load Type (fixed boilerplate table — see Section 10.13)
6. Lifting Protocols (fixed boilerplate list — see Section 10.13)
7. Lifting Calculation Example (fixed boilerplate — see Section 10.13)
8. Any Other Business (dynamic free text)
9. Lifting Schedule (dynamic free text)
10. Reporting of Defects and Incidents (fixed boilerplate — see Section 10.13)
11. Have You Covered the Following? (dynamic: 9 yes/no answers rendered as coloured YES ✓ / NO ✗)
12. Appointed Person / Lifting Supervisor table (dynamic: AP name, supervisor name, date)

The assembled HTML is stored in `daily_briefings.content_html` and never regenerated at read time.

**Platform rendering:**
- **Web:** injected via `dangerouslySetInnerHTML={{ __html: briefing.content_html }}` inside a `<div>`. `DAILY_BRIEFING_CONTENT_STYLES` from `lib/daily-briefing-template.ts` is injected into the document `<head>` to style the `.daily-briefing-content` class.
- **Native:** wrapped in a full HTML shell with `DAILY_BRIEFING_NATIVE_STYLES` inlined in the `<style>` tag, rendered inside a `WebView` with `scrollEnabled={false}` (outer `ScrollView` handles scrolling).

**Scroll tracking:** same pattern as Toolbox Talk DOCX — the outer `ScrollView`'s `onScroll` handler detects `layoutMeasurement.height + contentOffset.y >= contentSize.height - 50` and records the read. `myReadRef` is used to avoid React closure stale-state bugs. If the briefing content fits entirely on screen without scrolling, the read is marked immediately on render.

---

### 10.7 Read Tracking + Signing

**Read tracking:**
- Scroll-to-bottom on the outer `ScrollView` triggers an INSERT into `daily_briefing_reads(briefing_id, user_id)`.
- `setMyRead(true)` fires immediately on detection — the Sign Off button appears without waiting for the DB round-trip.
- Unique constraint `(briefing_id, user_id)` — duplicate inserts return `23505` which is silently ignored.
- `myReadRef` is used in the `onScroll` handler to avoid stale closure bugs.

**Signing:**
- Sign screen (`/daily-briefing/sign?briefing_id={id}`) receives `briefing_id` as a URL param.
- Same drawn signature canvas as Toolbox Talk sign screen — HTML5 canvas on web, `react-native-signature-canvas` on native.
- Pen colour `#000000`, white background baked in via `destination-over` on web.
- Signature uploaded to `daily-briefing-signatures` bucket at `{briefing_id}/{user_id}.png` (upsert:true).
- `daily_briefing_signatures` row inserted with `full_name`, `role`, and `company`:
  - `company` for `subcontractor_admin`: resolved from their `subcontractor_id` in `profiles` → `subcontractors.name`.
  - `company` for all other roles: resolved from `profiles.company_id` → `companies.name`.
- Unique constraint `(briefing_id, user_id)` — if `23505` is returned, "Already Signed" is shown and the user is navigated back.
- On success: `Alert.alert('Thank You', 'Thank you for signing the daily briefing.')` then `router.replace('/(appointed-person)/daily-briefing/')`.
- `router.replace` is used so the user cannot navigate back to the sign screen.

---

### 10.8 Bar Chart

The home screen displays a grouped bar chart showing how many operatives from each company have signed the current day's briefing.

**Data assembly:**
- Fetch all profiles on the site (operative roles only: crane_operator, crane_supervisor, slinger_signaller, subcontractor_admin, appointed_person).
- For `subcontractor_admin`: resolve company name from `subcontractors` via `profiles.subcontractor_id`.
- For all other roles: resolve company name from `companies` via `profiles.company_id`.
- Group operatives by company name → `total` count per company.
- Cross-reference with `daily_briefing_signatures` for the active briefing → `signed` count per company.

**Rendering:**
- Custom View-based bar chart — no external charting library.
- Two bars per group (company): red bar = Total, blue bar = Signed.
- Bar widths are percentage strings computed as `(value / maxValue) * 100 + '%'` — works on both web and native.
- Legend: red square = Total Operatives, blue square = Operatives Signed.
- Chart updates live when `daily_briefing_signatures` receives a Realtime insert.

---

### 10.9 Attendance (Who Signed)

The **Who Signed** button (AP/supervisor only) opens `/(appointed-person)/daily-briefing/attendance?briefing_id={id}` as a modal screen.

**Display:** Two sections — **Read** and **Signed** — each listing operative names with timestamps. Counts shown in section headers: `Read (n)` / `Signed (n)`.

**Real-time updates:** Supabase Realtime subscriptions on both `daily_briefing_reads` and `daily_briefing_signatures` tables, filtered to `briefing_id=eq.{briefing_id}`. All `.on()` calls are chained before the single `.subscribe()` call in one fluent chain — splitting into multiple `.subscribe()` calls causes missed events.

**Generate Archive PDF:** A button at the bottom of the attendance screen calls `callDailyBriefingGeneratePdf(briefingId)` from `lib/api.ts`. On success, navigates to `router.replace('/(appointed-person)/daily-briefing/')`.

**Visibility:** Only `appointed_person` and `crane_supervisor` see the Who Signed button on the home screen. Other roles do not have access to the attendance screen.

---

### 10.10 Auto-Archive and PDF Generation

**Auto-archive:** A `pg_cron` job runs daily at 18:00 (17:00 UTC) and calls the `daily-briefing-generate-pdf` Edge Function for all briefings with `status = 'active'` and `briefing_date = today`. The pg_cron schedule is included as a SQL comment in `supabase/daily_briefing_schema.sql`.

**Manual archive:** AP or supervisor taps **Generate Archive PDF** on the attendance screen (or home screen). This calls `callDailyBriefingGeneratePdf(briefingId)` in `lib/api.ts`, which invokes the `daily-briefing-generate-pdf` Edge Function via `supabase.functions.invoke`.

**Edge Function** (`supabase/functions/daily-briefing-generate-pdf/index.ts`):

The function uses `pdf-lib` (Deno-compatible) and runs the following for each briefing:

1. Fetch `daily_briefings` record including the `sites` join for site name.
2. Fetch all `daily_briefing_signatures` for the briefing, ordered by `signed_at`.
3. Build a multi-page PDF:
   - **Page 1+ — Attendees Table:** navy header bar, date and site name, then one row per signatory with columns: Role / Name / Company / Signature image (embedded PNG/JPG, 100×35px) / Signed At timestamp (`DD MMM YYYY, HH:MM` in en-GB locale). Column x positions: margin=50, +130, +240, +350. Rows are 60pt tall to accommodate signature images.
   - **Following pages — Briefing Content:** AP name, supervisor name, forecast, site details, any other business, lifting schedule, checklist answers (green YES / red NO text). Logo header on each page.
   - **Final page — AP Sign-Off:** date, AP name, role, embedded submitter signature image (200×60px).
4. Storage: `await adminClient.storage.from('daily-briefing-archive').remove([pdfPath])` then `.upload(pdfPath, pdfBytes, { upsert: false })`. Path: `{site_id}/{briefing_id}.pdf`.
5. Update `daily_briefings`: set `archive_pdf_url = pdfPath`, `status = 'archived'`, `archived_at = new Date().toISOString()`.

**Cron mode vs. single mode:** If called without a `briefing_id` body param, the function queries all active briefings for today and processes each one. If called with `briefing_id`, it processes only that briefing.

---

### 10.11 Database Schema

Run `supabase/daily_briefing_schema.sql` in the Supabase SQL Editor to create all tables and indexes.

#### `daily_briefing_settings`
One row per site. Created on first Set Up submission via UPSERT (`onConflict: 'site_id'`).

| column | type | notes |
|---|---|---|
| site_id | uuid PK → sites | One row per site |
| changes_on_site | text | Persistent — pre-filled each day |
| lifting_schedule | text | Persistent — pre-filled each day |
| any_other_business | text | Persistent — pre-filled each day |
| first_aider_name | text | Persistent — pre-filled each day |
| site_location | text | Persistent — pre-filled each day |
| muster_point | text | Persistent — pre-filled each day |
| updated_at | timestamptz | default now() |
| updated_by | uuid FK → profiles | nullable |

#### `daily_briefings`
One active briefing per site per day, enforced by partial unique index.

| column | type | notes |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| site_id | uuid FK → sites | |
| briefing_date | date | default current_date |
| wind_speed | text | Daily — Weather Forecast |
| gust_speed | text | Daily — Weather Forecast |
| weather_condition | text | Daily — Weather Forecast |
| changes_on_site | text | Snapshot of persistent field at time of submission |
| lifting_schedule | text | Snapshot of persistent field at time of submission |
| any_other_business | text | Snapshot of persistent field at time of submission |
| first_aider_name | text | Snapshot of persistent field at time of submission |
| site_location | text | Snapshot of persistent field at time of submission |
| muster_point | text | Snapshot of persistent field at time of submission |
| q1_crane_clear | boolean | Daily checklist answers |
| q2_activities_planned | boolean | |
| q3_deliveries_scheduled | boolean | |
| q4_changes_communicated | boolean | |
| q5_accessory_checks | boolean | |
| q6_safety_first | boolean | |
| q7_crane_secured | boolean | |
| q8_whistles_working | boolean | |
| q9_radio_check | boolean | |
| ap_name | text | not null |
| supervisor_name | text | not null |
| submitter_name | text | not null |
| submitter_signature_url | text | Storage path in `daily-briefing-signatures` bucket |
| content_html | text | Full assembled HTML — not null |
| archive_pdf_url | text | Storage path in `daily-briefing-archive` bucket — set on archive |
| status | text | CHECK IN ('active', 'archived', 'deleted') default 'active' |
| created_by | uuid FK → profiles | not null |
| created_at | timestamptz | default now() |
| archived_at | timestamptz | Set when status changes to 'archived' |

**Partial unique index:** `daily_briefings_site_date_active ON daily_briefings(site_id, briefing_date) WHERE (status = 'active')` — prevents two active briefings for the same site on the same day.

> **Status values:** `active` = today's live briefing; `archived` = PDF generated, read-only; `deleted` = soft-deleted by AP or supervisor.

#### `daily_briefing_reads`
| column | type | notes |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| briefing_id | uuid FK → daily_briefings | |
| user_id | uuid FK → profiles | |
| read_at | timestamptz | default now() |

**UNIQUE constraint:** `(briefing_id, user_id)` — one read record per user per briefing.

#### `daily_briefing_signatures`
| column | type | notes |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| briefing_id | uuid FK → daily_briefings | |
| user_id | uuid FK → profiles | |
| full_name | text | Denormalised from profiles at sign time |
| role | text | Denormalised from auth context at sign time |
| company | text | Subcontractor company name for subcontractor_admin; site company for all others |
| signature_image_url | text | Storage path in `daily-briefing-signatures` bucket |
| signed_at | timestamptz | default now() |

**UNIQUE constraint:** `(briefing_id, user_id)` — one signature record per user per briefing.

---

### 10.12 Required Supabase Setup

The following must be configured in the Supabase Dashboard **before** the Daily Briefing feature will work. None of these are applied automatically.

#### Database Tables
Run `supabase/daily_briefing_schema.sql` in the SQL Editor. This creates all four tables, RLS policies, the partial unique index, and supporting indexes.

#### Storage Buckets
Create two **private** buckets:

| Bucket | Size limit | Allowed MIME types |
|---|---|---|
| `daily-briefing-signatures` | 5 MB | `image/png` |
| `daily-briefing-archive` | 50 MB | `application/pdf` |

#### Storage RLS Policies
For both buckets, add policies allowing:
- **INSERT:** `authenticated` role
- **SELECT:** `authenticated` role (signed URLs used at read time)

#### Edge Function Deployment
Deploy the archive PDF generator:
```
supabase functions deploy daily-briefing-generate-pdf
```
Or paste `supabase/functions/daily-briefing-generate-pdf/index.ts` into the Supabase Dashboard → Functions editor and click **Deploy**.

The function requires `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` environment variables set in Dashboard → Edge Functions → Secrets.

#### pg_cron Extension
Enable in **Database → Extensions**. Then register the schedule (SQL commented at the bottom of `supabase/daily_briefing_schema.sql`):
```sql
select cron.schedule(
  'daily-briefing-auto-archive',
  '0 17 * * *',
  $$ select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/daily-briefing-generate-pdf',
    headers := '{"Authorization": "Bearer <service_role_key>", "Content-Type": "application/json"}'::jsonb
  ) as request_id $$
);
```

---

### 10.13 Boilerplate Text Content

All static boilerplate text is defined in `lib/daily-briefing-template.ts` as private constants. Edit in one place — never duplicate in screen files or the Edge Function.

#### Wind Speed Limits by Load Type (`WIND_SPEED_TABLE`)
| Load Type | Max Wind Speed |
|---|---|
| Concrete Skip | 55 km/h |
| Re-bar lorry | 55 km/h |
| Column Shutters | 35.4 km/h |
| Open Stillage | 31 mph / 51 km/h |
| Plywood | 27 mph |
| Boat Skip | 55 km/h |
| Toolbox | 55 km/h |
| MEWP | 29 mph |
| Formwork Primary Beams | 55 km/h |
| Water Bouser | 51.4 km/h |

#### Lifting Protocols (`LIFTING_PROTOCOLS_LIST`)
- All lifting as per Subcontractor Lift Plan
- **DO NOT LIFT** loads not included in today's schedule without authorisation
- DAILY SMIE AND ZONING CHECKS must be completed before any lifting commences
- **NO MOBILE PHONES** while operating or signalling
- CHECKSHEETS MUST BE COMPLETED CORRECTLY and returned to the Appointed Person
- RESPECT THE WELFARE FACILITIES — keep areas clean and tidy
- Confirm Whistles are working before commencing operations
- CONSTANT CLEAR COMMUNICATION during all blind lifts — use radio at all times
- ENSURE DAILY ZONING AND ANTI-COLLISION CHECKS are completed on all cranes before operation

#### Lifting Calculation Example (`LIFTING_CALCULATION_TEXT`)
Example illustrating how to calculate combined SWL for 2- and 3-point lifts using mode factors. Uses a 4te SWL webbing sling choked (−20%) as the worked example: 3.2te × 1.4 mode factor = **4.48te SWL** (2-point @<90°); 3.2te × 2.1 mode factor = **6.72te SWL** (3- or 4-point @<90°).

#### Defects and Incidents Procedure (`DEFECTS_AND_INCIDENTS_TEXT`)
Six mandatory reporting categories:
- (a) Any defects found during daily and weekly checks.
- (b) Defects found at any other time.
- (c) Incidents, accidents or near misses however slight.
- (d) Shock loads, however they occur.
- (e) Dangerous occurrence and reportable accidents.
- (f) Report any radio communication issues to the principal contractor.

---

## 11. MEWP Inventory Module

The MEWP module is built **inside the Lifting App** as native screens using Expo Router.
It shares the same Supabase project, auth system, and existing tables (sites, subcontractors, profiles).
Accessible at `mewps.liftingmanagement.com` via the web version of the app.

MEWP = Mobile Elevated Work Platform (Pecolift, Scissor Lift, Boom Lift, Cherry Picker etc.)

---

### 11.1 Architecture

The MEWP module is built **inside the Lifting App** as native screens using Expo Router.
It is NOT a separate Next.js project.

- Runs natively on iOS and Android
- Runs on web via Expo's web support
- `mewps.liftingmanagement.com` points to the MEWP screens in the deployed web version
- PDF generation runs via a **Supabase Edge Function** (not a Next.js API route)
- All MEWP screens live under `app/(mewp)/` in the Expo project
- Public inspection pages (`/check/[mewpId]`) require no login — accessible to anyone with the URL or NFC/QR scan
- All admin/dashboard screens use the same email OTP auth as the rest of the app

**Additional dependencies:**
```
npm install pdf-lib signature_pad qrcode mammoth
```

> **Auth note:** ALL authentication uses email OTP only (6-digit PIN, 10 minutes).
> Worker inspection and spot check pages remain fully public — no login required.

---

### 11.2 Roles & Permissions

```
main_admin
└── site_admin (per site)
    ├── manages site MEWPs
    └── subcontractor_admin (per subcontractor on site)
        └── manages their own MEWPs on site
```

| Role | Scope | Responsibilities |
|---|---|---|
| `main_admin` | Global | Adds sites, adds site_admins |
| `site_admin` (`appointed_person`) | Single site | Adds/edits/archives MEWPs, adds subcontractor_admins, views all site MEWPs, does spot checks from web |
| `subcontractor_admin` | Single site | Adds/removes their own MEWPs, does daily checks and spot checks on their MEWPs |
| Public (no login) | Single MEWP | Views check history, thorough examination, does daily check and spot check via QR/NFC scan |

> In the MEWP module, `appointed_person` acts as `site_admin`. The shared `profiles` table role field determines access.

---

### 11.3 MEWP Lifecycle & Fields

```
Subcontractor delivers MEWP
        ↓
subcontractor_admin adds MEWP to site
        ↓
QR code / NFC tag attached to MEWP
        ↓
Daily checks done by operators (public, via QR/NFC scan)
        ↓
Spot checks done by anyone (public QR/NFC or web by site_admin/subcontractor_admin)
        ↓
Subcontractor collects MEWP → subcontractor_admin removes it from site
```

| Field | Required |
|---|---|
| MEWP ID / reference | Yes |
| Type (scissor, boom, cherry picker etc.) | Yes |
| Subcontractor (owner) | Yes |
| Thorough examination document (photo or PDF) | Yes |
| Thorough examination expiry date | Yes |
| QR code / NFC reference | Auto-generated |

- Added by `subcontractor_admin` for their own MEWPs, or by `site_admin` for site-owned MEWPs.
- Removed from site by `subcontractor_admin` when collected — not permanently deleted, marked as off-site.
- `site_admin` can archive any MEWP.

---

### 11.4 Thorough Examination & Status Logic

- Uploaded as a **photo or PDF document** by `site_admin` or `subcontractor_admin`.
- Has an **expiry date** set manually at time of upload.
- Visible publicly on the MEWP public page (anyone who scans the QR/NFC can see it).

Status is calculated from `thorough_exam_expiry` — never stored, always derived:

- **VALID** — expiry date exists and is more than 30 days from today (green)
- **EXP SOON** — expiry date exists and is within 30 days from today (amber)
- **NO CERT** — no expiry date, or expiry date is in the past (red)

---

### 11.5 Screens

#### MEWP Inventory Screen

Design: Glide-style — clean, minimal, flat. White surfaces, 0.5px borders, generous whitespace.

**Summary cards at top (4 cards):**
- Total MEWPs (neutral)
- Valid (green background)
- Exp Soon (amber background)
- No Cert (red background)

**Filter pills:** All / Valid / Exp Soon / No Cert + search box

**Table columns:** # / Type / Serial / Subcontractor / Expiry / Location / Status / Actions

**Status badges (pill shaped):** Valid → green, Exp Soon → amber, No Cert → red

**Action buttons per row (inline):**
- Upload exam icon → opens sheet with file/photo picker + date picker for expiry
- Edit icon → opens edit form

**Pagination** at bottom for large lists.

#### Add / Edit MEWP Form

Fields:
- MEWP Type (text — e.g. Pecolift, Scissor Lift)
- Serial Number (text)
- Subcontractor (dropdown from `subcontractors` filtered by site_id — "None / Site-owned" as first option)
- Thorough Exam (file/photo picker — optional at creation)
- Expiry Date (date picker — optional at creation)
- Current Location (text)
- Sticker Photo (photo picker — optional)

#### MEWP Detail Screen

Shows all MEWP fields plus:
- Location history timeline (past locations with date and who changed it)
- Thorough exam document/photo preview
- Sticker photo preview

---

### 11.6 Daily Check

- Done by **anyone** — no login required.
- Triggered by scanning the QR code or NFC tag on the MEWP.
- One check per MEWP per day.
- At the end of each week, a **PDF is auto-generated** showing all daily checks for that week and saved to the MEWP archive.

---

### 11.7 Spot Check

- Done by **anyone** — no login required via QR/NFC scan, or from web by `site_admin` and `subcontractor_admin`.
- Can be done at any time (not limited to once per day).
- Generates a **condition report**.

#### Spot Check Form

| Section | Details |
|---|---|
| Checklist | Fixed list of items, each marked **Pass / Fail / N/A** |
| Notes | Free text — describe any issues found |
| Photos | One or more photos of condition |

#### Fixed Checklist Items
- Tyres / Tracks
- Controls (joysticks, buttons, display)
- Safety features (harness points, guardrails, emergency stop)
- Boom / Arm
- Basket / Platform
- Hydraulics (visible leaks, damage)
- Structure (frame, welds, visible damage)
- Battery / Fuel level
- Lights and alarms
- Ground conditions suitability

#### Spot Check Outcome
- All Pass → **Satisfactory**
- Any Fail → **Issues Found** — notes and photos required for each failure
- A condition report PDF is generated after submission

---

### 11.8 Public MEWP Page (QR/NFC Scan — no login required)

When anyone scans the QR code or NFC tag on a MEWP, they see:

- MEWP ID, type, subcontractor
- Thorough examination document/photo and expiry date
- Daily checks history (list of all checks with date and result)
- **Do Daily Check** button
- **Do Spot Check** button

---

### 11.9 Screen Structure (inside lifting-app)

```
app/
└── (mewp)/
    ├── _layout.tsx
    ├── dashboard.tsx              # site_admin dashboard
    ├── check/
    │   └── [mewpId].tsx          # Public daily inspection form (no login)
    ├── spot/
    │   └── [mewpId].tsx          # Public spot check form (no login)
    ├── site/
    │   └── [siteId].tsx          # Site dashboard (authenticated)
    ├── admin/
    │   └── index.tsx             # main_admin dashboard (authenticated)
    └── machines/
        └── [mewpId].tsx          # MEWP detail screen

supabase/
└── functions/
    └── mewp-generate-pdf/
        └── index.ts              # Edge Function for PDF generation

public/
└── mewp-template.pdf             # REQUIRED — copy from old MEWP project
```

---

### 11.10 Supabase Tables (MEWP module)

These tables are **prefixed with `mewp_`** to avoid collision with Lifting App tables.

#### `mewp_sites`
| column | type | notes |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| name | text | Site name |
| location | text | Address |
| postcode | text | |
| manager_name | text | |
| qr_code_url | text | Full URL of this site's QR code PNG |
| is_archived | boolean | default false |
| created_at | timestamptz | default now() |

#### `mewp_machines`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| site_id | uuid FK → mewp_sites | |
| subcontractor_id | uuid FK → mewp_subcontractors | nullable |
| machine_ref | text | e.g. "MEWP-01" |
| model | text | e.g. "Genie GS-2632" |
| serial_number | text | |
| nfc_url | text | Full URL: https://mewps.liftingmanagement.com/check/[id] |
| active | boolean | default true |
| is_archived | boolean | default false |
| thorough_exam_url | text | Public URL of uploaded certificate |
| thorough_exam_expiry | date | |
| thorough_exam_filename | text | |
| thorough_exam_uploaded_at | timestamptz | |
| created_at | timestamptz | |

#### `mewp_subcontractors`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| site_id | uuid FK → mewp_sites | |
| name | text | Company name |
| is_archived | boolean | default false |
| created_at | timestamptz | |

#### `mewp_weekly_sheets`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| mewp_id | uuid FK → mewp_machines | |
| site_id | uuid FK → mewp_sites | |
| machine_ref | text | Denormalised |
| week_commencing | date | Monday of the week |
| week_ending | date | Sunday of the week |
| pdf_url | text | Public URL of generated PDF |
| pdf_generated_at | timestamptz | |

**UNIQUE constraint:** `(mewp_id, week_commencing)`

#### `mewp_daily_entries`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| sheet_id | uuid FK → mewp_weekly_sheets | |
| mewp_id | uuid FK → mewp_machines | |
| site_id | uuid FK → mewp_sites | |
| inspection_date | date | |
| day_of_week | text | 'monday', 'tuesday', etc. (lowercase) |
| operator_name | text | |
| pal_card_number | text | nullable |
| initialled | boolean | always true on submit |
| daily_status | text | CHECK IN ('pending','ok','fault') |
| submitted_at | timestamptz | |
| mewp_owner | text | nullable — hire company name |
| photo_url | text | Public URL in mewp-photos bucket |
| signature_url | text | Public URL in signatures bucket |

**UNIQUE constraint:** `(mewp_id, inspection_date)` — one inspection per machine per day.

#### `mewp_visual_checks`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| entry_id | uuid FK → mewp_daily_entries | |
| sheet_id | uuid FK → mewp_weekly_sheets | |
| mewp_id | uuid FK → mewp_machines | |
| inspection_date | date | |
| item_number | int | 1–28 |
| category | text | section ID |
| result | text | CHECK IN ('pass','fail','na') |

#### `mewp_function_checks`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| entry_id | uuid FK → mewp_daily_entries | |
| sheet_id | uuid FK → mewp_weekly_sheets | |
| mewp_id | uuid FK → mewp_machines | |
| inspection_date | date | |
| item_number | int | 29–43 |
| ground_result | text | CHECK IN ('pass','fail','na') |
| platform_result | text | CHECK IN ('pass','fail','na') |

#### `mewp_defects`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| entry_id | uuid FK → mewp_daily_entries | |
| mewp_id | uuid FK → mewp_machines | |
| site_id | uuid FK → mewp_sites | |
| inspection_date | date | |
| item_number | int | 1–43 |
| check_type | text | 'visual' or 'function' |
| defect_details | text | |
| status | text | CHECK IN ('open','reported','repaired','closed') |
| engineer_name | text | nullable |
| date_repaired | date | nullable |

#### `mewp_check_items` (seed once — 43 rows)
| column | type | notes |
|---|---|---|
| item_number | int PK | 1–43 |
| check_type | text | 'visual' or 'function' |
| category | text | section label |
| description | text | Full question text |
| has_gp | boolean | true for items 29–43 (has Ground + Platform) |

#### `mewp_spot_checks`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| mewp_id | uuid FK → mewp_machines | |
| site_id | uuid FK → mewp_sites | |
| submitted_at | timestamptz | |
| notes | text | Free text condition notes |
| outcome | text | CHECK IN ('satisfactory','issues_found') |

#### `mewp_spot_check_items`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| spot_check_id | uuid FK → mewp_spot_checks | |
| item_label | text | Checklist item name |
| result | text | CHECK IN ('pass','fail','na') |

#### `mewp_spot_check_photos`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| spot_check_id | uuid FK → mewp_spot_checks | |
| photo_url | text | Public URL in mewp-spot-photos bucket |

---

### 11.11 Supabase Views & RPCs

**Views:**

`mewp_today_status` — joins mewp_machines + mewp_sites + today's entry + defect count.
Used on site dashboard to show each MEWP's status for today.

`mewp_weekly_operator_log` — one row per day per sheet: day_of_week, operator_name,
pal_card_number, daily_status. Used in PDF generation.

`mewp_weekly_summary` — all 43 items pivoted across 7 day columns.
Columns: item_number, mon_result, tue_result, ... sun_result (visual),
mon_ground_result, mon_platform_result, ... sun_platform_result (function).

**RPC Functions:**

`mewp_get_week_commencing(p_date date) → date`
Returns the Monday of the week containing the given date:
```sql
RETURN date_trunc('week', p_date::timestamp)::date;
```

`mewp_get_or_create_weekly_sheet(p_mewp_id uuid, p_site_id uuid, p_machine_ref text, p_date date) → uuid`
Finds or creates the weekly sheet for this MEWP and week. Returns sheet_id.
Uses INSERT ... ON CONFLICT DO NOTHING then SELECT.

---

### 11.12 Supabase Storage Buckets

All buckets are **public** (public read).

| Bucket | Path pattern | Writer | Notes |
|---|---|---|---|
| `mewp-photos` | `{siteId}/{mewpId}/{date}.jpg` | anon | One per MEWP per day |
| `mewp-signatures` | `{siteId}/{mewpId}/{date}.png` | anon | One per MEWP per day |
| `mewp-weekly-reports` | `{siteId}/{mewpId}/{week_commencing}.pdf` | service role | Always remove() then upload() — never upsert |
| `mewp-thorough-exams` | `{mewpId}/{timestamp}.{ext}` | anon | PDF, JPG, or PNG |
| `mewp-spot-photos` | `{mewpId}/{spotCheckId}/{n}.jpg` | anon | Multiple per spot check |

---

### 11.13 Authentication (MEWP module)

**Public pages (no login):**
- `/check/[mewpId]` — worker inspection form, fully public
- `/check/[mewpId]/spot` — spot check form, fully public

**Authenticated pages:**
- `/site/[siteId]` — site dashboard (site_admin or subcontractor_admin for that site)
- `/admin` — main_admin only

**Auth flow:** Same email OTP as the main Lifting App — email → 6-digit PIN → signed in.
Users are managed via the shared `profiles` table. No separate user table for MEWP.

---

### 11.14 All 43 Inspection Items

#### Visual Checks (items 1–28, single PASS/FAIL/N/A)

**Documentation (1–3):**
1. Statutory examination / periodic inspection in date
2. Manufacturer's operator manual with the machine
3. Rescue plan in place and name of nominated ground rescue person identified

**Wheels/Tyres (4–6):**
4. No missing, loose or damaged nuts and retainers
5. Tyre pressure (pneumatic, foam filled or solid)
6. Condition (no cuts, splits, exposed braiding, damaged rims)

**Engine/Power Source (7–9):**
7. Fluid levels (engine oil, coolant, fuel)
8. No fluid leakage on ground and around engine
9. Battery (electrolyte, connections, terminals, security and charging plug condition)

**Hydraulics (10–11):**
10. Hydraulic fluid level
11. No leaks (hoses, pipe connections, rams, cylinders)

**Hoses and Cables (12–13):**
12. Security and condition (no cuts, chaffing, bulges)
13. Power track cable trays (free from damage and debris)

**Outriggers/Stabilisers (14–16):**
14. General condition, pins/retainers, footplate
15. Spreader plates (present, condition, secure for travel)
16. Interlocks (functioning, engaged)

**Chassis, Boom & Scissor (17–19):**
17. General condition (no damage, misalignment, corrosion)
18. No cracks in weld
19. Pins, retainers and chains (good condition, secure)

**Platform or Cage (20–25):**
20. Canopies, guards, engine covers (security and condition)
21. Steps for access/egress secure (undamaged, clear of debris)
22. Entrance gate, guard rails and retaining pins
23. Harness / lanyard anchorage points
24. Clear of rubbish, debris and obstructions
25. Secondary Guarding

**Decals and Signage (26–28):**
26. ID/compliance plate, safety, warning and information decals (all present, legible)
27. Controls (identification decals, directional arrows clearly marked)
28. Platform loads (SWL, max. wind speed, max. number of persons clearly marked)

#### Function Checks (items 29–43, PASS/FAIL/N/A for Ground AND Platform controls)
29. Security device (power isolator, keypad, smart card)
30. Function enable works correctly (ignition key, foot switch, hold to run device)
31. Emergency stops and emergency / auxiliary lowering system are fully functional
32. All switches, function controls (move freely, return to neutral, operate as expected)
33. Elevating functions (raise, lower, slew, tele-out, tele-in)
34. Travel functions (forward, reverse, steer, brakes)
35. Elevated drive speed activates when platform is raised (reduced or prevented)
36. Lights, beacons, warning devices
37. Audible alarms (tilt, descent and travel)
38. Interlock, limit switches (e.g. descent, SWL, outreach, rotation)
39. Pothole protection device (fully deploys and retracts)
40. Oscillating axle locks and extending axles operate correctly
41. Accessories, power to platform, extending decks
42. Jacks-legs, stabilisers, outriggers, levelling devices
43. Secondary guarding (function, operation, reset)

---

### 11.15 Daily Inspection Form

File: `app/(mewp)/check/[mewpId].tsx`

**Page states:** `loading | not_found | form | submitting | submit_error | already_done | done`

**Steps:**
- Step 0: Operator details (name required, PAL card optional, MEWP owner optional)
- Step 1: Visual checks — items 1–28, all must be answered before proceeding
- Step 2: Function checks — items 29–43, both Ground and Platform must be answered per item
- Step 3: Review + photo + signature + submit

**Validation rules:**
- All 28 visual items must be answered
- Both G and P must be answered for all 15 function items
- Photo required (rear camera: `<input type="file" accept="image/*" capture="environment">`)
- Signature required (signature_pad library on canvas)
- If already inspected today → show "Already Inspected" screen instead of form

**Submit order (CRITICAL — do not change this order):**

1. Capture signature data URL **before** any setState call (canvas unmounts on re-render):
```js
const sigDataUrl = (sigPadRef.current && !sigPadRef.current.isEmpty())
  ? sigPadRef.current.toDataURL("image/png") : null;
```
2. Validate photo + signature present
3. `setPageStatus("submitting")`
4. Call `mewp_get_or_create_weekly_sheet` RPC → get sheetId
5. Upload photo to `mewp-photos` and signature to `mewp-signatures` **in parallel**
6. INSERT into `mewp_daily_entries` — include photo_url and signature_url in initial INSERT (anon RLS only allows INSERT, not UPDATE)
7. INSERT 28 rows into `mewp_visual_checks`
8. INSERT 15 rows into `mewp_function_checks`
9. If any faults: INSERT rows into `mewp_defects`
10. POST to `/api/trigger-pdf` and await
11. `setPageStatus("done")`

**Error recovery:** if any step fails after entry was inserted, delete the entry:
```js
if (entryId) await supabase.from("mewp_daily_entries").delete().eq("id", entryId);
```

---

### 11.16 PDF Generation

**Library:** `pdf-lib` v1.17.1 — pure JS, works server-side in API routes.

**Two-layer system:**
1. `createTemplate.js` — generates `public/template.pdf` (run once). 2-page A4 landscape PDF with `{{MON_01}}` placeholder text at precise coordinates.
2. `generateReport.js` — loads template, strips placeholders, stamps real data, appends dynamic daily summary pages.

**Coordinate system:** pdf-lib uses bottom-left origin (y=0 is bottom of page).
- Template pages: A4 landscape = 841.92 × 595.32 pt
- Dynamic summary pages: A4 portrait = 595.32 × 841.92 pt

**Key coordinate maps:**
```js
const VIS_Y = [null, 527, 516, 506, 495, 485, 474, 464, 453, 443, 432, 421, ...]; // items 1–28
const FUNC = { 29: { y: 223, page: 0 }, 30: { y: 206, page: 0 }, ..., 43: { y: 562, page: 1 } };
const DAY_X = { Mon: 442, Tue: 492, Wed: 541, Thu: 591, Fri: 640, Sat: 690, Sun: 740 };
const FUNC_G_OFFSET = -7;
const FUNC_P_OFFSET = +17;
```

**Placeholder stripping:** decode each page's content stream, regex-match BT...ET blocks containing `{` or `}`, replace text content with equal-length spaces. Preserves grid lines.

**Dynamic daily summary pages** (appended after 2 template pages):
- Dark header bar: day name + date
- Info row: operator name, PAL card, submission time, status
- Photo + signature side by side
- Fault table if any faults

**PDF trigger:** called immediately after form submission:
```js
await fetch("/api/trigger-pdf", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ mewp_id: mewpId, sheet_id: sheetId }),
});
```

**PDF storage:**
```js
const filePath = `${siteId}/${mewpId}/${weekCommencing}.pdf`;
await supabase.storage.from("mewp-weekly-reports").remove([filePath]); // always remove first
await supabase.storage.from("mewp-weekly-reports").upload(filePath, pdfBuffer, {
  contentType: "application/pdf", upsert: false
});
```

---

### 11.17 Critical Workarounds (do not skip)

**1. Signature captured before state change**
Read `sigPadRef.current` BEFORE calling `setPageStatus("submitting")` — the state change unmounts the canvas and nulls the ref.

**2. Canvas dimensions for SignaturePad**
Set canvas pixel dimensions from layout before initialising:
```js
canvas.width = canvas.offsetWidth || 320;
canvas.height = canvas.offsetHeight || 160;
sigPadRef.current = new SignaturePad(canvas, { ... });
```

**3. SignaturePad dynamic import (SSR)**
```js
useEffect(() => {
  if (step !== 3) return;
  requestAnimationFrame(() => {
    import("signature_pad").then(({ default: SignaturePad }) => {
      sigPadRef.current = new SignaturePad(canvasRef.current);
    });
  });
}, [step]);
```

**4. Photo URL in initial INSERT**
Upload photos/signatures before inserting the entry. Anon RLS allows INSERT not UPDATE.

**5. PDF storage: remove() before upload()**
Always `remove([filePath])` then `upload(..., { upsert: false })` — never use upsert on storage.

**6. UTC dates**
Always use UTC getters when working with date strings:
```js
function dayFromDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  return ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][(d.getUTCDay() + 6) % 7];
}
```
Never use `new Date().toISOString().split('T')[0]` — gives yesterday's date in UK summer (UTC+1).
Always use local date:
```js
function toLocalDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
```

**7. Image embedding order (pdf-lib)**
Embed all images first, then draw. Never pass raw bytes to drawImage.
```js
// JPEG/PNG fallback for photos
try { embedded.photo = await pdfDoc.embedJpg(bytes); }
catch { embedded.photo = await pdfDoc.embedPng(bytes); }
// PNG/JPEG fallback for signatures
try { embedded.sig = await pdfDoc.embedPng(bytes); }
catch { embedded.sig = await pdfDoc.embedJpg(bytes); }
```

**8. day_of_week normalisation**
Always normalise via helper — different queries return different formats:
```js
const DAY_NORM = { monday:'Mon', tuesday:'Tue', wednesday:'Wed', thursday:'Thu', friday:'Fri', saturday:'Sat', sunday:'Sun', mon:'Mon', tue:'Tue', wed:'Wed', thu:'Thu', fri:'Fri', sat:'Sat', sun:'Sun' };
function normDay(val) { return val ? DAY_NORM[String(val).toLowerCase()] ?? null : null; }
```

---

### 11.18 RLS Policy Summary (MEWP tables)

- `mewp_sites`: public SELECT, service role INSERT/UPDATE
- `mewp_machines`: public SELECT, service role INSERT/UPDATE
- `mewp_weekly_sheets`: public SELECT, service role INSERT/UPDATE, anon INSERT via RPC
- `mewp_daily_entries`: anon INSERT, public SELECT
- `mewp_visual_checks`: anon INSERT, public SELECT
- `mewp_function_checks`: anon INSERT, public SELECT
- `mewp_defects`: anon INSERT, public SELECT, service role UPDATE
- `mewp_spot_checks`: anon INSERT, public SELECT
- `mewp_spot_check_items`: anon INSERT, public SELECT
- Storage `mewp-photos`: anon INSERT, public SELECT
- Storage `mewp-signatures`: anon INSERT, public SELECT
- Storage `mewp-weekly-reports`: service role INSERT/DELETE, public SELECT
- Storage `mewp-thorough-exams`: anon INSERT, public SELECT
- Storage `mewp-spot-photos`: anon INSERT, public SELECT

---

### 11.19 Still To Build

1. **Weekly Sunday auto-archive** — Supabase Edge Function running at 23:59 every Sunday, calling generateReport for all MEWPs with activity that week
2. **Defect management** — site admins mark defects as repaired, add engineer name and date
3. **Email/SMS notifications** — alert site admin when a fault is logged
4. **Subcontractor inventory view** — subcontractor_admin sees only their own MEWPs

---

### 11.20 Deployment

- **Host:** Vercel (auto-deploy on push to main)
- **Subdomain:** `mewps.liftingmanagement.com`
- **Node version:** 20.x
- **PDF generation timeout:** can take 5–15 seconds — use Vercel Pro for 300s timeout (Hobby is 10s)
- Env vars set in Vercel dashboard (not committed to repo)
