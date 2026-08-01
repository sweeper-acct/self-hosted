import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { API_BASE_URL } from '../lib/config'

// ─── Types ─────────────────────────────────────────────────────────────────

interface UsageData {
  customer: {
    email: string
    firm_name: string
    license_is_free: boolean
    license_issued_at: string
  }
  subscription: {
    plan: string
    interval: string
    runs_used: number
    runs_per_period: number
    topup_credits: number
    status: string
    period_reset_at: string | null
    cancel_at: string | null
  }
  api_keys: {
    id: string
    key_prefix: string
    label: string
    is_active: boolean
    last_used_at: string | null
    created_at: string
  }[]
}

// ─── Constants ──────────────────────────────────────────────────────────────

const PLAN_LABELS: Record<string, string> = {
  trial:   'Trial',
  starter: 'Starter',
  growth:  'Growth',
  scale:   'Scale',
}

const TOPUP_OPTIONS = [
  { runs: 10,  label: '10 MCP runs',  price: 'AU$90' },
  { runs: 30,  label: '30 MCP runs',  price: 'AU$270' },
  { runs: 50,  label: '50 MCP runs',  price: 'AU$450' },
]
const TOPUP_SUBTITLE = 'Credits added immediately and never expire.'

const SESSION_KEY = 'enterprise_mcp_key'

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtDatetime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function KeyForm({ onSubmit }: { onSubmit: (key: string) => void }) {
  const [val, setVal] = useState('')
  const [err, setErr] = useState('')
  const [show, setShow] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 max-w-md w-full">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Sweeper Enterprise</h1>
            <p className="text-sm text-gray-500">Enter your API key to view usage</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">MCP API Key</label>
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                value={val}
                onChange={e => { setVal(e.target.value); setErr('') }}
                onKeyDown={e => e.key === 'Enter' && val && onSubmit(val)}
                placeholder="sk-swp-..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 pr-10 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => setShow(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {show
                  ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21" /></svg>
                  : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                }
              </button>
            </div>
            {err && <p className="text-xs text-red-600 mt-1.5">{err}</p>}
          </div>

          <button
            onClick={() => {
              if (!val.trim()) { setErr('Please enter your API key'); return }
              onSubmit(val.trim())
            }}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg py-2.5 transition-colors"
          >
            View usage
          </button>
        </div>

        <p className="text-xs text-gray-400 mt-5 text-center">
          Your key was emailed when your license was issued.{' '}
          <a href="mailto:service@sweeper-acct.com.au" className="underline">Contact support</a>
        </p>
      </div>
    </div>
  )
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function EnterpriseDashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [apiKey, setApiKey]   = useState<string | null>(null)
  const [data, setData]       = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(false)
  const [authErr, setAuthErr] = useState('')
  const [topupLoading, setTopupLoading] = useState<number | null>(null)
  const [topupSuccess, setTopupSuccess] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const topupSuccessParam = searchParams.get('topup') === 'success'

  useEffect(() => {
    const stored = sessionStorage.getItem(SESSION_KEY)
    if (stored) handleApiKey(stored)
    if (topupSuccessParam) {
      setTopupSuccess(true)
      setSearchParams({}, { replace: true })
    }
  }, [])

  async function handleApiKey(key: string) {
    setLoading(true)
    setAuthErr('')
    try {
      const resp = await fetch(`${API_BASE_URL}/api/v1/mcp-billing/usage`, {
        headers: { 'X-MCP-Key': key },
      })
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        setAuthErr(body.detail || 'Invalid API key')
        setLoading(false)
        return
      }
      const json = await resp.json()
      sessionStorage.setItem(SESSION_KEY, key)
      setApiKey(key)
      setData(json)
    } catch {
      setAuthErr('Could not connect to Sweeper API')
    }
    setLoading(false)
  }

  function handleSignOut() {
    sessionStorage.removeItem(SESSION_KEY)
    setApiKey(null)
    setData(null)
  }

  async function handleTopup(runs: number) {
    if (!apiKey) return
    setTopupLoading(runs)
    try {
      const resp = await fetch(`${API_BASE_URL}/api/v1/mcp-billing/topup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-MCP-Key': apiKey },
        body: JSON.stringify({ runs }),
      })
      const json = await resp.json()
      if (json.checkout_url) {
        window.location.href = json.checkout_url
      }
    } catch {
      // silent
    }
    setTopupLoading(null)
  }

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  if (!apiKey && !loading) {
    return (
      <>
        {authErr && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-lg shadow z-50">
            {authErr}
          </div>
        )}
        <KeyForm onSubmit={handleApiKey} />
      </>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-sm text-gray-500">Loading…</div>
      </div>
    )
  }

  if (!data) return null

  const sub  = data.subscription
  const base = sub.runs_per_period || 0
  const topup = sub.topup_credits || 0
  const used  = sub.runs_used || 0
  const quota = base + topup
  const pct   = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0
  const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-blue-500'
  const isTrial  = sub.status === 'trial'
  const isCancelling = !!sub.cancel_at

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-gray-900">Sweeper Enterprise</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">{data.customer.firm_name}</span>
            <button
              onClick={handleSignOut}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">

        {/* Success banner */}
        {topupSuccess && (
          <div className="bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-3 rounded-lg flex items-center gap-2">
            <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Top-up purchased — runs added to your account. Refresh in a moment to see updated quota.
          </div>
        )}

        {/* Cancellation warning */}
        {isCancelling && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-lg">
            Subscription cancels on {fmtDate(sub.cancel_at)}. MCP services will stop after that date.
          </div>
        )}

        {/* Plan + runs card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-start justify-between mb-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg font-semibold text-gray-900">
                  {PLAN_LABELS[sub.plan] ?? sub.plan}
                </span>
                {isTrial
                  ? <span className="text-xs font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Trial</span>
                  : isCancelling
                    ? <span className="text-xs font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Cancelling</span>
                    : <span className="text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Active</span>
                }
              </div>
              <p className="text-sm text-gray-500">
                {isTrial
                  ? `Trial expires ${fmtDate(sub.period_reset_at)}`
                  : `${sub.interval === 'annual' ? 'Annual' : 'Monthly'} · resets ${fmtDate(sub.period_reset_at)}`
                }
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-gray-900 tabular-nums">{used}</div>
              <div className="text-sm text-gray-400">of {quota} runs used</div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
            <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between text-xs text-gray-400 mb-5">
            <span>{pct}% used</span>
            <div className="flex items-center gap-3">
              {topup > 0 && (
                <span className="text-blue-600 font-medium">+{topup} top-up</span>
              )}
              <span>{quota - used} remaining</span>
            </div>
          </div>

          {/* Top-up section */}
          {!isTrial && (
            <div>
              <div className="text-xs font-medium text-gray-500 mb-2.5 uppercase tracking-wide">Purchase additional runs</div>
              <div className="grid grid-cols-3 gap-3">
                {TOPUP_OPTIONS.map(opt => (
                  <button
                    key={opt.runs}
                    onClick={() => handleTopup(opt.runs)}
                    disabled={!!topupLoading}
                    className="border border-gray-200 rounded-lg p-3 text-left hover:border-blue-300 hover:bg-blue-50 transition-colors disabled:opacity-50"
                  >
                    <div className="text-sm font-semibold text-gray-900">{opt.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{opt.price}</div>
                    <div className="text-xs text-gray-400 mt-1">{TOPUP_SUBTITLE}</div>
                    {topupLoading === opt.runs && (
                      <div className="text-xs text-blue-600 mt-1">Redirecting…</div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* API Keys */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">API Keys</h2>
          <div className="space-y-2">
            {data.api_keys.map(key => (
              <div key={key.id} className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${key.is_active ? 'border-gray-200' : 'border-gray-100 bg-gray-50'}`}>
                <div className={`w-2 h-2 rounded-full shrink-0 ${key.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-gray-800">{key.key_prefix}…</span>
                    <span className="text-xs text-gray-400">{key.label}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {key.last_used_at
                      ? `Last used ${fmtDatetime(key.last_used_at)}`
                      : `Issued ${fmtDate(key.created_at)} · never used`
                    }
                  </div>
                </div>
                <button
                  onClick={() => copyToClipboard(apiKey ?? '', key.id)}
                  className="shrink-0 text-xs text-gray-400 hover:text-gray-700 border border-gray-200 rounded px-2 py-1 transition-colors"
                >
                  {copied === key.id ? <span className="text-green-600">Copied!</span> : 'Copy key'}
                </button>
              </div>
            ))}
          </div>

          <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-100">
            <p className="text-xs text-amber-700">
              Keep your API key secret. Set it as <code className="font-mono bg-amber-100 px-1 rounded">SWEEPER_MCP_KEY</code> in your server's <code className="font-mono bg-amber-100 px-1 rounded">.env</code> file.
              Contact <a href="mailto:service@sweeper-acct.com.au" className="underline">support</a> to rotate a compromised key.
            </p>
          </div>
        </div>

        {/* Account info */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Account</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Firm</span>
              <span className="text-gray-900 font-medium">{data.customer.firm_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Email</span>
              <span className="text-gray-900">{data.customer.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">License type</span>
              <span className="text-gray-900">{data.customer.license_is_free ? 'Free (founding)' : 'Paid'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Issued</span>
              <span className="text-gray-900">{fmtDate(data.customer.license_issued_at)}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 pb-4">
          <a href="https://enterprise.sweeper-acct.com.au" className="hover:text-gray-600">Documentation</a>
          {' · '}
          <a href="mailto:service@sweeper-acct.com.au" className="hover:text-gray-600">Support</a>
          {' · '}
          <span>Sweeper Enterprise — PIN ME PTY LTD ABN 94 635 327 365</span>
        </p>
      </div>
    </div>
  )
}
