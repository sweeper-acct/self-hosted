import { type FormEvent, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { APP_NAME } from '../lib/config'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

type RegStep = 0 | 1 | 2   // 0=account  1=verify email  2=firm details

const STEPS = ['Account', 'Verify email', 'Firm details'] as const
const RESEND_COOLDOWN = 60

export default function RegisterPage() {
  const { session, profile, loading: authLoading } = useAuth()

  const [step, setStep]     = useState<RegStep>(0)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  // Step 0 — account
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')

  // Step 1 — OTP
  const [code, setCode]                       = useState('')
  const [resendCooldown, setResendCooldown]   = useState(0)
  const [pendingToken, setPendingToken]       = useState<string | null>(null)

  // Step 2 — firm details
  const [adminName, setAdminName] = useState('')
  const [firmName, setFirmName]   = useState('')
  const [abn, setAbn]             = useState('')
  const [address, setAddress]     = useState('')

  // If user already has a verified session but no firm yet, skip to Step 3
  useEffect(() => {
    if (!authLoading && session && !profile?.firm_id && step === 0) {
      setEmail(session.user?.email ?? '')
      setStep(2)
    }
  }, [authLoading, session, profile?.firm_id, step])

  // Only redirect once firm setup is complete (firm_id present in JWT)
  if (!authLoading && session && profile?.firm_id) return <Navigate to="/conversation" replace />

  function startResendCooldown() {
    setResendCooldown(RESEND_COOLDOWN)
    const t = setInterval(() => setResendCooldown(c => {
      if (c <= 1) { clearInterval(t); return 0 }
      return c - 1
    }), 1000)
  }

  // ── Step 0: create account + send OTP ───────────────────────────
  async function handleSignUp(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) { setError('Passwords do not match'); return }
    if (password.length < 8)  { setError('Password must be at least 8 characters'); return }

    setLoading(true)

    const { error: signUpErr } = await supabase.auth.signUp({ email, password })
    // "User already registered" is not fatal — still send OTP so email is verified
    if (signUpErr && !signUpErr.message.toLowerCase().includes('already registered')) {
      setError(signUpErr.message)
      setLoading(false)
      return
    }

    const { error: otpErr } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    })
    setLoading(false)
    if (otpErr) { setError(otpErr.message); return }

    startResendCooldown()
    setStep(1)
  }

  // ── Step 1: verify OTP ───────────────────────────────────────────
  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault()
    if (code.length < 6) { setError('Enter the verification code from your email'); return }
    setError(null)
    setLoading(true)

    const { data, error: verifyErr } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'email',
    })
    setLoading(false)

    if (verifyErr) { setError('Invalid or expired code — try again or request a new one'); return }
    if (data.session) setPendingToken(data.session.access_token)
    setStep(2)
  }

  async function handleResend() {
    setError(null)
    await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
    startResendCooldown()
  }

  // ── Step 2: create firm ──────────────────────────────────────────
  async function handleCreateFirm(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const token = pendingToken ?? (await supabase.auth.getSession()).data.session?.access_token
    if (!token) { setError('Session expired — please sign up again'); return }

    setLoading(true)
    try {
      await api.post(
        '/api/v1/firms',
        { firm_name: firmName.trim(), abn: abn.trim(), address: address.trim(), admin_name: adminName.trim() },
        { headers: { Authorization: `Bearer ${token}` } },
      )
      // Refresh JWT so custom_access_token_hook injects firm_id.
      // onAuthStateChange fires → _loadProfile updates profile.firm_id
      // → the redirect guard at the top of this component navigates to /conversation.
      await supabase.auth.refreshSession()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg ?? 'Registration failed — please try again')
    } finally {
      setLoading(false)
    }
  }

  // ── Shared UI helpers ────────────────────────────────────────────
  const inputCls = 'mt-1.5 block w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm focus:border-gray-400 focus:outline-none'
  const btnCls   = 'flex w-full justify-center rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors'

  return (
    <div className="flex h-screen bg-gray-50">

      {/* Left panel */}
      <div className="hidden w-1/2 flex-col justify-between bg-gray-900 p-12 lg:flex">
        <div>
          <h1 className="text-3xl font-bold text-white">{APP_NAME}</h1>
          <p className="mt-2 text-gray-400">Professional Work Operating System</p>
        </div>
        <div className="space-y-8">
          {[
            { title: 'Register your firm', body: 'Create your account and firm profile in under two minutes.' },
            { title: 'Add your team', body: 'Invite Partners, Managers, Seniors and Juniors — each gets role-appropriate access.' },
            { title: 'Start processing', body: 'Upload bank statements, let AI handle GST coding, and certify BAS workpapers with a full audit trail.' },
          ].map(({ title, body }) => (
            <div key={title} className="flex gap-4">
              <span className="mt-1.5 flex-none h-1.5 w-1.5 rounded-full bg-gray-500" />
              <div>
                <h3 className="font-semibold text-white">{title}</h3>
                <p className="mt-1 text-sm text-gray-400">{body}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-600">
          Data stored in Australia ·{' '}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-400">Privacy Policy</a>
          {' '}·{' '}
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-400">Terms of Service</a>
        </p>
      </div>

      {/* Right panel */}
      <div className="flex flex-1 items-center justify-center overflow-y-auto px-8 py-12">
        <div className="w-full max-w-sm">

          {/* Step indicator */}
          <div className="mb-8 flex items-center gap-2">
            {STEPS.map((label, i) => (
              <div key={label} className="flex items-center gap-2">
                <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                  i < step  ? 'bg-gray-900 text-white' :
                  i === step ? 'bg-gray-900 text-white' :
                  'bg-gray-200 text-gray-500'
                }`}>
                  {i < step ? '✓' : i + 1}
                </div>
                <span className={`text-sm ${i === step ? 'font-medium text-gray-900' : 'text-gray-400'}`}>
                  {label}
                </span>
                {i < STEPS.length - 1 && <span className="mx-1 text-gray-300">›</span>}
              </div>
            ))}
          </div>

          {/* ── Step 0: account ─────────────────────────────────── */}
          {step === 0 && (
            <>
              <h2 className="text-2xl font-semibold text-gray-900">Create your account</h2>
              <p className="mt-1.5 text-sm text-gray-500">
                Already registered?{' '}
                <Link to="/login" className="font-medium text-gray-700 hover:underline">Sign in</Link>
              </p>
              <form onSubmit={handleSignUp} className="mt-8 space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <input type="email" required autoComplete="email"
                    value={email} onChange={e => setEmail(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Password</label>
                  <input type="password" required autoComplete="new-password"
                    value={password} onChange={e => setPassword(e.target.value)} className={inputCls} />
                  <p className="mt-1 text-xs text-gray-400">Minimum 8 characters</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Confirm password</label>
                  <input type="password" required autoComplete="new-password"
                    value={confirm} onChange={e => setConfirm(e.target.value)} className={inputCls} />
                </div>
                {error && <p className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
                <button type="submit" disabled={loading} className={btnCls}>
                  {loading ? 'Sending code…' : 'Continue'}
                </button>
              </form>
            </>
          )}

          {/* ── Step 1: verify OTP ──────────────────────────────── */}
          {step === 1 && (
            <>
              <button
                type="button"
                onClick={() => { setStep(0); setCode(''); setError(null) }}
                className="mb-4 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
              >
                ← Back
              </button>
              <h2 className="text-2xl font-semibold text-gray-900">Verify your email</h2>
              <p className="mt-1.5 text-sm text-gray-500">
                We sent a verification code to{' '}
                <strong className="text-gray-700">{email}</strong>. Check your inbox.
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
                    value={code}
                    onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    className="mt-1.5 block w-full rounded-lg border border-gray-200 bg-white px-3.5 py-4 text-center text-2xl font-mono tracking-[0.5em] text-gray-900 shadow-sm focus:border-gray-400 focus:outline-none"
                    placeholder="········"
                  />
                </div>
                {error && <p className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
                <button type="submit" disabled={loading || code.length < 6} className={btnCls}>
                  {loading ? 'Verifying…' : 'Verify'}
                </button>
                <div className="text-center">
                  <button
                    type="button" onClick={handleResend} disabled={resendCooldown > 0}
                    className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-40"
                  >
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                  </button>
                </div>
              </form>
            </>
          )}

          {/* ── Step 2: firm details ─────────────────────────────── */}
          {step === 2 && (
            <>
              <button
                type="button"
                onClick={async () => { await supabase.auth.signOut(); setStep(0); setCode(''); setError(null) }}
                className="mb-4 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
              >
                ← Start over
              </button>
              <h2 className="text-2xl font-semibold text-gray-900">Firm details</h2>
              <p className="mt-1.5 text-sm text-gray-500">Tell us about your accounting firm.</p>
              <form onSubmit={handleCreateFirm} className="mt-8 space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Your full name</label>
                  <input type="text" required placeholder="e.g. Anna Chen"
                    value={adminName} onChange={e => setAdminName(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Firm name</label>
                  <input type="text" required placeholder="e.g. Alpha Accounting Pty Ltd"
                    value={firmName} onChange={e => setFirmName(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">ABN</label>
                  <input type="text" required placeholder="e.g. 51 824 753 556"
                    value={abn} onChange={e => setAbn(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Business address</label>
                  <input type="text" required placeholder="e.g. Level 5, 123 Collins St, Melbourne VIC 3000"
                    value={address} onChange={e => setAddress(e.target.value)} className={inputCls} />
                </div>
                {error && <p className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
                <button type="submit" disabled={loading} className={btnCls}>
                  {loading ? 'Setting up your firm…' : 'Complete registration'}
                </button>
                <p className="text-center text-xs text-gray-400">
                  By registering you agree to our{' '}
                  <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600">Privacy Policy</a>
                  {' '}and{' '}
                  <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600">Terms of Service</a>.
                </p>
              </form>
              <p className="mt-4 text-center text-xs text-gray-400">
                You can add team members and configure approval chains after registration.
              </p>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
