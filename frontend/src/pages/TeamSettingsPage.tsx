import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { MODULE_META, useTeamModules, useSetTeamModule } from '../hooks/useModules'

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$'
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => chars[b % chars.length])
    .join('')
}

interface Team {
  id: string
  name: string
  parent_team_id: string | null
  partner_id: string | null
  default_sla_profile_id: string | null
  approval_chain: {
    senior_review: boolean
    senior_id: string | null
    manager_approve: boolean
    manager_id: string | null
    manager_can_push_xero: boolean
  }
}

interface Member {
  id: string
  name: string
  email: string
  role: string
  status: string
}

const ROLE_CHIP: Record<string, string> = {
  owner:   'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  partner: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200',
  manager: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  senior:  'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
  junior:  'bg-green-50 text-green-700 ring-1 ring-green-200',
  admin:   'bg-gray-100 text-gray-600 ring-1 ring-gray-200',
}

const ROLE_ORDER: Record<string, number> = {
  owner: 0, partner: 1, manager: 2, senior: 3, junior: 4, admin: 5,
}

// ── Member Detail Modal ───────────────────────────────────────────────────────
interface MemberDetailModalProps {
  member: Member
  currentUserId: string
  onClose: () => void
  onUpdated: () => void
}

const ALL_ROLES = ['admin', 'partner', 'manager', 'senior', 'junior'] as const

function MemberDetailModal({ member, currentUserId, onClose, onUpdated }: MemberDetailModalProps) {
  const [editing, setEditing]   = useState(false)
  const [name, setName]         = useState(member.name)
  const [role, setRole]         = useState(member.role)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const isSelf = member.id === currentUserId
  const isOwner = member.role === 'owner'

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await api.patch(`/api/v1/users/${member.id}`, { name: name.trim(), role })
      onUpdated()
      setEditing(false)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleStatus() {
    setSaving(true)
    setError(null)
    try {
      await api.patch(`/api/v1/users/${member.id}`, {
        status: member.status === 'active' ? 'inactive' : 'active',
      })
      onUpdated()
      onClose()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'Failed to update status')
      setConfirming(false)
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-gray-400 focus:outline-none bg-white'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl ring-1 ring-gray-200">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">Member details</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {editing ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700">Full name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Role</label>
                <select value={role} onChange={e => setRole(e.target.value)} className={inputCls}>
                  {ALL_ROLES.map(r => (
                    <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Name</span>
                <span className="font-medium text-gray-900">{member.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Email</span>
                <span className="text-gray-700">{member.email}</span>
              </div>
              <div className="flex justify-between text-sm items-center">
                <span className="text-gray-500">Role</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${ROLE_CHIP[member.role] ?? 'bg-gray-100 text-gray-600'}`}>
                  {member.role}
                </span>
              </div>
              <div className="flex justify-between text-sm items-center">
                <span className="text-gray-500">Status</span>
                <span className={`inline-flex items-center gap-1.5 text-xs ${member.status === 'active' ? 'text-green-600' : 'text-gray-400'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${member.status === 'active' ? 'bg-green-500' : 'bg-gray-300'}`} />
                  {member.status === 'active' ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          )}

          {error && <p className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>}

          {confirming && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
              <p className="font-medium mb-2">
                {member.status === 'active' ? 'Deactivate' : 'Reactivate'} {member.name}?
              </p>
              <p className="text-xs text-amber-700 mb-3">
                {member.status === 'active'
                  ? 'They will no longer be able to sign in.'
                  : 'Their account will be restored.'}
              </p>
              <div className="flex gap-2">
                <button onClick={handleToggleStatus} disabled={saving}
                  className="px-3 py-1.5 text-xs font-medium bg-amber-700 text-white rounded-lg hover:bg-amber-800 disabled:opacity-50">
                  {saving ? 'Saving…' : 'Confirm'}
                </button>
                <button onClick={() => setConfirming(false)}
                  className="px-3 py-1.5 text-xs font-medium text-amber-700 hover:text-amber-900">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
          {/* left: deactivate/reactivate — hidden for self + owner */}
          {!isSelf && !isOwner && !confirming && !editing && (
            <button onClick={() => setConfirming(true)}
              className={`text-xs font-medium ${member.status === 'active' ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'}`}>
              {member.status === 'active' ? 'Deactivate' : 'Reactivate'}
            </button>
          )}
          {(isSelf || isOwner || confirming || editing) && <div />}

          {/* right: edit / save / cancel */}
          <div className="flex gap-2 ml-auto">
            {editing ? (
              <>
                <button onClick={() => { setEditing(false); setName(member.name); setRole(member.role) }}
                  className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900">
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="px-4 py-1.5 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </>
            ) : (
              <>
                <button onClick={onClose}
                  className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900">
                  Close
                </button>
                {!isSelf && !isOwner && (
                  <button onClick={() => setEditing(true)}
                    className="px-4 py-1.5 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700">
                    Edit
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Add Member Modal ──────────────────────────────────────────────────────────
interface AddMemberModalProps {
  teams: Team[]
  defaultTeamId: string
  onClose: () => void
  onCreated: () => void
}

const CREATABLE_ROLES = ['admin', 'partner', 'manager', 'senior', 'junior'] as const
type CreatableRole = typeof CREATABLE_ROLES[number]

function AddMemberModal({ teams, defaultTeamId, onClose, onCreated }: AddMemberModalProps) {
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [role, setRole]         = useState<CreatableRole>('junior')
  const [password, setPassword] = useState(generatePassword)
  const [newTeamName, setNewTeamName] = useState('')
  const [teamId, setTeamId]     = useState(defaultTeamId)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [created, setCreated]   = useState<{ name: string; email: string; role: string; password: string } | null>(null)
  const [copied, setCopied]     = useState(false)
  const pwRef = useRef<HTMLInputElement>(null)

  const isPartner = role === 'partner'
  const isAdmin   = role === 'admin'

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await api.post('/api/v1/users', {
        name:          name.trim(),
        email:         email.trim(),
        role,
        password,
        team_id:       (isPartner || isAdmin) ? null : (teamId || null),
        new_team_name: isPartner ? (newTeamName.trim() || null) : null,
      })
      setCreated({ name: name.trim(), email: email.trim(), role, password })
      onCreated()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'Failed to create user')
    } finally {
      setSaving(false)
    }
  }

  function copyPassword() {
    navigator.clipboard.writeText(password)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const inputCls = 'mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-gray-400 focus:outline-none bg-white'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl ring-1 ring-gray-200">
        {/* header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">
            {created ? 'Member created' : 'Add team member'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">×</button>
        </div>

        {created ? (
          /* ── Success state ─────────────────────────── */
          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-gray-600">
              <strong className="text-gray-900">{created.name}</strong> ({created.role}) has been added.
              Share the temporary password below — they can change it after signing in.
            </p>
            <div className="rounded-lg bg-gray-50 p-4 ring-1 ring-gray-200">
              <p className="text-xs font-medium text-gray-500 mb-1">Email</p>
              <p className="text-sm font-mono text-gray-900 mb-3">{created.email}</p>
              <p className="text-xs font-medium text-gray-500 mb-1">Temporary password</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm font-mono text-gray-900 bg-white px-3 py-2 rounded border border-gray-200 select-all">
                  {created.password}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(created.password)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  }}
                  className={`px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${copied ? 'bg-green-600 text-white' : 'bg-gray-900 text-white hover:bg-gray-700'}`}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          /* ── Form ─────────────────────────────────── */
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Full name</label>
              <input type="text" required value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="e.g. Jane Smith" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <input type="email" required value={email} onChange={e => { setEmail(e.target.value); setError(null) }} className={inputCls} placeholder="jane@firm.com.au" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Role</label>
              <select value={role} onChange={e => setRole(e.target.value as CreatableRole)} className={inputCls}>
                {CREATABLE_ROLES.map(r => (
                  <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                ))}
              </select>
            </div>

            {isPartner ? (
              <div>
                <label className="block text-sm font-medium text-gray-700">New team name</label>
                <input type="text" value={newTeamName} onChange={e => setNewTeamName(e.target.value)}
                  className={inputCls} placeholder="e.g. Smith Partners" />
                <p className="mt-1 text-xs text-gray-400">A new team will be created for this Partner.</p>
              </div>
            ) : isAdmin ? (
              <p className="text-xs text-gray-400">Admin has firm-wide access and is not assigned to a specific team.</p>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700">Assign to team</label>
                <select value={teamId} onChange={e => setTeamId(e.target.value)} className={inputCls}>
                  {teams.map(t => {
                    const parent = t.parent_team_id ? teams.find(p => p.id === t.parent_team_id) : null
                    const label = parent ? `${parent.name} › ${t.name}` : t.name
                    return <option key={t.id} value={t.id}>{label}</option>
                  })}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700">Temporary password</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  ref={pwRef}
                  type="text"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono text-gray-900 focus:border-gray-400 focus:outline-none bg-white"
                />
                <button type="button" onClick={() => setPassword(generatePassword())}
                  className="px-3 py-2 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 whitespace-nowrap">
                  Regenerate
                </button>
                <button type="button" onClick={copyPassword}
                  className={`px-3 py-2 text-xs font-medium border rounded-lg whitespace-nowrap transition-colors ${copied ? 'bg-green-50 border-green-200 text-green-700' : 'border-gray-200 hover:bg-gray-50 text-gray-600'}`}>
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-400">The user must change this after first sign-in.</p>
            </div>

            {error && <p className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>}

            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50">
                {saving ? 'Creating…' : 'Create member'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ── SLA Profile types ─────────────────────────────────────────────────────────

interface SLAProfile {
  id: string
  name: string
  step_sla_days: Record<string, number>
}

const SLA_STEPS: { key: string; label: string }[] = [
  { key: 'validate_extraction', label: 'Validate extraction'   },
  { key: 'validate_gst',        label: 'Validate GST prep'     },
  { key: 'senior_review',       label: 'GST prep review'       },
  { key: 'bas_draft',           label: 'BAS draft (agent)'     },
  { key: 'senior_bas_review',   label: 'BAS draft review'      },
  { key: 'manager_review',      label: 'Manager review'        },
  { key: 'client_confirm',      label: 'Client confirmation'   },
  { key: 'certify',             label: 'Partner certify'       },
]

// ── SLA Profile Modal ─────────────────────────────────────────────────────────

interface SLAModalProps {
  profile: SLAProfile | null  // null = create mode
  onClose: () => void
  onSaved: () => void
}

function SLAProfileModal({ profile, onClose, onSaved }: SLAModalProps) {
  const [name, setName] = useState(profile?.name ?? '')
  const [days, setDays] = useState<Record<string, number>>(() => {
    const defaults: Record<string, number> = {}
    SLA_STEPS.forEach(s => { defaults[s.key] = profile?.step_sla_days?.[s.key] ?? 1 })
    return defaults
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  async function handleSave() {
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true); setError(null)
    try {
      if (profile) {
        await api.put(`/api/v1/sla-profiles/${profile.id}`, { name, step_sla_days: days })
      } else {
        await api.post('/api/v1/sla-profiles', { name, step_sla_days: days })
      }
      onSaved()
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          {profile ? 'Edit SLA profile' : 'New SLA profile'}
        </h2>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Profile name</label>
            <input
              value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Standard 5-day BAS"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-2 block">
              Days per step <span className="text-gray-400 font-normal">(calendar days · 0 = same day)</span>
            </label>
            <div className="rounded-lg ring-1 ring-gray-200 overflow-hidden">
              {SLA_STEPS.map((s, i) => (
                <div key={s.key}
                  className={`flex items-center justify-between px-4 py-2.5 ${i > 0 ? 'border-t border-gray-100' : ''}`}
                >
                  <span className="text-sm text-gray-700">{s.label}</span>
                  <div className="flex items-center gap-2">
                    <button type="button"
                      onClick={() => setDays(d => ({ ...d, [s.key]: Math.max(0, (d[s.key] ?? 1) - 1) }))}
                      className="w-6 h-6 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 text-sm font-medium flex items-center justify-center"
                    >−</button>
                    <span className="w-6 text-center text-sm font-semibold tabular-nums text-gray-900">
                      {days[s.key] ?? 1}
                    </span>
                    <button type="button"
                      onClick={() => setDays(d => ({ ...d, [s.key]: (d[s.key] ?? 1) + 1 }))}
                      className="w-6 h-6 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 text-sm font-medium flex items-center justify-center"
                    >+</button>
                    <span className="text-xs text-gray-400 w-10">
                      {days[s.key] === 0 ? 'same day' : `day ${days[s.key] ?? 1}`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 mt-5">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50">
            {saving ? 'Saving…' : profile ? 'Save changes' : 'Create profile'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Create Group Modal ────────────────────────────────────────────────────────

interface CreateGroupModalProps {
  parentTeamId: string
  parentTeamName: string
  onClose: () => void
  onCreated: () => void
}

function CreateGroupModal({ parentTeamId, parentTeamName, onClose, onCreated }: CreateGroupModalProps) {
  const [name, setName]   = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Group name is required'); return }
    setSaving(true); setError(null)
    try {
      await api.post(`/api/v1/teams/${parentTeamId}/groups`, { name: name.trim() })
      onCreated()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'Failed to create group')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-gray-400 focus:outline-none bg-white'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl ring-1 ring-gray-200">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">New group</h2>
            <p className="text-xs text-gray-400 mt-0.5">Under {parentTeamName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Group name</label>
            <input
              autoFocus
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Corporate Group"
              className={inputCls}
            />
            <p className="mt-1 text-xs text-gray-400">
              Groups have their own Manager, Seniors, and Juniors with a separate approval chain.
            </p>
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50">
              {saving ? 'Creating…' : 'Create group'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Xero Integration Section ──────────────────────────────────────────────────

function XeroSection({ canManage, otherConnected }: { canManage: boolean; otherConnected: string | null }) {
  const qc = useQueryClient()
  const [connecting, setConnecting] = useState(false)

  const statusQ = useQuery({
    queryKey: ['xero-status'],
    queryFn: () => api.get('/api/v1/xero/status').then(r => r.data.data as {
      connected: boolean
      connected_at?: string
      tenants?: { tenantId: string; tenantName: string }[]
      selected_tenant_id?: string | null
      selected_tenant_name?: string | null
      auto_push?: boolean
    }),
  })

  const disconnectMut = useMutation({
    mutationFn: () => api.delete('/api/v1/xero/disconnect'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['xero-status'] }),
  })

  const selectTenantMut = useMutation({
    mutationFn: (t: { tenantId: string; tenantName: string }) =>
      api.patch('/api/v1/xero/select-tenant', { tenant_id: t.tenantId, tenant_name: t.tenantName }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['xero-status'] }),
  })

  const autoPushMut = useMutation({
    mutationFn: (val: boolean) => api.patch('/api/v1/xero/auto-push', { auto_push: val }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['xero-status'] }),
  })

  const status = statusQ.data

  async function handleConnect() {
    setConnecting(true)
    try {
      const res = await api.get('/api/v1/xero/connect')
      window.location.href = res.data.data.auth_url
    } catch {
      setConnecting(false)
    }
  }

  if (statusQ.isLoading) return <p className="text-sm text-gray-400">Loading…</p>

  // Read-only view for Partner role
  if (!canManage) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        {status?.connected ? (
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
            <span className="text-sm font-medium text-gray-800">Connected to Xero</span>
            {status.selected_tenant_name && (
              <span className="text-xs text-gray-500">· {status.selected_tenant_name}</span>
            )}
            <span className="text-xs text-gray-400 ml-auto">
              Auto-push: {status.auto_push ? 'On' : 'Off'}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-gray-300" />
            <span className="text-sm text-gray-500">Not connected</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      {status?.connected ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
              <span className="text-sm font-medium text-gray-800">Connected to Xero</span>
              {status.connected_at && (
                <span className="text-xs text-gray-400">
                  since {new Date(status.connected_at).toLocaleDateString('en-AU')}
                </span>
              )}
            </div>
            <button
              onClick={() => { if (confirm('Disconnect Xero?')) disconnectMut.mutate() }}
              className="text-xs text-red-500 hover:text-red-700"
            >
              Disconnect
            </button>
          </div>

          {/* Tenant selector */}
          {status.tenants && status.tenants.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Xero organisation to use for BAS journals:</p>
              <select
                value={status.selected_tenant_id ?? ''}
                onChange={e => {
                  const t = status.tenants!.find(x => x.tenantId === e.target.value)
                  if (t) selectTenantMut.mutate(t)
                }}
                disabled={selectTenantMut.isPending}
                className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[13px] text-gray-700 focus:border-blue-500 focus:outline-none disabled:opacity-60"
              >
                <option value="">— Select organisation —</option>
                {status.tenants.map(t => (
                  <option key={t.tenantId} value={t.tenantId}>{t.tenantName}</option>
                ))}
              </select>
            </div>
          )}

          {/* Auto-push toggle */}
          {status.selected_tenant_id && (
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-xs text-gray-600">Auto-push to Xero on certify</span>
              <button
                onClick={() => autoPushMut.mutate(!status.auto_push)}
                disabled={autoPushMut.isPending}
                className={`relative inline-flex h-5 w-9 items-center rounded-full overflow-hidden transition-colors disabled:opacity-50 ${
                  status.auto_push ? 'bg-[#13B5EA]' : 'bg-gray-200'
                }`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  status.auto_push ? 'translate-x-4' : 'translate-x-0.5'
                }`} />
              </button>
            </label>
          )}
        </div>
      ) : otherConnected ? (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <span className="inline-block w-2 h-2 rounded-full bg-gray-300 shrink-0" />
          Disconnect {otherConnected} first to connect Xero.
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-700 font-medium">Not connected</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Connect Xero to push BAS journals after certification.
            </p>
          </div>
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="px-3 py-1.5 text-sm font-medium bg-[#13B5EA] text-white rounded-lg hover:bg-[#0fa0d4] disabled:opacity-50"
          >
            {connecting ? 'Redirecting…' : 'Connect Xero'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── QuickBooks Integration Section ────────────────────────────────────────────

function QboSection({ canManage, otherConnected }: { canManage: boolean; otherConnected: string | null }) {
  const qc = useQueryClient()
  const [connecting, setConnecting] = useState(false)

  const statusQ = useQuery({
    queryKey: ['qbo-status'],
    queryFn: () => api.get('/api/v1/qbo/status').then(r => r.data.data as {
      connected: boolean
      connected_at?: string
      company_name?: string
      realm_id?: string
      auto_push?: boolean
    }),
  })

  const disconnectMut = useMutation({
    mutationFn: () => api.delete('/api/v1/qbo/disconnect'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['qbo-status'] }),
  })

  const autoPushMut = useMutation({
    mutationFn: (val: boolean) => api.patch('/api/v1/qbo/auto-push', { auto_push: val }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['qbo-status'] }),
  })

  const status = statusQ.data

  async function handleConnect() {
    setConnecting(true)
    try {
      const res = await api.get('/api/v1/qbo/connect')
      window.location.href = res.data.data.auth_url
    } catch {
      setConnecting(false)
    }
  }

  if (statusQ.isLoading) return <p className="text-sm text-gray-400">Loading…</p>

  // Read-only view for Partner role
  if (!canManage) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        {status?.connected ? (
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
            <span className="text-sm font-medium text-gray-800">Connected to QuickBooks</span>
            {status.company_name && (
              <span className="text-xs text-gray-500">· {status.company_name}</span>
            )}
            <span className="text-xs text-gray-400 ml-auto">
              Auto-push: {status.auto_push ? 'On' : 'Off'}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-gray-300" />
            <span className="text-sm text-gray-500">Not connected</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      {status?.connected ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
              <span className="text-sm font-medium text-gray-800">Connected to QuickBooks</span>
              {status.company_name && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-green-50 text-green-700 ring-1 ring-green-200">
                  {status.company_name}
                </span>
              )}
              {status.connected_at && (
                <span className="text-xs text-gray-400">
                  since {new Date(status.connected_at).toLocaleDateString('en-AU')}
                </span>
              )}
            </div>
            <button
              onClick={() => { if (confirm('Disconnect QuickBooks?')) disconnectMut.mutate() }}
              className="text-xs text-red-500 hover:text-red-700"
            >
              Disconnect
            </button>
          </div>

          {/* Auto-push toggle */}
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-xs text-gray-600">Auto-push to QuickBooks on certify</span>
            <button
              onClick={() => autoPushMut.mutate(!status.auto_push)}
              disabled={autoPushMut.isPending}
              className={`relative inline-flex h-5 w-9 items-center rounded-full overflow-hidden transition-colors disabled:opacity-50 ${
                status.auto_push ? 'bg-[#2CA01C]' : 'bg-gray-200'
              }`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                status.auto_push ? 'translate-x-4' : 'translate-x-0.5'
              }`} />
            </button>
          </label>
        </div>
      ) : otherConnected ? (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <span className="inline-block w-2 h-2 rounded-full bg-gray-300 shrink-0" />
          Disconnect {otherConnected} first to connect QuickBooks.
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-700 font-medium">Not connected</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Connect QuickBooks Online to push BAS journals after certification.
            </p>
          </div>
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="px-3 py-1.5 text-sm font-medium bg-[#2CA01C] text-white rounded-lg hover:bg-[#258918] disabled:opacity-50"
          >
            {connecting ? 'Redirecting…' : 'Connect QuickBooks'}
          </button>
        </div>
      )}
    </div>
  )
}

export default function TeamSettingsPage() {
  const qc = useQueryClient()
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [showCreateGroupForTeam, setShowCreateGroupForTeam] = useState<Team | null>(null)

  const { profile } = useAuth()
  const canManageIntegrations = ['owner', 'admin'].includes(profile?.user_role ?? '')

  // ── integration status (shared — React Query deduplicates with section queries) ──
  const xeroStatusQ = useQuery({
    queryKey: ['xero-status'],
    queryFn: () => api.get('/api/v1/xero/status').then(r => r.data.data as { connected: boolean }),
    staleTime: 30_000,
  })
  const qboStatusQ = useQuery({
    queryKey: ['qbo-status'],
    queryFn: () => api.get('/api/v1/qbo/status').then(r => r.data.data as { connected: boolean }),
    staleTime: 30_000,
  })
  const xeroConnected = xeroStatusQ.data?.connected ?? false
  const qboConnected  = qboStatusQ.data?.connected ?? false

  // ── current user (need team_id before sorting teams) ────────────────
  const meQ = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get('/api/v1/users/me').then(r => r.data.data as { id: string; team_id: string }),
  })
  const currentUserId = meQ.data?.id ?? ''
  const myTeamId      = meQ.data?.team_id ?? ''

  // ── fetch all teams ──────────────────────────────────────────────────
  const teamsQ = useQuery({
    queryKey: ['teams'],
    queryFn: () => api.get('/api/v1/teams').then(r => r.data.data as Team[]),
  })

  // Own team first, then alphabetical
  const teams: Team[] = (teamsQ.data ?? []).slice().sort((a, b) => {
    if (a.id === myTeamId) return -1
    if (b.id === myTeamId) return 1
    return a.name.localeCompare(b.name)
  })

  // Separate top-level teams from groups
  const topTeams = teams.filter(t => !t.parent_team_id)
  const groupsByParent = new Map<string, Team[]>()
  teams.filter(t => t.parent_team_id).forEach(g => {
    const arr = groupsByParent.get(g.parent_team_id!) ?? []
    arr.push(g)
    groupsByParent.set(g.parent_team_id!, arr)
  })

  // Only Partners can create groups, and only under their own team
  function canCreateGroup(parentTeamId: string): boolean {
    return profile?.user_role === 'partner' && parentTeamId === myTeamId
  }

  // Auto-select own team once loaded; fall back to first
  useEffect(() => {
    if (!selectedTeamId && teams.length > 0) {
      const own = teams.find(t => t.id === myTeamId)
      setSelectedTeamId(own ? own.id : teams[0].id)
    }
  }, [teams, selectedTeamId, myTeamId])
  const team = teams.find(t => t.id === selectedTeamId) ?? null
  const parentTeam = team?.parent_team_id ? teams.find(t => t.id === team.parent_team_id) ?? null : null

  // ── fetch members of selected team ──────────────────────────────────
  const membersQ = useQuery({
    queryKey: ['team-members', selectedTeamId],
    queryFn: () =>
      api.get(`/api/v1/teams/${selectedTeamId}/members`).then(r => r.data.data as Member[]),
    enabled: !!selectedTeamId,
  })

  const members: Member[] = (membersQ.data ?? []).slice().sort(
    (a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9),
  )

  const gstReviewers = members.filter(m => ['senior', 'manager'].includes(m.role) && m.status === 'active')
  const managers     = members.filter(m => m.role === 'manager' && m.status === 'active')

  // ── business modules for selected team ──────────────────────────────
  const teamModulesQ = useTeamModules(selectedTeamId ?? undefined)
  const setTeamModuleMut = useSetTeamModule(selectedTeamId ?? '')
  const canManageTeamModules =
    ['owner', 'admin'].includes(profile?.user_role ?? '') ||
    (profile?.user_role === 'partner' && selectedTeamId === myTeamId)

  // ── SLA profiles ─────────────────────────────────────────────────────
  const slaQ = useQuery({
    queryKey: ['sla-profiles'],
    queryFn: () => api.get('/api/v1/sla-profiles').then(r => r.data.data as SLAProfile[]),
  })
  const slaProfiles = slaQ.data ?? []
  const [slaModal, setSlaModal] = useState<'create' | SLAProfile | null>(null)
  const [deletingSlaid, setDeletingSlaid] = useState<string | null>(null)

  async function deleteSlaProfle(id: string) {
    try {
      await api.delete(`/api/v1/sla-profiles/${id}`)
      qc.invalidateQueries({ queryKey: ['sla-profiles'] })
    } catch (e: any) {
      alert(e?.response?.data?.detail ?? 'Delete failed')
    } finally {
      setDeletingSlaid(null)
    }
  }

  async function setTeamDefaultSla(profileId: string | null) {
    if (!selectedTeamId) return
    await api.put(`/api/v1/sla-profiles/teams/${selectedTeamId}/default`, null, {
      params: profileId ? { profile_id: profileId } : {},
    })
    qc.invalidateQueries({ queryKey: ['teams'] })
  }

  // ── approval chain local state ───────────────────────────────────────
  const [chain, setChain] = useState<Team['approval_chain'] | null>(null)
  const [saveMsg, setSaveMsg] = useState('')
  const [saveErr, setSaveErr] = useState('')
  const [showAddMember, setShowAddMember] = useState(false)
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)

  // ── team rename ───────────────────────────────────────────────────────
  const [editingName, setEditingName] = useState(false)
  const [draftName, setDraftName]     = useState('')

  function startRename() {
    setDraftName(team?.name ?? '')
    setEditingName(true)
  }

  const renameMutation = useMutation({
    mutationFn: (name: string) =>
      api.patch(`/api/v1/teams/${selectedTeamId}/name`, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams'] })
      setEditingName(false)
    },
  })

  // Sync local state when team changes
  const effectiveChain = chain ?? team?.approval_chain ?? {
    senior_review: false, senior_id: null,
    manager_approve: false, manager_id: null,
    manager_can_push_xero: false,
  }

  function handleTeamSelect(id: string) {
    setSelectedTeamId(id)
    setChain(null)
    setSaveMsg('')
    setSaveErr('')
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      api.patch(`/api/v1/teams/${selectedTeamId}/approval-chain`, {
        senior_review:          effectiveChain.senior_review,
        senior_id:              effectiveChain.senior_id   || null,
        manager_approve:        effectiveChain.manager_approve,
        manager_id:             effectiveChain.manager_id  || null,
        manager_can_push_xero:  effectiveChain.manager_can_push_xero,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams'] })
      setSaveMsg('Saved')
      setSaveErr('')
      setTimeout(() => setSaveMsg(''), 3000)
    },
    onError: (e: any) => {
      setSaveErr(e?.response?.data?.detail ?? 'Save failed')
    },
  })

  // ── render ───────────────────────────────────────────────────────────
  if (teamsQ.isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-gray-400">
        Loading…
      </div>
    )
  }

  if (teams.length === 0) {
    return (
      <div className="p-8 text-sm text-gray-400">No teams found.</div>
    )
  }

  return (
    <div className="flex h-full min-h-0">

      {/* ── left: team selector ────────────────────────────────────── */}
      <div className="w-56 flex-none border-r border-gray-200 bg-gray-50 p-4 flex flex-col gap-1 overflow-y-auto">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Teams</p>
        {topTeams.map(t => (
          <div key={t.id}>
            {/* top-level partner team */}
            <button
              onClick={() => handleTeamSelect(t.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                t.id === selectedTeamId
                  ? 'bg-white shadow-sm text-gray-900 ring-1 ring-gray-200'
                  : 'text-gray-600 hover:bg-white hover:text-gray-900'
              }`}
            >
              {t.name}
            </button>

            {/* groups under this team */}
            {(groupsByParent.get(t.id) ?? []).map(g => (
              <button
                key={g.id}
                onClick={() => handleTeamSelect(g.id)}
                className={`w-full text-left pl-6 pr-3 py-1.5 rounded-lg text-[13px] transition-colors flex items-center gap-1.5 ${
                  g.id === selectedTeamId
                    ? 'bg-white shadow-sm text-gray-900 ring-1 ring-gray-200 font-medium'
                    : 'text-gray-500 hover:bg-white hover:text-gray-700'
                }`}
              >
                <span className="text-gray-300 text-xs">└</span>
                <span className="truncate">{g.name}</span>
              </button>
            ))}

            {/* + New Group — Partner (own team) or Admin */}
            {canCreateGroup(t.id) && (
              <button
                onClick={() => setShowCreateGroupForTeam(t)}
                className="w-full text-left pl-6 pr-3 py-1.5 text-[12px] text-indigo-500 hover:text-indigo-700 flex items-center gap-1"
              >
                <span>+</span> New group
              </button>
            )}
          </div>
        ))}
      </div>

      {/* ── right: team detail ─────────────────────────────────────── */}
      {team && (
        <div className="flex-1 overflow-y-auto p-8">

          {/* header */}
          <div className="mb-6">
            {parentTeam && (
              <p className="text-xs text-gray-400 mb-1">
                <span className="text-gray-500 font-medium">{parentTeam.name}</span>
                <span className="mx-1">›</span>
                <span>Group</span>
              </p>
            )}
            {editingName ? (
              <form
                onSubmit={e => { e.preventDefault(); if (draftName.trim()) renameMutation.mutate(draftName.trim()) }}
                className="flex items-center gap-2"
              >
                <input
                  autoFocus
                  value={draftName}
                  onChange={e => setDraftName(e.target.value)}
                  className="text-xl font-semibold text-gray-900 border-b-2 border-gray-400 focus:outline-none bg-transparent w-72"
                />
                <button type="submit" disabled={renameMutation.isPending}
                  className="px-3 py-1 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50">
                  {renameMutation.isPending ? 'Saving…' : 'Save'}
                </button>
                <button type="button" onClick={() => setEditingName(false)}
                  className="px-3 py-1 text-xs font-medium text-gray-500 hover:text-gray-900">
                  Cancel
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-gray-900">{team.name}</h1>
                <button onClick={startRename}
                  title="Rename"
                  className="text-gray-400 hover:text-gray-700 text-sm">
                  ✏
                </button>
              </div>
            )}
            <p className="text-sm text-gray-400 mt-0.5">
              {parentTeam ? 'Group configuration and members' : 'Team configuration and members'}
            </p>
          </div>

          {/* ── MEMBERS ──────────────────────────────────────────── */}
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700">Members</h2>
              <button
                onClick={() => setShowAddMember(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                <span className="text-base leading-none">+</span> Add member
              </button>
            </div>

            {membersQ.isLoading ? (
              <p className="text-sm text-gray-400">Loading members…</p>
            ) : members.length === 0 ? (
              <p className="text-sm text-gray-400">No members in this team.</p>
            ) : (
              <div className="bg-white rounded-lg ring-1 ring-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {members.map(m => (
                      <tr key={m.id}
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => setSelectedMember(m)}
                      >
                        <td className="px-4 py-2.5 font-medium text-gray-900 hover:underline">{m.name}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${ROLE_CHIP[m.role] ?? 'bg-gray-100 text-gray-600'}`}>
                            {m.role}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-500">{m.email}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center gap-1.5 text-xs ${m.status === 'active' ? 'text-green-600' : 'text-gray-400'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${m.status === 'active' ? 'bg-green-500' : 'bg-gray-300'}`} />
                            {m.status === 'active' ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ── APPROVAL CHAIN ───────────────────────────────────── */}
          <section>
            <h2 className="text-sm font-semibold text-gray-700 mb-1">Approval chain</h2>
            <p className="text-xs text-gray-400 mb-4">
              Controls which review steps are required before a BAS workpaper can be lodged.
              Changes apply to new cases only — existing cases keep their current task plan.
            </p>

            <div className="bg-white rounded-lg ring-1 ring-gray-200 divide-y divide-gray-100">

              {/* senior review toggle */}
              <div className="px-5 py-4 flex items-start gap-4">
                <button
                  onClick={() => setChain({
                    ...effectiveChain,
                    manager_can_push_xero: effectiveChain.manager_can_push_xero ?? false,
                    senior_review: !effectiveChain.senior_review,
                    senior_id: effectiveChain.senior_review ? null : effectiveChain.senior_id,
                  })}
                  className={`relative flex-none mt-0.5 w-10 h-6 rounded-full overflow-hidden transition-colors ${
                    effectiveChain.senior_review ? 'bg-indigo-600' : 'bg-gray-200'
                  }`}
                >
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                    effectiveChain.senior_review ? 'translate-x-5' : 'translate-x-1'
                  }`} />
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-gray-900">GST prep review</p>
                    {effectiveChain.senior_review && (
                      <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded ring-1 ring-indigo-200">Enabled</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    A designated reviewer must approve the GST workpaper before it advances to BAS draft.
                  </p>

                  {effectiveChain.senior_review && (
                    <div className="mt-3">
                      <label className="text-xs font-medium text-gray-600 mb-1 block">GST reviewer</label>
                      {gstReviewers.length === 0 ? (
                        <p className="text-xs text-amber-600">No eligible reviewers in this team. Add a Senior, Manager, or Partner first.</p>
                      ) : (
                        <select
                          value={effectiveChain.senior_id ?? ''}
                          onChange={e => setChain({ ...effectiveChain, senior_id: e.target.value || null })}
                          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="">— select reviewer —</option>
                          {gstReviewers.map(r => (
                            <option key={r.id} value={r.id}>{r.name} ({r.role})</option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* manager approval toggle */}
              <div className="px-5 py-4 flex items-start gap-4">
                <button
                  onClick={() => setChain({
                    ...effectiveChain,
                    manager_can_push_xero: effectiveChain.manager_can_push_xero ?? false,
                    manager_approve: !effectiveChain.manager_approve,
                    manager_id: effectiveChain.manager_approve ? null : effectiveChain.manager_id,
                  })}
                  className={`relative flex-none mt-0.5 w-10 h-6 rounded-full overflow-hidden transition-colors ${
                    effectiveChain.manager_approve ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                >
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                    effectiveChain.manager_approve ? 'translate-x-5' : 'translate-x-1'
                  }`} />
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-gray-900">Manager BAS approval</p>
                    {effectiveChain.manager_approve && (
                      <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded ring-1 ring-blue-200">Enabled</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    A Manager must approve the BAS draft before it proceeds to client confirmation.
                  </p>

                  {effectiveChain.manager_approve && (
                    <div className="mt-3">
                      <label className="text-xs font-medium text-gray-600 mb-1 block">Assigned Manager</label>
                      {managers.length === 0 ? (
                        <p className="text-xs text-amber-600">No active Managers in this team. Add a Manager member first.</p>
                      ) : (
                        <select
                          value={effectiveChain.manager_id ?? ''}
                          onChange={e => setChain({ ...effectiveChain, manager_id: e.target.value || null })}
                          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">— select Manager —</option>
                          {managers.map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {/* manager can push BAS journals toggle (covers Xero + QBO) */}
              <div className="px-5 py-4 flex items-start gap-4">
                <button
                  onClick={() => setChain({ ...effectiveChain, manager_can_push_xero: !effectiveChain.manager_can_push_xero })}
                  className={`relative flex-none mt-0.5 w-10 h-6 rounded-full overflow-hidden transition-colors ${
                    effectiveChain.manager_can_push_xero ? 'bg-[#13B5EA]' : 'bg-gray-200'
                  }`}
                >
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                    effectiveChain.manager_can_push_xero ? 'translate-x-5' : 'translate-x-1'
                  }`} />
                </button>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-gray-900">Allow Manager to push BAS journals</p>
                    {effectiveChain.manager_can_push_xero && (
                      <span className="text-xs text-[#0fa0d4] bg-[#13B5EA]/10 px-2 py-0.5 rounded ring-1 ring-[#13B5EA]/30">Enabled</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    When enabled, Managers can push certified BAS journals to connected accounting software (Xero or QuickBooks). By default only Partners can push.
                  </p>
                </div>
              </div>

            </div>

            {/* save bar */}
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                {saveMutation.isPending ? 'Saving…' : 'Save approval chain'}
              </button>
              {saveMsg && <span className="text-sm text-green-600">{saveMsg}</span>}
              {saveErr && <span className="text-sm text-red-600">{saveErr}</span>}
            </div>

            <p className="text-xs text-gray-400 mt-3">
              Fixed steps that are always required: <span className="text-gray-600 font-medium">Validate extraction → Validate GST → Client confirmation → Partner certify.</span>
            </p>
          </section>

          {/* ── BUSINESS MODULES ─────────────────────────────────────── */}
          <section className="mt-8">
            <h2 className="text-sm font-semibold text-gray-700 mb-1">Business modules</h2>
            <p className="text-xs text-gray-400 mb-4">
              Select which business lines this team handles. Only modules activated at firm level are available.
              Leave all toggled on to inherit the firm's full module set.
            </p>

            {teamModulesQ.isLoading ? (
              <p className="text-sm text-gray-400">Loading…</p>
            ) : (
              <div className="bg-white rounded-lg ring-1 ring-gray-200 divide-y divide-gray-100">
                {(teamModulesQ.data ?? []).map(m => (
                  <div key={m.module_name} className="px-5 py-3.5 flex items-center gap-4">
                    <button
                      disabled={!canManageTeamModules || setTeamModuleMut.isPending}
                      onClick={() => setTeamModuleMut.mutate({ moduleName: m.module_name, active: !m.active })}
                      className={`relative flex-none w-10 h-6 rounded-full overflow-hidden transition-colors ${
                        m.active ? 'bg-indigo-600' : 'bg-gray-200'
                      } disabled:opacity-40`}
                    >
                      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                        m.active ? 'translate-x-5' : 'translate-x-1'
                      }`} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900">
                          {MODULE_META[m.module_name]?.label ?? m.module_name}
                        </span>
                        {m.inherited && (
                          <span className="text-xs text-gray-400 bg-gray-50 ring-1 ring-gray-200 px-2 py-0.5 rounded">
                            Inherited
                          </span>
                        )}
                        {m.active && !m.inherited && (
                          <span className="text-xs text-indigo-600 bg-indigo-50 ring-1 ring-indigo-200 px-2 py-0.5 rounded">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">
                        {MODULE_META[m.module_name]?.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── SLA PROFILES ─────────────────────────────────────────── */}
          <section className="mt-8">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-semibold text-gray-700">SLA profiles</h2>
              <button
                onClick={() => setSlaModal('create')}
                className="text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
              >
                + New profile
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-4">
              Define turnaround targets for each workflow step. Assign a profile to this team as the default, or override per client on the client detail page.
            </p>

            {slaProfiles.length === 0 ? (
              <p className="text-sm text-gray-400">No SLA profiles yet — create one to set turnaround targets.</p>
            ) : (
              <div className="rounded-lg ring-1 ring-gray-200 overflow-hidden bg-white">
                {slaProfiles.map((p, i) => {
                  const isDefault = team?.default_sla_profile_id === p.id
                  return (
                    <div key={p.id}
                      className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-gray-100' : ''}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">{p.name}</span>
                          {isDefault && (
                            <span className="text-xs bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 px-2 py-0.5 rounded">
                              Team default
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {SLA_STEPS.length} steps configured
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isDefault ? (
                          <button
                            onClick={() => setTeamDefaultSla(null)}
                            className="text-xs text-gray-400 hover:text-gray-700"
                          >Clear default</button>
                        ) : (
                          <button
                            onClick={() => setTeamDefaultSla(p.id)}
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                          >Set as default</button>
                        )}
                        <button
                          onClick={() => setSlaModal(p)}
                          className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 rounded px-2 py-1"
                        >Edit</button>
                        {deletingSlaid === p.id ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => deleteSlaProfle(p.id)}
                              className="text-xs text-red-600 font-medium">Confirm</button>
                            <button onClick={() => setDeletingSlaid(null)}
                              className="text-xs text-gray-400">Cancel</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeletingSlaid(p.id)}
                            className="text-xs text-gray-400 hover:text-red-600"
                          >Delete</button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* ── Xero Integration ─────────────────────────────────── */}
          <section className="mt-8">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Xero Integration</h3>
            <XeroSection canManage={canManageIntegrations} otherConnected={qboConnected ? 'QuickBooks' : null} />
          </section>

          {/* ── QuickBooks Integration ───────────────────────────── */}
          <section className="mt-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">QuickBooks Integration</h3>
            <QboSection canManage={canManageIntegrations} otherConnected={xeroConnected ? 'Xero' : null} />
          </section>

        </div>
      )}

      {showCreateGroupForTeam && (
        <CreateGroupModal
          parentTeamId={showCreateGroupForTeam.id}
          parentTeamName={showCreateGroupForTeam.name}
          onClose={() => setShowCreateGroupForTeam(null)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['teams'] })
            setShowCreateGroupForTeam(null)
          }}
        />
      )}

      {slaModal !== null && (
        <SLAProfileModal
          profile={slaModal === 'create' ? null : slaModal}
          onClose={() => setSlaModal(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['sla-profiles'] })
            setSlaModal(null)
          }}
        />
      )}

      {selectedMember && (
        <MemberDetailModal
          member={selectedMember}
          currentUserId={currentUserId}
          onClose={() => setSelectedMember(null)}
          onUpdated={() => {
            qc.invalidateQueries({ queryKey: ['team-members', selectedTeamId] })
            setSelectedMember(null)
          }}
        />
      )}

      {showAddMember && selectedTeamId && (
        <AddMemberModal
          teams={teams}
          defaultTeamId={selectedTeamId}
          onClose={() => setShowAddMember(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['team-members', selectedTeamId] })
            qc.invalidateQueries({ queryKey: ['teams'] })
          }}
        />
      )}
    </div>
  )
}
