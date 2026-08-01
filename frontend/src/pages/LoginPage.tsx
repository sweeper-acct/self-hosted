import { type FormEvent, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { APP_NAME, API_BASE_URL } from '../lib/config'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const RESEND_COOLDOWN   = 60   // seconds
const DEVICE_TRUST_DAYS = 30
const DEVICE_TRUST_KEY  = 'sw_dt'

function isDeviceTrusted(email: string): boolean {
  try {
    const raw = localStorage.getItem(DEVICE_TRUST_KEY)
    if (!raw) return false
    const { em, exp } = JSON.parse(raw) as { em: string; exp: number }
    return em === email && exp > Date.now()
  } catch { return false }
}

function trustDevice(email: string) {
  localStorage.setItem(DEVICE_TRUST_KEY, JSON.stringify({
    em: email,
    exp: Date.now() + DEVICE_TRUST_DAYS * 24 * 60 * 60 * 1000,
  }))
}

function getDefaultHome(role: string): string {
  return role === 'owner' || role === 'admin' ? '/dashboard' : '/conversation'
}

const FEATURES = [
  { heading: 'AI Workforce',         body: 'AI agents handle extraction, GST coding and BAS drafts automatically.' },
  { heading: 'Human Certification',  body: 'Every agent output waits for your team to validate before advancing.' },
  { heading: 'Case Log',             body: 'Tamper-resistant audit trail for every action — 5-year retention, ATO compliant.' },
]

export default function LoginPage() {
  const { session } = useAuth()
  const navigate    = useNavigate()
  const location    = useLocation()
  const fromState = (location.state as { from?: Location })?.from?.pathname

  // Credentials
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)
  const [emailNotFound, setEmailNotFound] = useState(false)

  // Forgot password
  const [resetSent, setResetSent]       = useState(false)
  const [resetCooldown, setResetCooldown] = useState(0)

  // OTP 2FA
  const [showPassword, setShowPassword] = useState(false)
  const [view, setView]               = useState<'credentials' | 'otp'>('credentials')
  const [otpCode, setOtpCode]         = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)
  // Guard: blocks the Navigate during the window between signInWithPassword and signOut
  // to prevent a race where SIGNED_IN event fires before signOut() is called
  const otpFlowRef = useRef(false)

  // Only redirect when session is set AND we're not in the OTP flow
  if (session && !otpFlowRef.current) {
    const role = (session.user.app_metadata?.user_role as string) ?? ''
    return <Navigate to={fromState || getDefaultHome(role)} replace />
  }

  function startResendCooldown() {
    setResendCooldown(RESEND_COOLDOWN)
    const t = setInterval(() => setResendCooldown(c => {
      if (c <= 1) { clearInterval(t); return 0 }
      return c - 1
    }), 1000)
  }

  // ── Forgot password ──────────────────────────────────────────────
  async function handleForgotPassword() {
    if (!email) { setError('Enter your email above, then click Forgot password'); return }
    setError(null)
    // Pre-check email before sending reset — prevents Supabase sending a reset link to an unregistered address
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/users/check-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!data?.data?.exists) {
        setEmailNotFound(true)
        setError('No account found for this email. New firm? Register above.')
        return
      }
    } catch { /* fail open — proceed with reset if check fails */ }
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setResetSent(true)
    setResetCooldown(RESEND_COOLDOWN)
    const t = setInterval(() => setResetCooldown(c => {
      if (c <= 1) { clearInterval(t); return 0 }
      return c - 1
    }), 1000)
  }

  // ── Sign in → check device trust → maybe trigger OTP ────────────
  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const trusted = isDeviceTrusted(email)

    const { data: { session: loginSession }, error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      if (authError.message.toLowerCase().includes('invalid login credentials')) {
        try {
          const res = await fetch(`${API_BASE_URL}/api/v1/users/check-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          })
          const data = await res.json()
          if (!data?.data?.exists) {
            setEmailNotFound(true)
            setError('No account found for this email. New firm? Register above.')
          } else {
            setEmailNotFound(false)
            setError('Incorrect password — try again or use Forgot password.')
          }
        } catch {
          setError(authError.message)
        }
      } else {
        setError(authError.message)
      }
      setLoading(false)
      return
    }

    if (trusted) {
      trustDevice(email)  // refresh 30-day TTL on each trusted login
      const role = (loginSession?.user?.app_metadata?.user_role as string) ?? ''
      navigate(fromState || getDefaultHome(role), { replace: true })
      return  // component unmounts — no need to setLoading(false)
    }

    // Untrusted device: set guard, then run signOut + OTP send in parallel
    otpFlowRef.current = true
    const [, otpResult] = await Promise.all([
      supabase.auth.signOut(),
      supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } }),
    ])
    setLoading(false)

    if (otpResult.error) {
      otpFlowRef.current = false
      setError('Failed to send verification code — please try again')
      return
    }

    startResendCooldown()
    setView('otp')
  }

  // ── Verify OTP ───────────────────────────────────────────────────
  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault()
    if (otpCode.length < 6) { setError('Enter the verification code from your email'); return }
    setError(null)
    setLoading(true)

    const { error: verifyErr } = await supabase.auth.verifyOtp({
      email,
      token: otpCode,
      type: 'email',
    })
    setLoading(false)

    if (verifyErr) {
      setError('Invalid or expired code — try again or request a new one')
      return
    }

    otpFlowRef.current = false
    trustDevice(email)
    const { data: { session: verifiedSession } } = await supabase.auth.getSession()
    const role = (verifiedSession?.user?.app_metadata?.user_role as string) ?? ''
    navigate(fromState || getDefaultHome(role), { replace: true })
  }

  async function handleResend() {
    setError(null)
    await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
    startResendCooldown()
  }

  async function handleBackToSignIn() {
    otpFlowRef.current = false
    await supabase.auth.signOut()
    setOtpCode('')
    setError(null)
    setView('credentials')
  }

  // ── Shared styles ────────────────────────────────────────────────
  const inputCls = 'mt-1.5 block w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-gray-400 focus:outline-none'
  const btnCls   = 'flex w-full justify-center rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:opacity-50'

  return (
    <div className="flex h-screen bg-gray-50">

      {/* Left panel */}
      <div className="hidden w-1/2 flex-col justify-between bg-gray-900 p-12 lg:flex">
        <div>
          <h1 className="text-3xl font-bold text-white">{APP_NAME}</h1>
          <p className="mt-2 text-gray-400">Professional Work Operating System</p>
        </div>
        <div className="space-y-8">
          {FEATURES.map(({ heading, body }) => (
            <div key={heading} className="flex gap-4">
              <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-gray-500" />
              <div>
                <h3 className="font-semibold text-white">{heading}</h3>
                <p className="mt-1 text-sm text-gray-400">{body}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-600">
          Data stored in Australia ·{' '}
          <a href="/faq" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-400">FAQ</a>
          {' '}·{' '}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-400">Privacy Policy</a>
          {' '}·{' '}
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-400">Terms of Service</a>
          {' '}·{' '}
          <a href="/ai-policy" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-400">AI Policy</a>
        </p>
      </div>

      {/* Right panel */}
      <div className="flex flex-1 items-center justify-center px-8">
        <div className="w-full max-w-sm">

          {/* ── Credentials view ─────────────────────────────────── */}
          {view === 'credentials' && (
            <>
              <h2 className="text-2xl font-semibold text-gray-900">Sign in</h2>

              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5">
                  <span className="text-sm text-gray-500">New firm?</span>
                  <Link to="/register" className="ml-auto text-sm font-medium text-gray-900 hover:underline">
                    Register now →
                  </Link>
                </div>
                <p className="px-1 text-xs text-gray-400">
                  Staff member? Sign in with your admin-provided credentials.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
                  <input id="email" type="email" autoComplete="email" required
                    value={email} onChange={e => { setEmail(e.target.value); setEmailNotFound(false); setError(null) }} className={inputCls} />
                </div>
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password</label>
                  <div className="relative">
                    <input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required
                      value={password} onChange={e => setPassword(e.target.value)} className={inputCls} />
                    <button type="button" onClick={() => setShowPassword(v => !v)}
                      className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600">
                      {showPassword ? (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
                {error && <p className={`rounded-lg bg-red-50 px-3.5 py-2.5 text-red-700 ${emailNotFound ? 'text-xs' : 'text-sm'}`}>{error}</p>}
                <button type="submit" disabled={loading} className={btnCls}>
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
                <p className="text-center text-xs text-gray-400">
                  By signing in you agree to our{' '}
                  <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600">Privacy Policy</a>
                  {' '}and{' '}
                  <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600">Terms of Service</a>.
                </p>
                <div className="pt-1 text-center">
                  {resetSent ? (
                    <p className="text-xs text-green-600">
                      Reset link sent — check your email.
                      {resetCooldown > 0 && <span className="text-gray-400"> Resend in {resetCooldown}s</span>}
                    </p>
                  ) : !emailNotFound ? (
                    <button
                      type="button" onClick={handleForgotPassword} disabled={resetCooldown > 0}
                      className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-40"
                    >
                      Forgot password?
                    </button>
                  ) : null}
                </div>
              </form>
            </>
          )}

          {/* ── OTP verification view ────────────────────────────── */}
          {view === 'otp' && (
            <>
              <h2 className="text-2xl font-semibold text-gray-900">Verify it's you</h2>
              <p className="mt-1.5 text-sm text-gray-500">
                We sent a verification code to{' '}
                <strong className="text-gray-700">{email}</strong>.
                This keeps your account secure on new devices.
              </p>

              <form onSubmit={handleVerifyOtp} className="mt-8 space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Verification code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={8}
                    autoComplete="one-time-code"
                    autoFocus
                    value={otpCode}
                    onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    className="mt-1.5 block w-full rounded-lg border border-gray-200 bg-white px-3.5 py-4 text-center text-2xl font-mono tracking-[0.5em] text-gray-900 shadow-sm focus:border-gray-400 focus:outline-none"
                    placeholder="········"
                  />
                </div>
                {error && <p className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
                <button type="submit" disabled={loading || otpCode.length < 6} className={btnCls}>
                  {loading ? 'Verifying…' : 'Verify'}
                </button>
                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button" onClick={handleResend} disabled={resendCooldown > 0}
                    className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-40"
                  >
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                  </button>
                  <button
                    type="button" onClick={handleBackToSignIn}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    ← Back to sign in
                  </button>
                </div>
              </form>

              <p className="mt-6 text-center text-xs text-gray-400">
                Trusted devices won't be asked again for {DEVICE_TRUST_DAYS} days.
              </p>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
