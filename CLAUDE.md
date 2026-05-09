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
