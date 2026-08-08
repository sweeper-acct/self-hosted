# Sweeper Self-Hosted

> **Version**: v1.0.35  
> AI Workforce OS for Australian accounting firms 鈥?self-hosted edition.

> **Requires a Sweeper Enterprise license.**  
> Register at [enterprise.sweeper-acct.com.au](https://enterprise.sweeper-acct.com.au)

---

## What you get

- Sweeper frontend running on your own server
- All client data, workpapers, and audit logs stay within your own Supabase project
- AI processing (data normalization, workpaper preparation, client collaboration, audit trails, Xero/QBO integration, and professional sign-off) via your Sweeper MCP API key
- Upgrade by pulling the latest Docker image 鈥?no rebuild required

## Architecture

```
Your server
鈹斺攢鈹€ frontend     (nginx, React SPA 鈥?sweeper425/sweeper-frontend:1.0.31)

Your Supabase project
鈹溾攢鈹€ Postgres + RLS    (all firm/client/case data)
鈹溾攢鈹€ Auth              (JWT authentication)
鈹斺攢鈹€ Storage           (bank statement PDFs, workpaper CSVs)

Sweeper backend       (enterprise.sweeper-acct.com.au)
鈹斺攢鈹€ AI processing via your MCP API key
    (data normalization, workpaper preparation, client collaboration,
     audit trails, Xero/QBO integration, and professional sign-off)
```

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

### 3. Configure the JWT Auth Hook

This step injects `firm_id`, `team_id`, and `user_role` into every JWT so the backend can authenticate requests without an extra database round-trip.

In your Supabase project 鈫?**Authentication 鈫?Auth Hooks**:

1. Click **Add new hook**
2. Hook type: **Customize Access Token**
3. Function name: `custom_jwt_hook`
4. Click **Save**

> **Optional but recommended.** Without the hook, authentication still works 鈥?the backend falls back to a database lookup on every request. With the hook, claims are in the JWT itself (faster, fewer round-trips).

### 4. Configure environment

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

### 5. Configure Supabase Auth redirect URLs

In your Supabase project 鈫?**Authentication 鈫?URL Configuration**:
- **Site URL**: `http://localhost:3000` (or your domain)
- **Redirect URLs**: `http://localhost:3000/**`

### 6. Start

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
| `SWEEPER_VERSION` | No | Image version to pull (default: `1.0.21`) |
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

