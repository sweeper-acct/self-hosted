# Sweeper Self-Hosted

> **Version**: v1.1.75  
> AI Workforce OS for Australian accounting firms ->self-hosted edition.

> **Requires a Sweeper Enterprise license.**  
> Register at [enterprise.sweeper-acct.com.au](https://enterprise.sweeper-acct.com.au)

---

## What you get

- Sweeper frontend running on your own server
- All client data, workpapers, and audit logs stay within your own Supabase project - Sweeper never holds a copy
- AI processing (data normalization, workpaper preparation, client collaboration, audit trails, and professional sign-off) via your Sweeper MCP API key
- You own your data - build downstream integrations (Xero, MYOB, QuickBooks) directly from your Supabase Storage using any tool you choose
- Upgrade by pulling the latest Docker image - no rebuild required

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

The frontend image is public on Docker Hub - **no Docker Hub login required**.

---

## Your data

All client data, workpapers, and audit logs are written to **your own Supabase project** - Sweeper never holds a copy.

Once a BAS/GST folder is certified, the output files sit in your own Supabase Storage:

```
{firm_id}/{client_id}/{period}/
  final/     - BAS summary JSON (G1, G11, 1A, 1B, 8A) - written after BAS draft
  reviewed/  - GST-coded transaction workpaper CSV - human-certified by Senior
  archived/  - Immutable copy written after Partner certifies
```

You can query these files directly using the Supabase client, the Supabase dashboard, or any PostgreSQL-compatible tool. Build downstream integrations with Xero, MYOB, QuickBooks, or any other platform using your own credentials and your own schedule - no dependency on Sweeper for that step.

---

The frontend image is public on Docker Hub ->**no Docker Hub login required**.  
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

Create a free project at [supabase.com](https://supabase.com) ->choose **ap-southeast-2 (Sydney)** region.

From **Settings ->API**, copy:
- Project URL
- `anon` / public key

### 2. Apply the database schema

In Supabase **SQL Editor**, paste and run `combined_schema.sql` (included in this release).

```
Supabase Dashboard ->SQL Editor ->New query ->paste combined_schema.sql ->Run
```

### 3. Create the Storage buckets

Two buckets are required. In Supabase **Dashboard - Storage - New bucket**, create each:

**Bucket 1 - workpaper files** (auto-created on first registration, but create manually if registering outside the UI):
- **Name:** `firm-{your-firm-uuid}` - replace with your firm's UUID from the `firms` table after registration
- **Public:** off (private)

**Bucket 2 - client query attachments** (must be created manually before clients can attach receipts):
- **Name:** `client-uploads`
- **Public:** off (private)

After creating `client-uploads`, add Storage policies in **Dashboard - Storage - Policies - client-uploads**:

| Policy | Allowed roles |
|---|---|
| INSERT | `anon`, `authenticated` |
| SELECT | `anon`, `authenticated` |
| DELETE | `authenticated` |

Or run this SQL in the SQL Editor:
```sql
CREATE POLICY "client_uploads_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'client-uploads');
CREATE POLICY "client_uploads_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'client-uploads');
CREATE POLICY "client_uploads_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'client-uploads' AND auth.role() = 'authenticated');
```

### 4. Configure the JWT Auth Hook

This step injects `firm_id`, `team_id`, and `user_role` into every JWT so the backend can authenticate requests without an extra database round-trip.

In your Supabase project ->**Authentication ->Auth Hooks**:

1. Click **Add new hook**
2. Hook type: **Customize Access Token**
3. Function name: `custom_jwt_hook`
4. Click **Save**

> **Optional but recommended.** Without the hook, authentication still works ->the backend falls back to a database lookup on every request. With the hook, claims are in the JWT itself (faster, fewer round-trips).

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
| `SWEEPER_VERSION` | `1.1.41` (or leave default) |

### 6. Configure Supabase Auth redirect URLs

In your Supabase project ->**Authentication ->URL Configuration**:
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

Open `http://localhost:3000` ->the registration page creates the first Owner account and firm.

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
# 1. Apply the new combined_schema.sql in Supabase SQL Editor (idempotent ->safe to re-run)

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
| `SWEEPER_MCP_KEY` | Yes | MCP API key from enterprise.sweeper-acct.com.au ->enabling data normalization, workpaper preparation, client collaboration, audit trails, Xero/QBO integration, and professional sign-off. |
| `VITE_APP_NAME` | No | Display name (default: `Sweeper`) |
| `VITE_CONTACT_EMAIL` | No | Support email shown in UI |
| `SWEEPER_VERSION` | No | Image version to pull (default: `1.1.41`) |
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

Both `principal@firm.com.au` and `principal+partner@firm.com.au` deliver to the same inbox ->Supabase treats them as separate accounts.

---

## Troubleshooting

**Frontend shows blank page or "missing Supabase URL"**

Check that `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in `.env`.  
The frontend reads these at container start ->no rebuild needed. After changing `.env`:

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

*Sweeper is developed and maintained by PIN ME PTY LTD ->ABN 94 635 327 365*

---

## Changelog

### v1.1.75 (August 2026)
- Fix: `SeniorReviewPage` approve role gate in self-hosted — Approve/Reject buttons now hidden for roles without permission; `SH_APPROVE_ROLES` enforced in mutation
- Fix: reject-cycle duplicate task bug in `SeniorReviewPage.shApproveMutation` — lookup now includes `rejected` status, uses UPDATE instead of INSERT on re-run

### v1.1.74 (August 2026)
- Security: SECURITY DEFINER RPC authorization hardening — all RPCs now validate caller firm ownership against `public.users` table (not just JWT claim)
- Security: `update_member_selfhosted` RPC replaces direct `users` table UPDATE — prevents within-firm privilege escalation
- Fix: `directors` DELETE RLS policy added — partner/manager/senior can now remove directors
- Fix: `sla_profiles` DELETE RLS policy added — partner/admin can delete SLA profiles

### v1.1.69 (August 2026)
- Fix: Add Member blocked for Owner role — new `register_member_selfhosted` SECURITY DEFINER RPC; direct `users.insert()` replaced
- Fix: `ManagerReviewPage` flash "Failed to load BAS summary" — loading state now includes parent `shDataLoading`

### v1.1.60 (August 2026)
- Fix: `SeniorReviewPage` + `ManagerReviewPage` self-hosted approve role gate added — `canApprove` flag computed from role × task_type; view-only message shown for unauthorized roles

### v1.1.54 (August 2026)
- Feat: Case Log — 4 new action filter options: client_query_sent / client_query_answered / client_query_revoked / document_uploaded
- Feat: Case Log Action column now shows workflow step name from `input_snapshot.task_type`
- Feat: audit trail entries added for GenerateQueryModal, CertifyPage document upload, client query submission and file upload

### v1.1.43 (August 2026)
- Fixed: workpaper files (validated/, processed/, reviewed/, final/, archived/) not appearing in Working Paper Files panel after submission — direct `supabase.from('files').insert()` calls were silently blocked by RLS; switched all file state inserts to `record_file_selfhosted` SECURITY DEFINER RPC across ValidatePage, SeniorReviewPage, SeniorBasDraftPage, and CertifyPage
- Fixed: CaseDetailPage showed stale "No workpaper files yet" after validate_extraction submit — React Query cache for `case-files` now invalidated on submit success

### v1.1.26 (August 2026)
- Fixed: GST Breakdown in Senior Review right panel showed $0.00 and stale tab counts (Ready for GST / Non-GST / Review Required) after Senior reclassified rows - panel now updates live as edits are made, without requiring submit

### v1.1.18 (August 2026)
- Fixed: duplicate "Extract" entries in Folder Steps when case had two `extract` tasks - `TaskList` now deduplicates by `task_type` before rendering
- Fixed: `handleUploadAndExtract` (upload new PDF button) used direct `tasks` INSERT which bypassed idempotency checks; changed to call `advance_to_validate_selfhosted` RPC (same as Continue button)
- Fixed: `advance_to_validate_selfhosted` RPC `ON CONFLICT DO NOTHING` did not prevent duplicate `extract` tasks (partial unique index only covers non-complete statuses); replaced with explicit `IF NOT EXISTS` check

  **DB fix required for existing installations** - re-run `advance_to_validate_selfhosted` function in Supabase SQL Editor:
  ```sql
  -- Copy the full CREATE OR REPLACE FUNCTION advance_to_validate_selfhosted ...
  -- from combined_schema.sql lines 3608->C3699 and paste into SQL Editor
  ```
  Then clean up any duplicate extract tasks:
  ```sql
  -- List duplicates
  SELECT case_id, COUNT(*) FROM tasks WHERE task_type = 'extract' GROUP BY case_id HAVING COUNT(*) > 1;
  -- Delete extra (keep the one with the latest completed_at)
  DELETE FROM tasks WHERE id IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY case_id ORDER BY completed_at DESC) AS rn
      FROM tasks WHERE task_type = 'extract'
    ) sub WHERE rn > 1
  );
  ```

### v1.1.17 (August 2026)
- Fixed: MCP extract calls returned 401 "Invalid MCP key format" - `X-MCP-Key` header was missing from the nginx self-hosted MCP proxy location block; key placeholder `SWEEPER_MCP_KEY_VALUE` was never added to `nginx.selfhosted.conf`

### v1.1.16 (August 2026)
- Fixed: `tasks` insert in self-hosted new-folder flow included `team_id` column which does not exist in the tasks schema - caused 400 PGRST204 error when creating a new folder from ClientDetailPage

### v1.1.15 (August 2026)
- Fixed: MCP key not detected on Modules page - `docker-compose.yml` only mapped key as `VITE_MCP_KEY` but `docker-entrypoint.sh` reads `SWEEPER_MCP_KEY`; both names now mapped; entrypoint falls back to `VITE_MCP_KEY` if `SWEEPER_MCP_KEY` absent

### v1.1.14 (August 2026)
- Fixed: `combined_schema.sql` idempotency - all CREATE TABLE / INDEX / TRIGGER now use IF NOT EXISTS / OR REPLACE; safe to re-run after a partial-run failure without DROP TABLE
- Fixed: `ADD COLUMN engagement_date` missing IF NOT EXISTS guard
- Fixed: `ADD CONSTRAINT chk_activated_at_required` missing preceding DROP IF EXISTS
- Fixed: incorrect header comment that claimed schema was already safe to re-run

### v1.1.04 (August 2026)
- Fixed: client query file uploads - `record_client_query_upload` RPC now formally in Migration 066 (was missing from all prior migrations; uploads silently failed in self-hosted mode)
- Fixed: `document_type` for client-uploaded attachments changed from `"receipt"` to `"client_upload"` (SaaS + self-hosted); existing uploads are unaffected
- Fixed: Supporting Evidence download URL - removed dead `client-uploads` bucket check in `get_document_download_url`; always uses `firm-{uuid}` bucket for SaaS mode
- Fixed: README Storage bucket setup - replaced incorrect `firm-files` with correct `firm-{uuid}` (auto-created by `register_firm()`) and added `client-uploads` bucket setup with SQL policies
- Action required: apply Migration 066 in Supabase SQL Editor, then create `client-uploads` Storage bucket per README step 3

### v1.1.02 (August 2026)
- Feat: ManagerReviewPage full self-hosted implementation - Supabase-direct BAS summary + workpaper rows; approve advances to client_confirm; reject resets bas_draft + returns upstream
- Feat: ClientConfirmPage full self-hosted implementation - Supabase-direct BAS summary + workpaper rows; confirm advances to certify; send back returns to manager_review
- Feat: CertifyPage full self-hosted implementation - reads final/ JSON via signed URL; certify copies final/ to archived/ in Storage + archives case; return for revision returns to client_confirm
- Full Partner workflow chain now operational in self-hosted mode: validate_gst - senior_review - senior_bas_review - manager_review - client_confirm - certify - archived

*For earlier versions (v1.0.x), see [GitHub Releases](https://github.com/sweeper-acct/self-hosted/releases).*
