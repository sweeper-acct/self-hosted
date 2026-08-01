import { type FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { APP_NAME } from '../lib/config'
import { supabase } from '../lib/supabase'

export default function ResetPasswordPage() {
  const navigate = useNavigate()

  const [ready, setReady] = useState(false)   // recovery session established
  const [invalid, setInvalid] = useState(false)
  const [pw, setPw]           = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone]       = useState(false)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    // Detect Supabase error hash (expired / already-used token)
    const hash = window.location.hash
    if (hash.includes('error=')) {
      setInvalid(true)
      return
    }

    // Supabase fires PASSWORD_RECOVERY when the page loads with a valid recovery hash.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setReady(true)
      }
    })

    // Fallback: if there's already an active session
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true)
    })

    // If no recovery event fires within 5s, the link is invalid/expired
    const timer = setTimeout(() => {
      setReady(r => { if (!r) setInvalid(true); return r })
    }, 5000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timer)
    }
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (pw !== confirm) { setError('Passwords do not match'); return }
    if (pw.length < 8)  { setError('Password must be at least 8 characters'); return }
    setError(null)
    setLoading(true)
    const { error: err } = await supabase.auth.updateUser({ password: pw })
    setLoading(false)
    if (err) { setError(err.message); return }
    setDone(true)
    setTimeout(() => navigate('/conversation', { replace: true }), 2000)
  }

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
            { title: 'Secure by design', body: 'Passwords are hashed and never stored in plain text.' },
            { title: 'Session protected', body: 'Reset links are single-use and expire after 24 hours.' },
            { title: 'Audit trail', body: 'Every password change is recorded in the immutable case log.' },
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
      <div className="flex flex-1 items-center justify-center px-8">
        <div className="w-full max-w-sm">

          {done ? (
            <>
              <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-700 text-2xl">✓</div>
              <h2 className="text-2xl font-semibold text-gray-900">Password updated</h2>
              <p className="mt-2 text-sm text-gray-500">Redirecting you to the app…</p>
            </>
          ) : invalid ? (
            <>
              <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600 text-2xl">✕</div>
              <h2 className="text-2xl font-semibold text-gray-900">Link expired</h2>
              <p className="mt-2 text-sm text-gray-500">
                This password reset link has expired or already been used.
                Please request a new one from the sign-in page.
              </p>
              <button
                onClick={() => navigate('/login')}
                className="mt-6 w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700"
              >
                Back to sign in
              </button>
            </>
          ) : !ready ? (
            <>
              <h2 className="text-2xl font-semibold text-gray-900">Verifying link…</h2>
              <p className="mt-2 text-sm text-gray-500">Please wait a moment.</p>
              <div className="mt-6 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div className="h-full w-1/3 animate-pulse rounded-full bg-gray-400" />
              </div>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-semibold text-gray-900">Set new password</h2>
              <p className="mt-1.5 text-sm text-gray-500">Choose a strong password for your account.</p>

              <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700">New password</label>
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    value={pw}
                    onChange={e => setPw(e.target.value)}
                    className="mt-1.5 block w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm focus:border-gray-400 focus:outline-none"
                    placeholder="Min. 8 characters"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Confirm password</label>
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    className="mt-1.5 block w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm focus:border-gray-400 focus:outline-none"
                    placeholder="Repeat new password"
                  />
                </div>

                {error && (
                  <p className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 flex w-full justify-center rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Updating…' : 'Update password'}
                </button>
              </form>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
