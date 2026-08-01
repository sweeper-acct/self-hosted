#!/bin/sh
# Generate runtime env-config.js so the SPA can read env vars without a rebuild.
# Works for both self-hosted Docker and Railway (Railway also bakes vars at build time;
# env-config.js is redundant there but harmless).
cat > /usr/share/nginx/html/env-config.js <<EOF
window.__SWEEPER__ = {
  SUPABASE_URL:      "${VITE_SUPABASE_URL}",
  SUPABASE_ANON_KEY: "${VITE_SUPABASE_ANON_KEY}",
  API_BASE_URL:      "${VITE_API_BASE_URL}",
  APP_NAME:          "${VITE_APP_NAME:-Sweeper}",
  CONTACT_EMAIL:     "${VITE_CONTACT_EMAIL:-service@sweeper-acct.com.au}"
};
EOF
exec nginx -g "daemon off;"
