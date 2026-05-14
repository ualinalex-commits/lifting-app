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

> **Note:** Crane Logs and Crane Schedule are the first screens to be built. The remaining screens are placeholders for now — create the navigation and screen shells but leave them empty.

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

*More sections to follow: Crane Schedule, Daily Briefing, Toolbox Talk, LOLER Register, Supervisor Checks, Operator Checks.*

---

## 9. MEWP Inventory Module

The MEWP module is built **inside the Lifting App** as native screens using Expo Router.
It shares the same Supabase project, auth system, and existing tables (sites, subcontractors, profiles).
Accessible at `mewps.liftingmanagement.com` via the web version of the app.

MEWP = Mobile Elevated Work Platform (Pecolift, Scissor Lift, Boom Lift, Cherry Picker etc.)

---

### 9.1 What It Does (Phase 1 — Inventory)

A site inventory system for tracking all MEWPs on a construction site — their type, serial number,
subcontractor, thorough examination certificate status, location, and compliance status.

Phase 1 is inventory only. Daily checks, spot checks and PDF generation come later.

---

### 9.2 Roles & Permissions

| Role | Can Do |
|---|---|
| `appointed_person` | Add/edit/archive any MEWP on their site, upload thorough exam, update location |
| `subcontractor_admin` | Add/edit/archive their own subcontractor's MEWPs only, upload thorough exam, update location |
| All other site roles | View inventory only |

---

### 9.3 Data Model

Uses existing tables: `sites`, `subcontractors`, `profiles`. New tables:

#### `mewps`
| column | type | notes |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| site_id | uuid FK → sites | |
| subcontractor_id | uuid FK → subcontractors | nullable — null if site-owned |
| mewp_type | text | e.g. Pecolift, Scissor Lift |
| serial_number | text | |
| thorough_exam_url | text | public URL of uploaded document or photo |
| thorough_exam_expiry | date | nullable |
| current_location | text | e.g. Basement, Level 2 |
| sticker_url | text | public URL of MEWP sticker photo |
| is_archived | boolean | default false |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

#### `mewp_location_history`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| mewp_id | uuid FK → mewps | |
| location | text | |
| changed_at | timestamptz | default now() |
| changed_by | uuid FK → profiles | |

---

### 9.4 Status Logic

Calculated from `thorough_exam_expiry` — never stored, always derived:

- **VALID** — expiry date exists and is more than 30 days from today (green)
- **EXP SOON** — expiry date exists and is within 30 days from today (amber)
- **NO CERT** — no expiry date, or expiry date is in the past (red)

---

### 9.5 Screens

#### MEWP Inventory Screen (appointed_person dashboard card → this screen)

Design: Glide-style — clean, minimal, flat. White surfaces, 0.5px borders, generous whitespace.

**Summary cards at top (4 cards):**
- Total MEWPs (neutral)
- Valid (green background)
- Exp Soon (amber background)
- No Cert (red background)

**Filter pills:** All / Valid / Exp Soon / No Cert + search box

**Table columns:** # / Type / Serial / Subcontractor / Expiry / Location / Status / Actions

**Status badges (pill shaped):**
- Valid → green pill
- Exp Soon → amber pill
- No Cert → red pill

**Action buttons per row (inline, no detail screen needed):**
- Upload exam icon button → opens sheet with file/photo picker + date picker for expiry
- Edit icon button → opens edit form

**Pagination** at bottom for large lists.

#### Add / Edit MEWP Form

Fields:
- MEWP Type (text input — e.g. Pecolift, Scissor Lift)
- Serial Number (text input)
- Subcontractor (dropdown from `subcontractors` table filtered by site_id — shows "None / Site-owned" as first option)
- Thorough Exam (file/photo picker — optional at creation)
- Expiry Date (date picker — optional at creation)
- Current Location (text input)
- Sticker Photo (photo picker — optional)

#### MEWP Detail Screen (tap a row → detail)

Shows all MEWP fields plus:
- Location history timeline (list of past locations with date and who changed it)
- Thorough exam document/photo preview
- Sticker photo preview

---

### 9.6 Supabase Storage Buckets

| Bucket | Path | Writer | Notes |
|---|---|---|---|
| `mewp-thorough-exams` | `{siteId}/{mewpId}/{timestamp}.{ext}` | authenticated | PDF, JPG, PNG |
| `mewp-stickers` | `{siteId}/{mewpId}/sticker.jpg` | authenticated | MEWP sticker photo |

Both buckets: public read, authenticated INSERT.

---

### 9.7 RLS Policies

- `mewps`: public SELECT, appointed_person ALL for their site, subcontractor_admin INSERT/UPDATE/DELETE for their own subcontractor_id rows
- `mewp_location_history`: public SELECT, authenticated INSERT
- Storage buckets: authenticated INSERT, public SELECT

---

### 9.8 What Comes After Inventory (Phase 2+)

- Daily inspection form (43-item checklist, photo, signature)
- Spot check form (condition report)
- QR code / NFC tag per MEWP
- PDF inventory export (matching the IPAF-style table format)
- Weekly PDF archive
- Defect management



- Site admin scans a QR code → opens site dashboard
- Worker scans NFC tag on machine → opens daily inspection form
- Worker completes 43-item checklist, takes a photo, signs → data saves to Supabase
- PDF report generated immediately after each submission and stored in Supabase Storage
- Weekly PDF archived for compliance records

---

### 9.2 Architecture

The MEWP module is built **inside the Lifting App** as native screens using Expo Router.
It is NOT a separate Next.js project.

- Runs natively on iOS and Android
- Runs on web via Expo's web support
- `mewps.liftingmanagement.com` points to the MEWP screens in the deployed web version
- PDF generation runs via a **Supabase Edge Function** (not a Next.js API route)
- All MEWP screens live under `app/(mewp)/` in the Expo project
- Public inspection pages (`/check/[mewpId]`) require no login — accessible to anyone with the URL or NFC/QR scan
- All admin/dashboard screens use the same email OTP auth as the rest of the app

**Additional dependencies to add to lifting-app:**
```
npm install pdf-lib signature_pad qrcode
```

> **Auth note:** ALL authentication uses email OTP only (6-digit PIN, 10 minutes).
> Worker inspection and spot check pages remain fully public — no login required.

---

### 9.3 Screen Structure (inside lifting-app)

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

### 9.4 Supabase Tables (MEWP module)

These tables are **prefixed with `mewp_`** to avoid collision with Lifting App tables.
All use the same Supabase project.

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

### 9.5 Supabase Views & RPCs

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

### 9.6 Supabase Storage Buckets

All buckets are **public** (public read).

| Bucket | Path pattern | Writer | Notes |
|---|---|---|---|
| `mewp-photos` | `{siteId}/{mewpId}/{date}.jpg` | anon | One per MEWP per day |
| `mewp-signatures` | `{siteId}/{mewpId}/{date}.png` | anon | One per MEWP per day |
| `mewp-weekly-reports` | `{siteId}/{mewpId}/{week_commencing}.pdf` | service role | Always remove() then upload() — never upsert |
| `mewp-thorough-exams` | `{mewpId}/{timestamp}.{ext}` | anon | PDF, JPG, or PNG |
| `mewp-spot-photos` | `{mewpId}/{spotCheckId}/{n}.jpg` | anon | Multiple per spot check |

---

### 9.7 Authentication (MEWP module)

**Public pages (no login):**
- `/check/[mewpId]` — worker inspection form, fully public
- `/check/[mewpId]/spot` — spot check form, fully public

**Authenticated pages:**
- `/site/[siteId]` — site dashboard (site_admin or subcontractor_admin for that site)
- `/admin` — main_admin only

**Auth flow:** Same email OTP as the main Lifting App — email → 6-digit PIN → signed in.
Users are managed via the shared `profiles` table. No separate user table for MEWP.

**Role mapping for MEWP module:**

| Lifting App role | MEWP access |
|---|---|
| `main_admin` | Full admin access — all sites, all MEWPs |
| `company_admin` | No direct MEWP access (future: view reports) |
| `appointed_person` → `site_admin` | Manages MEWPs on their site |
| `subcontractor_admin` | Manages their own MEWPs on site |

> Note: In the MEWP module, `appointed_person` acts as `site_admin`.
> The shared `profiles` table role field determines access.

---

### 9.8 All 43 Inspection Items

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

### 9.9 Daily Inspection Form

File: `/pages/check/[mewpId].jsx`

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

### 9.10 PDF Generation

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

### 9.11 Critical Workarounds (do not skip)

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

### 9.12 RLS Policy Summary (MEWP tables)

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

### 9.13 Still To Build

1. **Weekly Sunday auto-archive** — Supabase Edge Function running at 23:59 every Sunday, calling generateReport for all MEWPs with activity that week
2. **Defect management** — site admins mark defects as repaired, add engineer name and date
3. **Email/SMS notifications** — alert site admin when a fault is logged
4. **Subcontractor inventory view** — subcontractor_admin sees only their own MEWPs

---

### 9.14 Deployment

- **Host:** Vercel (auto-deploy on push to main)
- **Subdomain:** `mewps.liftingmanagement.com`
- **Node version:** 20.x
- **PDF generation timeout:** can take 5–15 seconds — use Vercel Pro for 300s timeout (Hobby is 10s)
- Env vars set in Vercel dashboard (not committed to repo)

The MEWP module is a standalone web app deployed at `mewps.liftingmanagement.com`, built as part of the Lifting App ecosystem and sharing the same Supabase project and authentication system.

MEWP = Mobile Elevated Work Platform (cherry pickers, scissor lifts, boom lifts etc.)

---

### 8.1 Role Structure

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
| `site_admin` | Single site | Adds/edits/archives MEWPs, adds subcontractor_admins, views all site MEWPs, does spot checks from web |
| `subcontractor_admin` | Single site | Adds/removes their own MEWPs, does daily checks and spot checks on their MEWPs |
| Public (no login) | Single MEWP | Views check history, thorough examination, does daily check and spot check via QR/NFC scan |

---

### 8.2 MEWP Lifecycle

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

---

### 8.3 MEWP Fields

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

### 8.4 Thorough Examination

- Uploaded as a **photo or PDF document** by `site_admin` or `subcontractor_admin`.
- Has an **expiry date** set manually at time of upload.
- Visible publicly on the MEWP public page (anyone who scans the QR/NFC can see it).
- Status shown on inventory dashboard: **In Date** or **Overdue**.

---

### 8.5 Daily Check

- Done by **anyone** — no login required.
- Triggered by scanning the QR code or NFC tag on the MEWP.
- Uses the existing daily check form (same as current MEWP app).
- One check per MEWP per day.
- At the end of each week, a **PDF is auto-generated** showing all daily checks for that week and saved to the MEWP archive.

---

### 8.6 Spot Check

- Done by **anyone** — no login required via QR/NFC scan, or from the web by `site_admin` and `subcontractor_admin`.
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

### 8.7 Public MEWP Page (QR/NFC Scan — no login required)

When anyone scans the QR code or NFC tag on a MEWP, they see:

- MEWP ID, type, subcontractor
- Thorough examination document/photo and expiry date
- Daily checks history (list of all checks with date and result)
- **Do Daily Check** button
- **Do Spot Check** button

---

### 8.8 Inventory Dashboard (site_admin)

The site_admin has a full inventory view of all MEWPs on site:

- Total MEWPs on site
- Breakdown by subcontractor
- **In Date** vs **Overdue** thorough examinations
- Daily check compliance — how many MEWPs checked today vs not checked
- Spot check history across all MEWPs
- Weekly PDF archive per MEWP

---

### 8.9 Supabase Tables (MEWP module)

Tables to be added to the shared Supabase project:

- `mewp_sites` — site register for MEWP module
- `mewp_site_admins` — site_admin assignments
- `mewps` — MEWP register per site
- `mewp_thorough_examinations` — document/photo + expiry date per MEWP
- `mewp_daily_checks` — one record per MEWP per day
- `mewp_spot_checks` — condition report per check
- `mewp_spot_check_items` — individual checklist item results per spot check
- `mewp_weekly_pdfs` — archived weekly PDF references per MEWP

---

### 8.10 Deployment

- Deployed as a separate web app on Vercel
- Subdomain: `mewps.liftingmanagement.com`
- Shares the same Supabase project as the main Lifting App
- Auth: same email OTP system — logged-in users (site_admin, subcontractor_admin) use the same credentials
- Public pages (QR/NFC scan) require no authentication