#!/bin/sh
# Generate runtime env-config.js so the SPA can read env vars without a rebuild.
# Works for both self-hosted Docker and Railway (Railway also bakes vars at build time;
# env-config.js is redundant there but harmless).
#
# Security: strip characters that enable shell command substitution ($, `, \) from all
# env var values before interpolating them into the JS file. These characters never
# appear in legitimate Supabase URLs, API keys, or display names.
_safe() { printf '%s' "${1}" | tr -d '$`\\'; }

SUPABASE_URL=$(_safe "${VITE_SUPABASE_URL}")
SUPABASE_ANON_KEY=$(_safe "${VITE_SUPABASE_ANON_KEY}")
API_BASE_URL=$(_safe "${VITE_API_BASE_URL}")
APP_NAME=$(_safe "${VITE_APP_NAME:-Sweeper}")
CONTACT_EMAIL=$(_safe "${VITE_CONTACT_EMAIL:-service@sweeper-acct.com.au}")

cat > /usr/share/nginx/html/env-config.js <<EOF
window.__SWEEPER__ = {
  SUPABASE_URL:      "${SUPABASE_URL}",
  SUPABASE_ANON_KEY: "${SUPABASE_ANON_KEY}",
  API_BASE_URL:      "${API_BASE_URL}",
  APP_NAME:          "${APP_NAME}",
  CONTACT_EMAIL:     "${CONTACT_EMAIL}"
};
EOF
exec nginx -g "daemon off;"
