# Sweeper Self-Hosted

> **Version**: 2026-08-01  
> AI-assisted professional accounting workflow system for Australian accounting firms — self-hosted edition.

> **Requires a Sweeper Enterprise license.**  
> Request one at [enterprise.sweeper-acct.com.au](https://enterprise.sweeper-acct.com.au) — includes 10 free MCP trial runs.

---

## What you get

- Full Sweeper application (frontend + backend + task queue) running on your own infrastructure
- BAS/GST workpaper processing powered by the Sweeper MCP API (bank statement extraction + GST classification)
- All client data, workpapers, and audit logs stay within your Supabase project
- Upgrade to newer versions by pulling the latest Docker image — no migration headaches

## Architecture

```
Your server
├── frontend          (nginx, React SPA)
├── backend           (FastAPI — sweeper425/sweeper-backend:latest)
├── celery_worker     (task queue worker — same image)
├── celery_beat       (scheduled tasks — same image)
└── redis             (job queue)

Your Supabase project (cloud or self-hosted)
├── Postgres + RLS    (all firm/client/case data)
├── Auth              (JWT authentication)
└── Storage           (bank statement PDFs, workpaper CSVs)

Sweeper MCP API       (enterprise.sweeper-acct.com.au)
└── /mcp/extract      (bank statement → structured rows)
    /mcp/classify     (GST coding — deducts 1 run per statement)
```

All five images are pre-built and pulled from Docker Hub — **no local build required**.  
The frontend reads your Supabase URL from environment variables at container start via `window.__SWEEPER__` (injected by the entrypoint script).

---

## Prerequisites

| Requirement | Minimum |
|---|---|
| Docker Engine | 24+ |
| Docker Compose | v2 (bundled with Docker Desktop) |
| RAM | 4 GB |
| Disk | 20 GB |
| OS | Linux (Ubuntu 22.04 recommended), macOS 13+, Windows Server 2022 |

---

## Quick start

### 1. Get a Supabase project

Create a free project at [supabase.com](https://supabase.com) — choose the **ap-southeast-2 (Sydney)** region.

From **Settings → API**, copy:
- Project URL
- `anon` / public key
- `service_role` key
- JWT secret (under **JWT Settings**)

### 2. Apply database migrations

In the Supabase **SQL Editor**, run each `.sql` file from `supabase/migrations/` in filename order (001 → 053).

All migrations are idempotent — safe to re-run.

```sql
-- Tip: paste and run one file at a time, or use the Supabase CLI:
supabase db push --db-url "postgresql://postgres:[password]@[host]:5432/postgres"
```

### 3. Configure environment

```bash
cp .env.example .env
```

Fill in at minimum:

| Variable | Value |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_KEY` | Supabase service_role key |
| `SUPABASE_JWT_SECRET` | Supabase JWT secret |
| `VITE_SUPABASE_URL` | Same as `SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | Same as `SUPABASE_ANON_KEY` |
| `VITE_API_BASE_URL` | Your server's public URL (e.g. `https://sweeper.firm.com.au`) |
| `SWEEPER_MCP_KEY` | Your API key from enterprise.sweeper-acct.com.au |
| `FRONTEND_URL` | Your public frontend URL |
| `CORS_ORIGINS` | Same as `FRONTEND_URL` |

### 4. Configure Supabase Auth redirect URLs

In your Supabase project → **Authentication → URL Configuration**:
- **Site URL**: your `FRONTEND_URL`
- **Redirect URLs**: `{FRONTEND_URL}/**`

### 5. Start services

```bash
# Pull all images from Docker Hub (no local build needed)
docker compose pull

# Start everything
docker compose up -d

# Check status
docker compose ps
```

All five services should show `running`:

```
NAME             STATUS
redis            running (healthy)
backend          running (healthy)
celery_worker    running
celery_beat      running
frontend         running
```

### 6. Register the first firm

Open `http://localhost:3000` (or your domain) in a browser.

The registration page creates the Owner account and the first firm. After registering:
1. Log in as Owner
2. **Team Settings** → add team members (Partner, Manager, Senior, Junior)
3. **Clients** → add your first client
4. Upload a bank statement to start processing

---

## Production setup

### Reverse proxy (nginx)

```nginx
server {
    listen 443 ssl;
    server_name sweeper.firm.com.au;

    # Backend API
    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
    }
}
```

### Cloudflare (recommended)

Point your domain's A record to your server IP.  
Enable **Full (strict)** SSL mode. Cloudflare handles TLS; nginx or Caddy handles the internal proxy.

### Backups

Supabase Cloud handles Postgres backups automatically (daily, 7-day retention on free plan).  
For self-hosted Supabase, add a cron job to `pg_dump` and upload to S3 or Backblaze B2.

---

## Upgrading

Check the [releases page](https://github.com/sweeper-acct/self-hosted/releases) for new migration files before upgrading.

```bash
# 1. Apply any new migrations in supabase/migrations/ (SQL Editor)

# 2. Pull new images and restart
docker compose pull
docker compose up -d --force-recreate
```

No local build required — new frontend and backend versions are distributed as updated Docker Hub images.

---

## MCP quota

Your `SWEEPER_MCP_KEY` controls how many bank statements you can process per month.

| Action | Quota impact |
|---|---|
| Upload a bank statement | Free |
| Extract rows (GET `/mcp/extract`) | Free |
| GST classify a statement (`/mcp/classify`) | **1 run** |

Monitor usage and purchase top-ups at [enterprise.sweeper-acct.com.au](https://enterprise.sweeper-acct.com.au).

| Plan | Runs/month |
|---|---|
| Starter | 75 |
| Growth | 180 |
| Scale | 360 |
| Top-up Small | +10 (AU$110, never expire) |
| Top-up Medium | +30 (AU$330, never expire) |
| Top-up Large | +50 (AU$550, never expire) |

---

## Configuration reference

See `.env.example` for all available variables with descriptions.

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_URL` | Yes | Database connection |
| `SUPABASE_ANON_KEY` | Yes | Frontend/backend auth |
| `SUPABASE_SERVICE_KEY` | Yes | Backend admin operations |
| `SUPABASE_JWT_SECRET` | Yes | JWT verification |
| `VITE_SUPABASE_URL` | Yes | Frontend build (same as `SUPABASE_URL`) |
| `VITE_SUPABASE_ANON_KEY` | Yes | Frontend build |
| `VITE_API_BASE_URL` | Yes | API URL for browser (your domain) |
| `SWEEPER_MCP_KEY` | Yes | Bank statement processing quota |
| `SWEEPER_MCP_ENDPOINT` | No | Override MCP endpoint (default: Sweeper cloud) |
| `ANTHROPIC_API_KEY` | No | BYOK — only if not using `SWEEPER_MCP_KEY` |
| `FRONTEND_URL` | Yes | Auth redirect base URL |
| `CORS_ORIGINS` | Yes | Comma-separated allowed origins |
| `ENCRYPTION_KEY` | No | Fernet key for BYOK key storage |
| `SENTRY_DSN` | No | Error monitoring |
| `STRIPE_SECRET_KEY` | No | In-app billing (leave blank if not using) |
| `REDIS_URL` | No | Defaults to internal Redis container |
| `BACKEND_PORT` | No | Host port for backend (default: 8000) |
| `FRONTEND_PORT` | No | Host port for frontend (default: 3000) |

---

## Security notes

- The backend API runs as a non-root user inside the container.
- All data isolation between accounting firms is enforced at the Postgres RLS layer — not the application layer. Do not disable RLS on any table.
- The `SUPABASE_SERVICE_KEY` is a superuser credential. Keep it secret and rotate it if compromised.
- Set `ENVIRONMENT=production` to disable the API docs endpoint (`/api/docs`).
- Rate limiting (IP-level) is built in using Redis. The limit is 3,000 requests per 60 seconds per IP.

---

## Troubleshooting

**Backend fails to start**

```bash
docker compose logs backend
```

Most common causes:
- Missing required env var → check `.env` has all required fields
- Supabase URL invalid → confirm the URL ends without a trailing slash

**Celery worker not processing jobs**

```bash
docker compose logs celery_worker
```

Ensure Redis is healthy: `docker compose ps redis`

**Frontend shows blank page or "missing Supabase URL"**

Check that your `.env` has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set correctly.  
The frontend container reads these at startup and writes them to `/env-config.js` — no rebuild needed.  
After changing `.env`:

```bash
docker compose up -d frontend   # restarts container; entrypoint re-generates env-config.js
```

**"quota exceeded" when uploading**

Your MCP plan's monthly runs are exhausted.  
Purchase a top-up at [enterprise.sweeper-acct.com.au](https://enterprise.sweeper-acct.com.au).

---

## Support

- **Email**: service@sweeper-acct.com.au
- **Response time**: next business day (AEST / AEDT)
- **Docs**: [enterprise.sweeper-acct.com.au](https://enterprise.sweeper-acct.com.au)

---

*Sweeper is developed and maintained by PIN ME PTY LTD — ABN 94 635 327 365*  
*Supabase is an open-source project. Sweeper is not affiliated with Supabase.*
