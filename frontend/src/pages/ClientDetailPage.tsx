import { useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { caseTypeLabel } from '../lib/case-types'
import PeriodPicker from '../components/PeriodPicker'

interface Director { id: string; name: string; position: string; email?: string; phone?: string }
interface Client {
  id: string; business_name: string; abn: string; entity_type: string
  industry: string; address: string; bas_cycle: string; gst_method: string
  status: 'open' | 'closed'; activated_at: string | null
  contact_email: string | null; sla_profile_id: string | null
  assigned_junior: string | null; directors: Director[]
}
interface SLAProfile { id: string; name: string }
interface Case {
  id: string; case_type: string; period: string; status: string; current_step: string
  creator: { name: string } | null
  junior: { name: string } | null
}

const STATUS_BADGE: Record<string, string> = {
  open:   'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-500',
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

const CASE_STEP_LABEL: Record<string, string> = {
  extract: 'Upload required', validate_extraction: 'Validate extraction',
  gst_prep: 'GST Prep', validate_gst: 'Validate GST',
  senior_review: 'GST Prep Review', bas_draft: 'BAS Draft',
  manager_review: 'Manager approval', client_confirm: 'Client confirmation',
  certify: 'Certify', complete: 'Complete',
}

const CASE_STATUS_LABEL: Record<string, string> = {
  pending:        'Not started',
  in_progress:    'In progress',
  waiting_human:  'Action required',
  complete:       'Complete',
  archived:       'Complete',
  rejected:       'Returned',
}

const CASE_STATUS_COLOUR: Record<string, string> = {
  pending:        'text-gray-400',
  in_progress:    'text-blue-600',
  waiting_human:  'text-amber-600',
  complete:       'text-green-600',
  archived:       'text-green-600',
  rejected:       'text-red-500',
}

function defaultPeriod() {
  const d = new Date()
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function ClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { profile } = useAuth()
  const canManageStatus = ['partner', 'admin', 'manager'].includes(profile?.user_role ?? '')
  const canManageSla    = ['owner', 'admin', 'partner'].includes(profile?.user_role ?? '')
  const [showNewCase, setShowNewCase] = useState(false)
  const [newPeriod, setNewPeriod] = useState(defaultPeriod)
  const [newType, setNewType] = useState<'bas_gst'>('bas_gst')
  const [newCaseError, setNewCaseError] = useState('')

  const { data: clientData, isLoading } = useQuery({
    queryKey: ['client', clientId],
    queryFn: () =>
      api.get<{ data: Client }>(`/api/v1/clients/${clientId}`).then((r) => r.data.data),
    enabled: !!clientId,
  })

  const { data: casesData } = useQuery({
    queryKey: ['client-cases', clientId],
    queryFn: () =>
      api.get<{ data: Case[] }>(`/api/v1/clients/${clientId}/cases`).then((r) => r.data.data),
    enabled: !!clientId,
  })

  const { data: slaProfiles } = useQuery({
    queryKey: ['sla-profiles'],
    queryFn: () =>
      api.get<{ data: SLAProfile[] }>('/api/v1/sla-profiles').then(r => r.data.data ?? []),
  })

  const updateSla = useMutation({
    mutationFn: (sla_profile_id: string | null) =>
      api.patch(`/api/v1/clients/${clientId}`, { sla_profile_id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['client', clientId] }),
  })

  const updateStatus = useMutation({
    mutationFn: (status: 'open' | 'closed') =>
      api.patch(`/api/v1/clients/${clientId}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['client', clientId] }),
  })

  const createCase = useMutation({
    mutationFn: () =>
      api.post<{ data: Case }>('/api/v1/cases', {
        client_id: clientId,
        case_type: newType,
        period: newPeriod,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['client-cases', clientId] })
      setShowNewCase(false)
      navigate(`/clients/${clientId}/cases/${res.data.data.id}`)
    },
    onError: () => setNewCaseError('Failed to create folder — a folder for this period may already exist'),
  })

  const client = clientData
  const cases = casesData ?? []

  if (isLoading) {
    return <div className="flex h-full items-center justify-center text-sm text-gray-400">Loading…</div>
  }
  if (!client) {
    return <div className="flex h-full items-center justify-center text-sm text-gray-400">Client not found</div>
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <Link to="/clients" className="text-gray-400 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{client.business_name}</h1>
            <p className="text-xs text-gray-400">ABN {client.abn} · <span className="text-gray-300">Ref: {clientId?.slice(0, 8)}</span></p>
          </div>
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[client.status] ?? 'bg-gray-100 text-gray-500'}`}>
            {client.status}
          </span>
        </div>
        <button
          onClick={() => { setShowNewCase(true); setNewCaseError('') }}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Folder
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — client info */}
        <aside className="w-64 flex-shrink-0 overflow-y-auto border-r border-gray-200 bg-white px-5 py-5 space-y-5">
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Details</h3>
            <dl className="space-y-2 text-[13px]">
              <Row label="Entity type" value={client.entity_type} />
              <Row label="Industry" value={client.industry} />
              <Row label="Location" value={client.address} />
              <Row label="BAS cycle" value={{ monthly: 'Monthly', quarterly: 'Quarterly', annual: 'Annual' }[client.bas_cycle] ?? client.bas_cycle} />
              <Row label="GST method" value={client.gst_method === 'cash' ? 'Cash' : 'Accruals'} />
              <Row label="Registered" value={formatDate(client.activated_at)} />
              {client.contact_email && <Row label="Contact email" value={client.contact_email} />}
            </dl>
          </section>

          {slaProfiles && slaProfiles.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">SLA Profile</h3>
              <select
                value={client.sla_profile_id ?? ''}
                onChange={e => updateSla.mutate(e.target.value || null)}
                disabled={updateSla.isPending || !canManageSla}
                className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[13px] text-gray-700 focus:border-blue-500 focus:outline-none disabled:opacity-60"
              >
                <option value="">Team default</option>
                {slaProfiles.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </section>
          )}

          {canManageStatus && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Actions</h3>
              {client.status === 'open' ? (
                <button
                  onClick={() => updateStatus.mutate('closed')}
                  disabled={updateStatus.isPending}
                  className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
                >
                  Deactivate Client
                </button>
              ) : (
                <button
                  onClick={() => updateStatus.mutate('open')}
                  disabled={updateStatus.isPending}
                  className="w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-600 hover:bg-blue-100 disabled:opacity-50"
                >
                  Reopen Client
                </button>
              )}
            </section>
          )}

          {client.directors.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Directors</h3>
              <div className="space-y-2">
                {client.directors.map((d) => (
                  <div key={d.id} className="rounded-lg bg-gray-50 px-3 py-2 text-[13px]">
                    <p className="font-medium text-gray-800">{d.name}</p>
                    <p className="text-gray-500">{d.position}</p>
                    {d.email && <p className="text-gray-400">{d.email}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </aside>

        {/* Main — cases list */}
        <main className="flex-1 overflow-auto px-6 py-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Folders</h2>
            {cases.length > 0 && (
              <Link
                to="/upload"
                className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                Upload statements
              </Link>
            )}
          </div>

          {cases.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-gray-200 text-gray-400">
              <p className="text-sm">No folders yet</p>
              <button
                onClick={() => { setShowNewCase(true); setNewCaseError('') }}
                className="text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                Create a folder to get started →
              </button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-gray-50">
                  <tr>
                    {['Period', 'Type', 'Current step', 'Status', 'Created by'].map((h) => (
                      <th key={h} className="px-4 py-2.5 font-medium text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cases
                    .slice()
                    .sort((a, b) => b.period.localeCompare(a.period))
                    .map((c) => (
                      <tr
                        key={c.id}
                        className="cursor-pointer hover:bg-gray-50"
                        onClick={() => navigate(`/clients/${clientId}/cases/${c.id}`)}
                      >
                        <td className="px-4 py-3 font-mono font-medium text-gray-900">{c.period}</td>
                        <td className="px-4 py-3 text-gray-600">{caseTypeLabel(c.case_type)}</td>
                        <td className="px-4 py-3 text-gray-600">{CASE_STEP_LABEL[c.current_step] ?? c.current_step}</td>
                        <td className="px-4 py-3">
                          <span className={`font-medium ${CASE_STATUS_COLOUR[c.status] ?? 'text-gray-500'}`}>
                            {CASE_STATUS_LABEL[c.status] ?? c.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {c.creator?.name ?? c.junior?.name ?? <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>

      {/* New Case modal */}
      {showNewCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-80 rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-sm font-semibold text-gray-800">New Folder</h2>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Period</label>
                <PeriodPicker value={newPeriod} onChange={setNewPeriod} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Folder type</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as typeof newType)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="bas_gst">BAS / GST</option>
                </select>
              </div>
              {newCaseError && <p className="text-xs text-red-600">{newCaseError}</p>}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowNewCase(false)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => createCase.mutate()}
                disabled={!newPeriod || createCase.isPending}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {createCase.isPending ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-gray-400">{label}</dt>
      <dd className="text-right font-medium text-gray-700">{value || '—'}</dd>
    </div>
  )
}
