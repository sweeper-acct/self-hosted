import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

const ROLES = ['junior', 'senior', 'manager', 'partner', 'owner'] as const
type StaffRole = typeof ROLES[number]

function genPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$'
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

interface ExistingTeam { id: string; name: string }

function AddMemberModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName]           = useState('')
  const [email, setEmail]         = useState('')
  const [role, setRole]           = useState<StaffRole>('junior')
  const [password, setPassword]   = useState(genPassword)
  const [createNewTeam, setCreateNewTeam] = useState(true)
  const [newTeamName, setNewTeamName]     = useState('')
  const [existingTeamId, setExistingTeamId] = useState('')
  const [teams, setTeams]         = useState<ExistingTeam[]>([])
  const [saving, setSaving]       = useState(false)
  const [done, setDone]           = useState(false)
  const [createdTeamName, setCreatedTeamName] = useState('')
  const [error, setError]         = useState('')

  // Fetch existing teams when Partner/Owner + assign-existing is chosen
  const needsTeam = role === 'partner' || role === 'owner'
  useState(() => {
    api.get<{ data: ExistingTeam[] }>('/api/v1/teams')
      .then(r => setTeams(r.data.data ?? []))
      .catch(() => {})
  })

  function handleRoleChange(r: StaffRole) {
    setRole(r)
    if (r !== 'partner' && r !== 'owner') { setCreateNewTeam(true); setNewTeamName(''); setExistingTeamId('') }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (needsTeam && createNewTeam && !newTeamName.trim()) {
      setError('Team name is required'); return
    }
    if (needsTeam && !createNewTeam && !existingTeamId) {
      setError('Please select a team'); return
    }
    setSaving(true); setError('')
    try {
      const payload: Record<string, string> = { name, email, password, role }
      if (needsTeam && createNewTeam)   payload.new_team_name = newTeamName.trim()
      if (needsTeam && !createNewTeam)  payload.team_id = existingTeamId
      await api.post('/api/v1/users', payload)
      setCreatedTeamName(createNewTeam ? newTeamName.trim() : '')
      setDone(true)
      onCreated()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? 'Failed to create user'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        {done ? (
          <>
            <h2 className="text-base font-semibold text-gray-900">Account created</h2>
            <p className="mt-1 text-sm text-gray-500">Share these credentials with the new team member.</p>
            <div className="mt-4 space-y-2 rounded-lg bg-gray-50 p-4 text-sm font-mono text-gray-800">
              <div><span className="text-gray-400">Email:    </span>{email}</div>
              <div><span className="text-gray-400">Password: </span>{password}</div>
              {createdTeamName && <div><span className="text-gray-400">New team: </span>{createdTeamName}</div>}
            </div>
            <p className="mt-2 text-xs text-amber-600">⚠ Save this password — it won't be shown again.</p>
            <button
              onClick={onClose}
              className="mt-5 w-full rounded-lg bg-gray-900 py-2 text-sm font-medium text-white hover:bg-gray-700"
            >
              Done
            </button>
          </>
        ) : (
          <>
            <h2 className="text-base font-semibold text-gray-900">Add team member</h2>
            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Full name</label>
                <input
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Jane Smith"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Email</label>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="jane@firm.com.au"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Role</label>
                <select
                  value={role}
                  onChange={e => handleRoleChange(e.target.value as StaffRole)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {ROLES.map(r => (
                    <option key={r} value={r} className="capitalize">{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                  ))}
                </select>
              </div>

              {/* Partner / Owner — team section */}
              {needsTeam && (
                <div className="rounded-lg border border-purple-100 bg-purple-50 p-3 space-y-2">
                  <p className="text-xs font-medium text-purple-700">{role === 'owner' ? 'Owner team' : 'Partner team'}</p>
                  <div className="flex gap-3 text-xs">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" checked={createNewTeam} onChange={() => setCreateNewTeam(true)} className="accent-purple-600" />
                      <span className="text-gray-700">Create new team</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" checked={!createNewTeam} onChange={() => setCreateNewTeam(false)} className="accent-purple-600" />
                      <span className="text-gray-700">Assign to existing team</span>
                    </label>
                  </div>
                  {createNewTeam ? (
                    <input
                      value={newTeamName}
                      onChange={e => setNewTeamName(e.target.value)}
                      placeholder="e.g. Corporate Tax Team"
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                    />
                  ) : (
                    <select
                      value={existingTeamId}
                      onChange={e => setExistingTeamId(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                    >
                      <option value="">Select team…</option>
                      {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  )}
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Initial password</label>
                <div className="flex gap-2">
                  <input
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setPassword(genPassword())}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-500 hover:bg-gray-50"
                  >
                    Regenerate
                  </button>
                </div>
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-lg border border-gray-200 py-2 text-sm text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-lg bg-gray-900 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
                >
                  {saving ? 'Creating…' : 'Create account'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

interface DashboardStats {
  pending_tasks: number
  completed_today: number
  completed_week: number
  completed_month: number
}

interface ClientsSummary {
  total: number
  open: number
  closed: number
}

interface TeamMember {
  id: string
  name: string
  role: string
}

interface CaseRow {
  case_id: string
  client_id: string | null
  client_name: string
  period: string
  current_step: string
  status: string
  days_open: number
  assigned_junior_name: string
  sla_overdue?: boolean
  active_task_type: string
  active_task_status: string
}

interface SLASummary {
  overdue: number
  approaching: number
  on_track: number
}

interface DashboardData {
  stats: DashboardStats
  clients: ClientsSummary
  sla?: SLASummary
  cases: CaseRow[]
  team: TeamMember[]
}

const STEP_LABEL: Record<string, string> = {
  extract:              'Extracting',
  validate_extraction:  'Validate extraction',
  gst_prep:             'GST coding',
  validate_gst:         'Validate GST prep',
  senior_review:        'GST Prep Review',
  senior_bas_review:    'Senior BAS review',
  bas_draft:            'BAS draft',
  manager_review:       'Manager review',
  client_confirm:       'Client confirm',
  certify:              'Certify',
  complete:             'Complete',
}

const ROLE_CHIP: Record<string, string> = {
  owner:   'bg-amber-50 text-amber-700 ring-amber-300',
  partner: 'bg-violet-50 text-violet-700 ring-violet-300',
  manager: 'bg-sky-50 text-sky-700 ring-sky-300',
  senior:  'bg-teal-50 text-teal-700 ring-teal-300',
  junior:  'bg-emerald-50 text-emerald-700 ring-emerald-300',
  admin:   'bg-gray-100 text-gray-500 ring-gray-300',
}


const AGENT_STEPS = new Set(['extract', 'gst_prep', 'bas_draft'])

const STEP_AWAITING: Record<string, string> = {
  validate_extraction: 'Junior',
  validate_gst:        'Junior',
  senior_review:       'Senior',
  senior_bas_review:   'Senior',
  manager_review:      'Manager',
  client_confirm:      'Partner',
  certify:             'Partner',
}

const AWAITING_DOT: Record<string, string> = {
  Junior:  'bg-green-400',
  Senior:  'bg-indigo-400',
  Manager: 'bg-blue-400',
  Partner: 'bg-purple-400',
}

function getCaseStatus(c: CaseRow): { label: string; dot: string } {
  const ts = c.active_task_status
  const tt = c.active_task_type
  if (ts === 'waiting_human') {
    const who = STEP_AWAITING[tt]
    if (who) return { label: `Awaiting ${who}`, dot: AWAITING_DOT[who] ?? 'bg-amber-400' }
    return { label: 'Awaiting action', dot: 'bg-amber-400' }
  }
  if (ts === 'in_progress' && AGENT_STEPS.has(tt)) {
    return { label: 'Agent running', dot: 'bg-blue-400' }
  }
  if (ts === 'in_progress') return { label: 'In progress', dot: 'bg-blue-400' }
  return { label: 'In progress', dot: 'bg-gray-300' }
}

function StatCard({
  label, value, sub, linkLabel, onLink,
}: {
  label: string
  value: number
  sub?: string
  linkLabel?: string
  onLink?: () => void
}) {
  return (
    <div className="flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
        <p className="mt-2 text-3xl font-semibold tabular-nums text-gray-900">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
      </div>
      {linkLabel && onLink && (
        <button
          onClick={onLink}
          className="mt-4 self-start text-xs font-medium text-blue-600 hover:text-blue-700"
        >
          {linkLabel} →
        </button>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const role = profile?.user_role ?? 'junior'
  const isJunior   = role === 'junior'
  const isAdmin    = role === 'admin'
  const isOwner    = role === 'owner'
  const [showAddMember, setShowAddMember] = useState(false)
  const [slaFilter, setSlaFilter] = useState<'overdue' | null>(null)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () =>
      api.get<{ data: DashboardData }>('/api/v1/dashboard').then(r => r.data.data),
    refetchInterval: 60_000,
  })

  const stats   = data?.stats   ?? { pending_tasks: 0, completed_today: 0, completed_week: 0, completed_month: 0 }
  const clients = data?.clients ?? { total: 0, open: 0, closed: 0 }
  const sla     = data?.sla     ?? null
  const cases   = data?.cases   ?? []
  const team    = data?.team    ?? []

  const clientsLabel = isJunior ? 'My Clients' : (isOwner || isAdmin) ? 'Firm Clients' : 'Team Clients'

  // Cases with attention (>7 days open, not complete/archived)
  const allActiveCases = cases.filter(c => c.status !== 'complete' && c.status !== 'archived')
  const activeCases = slaFilter === 'overdue'
    ? allActiveCases.filter(c => c.sla_overdue)
    : allActiveCases

  return (
    <>
    {showAddMember && (
      <AddMemberModal
        onClose={() => setShowAddMember(false)}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ['dashboard'] })}
      />
    )}
    <div className="flex h-full flex-col overflow-auto bg-gray-50">
      {/* Header */}
      <div className="flex h-14 flex-shrink-0 items-center border-b border-gray-200 bg-white px-6">
        <h1 className="text-base font-semibold text-gray-900">Dashboard</h1>
      </div>

      <div className="flex-1 space-y-5 p-6">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center text-sm text-gray-400">Loading…</div>
        ) : (
          <>
            {/* ── Stat cards ─────────────────────────────────────────────── */}
            <div className="grid grid-cols-4 gap-4">
              <StatCard
                label="Today — Pending"
                value={stats.pending_tasks}
                sub={isOwner || isAdmin ? 'Firm-wide tasks awaiting' : 'Tasks waiting for you'}
                linkLabel={isOwner || isAdmin ? undefined : 'View in Chat'}
                onLink={isOwner || isAdmin ? undefined : () => navigate('/conversation')}
              />
              <StatCard
                label="Today — Completed"
                value={stats.completed_today}
                sub="Cases closed today"
              />
              <StatCard
                label="This Week"
                value={stats.completed_week}
                sub="Cases closed"
              />
              <StatCard
                label="This Month"
                value={stats.completed_month}
                sub="Cases closed"
              />
            </div>

            {/* ── Second row ─────────────────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-4">
              {/* My Clients */}
              <div className="flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-5">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    {clientsLabel}
                  </p>
                  <p className="mt-2 text-3xl font-semibold tabular-nums text-gray-900">{clients.total}</p>
                  <div className="mt-3 flex gap-4 text-xs">
                    <span className="text-gray-500">
                      <span className="font-medium text-green-600">{clients.open}</span> open
                    </span>
                    <span className="text-gray-500">
                      <span className="font-medium text-gray-400">{clients.closed}</span> closed
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => navigate('/clients')}
                  className="mt-4 self-start text-xs font-medium text-blue-600 hover:text-blue-700"
                >
                  View all →
                </button>
              </div>

              {/* SLA tracking */}
              <div className="flex flex-col rounded-xl border border-gray-200 bg-white p-5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">SLA Tracking</p>
                {sla === null || (sla.overdue === 0 && sla.approaching === 0 && sla.on_track === 0) ? (
                  <p className="mt-3 text-xs text-gray-400">
                    No active tasks with SLA deadlines.{' '}
                    <button onClick={() => navigate('/settings/team')} className="text-blue-500 hover:underline">
                      Configure SLA profiles →
                    </button>
                  </p>
                ) : (
                  <div className="mt-3 space-y-2.5">
                    <button
                      onClick={() => setSlaFilter(f => f === 'overdue' ? null : 'overdue')}
                      className={`flex w-full items-center justify-between rounded-md px-1.5 py-1 transition-colors ${slaFilter === 'overdue' ? 'bg-red-50 ring-1 ring-red-200' : 'hover:bg-red-50'}`}
                    >
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <span className="h-2 w-2 rounded-full bg-red-400 shrink-0" />
                        Overdue
                        {sla.overdue > 0 && <span className="text-[10px] text-red-400">(click to filter)</span>}
                      </div>
                      <span className="text-sm font-semibold tabular-nums text-red-600">{sla.overdue}</span>
                    </button>
                    <div className="flex items-center justify-between px-1.5">
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" />
                        Due within 48 h
                      </div>
                      <span className="text-sm font-semibold tabular-nums text-amber-600">{sla.approaching}</span>
                    </div>
                    <div className="flex items-center justify-between px-1.5">
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <span className="h-2 w-2 rounded-full bg-green-400 shrink-0" />
                        On track
                      </div>
                      <span className="text-sm font-semibold tabular-nums text-green-600">{sla.on_track}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* My Team */}
              <div className="flex flex-col rounded-xl border border-gray-200 bg-white p-5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">My Team</p>
                {team.length === 0 ? (
                  <p className="mt-3 text-xs text-gray-400">No team members found.</p>
                ) : (
                  <ul className="mt-3 space-y-2 overflow-y-auto" style={{ maxHeight: '11rem' }}>
                    {team.map(member => (
                      <li key={member.id} className="flex items-center justify-between gap-2">
                        <span className={`flex items-center gap-1.5 text-xs font-medium ${member.id === profile?.user_id ? 'text-gray-900' : 'text-gray-600'}`}>
                          {member.id === profile?.user_id && (
                            <span className="h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0" />
                          )}
                          {member.name}
                          {member.id === profile?.user_id && (
                            <span className="text-[10px] text-gray-400">(you)</span>
                          )}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`w-16 text-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset capitalize ${ROLE_CHIP[member.role] ?? 'bg-gray-100 text-gray-500 ring-gray-200'}`}>
                            {member.role}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {(isAdmin || isOwner) && (
                  <button
                    onClick={() => setShowAddMember(true)}
                    className="mt-4 self-start text-xs font-medium text-blue-600 hover:text-blue-700"
                  >
                    + Add member
                  </button>
                )}
              </div>
            </div>

            {/* ── Cases in progress ──────────────────────────────────────── */}
            <div className="rounded-xl border border-gray-200 bg-white">
              <div className="flex h-12 items-center justify-between border-b border-gray-100 px-5">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-gray-700">Cases in Progress</h2>
                  {slaFilter === 'overdue' && (
                    <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600 ring-1 ring-red-200">
                      SLA overdue
                      <button onClick={() => setSlaFilter(null)} className="ml-0.5 hover:text-red-800">✕</button>
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-400">{activeCases.length} active</span>
              </div>

              {activeCases.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-sm text-gray-400">
                  No active cases
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="px-5 py-2.5 text-left font-semibold text-gray-500">Client</th>
                        <th className="px-5 py-2.5 text-left font-semibold text-gray-500">Period</th>
                        <th className="px-5 py-2.5 text-left font-semibold text-gray-500">Current Step</th>
                        {!isJunior && (
                          <th className="px-5 py-2.5 text-left font-semibold text-gray-500">Assigned</th>
                        )}
                        <th className="px-5 py-2.5 text-left font-semibold text-gray-500">Days Open</th>
                        <th className="px-5 py-2.5 text-left font-semibold text-gray-500">Status</th>
                        <th className="px-5 py-2.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeCases.map(c => {
                        const attention = c.days_open >= 7
                        return (
                          <tr
                            key={c.case_id}
                            className={`border-b border-gray-100 last:border-0 ${attention ? 'bg-amber-50' : 'hover:bg-gray-50'}`}
                          >
                            <td className="px-5 py-3 font-medium text-gray-800 max-w-[200px] truncate">
                              {c.client_name || '—'}
                            </td>
                            <td className="px-5 py-3 tabular-nums text-gray-600">{c.period}</td>
                            <td className="px-5 py-3 text-gray-700">
                              {STEP_LABEL[c.current_step] ?? c.current_step}
                            </td>
                            {!isJunior && (
                              <td className="px-5 py-3">
                                {c.assigned_junior_name ? (
                                  <span className="text-gray-500">{c.assigned_junior_name}</span>
                                ) : (
                                  <span className={
                                    ['validate_extraction', 'validate_gst', 'senior_review', 'senior_bas_review'].includes(c.current_step)
                                      ? 'text-amber-600 font-medium'
                                      : 'text-gray-400'
                                  }>—</span>
                                )}
                              </td>
                            )}
                            <td className="px-5 py-3 tabular-nums">
                              <span className={`font-medium ${attention ? 'text-amber-600' : 'text-gray-600'}`}>
                                {c.days_open}d
                                {attention && <span className="ml-1 text-amber-400">⚑</span>}
                              </span>
                            </td>
                            <td className="px-5 py-3">
                              {(() => {
                                const { label, dot } = getCaseStatus(c)
                                return (
                                  <span className="flex items-center gap-1.5">
                                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dot}`} />
                                    <span className="text-gray-600">{label}</span>
                                  </span>
                                )
                              })()}
                            </td>
                            <td className="px-5 py-3">
                              {c.client_id && (
                                <button
                                  onClick={() => navigate(`/clients/${c.client_id}/cases/${c.case_id}`)}
                                  className="text-xs text-blue-600 hover:text-blue-700"
                                >
                                  Open →
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
    </>
  )
}
