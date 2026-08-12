# Sweeper Self-Hosted

> **Version**: v1.0.57  
> AI Workforce OS for Australian accounting firms 鈥?self-hosted edition.

> **Requires a Sweeper Enterprise license.**  
> Register at [enterprise.sweeper-acct.com.au](https://enterprise.sweeper-acct.com.au)

---

## What you get

- Sweeper frontend running on your own server
- All client data, workpapers, and audit logs stay within your own Supabase project — Sweeper never holds a copy
- AI processing (data normalization, workpaper preparation, client collaboration, audit trails, and professional sign-off) via your Sweeper MCP API key
- You own your data — build downstream integrations (Xero, MYOB, QuickBooks) directly from your Supabase Storage using any tool you choose
- Upgrade by pulling the latest Docker image — no rebuild required

## Architecture

```
Your server
  frontend       nginx + React SPA (sweeper425/sweeper-frontend)

Your Supabase project
  Postgres + RLS   all firm/client/case data
  Auth             JWT authentication
  Storage          bank statement PDFs, workpaper CSVs and JSON

Sweeper backend    enterprise.sweeper-acct.com.au
  AI processing via your MCP API key
  (data normalization, workpaper preparation, client collaboration,
   audit trails, and professional sign-off)

Your downstream integrations (Xero, MYOB, QuickBooks, etc.)
  Your Supabase Storage and database are yours to query directly.
  Read workpaper files and BAS data from your own storage,
  then push to any accounting software using your own credentials.
```

The frontend image is public on Docker Hub — **no Docker Hub login required**.

---

## Your data

All client data, workpapers, and audit logs are written to **your own Supabase project** — Sweeper never holds a copy.

Once a BAS/GST folder is certified, the output files sit in your own Supabase Storage:

```
{firm_id}/{client_id}/{period}/
  final/     ← BAS summary JSON (G1, G11, 1A, 1B, 8A) — written after BAS draft
  reviewed/  ← GST-coded transaction workpaper CSV — human-certified by Senior
  archived/  ← Immutable copy written after Partner certifies
```

You can query these files directly using the Supabase client, the Supabase dashboard, or any PostgreSQL-compatible tool. Build downstream integrations with Xero, MYOB, QuickBooks, or any other platform using your own credentials and your own schedule — no dependency on Sweeper for that step.

---

The frontend image is public on Docker Hub 鈥?**no Docker Hub login required**.  
Your Supabase URL and MCP endpoint are injected at container start via `window.__SWEEPER__` (no rebuild needed on config change).

---

## Prerequisites

| Requirement | Minimum |
|---|---|
| Docker Engine | 24+ |
| Docker Compose | v2 (bundled with Docker Desktop) |
| RAM | 1 GB |
| OS | Linux, macOS, Windows |

---

## Quick start

### 1. Create a Supabase project

Create a free project at [supabase.com](https://supabase.com) 鈥?choose **ap-southeast-2 (Sydney)** region.

From **Settings 鈫?API**, copy:
- Project URL
- `anon` / public key

### 2. Apply the database schema

In Supabase **SQL Editor**, paste and run `combined_schema.sql` (included in this release).

```
Supabase Dashboard 鈫?SQL Editor 鈫?New query 鈫?paste combined_schema.sql 鈫?Run
```

### 3. Create the Storage bucket

In Supabase **Dashboard → Storage → New bucket**:

- **Name:** `firm-files`
- **Public:** off (private)

This bucket stores all uploaded bank statements and generated workpapers. It is not created by the SQL schema and must be set up once manually.

### 4. Configure the JWT Auth Hook

This step injects `firm_id`, `team_id`, and `user_role` into every JWT so the backend can authenticate requests without an extra database round-trip.

In your Supabase project 鈫?**Authentication 鈫?Auth Hooks**:

1. Click **Add new hook**
2. Hook type: **Customize Access Token**
3. Function name: `custom_jwt_hook`
4. Click **Save**

> **Optional but recommended.** Without the hook, authentication still works 鈥?the backend falls back to a database lookup on every request. With the hook, claims are in the JWT itself (faster, fewer round-trips).

### 5. Configure environment

```bash
cp .env.example .env
```

Fill in:

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| `SWEEPER_MCP_KEY` | Your Sweeper MCP API key from [enterprise.sweeper-acct.com.au](https://enterprise.sweeper-acct.com.au) |
| `SWEEPER_VERSION` | `1.0.20` (or leave default) |

### 6. Configure Supabase Auth redirect URLs

In your Supabase project 鈫?**Authentication 鈫?URL Configuration**:
- **Site URL**: `http://localhost:3000` (or your domain)
- **Redirect URLs**: `http://localhost:3000/**`

### 7. Start

```bash
docker compose pull
docker compose up -d
docker compose logs -f frontend
```

Frontend should show `ready` within a few seconds:

```
NAME        STATUS
frontend    running
```

Open `http://localhost:3000` 鈥?the registration page creates the first Owner account and firm.

---

## Production setup

### Reverse proxy (nginx)

```nginx
server {
    listen 443 ssl;
    server_name sweeper.firm.com.au;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
    }
}
```

### Cloudflare (recommended)

Point your domain's A record to your server IP. Enable **Full (strict)** SSL mode.

---

## Upgrading

```bash
# 1. Apply the new combined_schema.sql in Supabase SQL Editor (idempotent 鈥?safe to re-run)

# 2. Update SWEEPER_VERSION in .env

# 3. Pull and restart
docker compose pull
docker compose up -d --force-recreate
```

---

## Configuration reference

| Variable | Required | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `SWEEPER_MCP_KEY` | Yes | MCP API key from enterprise.sweeper-acct.com.au 鈥?enabling data normalization, workpaper preparation, client collaboration, audit trails, Xero/QBO integration, and professional sign-off. |
| `VITE_APP_NAME` | No | Display name (default: `Sweeper`) |
| `VITE_CONTACT_EMAIL` | No | Support email shown in UI |
| `SWEEPER_VERSION` | No | Image version to pull (default: `1.0.56`) |
| `FRONTEND_PORT` | No | Host port (default: `3000`) |

---

## Account setup notes

**Each email address can only be linked to one account.**

Supabase Auth enforces unique emails across all roles. If the firm principal (Owner) also manages their own partner team, they must register their team account with a different email address.

A common pattern is to use email sub-addressing (supported by most providers including Gmail):

| Role | Email example |
|---|---|
| Owner (firm admin) | `principal@firm.com.au` |
| Partner (own team) | `principal+partner@firm.com.au` |
| Junior | `junior@firm.com.au` |

Both `principal@firm.com.au` and `principal+partner@firm.com.au` deliver to the same inbox 鈥?Supabase treats them as separate accounts.

---

## Troubleshooting

**Frontend shows blank page or "missing Supabase URL"**

Check that `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in `.env`.  
The frontend reads these at container start 鈥?no rebuild needed. After changing `.env`:

```bash
docker compose up -d frontend
```

**Cannot log in / auth errors**

Confirm Supabase Auth **Site URL** and **Redirect URLs** match your frontend URL.

---

## Support

- **Email**: service@sweeper-acct.com.au
- **Response time**: next business day (AEST / AEDT)
- **Docs**: [enterprise.sweeper-acct.com.au](https://enterprise.sweeper-acct.com.au)

---

*Sweeper is developed and maintained by PIN ME PTY LTD 鈥?ABN 94 635 327 365*

---

## Changelog

### v1.0.68 (August 2026)

- Added: Self-hosted client query — Senior can generate query links directly via Supabase (no SaaS backend required)
- Added: Three SECURITY DEFINER RPCs in combined_schema.sql: `get_query_link_by_token`, `get_queries_by_link`, `submit_client_query_answers`
- Fixed: QUERY checkbox and toolbar now enabled in self-hosted mode (previously hidden)
- Note: apply combined_schema.sql RPCs to your Supabase instance (SQL Editor) before using this feature

### v1.0.67 (August 2026)

- Fixed: Query checkbox column now visible on all workpaper tabs (not just Review Required tab) in SaaS mode — Senior can send client queries from any sheet
- Fixed: CLIENT REPLY column now correctly displays client answers in SeniorReviewPage when queries have been answered
- Improved: Query creation toolbar hidden in self-hosted (client query requires SaaS backend)

### v1.0.57 (August 2026)

- Fixed: MCP endpoint URL now dynamically injected into nginx Content-Security-Policy at container start — works for any configured `SWEEPER_MCP_ENDPOINT`, including Railway direct URLs (`*.up.railway.app`)
- Previously: CSP was hardcoded to `enterprise.sweeper-acct.com.au` only, blocking extraction calls to the Railway backend

### v1.0.56 (August 2026)

- Fixed: "Continue" button now appears correctly when an extract task already exists but `validate_extraction` has not yet been created — previously the button was hidden once any extract task existed, even if extraction had never completed successfully
- Fixed: clicking "Continue" no longer fails when an extract task already exists in the database — duplicate insert is now skipped safely

### v1.0.55 (August 2026)

- Fixed: MCP extract stub data — Orvexa API key was not passed to extraction service, causing all extractions to return fixed test rows (including "XYZ Pty Ltd"). Real PDF extraction now works correctly.
- Fixed: validate_gst submit now respects approval chain — firms with Senior review gate create `senior_review` task (not `bas_draft`); minimal-chain firms continue to promote directly to reviewed/
- Fixed: validate_gst submit writes Junior edits back to processed/ for full-chain firms; Senior then promotes to reviewed/ on approve

### v1.0.54 (August 2026)

- Added: ValidatePage workpaper now fully functional in self-hosted — Junior can view, edit, and submit the extracted transaction table (validate_extraction) and GST-coded workpaper (validate_gst) directly from Supabase Storage
- Added: validate_extraction submit promotes extracted CSV → validated CSV in Storage, creates next workflow tasks (gst_prep → waiting for BASAgent, validate_gst → pending)
- Added: validate_gst submit calls MCP classify for GST coding, promotes validated → processed CSV, creates senior_review or bas_draft task based on approval chain

### v1.0.53 (August 2026)

- Fixed: Continue button now sets `completed_at` on the extract task — satisfies `chk_completed_at_consistency` constraint

### v1.0.52 (August 2026)

- Fixed: MCP extract URL was missing `/api/v1` prefix — caused CORS block when calling from self-hosted frontend

### v1.0.51 (August 2026)

- Added: "Continue" button on Folder detail page — for PDFs uploaded before MCP was connected, click triggers AI extraction (MCP extract → extracted CSV → validate_extraction task created automatically)
- Updated: Batch Upload button label → "Start working (N files)" during AI Workforce OS flow; AI extraction spinner is now violet to distinguish from the blue upload spinner
- Fixed: Junior can now see folders created by a Manager before they were assigned — assigning a client now cascades `assigned_junior` to all existing open folders

### v1.0.50 (August 2026)

- Fixed: New folders created from Client detail page now set `assigned_junior` so Junior RLS is satisfied immediately (Junior can see their own folders without waiting for a re-assignment)

### v1.0.49 (August 2026)

- Added: Directors management on Client detail page — always visible; inline Add/Delete form (name, position, email, phone)
- Fixed: Owner can now see clients, team members, and completed folders across all child groups (Partner Groups)

### v1.0.45 (August 2026)

- Added: Batch Upload now calls MCP extract automatically after each file upload — structured transaction rows written to `extracted/` in your Supabase Storage
- Added: `validate_extraction` task created in Supabase after extraction, making the folder immediately visible in Chat with a "Validate extraction" task pill
- Added: Sequential file processing per group prevents concurrent quota deductions (one file at a time; backend uses optimistic locking as a second guard)
- Added: `SWEEPER_MCP_ENDPOINT` env var (optional) — override the Sweeper backend endpoint if instructed by support
- Fixed: Opening/closing balance metadata lines now included in extracted CSV (passed through from MCP response)

### v1.0.41 (August 2026)

- Added: "Your data" section — explains that all workpapers live in your own Supabase Storage and are yours to query directly for downstream integrations (Xero, MYOB, QuickBooks)
- Updated: Architecture diagram clarifies Sweeper backend scope (AI processing only; downstream integrations are your own)

### v1.0.35 (August 2026)

- Fixed: New Client page Junior dropdown now loads in self-hosted (Supabase direct)
- Fixed: Register Client button now creates client and directors in self-hosted (Supabase direct)
- Fixed: Team members list shows child group members in parent team view (self-hosted)
- Fixed: Move member to child group now allowed by RLS policy (Migration 062)
- Fixed: Create Group, SLA profiles, AI Settings nav — self-hosted compatibility

### v1.0.31 (August 2026)

- Fixed: SLA profiles now create/edit/delete correctly in self-hosted (Supabase direct, no backend)
- Fixed: AI Settings nav item hidden in self-hosted (BYOK is a SaaS-only feature)

### v1.0.28 (August 2026)

- Fixed: Clients page now loads correctly in self-hosted (queries Supabase directly)
- Fixed: Dashboard page now loads correctly in self-hosted (stats, cases table, team members)
- Fixed: Case Log page now loads correctly in self-hosted (audit trail with client/period filters)

### v1.0.27 (August 2026)

- Fixed: login no longer triggers OTP email in self-hosted (password sign-in goes directly to app)

### v1.0.26 (August 2026)

- Fixed: login error no longer triggers CSP-blocked backend call in self-hosted
- Fixed: forgot password no longer calls SaaS backend in self-hosted

### v1.0.25 (August 2026)

- Fixed: firm_id now correctly read from JWT access_token payload (self-hosted custom_jwt_hook)

### v1.0.24 (August 2026)

- Fixed: Add member (Partner role) now correctly creates team with firm_id 鈥?RLS policy added
- Fixed: "Multiple GoTrueClient instances" warning eliminated (anon client moved to module level)

### v1.0.23 (August 2026)

- Fixed: Add member now works in self-hosted mode (Supabase direct, no backend required)
- Fixed: Team rename now works in self-hosted mode
- Added: Account setup notes 鈥?unique email requirement + email alias pattern

### v1.0.22 (August 2026)

- Fixed: MCP plan staff limits 鈥?Starter 15 staff, Growth 20 staff

### v1.0.21 (August 2026)

- Updated: MCP plan pricing 鈥?Starter 150 runs / Growth 250 runs / Scale contact us
- Updated: Top-up packs 鈥?20 / 30 / 50 runs at AU$10/run
- Updated: Storage row removed from plan cards (storage is your Supabase project)
- Updated: Platform feature label 鈥?Audit trails 路 5-yr

### v1.0.20 (August 2026)

- Improved: Plan & Billing page stability and enterprise portal link
- Improved: MCP key configuration and team module toggle reliability

### v1.0 鈥?Initial release (August 2026)

- Data normalization
- Workpaper preparation
- Client collaboration
- Audit trails
- Xero/QBO integration
- Professional sign-off
- Partner Groups, SLA Profiles, and Firm Module Library
- Plan & Billing with 5-run trial period

