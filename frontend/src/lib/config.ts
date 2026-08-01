const _rt = (window as any).__SWEEPER__ || {};

export const APP_NAME          = _rt.APP_NAME          || import.meta.env.VITE_APP_NAME          || 'Sweeper'
export const API_BASE_URL      = _rt.API_BASE_URL      || import.meta.env.VITE_API_BASE_URL      || 'http://localhost:8000'
export const SUPABASE_URL      = _rt.SUPABASE_URL      || import.meta.env.VITE_SUPABASE_URL      || ''
export const SUPABASE_ANON_KEY = _rt.SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || ''
export const CONTACT_EMAIL     = _rt.CONTACT_EMAIL     || import.meta.env.VITE_CONTACT_EMAIL     || 'service@sweeper-acct.com.au'
