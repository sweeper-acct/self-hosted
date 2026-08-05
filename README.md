# Sweeper Self-Hosted

> **Version**: v1.0.9  
> AI Workforce OS for Australian accounting firms — self-hosted edition.

> **Requires a Sweeper Enterprise license.**  
> Register at [enterprise.sweeper-acct.com.au](https://enterprise.sweeper-acct.com.au)

---

## What you get

- Sweeper frontend running on your own server
- All client data, workpapers, and audit logs stay within your own Supabase project
- AI processing (bank statement extraction, GST classification) via your Sweeper MCP API key
- Upgrade by pulling the latest Docker image — no rebuild required

## Architecture

```
Your server
└── frontend     (nginx, React SPA — sweeper425/sweeper-frontend:1.0.9)

Your Supabase project
├── Postgres + RLS    (all firm/client/case data)
├── Auth              (JWT authentication)
└── Storage           (bank statement PDFs, workpaper CSVs)

Sweeper backend       (enterprise.sweeper-acct.com.au)
└── AI processing via your MCP API key
    (bank statement extraction + GST classification)
```

The frontend image is public on Docker Hub — **no Docker Hub login required**.  
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

Create a free project at [supabase.com](https://supabase.com) — choose **ap-southeast-2 (Sydney)** region.

From **Settings → API**, copy:
- Project URL
- `anon` / public key

### 2. Apply the database schema

In Supabase **SQL Editor**, paste and run `combined_schema.sql` (included in this release).

```
Supabase Dashboard → SQL Editor → New query → paste combined_schema.sql → Run
```

### 3. Configure the JWT Auth Hook

This step injects `firm_id`, `team_id`, and `user_role` into every JWT so the backend can authenticate requests without an extra database round-trip.

In your Supabase project → **Authentication → Auth Hooks**:

1. Click **Add new hook**
2. Hook type: **Customize Access Token**
3. Function name: `custom_jwt_hook`
4. Click **Save**

> **Optional but recommended.** Without the hook, authentication still works — the backend falls back to a database lookup on every request. With the hook, claims are in the JWT itself (faster, fewer round-trips).

### 4. Configure environment

```bash
cp .env.example .env
```

Fill in:

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| `VITE_MCP_KEY` | Your Sweeper MCP API key from [enterprise.sweeper-acct.com.au](https://enterprise.sweeper-acct.com.au) |
| `VITE_DEPLOYMENT_MODE` | `self-hosted` (pre-filled in `.env.example`) |
| `SWEEPER_VERSION` | `1.0.9` (or leave default) |

### 5. Configure Supabase Auth redirect URLs

In your Supabase project → **Authentication → URL Configuration**:
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

Open `http://localhost:3000` — the registration page creates the first Owner account and firm.

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
# 1. Apply the new combined_schema.sql in Supabase SQL Editor (idempotent — safe to re-run)

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
| `VITE_MCP_KEY` | Yes | MCP API key from enterprise.sweeper-acct.com.au — authenticates AI Normalization calls and displays your plan & quota on the billing page |
| `VITE_APP_NAME` | No | Display name (default: `Sweeper`) |
| `VITE_CONTACT_EMAIL` | No | Support email shown in UI |
| `SWEEPER_VERSION` | No | Image version to pull (default: `1.0.9`) |
| `FRONTEND_PORT` | No | Host port (default: `3000`) |

---

## Troubleshooting

**Frontend shows blank page or "missing Supabase URL"**

Check that `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in `.env`.  
The frontend reads these at container start — no rebuild needed. After changing `.env`:

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

*Sweeper is developed and maintained by PIN ME PTY LTD — ABN 94 635 327 365*

---

## Changelog

### v1.0.9 (2026-08-06)

- Plan & Billing page redesigned to match SaaS visual structure: plan cards with feature lists, AI Normalization quota bar, interval toggle, top-up packs — all actions link to enterprise portal
- Removed stale license/info query (endpoint was removed in v1.0.8)

### v1.0.8 (2026-08-06)

- Self-hosted architecture: frontend-only deployment; AI processing via MCP API key
- CORS gateway: wildcard CORS for /api/v1/mcp* paths — self-hosted frontends on any domain now work without CORS errors
- SaaS backend local license check removed — no SWEEPER_MCP_KEY or SWEEPER_MCP_ENDPOINT env vars required

### v1.0.7 (2026-08-06)

- CORS gateway live at `gateway.enterprise.sweeper-acct.com.au` — all API traffic now routes through the gateway
- CSP fix: `gateway.enterprise.sweeper-acct.com.au` added to `connect-src` whitelist

### v1.0.6 (2026-08-05)

- Self-hosted architecture: frontend-only deployment; AI processing via MCP API key
- Database migrations (apply `combined_schema.sql`):
  - Migration 060 — per-client Xero/QBO organisation mapping
  - Migration 061 — BAS journal push timestamps (prevent duplicate Xero/QBO entries)

### v1.0.5 (2026-08-05)

- Migration 058 — soft-delete support for folders
- Migration 059 — extended task status values
- Partner Groups, Client Query Portal, SLA Profiles, Firm Module Library
- BAS workpaper: sortable columns, CLIENT REPLY column, Non-GST tab

### v1.0.4 (2026-08-01)

- Enterprise portal license key distribution
- MCP API security hardening
