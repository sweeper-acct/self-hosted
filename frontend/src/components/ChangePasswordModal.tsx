import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [pw, setPw]           = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving]   = useState(false)
  const [done, setDone]       = useState(false)
  const [error, setError]     = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (pw !== confirm) { setError('Passwords do not match'); return }
    if (pw.length < 8)  { setError('Password must be at least 8 characters'); return }
    setSaving(true); setError('')
    const { error: err } = await supabase.auth.updateUser({ password: pw })
    setSaving(false)
    if (err) { setError(err.message); return }
    setDone(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        {done ? (
          <>
            <p className="text-sm font-medium text-green-700">Password updated successfully.</p>
            <button
              onClick={onClose}
              className="mt-4 w-full rounded-lg bg-gray-900 py-2 text-sm font-medium text-white hover:bg-gray-700"
            >
              Close
            </button>
          </>
        ) : (
          <>
            <h2 className="text-base font-semibold text-gray-900">Change password</h2>
            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">New password</label>
                <input
                  required type="password" value={pw} onChange={e => setPw(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Min. 8 characters"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Confirm password</label>
                <input
                  required type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Repeat new password"
                />
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <div className="flex gap-3 pt-1">
                <button
                  type="button" onClick={onClose}
                  className="flex-1 rounded-lg border border-gray-200 py-2 text-sm text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit" disabled={saving}
                  className="flex-1 rounded-lg bg-gray-900 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Update password'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
