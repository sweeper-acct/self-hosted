import { useState, useRef } from 'react'
import { useParams } from 'react-router-dom'

// Public page — no auth, no AppShell. Accessed via magic link /c/:token

const RAW = import.meta.env.VITE_API_BASE_URL as string | undefined
const BASE = RAW?.replace(/\/$/, '') ?? ''

// ── Helpers ───────────────────────────────────────────────────────────────────

function post(path: string, body: FormData): Promise<Response> {
  return fetch(`${BASE}${path}`, { method: 'POST', body })
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—'
  const d = new Date(s)
  return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'long', year: 'numeric' })
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface LinkMeta {
  status: 'active' | 'already_submitted'
  period?: string
  client_name?: string
  entity_type?: string
  gst_method?: string
  expires_at?: string
  submitted_at?: string
}

type Screen = 'password' | 'instructions' | 'submitted'

// ── Components ────────────────────────────────────────────────────────────────

function SweepLogo() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-900 text-xs font-bold text-white">S</div>
      <span className="text-sm font-semibold text-gray-700">Sweeper</span>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ClientConfirmReceivePage() {
  const { token } = useParams<{ token: string }>()

  const [screen, setScreen] = useState<Screen>('password')
  const [password, setPassword] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [meta, setMeta] = useState<LinkMeta | null>(null)

  const [downloading, setDownloading] = useState(false)
  const [pdfDownloaded, setPdfDownloaded] = useState(false)

  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const fileRef = useRef<HTMLInputElement>(null)

  // ── Step 1: verify password ───────────────────────────────────────────────

  async function doVerify() {
    if (!password.trim()) { setPasswordError('Please enter the password.'); return }
    setVerifying(true)
    setPasswordError('')
    try {
      const fd = new FormData()
      fd.append('password', password)
      const res = await post(`/api/v1/confirm/${token}/verify`, fd)
      const json = await res.json()
      if (!res.ok) {
        setPasswordError(json?.detail ?? 'Incorrect password.')
        return
      }
      const linkMeta: LinkMeta = json.data
      setMeta(linkMeta)
      if (linkMeta.status === 'already_submitted') {
        setScreen('submitted')
      } else {
        setScreen('instructions')
      }
    } catch {
      setPasswordError('Network error. Please try again.')
    } finally {
      setVerifying(false)
    }
  }

  // ── Step 2: download PDF ──────────────────────────────────────────────────

  async function downloadPdf() {
    setDownloading(true)
    try {
      const fd = new FormData()
      fd.append('password', password)
      const res = await post(`/api/v1/confirm/${token}/bas.pdf`, fd)
      if (!res.ok) { alert('Failed to download document. Please try again.'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `BAS_Confirmation_${meta?.period ?? ''}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      setPdfDownloaded(true)
    } catch {
      alert('Download failed. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  // ── Step 3: upload signed doc ─────────────────────────────────────────────

  async function uploadSigned() {
    if (!uploadFile) return
    if (uploadFile.size > 50 * 1024 * 1024) {
      setUploadError('File too large. Maximum size is 50 MB.')
      return
    }
    setUploading(true)
    setUploadError('')
    try {
      const fd = new FormData()
      fd.append('password', password)
      fd.append('file', uploadFile)
      const res = await post(`/api/v1/confirm/${token}/upload`, fd)
      const json = await res.json()
      if (!res.ok) {
        setUploadError(json?.detail ?? 'Upload failed. Please try again.')
        return
      }
      setScreen('submitted')
    } catch {
      setUploadError('Network error. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (screen === 'password') {
    return (
      <div className="flex min-h-screen flex-col items-center bg-gray-50 pt-20 px-4">
        <div className="w-full max-w-sm">
          <div className="mb-8"><SweepLogo /></div>
          <div className="rounded-2xl border border-gray-200 bg-white px-8 py-8 shadow-sm">
            <h1 className="mb-1 text-lg font-semibold text-gray-900">BAS Confirmation</h1>
            <p className="mb-6 text-sm text-gray-500">Enter the password provided by your accountant to continue.</p>
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Password</span>
              <input
                type="password"
                autoFocus
                value={password}
                onChange={e => { setPassword(e.target.value); setPasswordError('') }}
                onKeyDown={e => e.key === 'Enter' && doVerify()}
                placeholder="Enter password"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </label>
            {passwordError && <p className="mt-2 text-xs text-red-600">{passwordError}</p>}
            <button
              onClick={doVerify}
              disabled={verifying}
              className="mt-4 w-full rounded-lg bg-gray-900 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {verifying ? 'Verifying…' : 'Continue'}
            </button>
          </div>
          <p className="mt-6 text-center text-xs text-gray-400">
            This link was sent by your accounting firm via Sweeper.
          </p>
        </div>
      </div>
    )
  }

  if (screen === 'submitted') {
    return (
      <div className="flex min-h-screen flex-col items-center bg-gray-50 pt-20 px-4">
        <div className="w-full max-w-sm">
          <div className="mb-8"><SweepLogo /></div>
          <div className="rounded-2xl border border-gray-200 bg-white px-8 py-8 shadow-sm text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <span className="text-2xl">✓</span>
            </div>
            <h1 className="mb-2 text-lg font-semibold text-gray-900">Document received</h1>
            <p className="text-sm text-gray-500">
              Your signed BAS statement has been received by your accounting firm. They will contact you if anything further is required.
            </p>
            {meta?.period && (
              <p className="mt-4 rounded-lg bg-gray-50 px-4 py-2 text-xs text-gray-500">
                Period: <span className="font-medium">{meta.period}</span>
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  // screen === 'instructions'
  return (
    <div className="flex min-h-screen flex-col items-center bg-gray-50 pt-12 px-4 pb-16">
      <div className="w-full max-w-xl">
        <div className="mb-8 flex items-center justify-between">
          <SweepLogo />
          {meta?.expires_at && (
            <p className="text-xs text-gray-400">Link expires {fmtDate(meta.expires_at)}</p>
          )}
        </div>

        {/* Client info */}
        {meta?.client_name && (
          <div className="mb-6 rounded-xl border border-gray-200 bg-white px-6 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Prepared for</p>
            <p className="mt-1 text-base font-semibold text-gray-900">{meta.client_name}</p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
              {meta.entity_type && <span>{meta.entity_type}</span>}
              {meta.period && <span>Period: {meta.period}</span>}
              {meta.gst_method && <span>GST method: {meta.gst_method}</span>}
            </div>
          </div>
        )}

        {/* Steps */}
        <div className="space-y-4">
          {/* Step 1 — Download */}
          <div className="rounded-xl border border-gray-200 bg-white px-6 py-5">
            <div className="flex items-start gap-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-bold text-white">1</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">Download the BAS statement</p>
                <p className="mt-1 text-xs text-gray-500">
                  Download the BAS statement prepared by your accountant, print and sign it.
                </p>
                <button
                  onClick={downloadPdf}
                  disabled={downloading}
                  className={`mt-3 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                    pdfDownloaded
                      ? 'border border-green-300 bg-green-50 text-green-700'
                      : 'bg-gray-900 text-white hover:bg-gray-700'
                  }`}
                >
                  {downloading ? (
                    'Downloading…'
                  ) : pdfDownloaded ? (
                    <>✓ Downloaded — print and sign it</>
                  ) : (
                    <>↓ Download BAS Statement (PDF)</>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Step 2 — Upload signed */}
          <div className={`rounded-xl border bg-white px-6 py-5 transition-opacity ${!pdfDownloaded ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="flex items-start gap-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-bold text-white">2</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">Return the signed document</p>
                <p className="mt-1 text-xs text-gray-500">
                  Take a photo or scan of your signed BAS statement and upload it below. Accepted: PDF, JPG, PNG, HEIC.
                </p>

                {/* File selector */}
                <div className="mt-3">
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.heic"
                    className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0] ?? null
                      setUploadFile(f)
                      setUploadError('')
                    }}
                  />
                  {uploadFile ? (
                    <div className="flex items-center gap-3">
                      <span className="min-w-0 flex-1 truncate rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
                        {uploadFile.name}
                      </span>
                      <button
                        onClick={() => { setUploadFile(null); if (fileRef.current) fileRef.current.value = '' }}
                        className="text-xs text-gray-400 hover:text-red-500"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="rounded-lg border-2 border-dashed border-gray-300 px-6 py-4 text-xs text-gray-400 hover:border-gray-400 hover:text-gray-600 w-full text-center"
                    >
                      Click to choose file
                    </button>
                  )}
                </div>

                {uploadError && <p className="mt-2 text-xs text-red-600">{uploadError}</p>}

                <button
                  onClick={uploadSigned}
                  disabled={!uploadFile || uploading}
                  className="mt-3 rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-40"
                >
                  {uploading ? 'Uploading…' : 'Submit signed document'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-gray-400">
          Questions? Contact your accounting firm directly.
        </p>
      </div>
    </div>
  )
}
