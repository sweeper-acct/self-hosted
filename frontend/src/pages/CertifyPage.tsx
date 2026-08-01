import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

// ── Types ─────────────────────────────────────────────────────────────────────

interface BASFields {
  G1: number; G2: number; G3: number; G4: number; G5: number; '1A': number
  G10: number; G11: number; G12: number; '1B': number; '8A': number
}

interface BASSummary {
  business_name: string
  period: string
  gst_method: string
  fields: BASFields
  transaction_count: number
  flagged_count: number
}

interface CaseTask {
  id: string
  task_type: string
  status: string
}

interface ClientDetail {
  id: string
  business_name: string
  abn: string | null
  entity_type: string
  gst_registered: boolean
  gst_registered_from: string | null
  address: string | null
  engagement_date: string | null
  contact_email: string | null
  status: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TASK_ORDER = [
  'extract', 'validate_extraction', 'gst_prep', 'validate_gst',
  'senior_review', 'bas_draft', 'senior_bas_review', 'manager_review', 'client_confirm', 'certify',
]

const TASK_LABELS: Record<string, string> = {
  extract:             'Extract',
  validate_extraction: 'Validate extraction',
  gst_prep:            'GST coding',
  validate_gst:        'GST prep validate',
  senior_review:       'GST Prep Review',
  bas_draft:           'BAS draft prep',
  senior_bas_review:   'BAS draft review',
  manager_review:      'Manager approval',
  client_confirm:      'Client confirmation',
  certify:             'Certify',
}

// Partner must confirm all three before the Certify button is enabled.
const CERTIFICATION_ITEMS = [
  {
    id: 'accurate',
    text: 'The BAS figures are accurate and complete based on the reviewed source documents.',
  },
  {
    id: 'ready',
    text: 'This BAS is ready for lodgement with the ATO for the period shown above.',
  },
  {
    id: 'flagged',
    text: 'All flagged and AI-coded transactions have been reviewed and the GST treatment is correct.',
  },
] as const

// ── Helpers ───────────────────────────────────────────────────────────────────

const ENTITY_TYPE_LABELS: Record<string, string> = {
  sole_trader: 'Sole Trader', company: 'Company', partnership: 'Partnership',
  trust: 'Trust', other: 'Other', australian_private_company: 'Australian Private Company',
}

function formatABN(abn: string): string {
  const d = abn.replace(/\D/g, '')
  return d.length === 11 ? `${d.slice(0,2)} ${d.slice(2,5)} ${d.slice(5,8)} ${d.slice(8)}` : abn
}

function fmtDate(s: string): string {
  try { return new Date(s).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return s }
}

function fmt(n: number): string {
  return n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function sortedByTaskOrder(tasks: CaseTask[]): CaseTask[] {
  return [...tasks].sort((a, b) => {
    const ai = TASK_ORDER.indexOf(a.task_type)
    const bi = TASK_ORDER.indexOf(b.task_type)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })
}

function StatusDot({ status, isCurrent = false }: { status: string; isCurrent?: boolean }) {
  if (isCurrent) return <span className="inline-block h-2 w-2 flex-shrink-0 rounded-full bg-gray-900" />
  const cls: Record<string, string> = {
    pending:       'border border-gray-300 bg-transparent',
    in_progress:   'bg-blue-400',
    waiting_human: 'bg-amber-400',
    approved:      'bg-green-500',
    validated:     'bg-green-500',
    reviewed:      'bg-green-500',
    confirmed:     'bg-green-500',
    certified:     'bg-green-500',
    complete:      'bg-green-500',
    rejected:      'bg-red-400',
  }
  return <span className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${cls[status] ?? 'border border-gray-300 bg-transparent'}`} />
}

function TaskList({ tasks, currentTaskId, collapsed, onToggle }: {
  tasks: CaseTask[]
  currentTaskId: string
  collapsed: boolean
  onToggle: () => void
}) {
  const sorted = sortedByTaskOrder(tasks)
  const activeIndex = sorted.findIndex((t) => ['in_progress', 'waiting_human'].includes(t.status))
  const _DONE = new Set(['complete', 'approved', 'validated', 'reviewed', 'confirmed', 'certified'])
  return (
    <div className={`flex flex-col ${collapsed ? 'w-10' : 'w-60'} flex-shrink-0 border-r border-gray-200 bg-white transition-all duration-150`}>
      <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-gray-200 px-3">
        {!collapsed && (
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Folder steps</span>
        )}
        <button onClick={onToggle} className="ml-auto text-gray-400 hover:text-gray-600" title={collapsed ? 'Expand' : 'Collapse'}>
          {collapsed ? '›' : '‹'}
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        {sorted.map((t, idx) => {
          const isActiveDot = activeIndex !== -1 ? idx === activeIndex : t.id === currentTaskId
          const isViewing = t.id === currentTaskId
          const effectiveStatus =
            activeIndex !== -1 && idx > activeIndex && _DONE.has(t.status) ? 'pending' : t.status
          return (
            <div key={t.id} className={`flex items-center gap-2.5 px-3 py-2 ${isViewing ? 'bg-blue-50 font-semibold text-gray-900' : 'text-gray-400'}`}>
              <StatusDot status={effectiveStatus} isCurrent={isActiveDot} />
              {!collapsed && (
                <span className="truncate text-sm">{TASK_LABELS[t.task_type] ?? t.task_type}</span>
              )}
            </div>
          )
        })}
      </nav>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FieldRow({ code, label, amount, bold, alwaysShow = false }: {
  code: string; label: string; amount: number; bold?: boolean; alwaysShow?: boolean
}) {
  if (!alwaysShow && amount === 0) return null
  return (
    <div className="flex items-baseline gap-3 py-1.5">
      <span className={`w-10 shrink-0 font-mono text-sm ${bold ? 'font-bold text-gray-700' : 'font-semibold text-gray-400'}`}>{code}</span>
      <span className={`grow text-sm ${bold ? 'font-bold text-gray-900' : 'text-gray-600'}`}>{label}</span>
      <span className={`shrink-0 font-mono text-sm font-normal tabular-nums ${amount < 0 ? 'text-red-600' : 'text-gray-900'}`}>
        {amount < 0 ? `$(${fmt(Math.abs(amount))})` : `$${fmt(amount)}`}
      </span>
    </div>
  )
}

function Divider() {
  return <div className="my-1 border-t border-gray-200" />
}

function SectionTitle({ title }: { title: string }) {
  return <div className="mb-1 mt-4 text-xs font-semibold uppercase tracking-widest text-gray-400">{title}</div>
}

// ── Certify modal ─────────────────────────────────────────────────────────────

function CertifyModal({
  summary,
  partnerEmail,
  onConfirm,
  onClose,
  loading,
}: {
  summary: BASSummary
  partnerEmail: string
  onConfirm: () => void
  onClose: () => void
  loading: boolean
}) {
  const isPayable = summary.fields['8A'] >= 0
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">Certify BAS</h2>
        <p className="mb-4 text-sm text-gray-500">
          {summary.business_name} — {summary.period}
        </p>

        <div className="mb-4 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">1A — GST on sales</span>
            <span className="font-mono">${fmt(summary.fields['1A'])}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">1B — Input tax credits</span>
            <span className="font-mono">${fmt(summary.fields['1B'])}</span>
          </div>
          <Divider />
          <div className="flex justify-between font-semibold">
            <span className={isPayable ? 'text-red-700' : 'text-green-700'}>
              8A — Net GST {isPayable ? 'payable' : 'refundable'}
            </span>
            <span className={`font-mono ${isPayable ? 'text-red-700' : 'text-green-700'}`}>
              ${fmt(Math.abs(summary.fields['8A']))}
            </span>
          </div>
        </div>

        {/* Professional declaration */}
        <div className="mb-5 rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-xs text-indigo-800">
          By clicking Certify, <strong>{partnerEmail}</strong> declares that as the registered
          tax agent, they accept professional responsibility for this Business Activity Statement
          and confirm it is accurate and complete. This action is final and cannot be undone.
          The certified BAS will be archived and locked.
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 py-2 text-sm text-gray-700 hover:bg-gray-50"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            disabled={loading}
          >
            {loading ? 'Certifying…' : 'Certify and archive'}
          </button>
        </div>
      </div>
    </div>
  )
}

function RejectModal({
  reason,
  onReasonChange,
  onConfirm,
  onClose,
  loading,
}: {
  reason: string
  onReasonChange: (v: string) => void
  onConfirm: () => void
  onClose: () => void
  loading: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">Reject and return</h2>
        <p className="mb-4 text-sm text-gray-500">
          The BAS will be returned and the folder put on hold.
        </p>
        <label className="mb-4 block text-sm font-medium text-gray-700">
          Reason <span className="text-red-500">*</span>
          <textarea
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            rows={4}
            placeholder="Describe what needs to be corrected before certification…"
            value={reason}
            onChange={e => onReasonChange(e.target.value)}
          />
        </label>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 py-2 text-sm text-gray-700 hover:bg-gray-50"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            disabled={loading || !reason.trim()}
          >
            {loading ? 'Returning…' : 'Return for revision'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Client Detail panel ───────────────────────────────────────────────────────

function ClientDetailPanel({ client }: { client: ClientDetail | undefined }) {
  function Row({ label, value }: { label: string; value: string }) {
    return (
      <div className="border-b border-gray-100 py-2.5 last:border-0">
        <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
        <p className="break-words text-xs text-gray-800">{value}</p>
      </div>
    )
  }
  if (!client) return <p className="px-4 py-4 text-xs text-gray-400">Loading client details…</p>
  return (
    <div className="px-4 py-3">
      <Row label="Entity name" value={client.business_name} />
      {client.abn && <Row label="ABN" value={formatABN(client.abn)} />}
      <Row label="Entity type" value={ENTITY_TYPE_LABELS[client.entity_type] ?? client.entity_type} />
      {client.gst_registered_from && <Row label="GST registered" value={`From ${fmtDate(client.gst_registered_from)}`} />}
      {client.address && <Row label="Address" value={client.address} />}
      {client.engagement_date && <Row label="Engaged since" value={fmtDate(client.engagement_date)} />}
      {client.contact_email && <Row label="Contact email" value={client.contact_email} />}
      <div className="border-b border-gray-100 py-2.5 last:border-0">
        <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-wider text-gray-400">Status</p>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
          client.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
        }`}>
          <span className={`h-1.5 w-1.5 rounded-full ${client.status === 'open' ? 'bg-green-500' : 'bg-gray-400'}`} />
          {client.status === 'open' ? 'Open' : 'Closed'}
        </span>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CertifyPage() {
  const { taskId } = useParams<{ taskId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const qc = useQueryClient()

  const [pushingXero, setPushingXero] = useState(false)
  const [pushingQbo,  setPushingQbo]  = useState(false)
  const [pushedXero,  setPushedXero]  = useState(false)
  const [pushedQbo,   setPushedQbo]   = useState(false)
  const [pushError,   setPushError]   = useState<string | null>(null)

  const xeroStatusQ = useQuery({
    queryKey: ['xero-status'],
    queryFn: () => api.get('/api/v1/xero/status').then(r => r.data.data as {
      connected: boolean; auto_push?: boolean; selected_tenant_name?: string | null
    }),
    enabled: false, // fetched on demand after certify
  })
  const qboStatusQ = useQuery({
    queryKey: ['qbo-status'],
    queryFn: () => api.get('/api/v1/qbo/status').then(r => r.data.data as {
      connected: boolean; auto_push?: boolean; company_name?: string | null
    }),
    enabled: false,
  })

  const [checked, setChecked] = useState<Record<string, boolean>>({
    accurate: false,
    ready: false,
    flagged: false,
  })
  const [showCertify, setShowCertify] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [certified, setCertified] = useState(false)

  const allChecked = CERTIFICATION_ITEMS.every(item => checked[item.id])

  const { data: summaryData, isLoading, error } = useQuery({
    queryKey: ['bas-summary', taskId],
    queryFn: () => api.get<{ data: { summary: BASSummary; file_id: string } }>(`/api/v1/tasks/${taskId}/bas-summary`).then(r => r.data),
    enabled: !!taskId,
    retry: false,
    throwOnError: false,
  })

  useEffect(() => {
    if (!error) return
    const status = (error as { response?: { status?: number } })?.response?.status
    if (status === 404 || status === 403) navigate('/conversation')
  }, [error, navigate])

  const { data: taskListData } = useQuery({
    queryKey: ['case-tasks-certify', taskId],
    queryFn: async () => {
      const taskRes = await api.get<{ data: { case_id: string } }>(`/api/v1/tasks/${taskId}`).then(r => r.data)
      const caseId = taskRes.data.case_id
      const [tasksRes, caseRes] = await Promise.all([
        api.get<{ data: CaseTask[] }>(`/api/v1/cases/${caseId}/tasks`),
        api.get<{ data: { client_id: string } }>(`/api/v1/cases/${caseId}`),
      ])
      const clientId = caseRes.data.data.client_id
      const clientRes = await api.get<{ data: ClientDetail }>(`/api/v1/clients/${clientId}`)
      return {
        tasks:  tasksRes.data.data,
        client: clientRes.data.data,
        caseId,
      }
    },
    enabled: !!taskId,
  })

  const certifyMut = useMutation({
    mutationFn: () => api.post(`/api/v1/tasks/${taskId}/approve`, { comment: null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bas-summary', taskId] })
      xeroStatusQ.refetch()
      qboStatusQ.refetch()
      setCertified(true)
    },
  })

  async function handlePushXero(caseId: string) {
    setPushingXero(true)
    setPushError(null)
    try {
      await api.post(`/api/v1/xero/cases/${caseId}/push-bas`)
      setPushedXero(true)
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setPushError(detail ?? 'Xero push failed')
    } finally {
      setPushingXero(false)
    }
  }

  async function handlePushQbo(caseId: string) {
    setPushingQbo(true)
    setPushError(null)
    try {
      await api.post(`/api/v1/qbo/cases/${caseId}/push-bas`)
      setPushedQbo(true)
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setPushError(detail ?? 'QuickBooks push failed')
    } finally {
      setPushingQbo(false)
    }
  }

  const [rejectError, setRejectError] = useState<string | null>(null)
  const rejectMut = useMutation({
    mutationFn: () => api.post(`/api/v1/tasks/${taskId}/reject`, { reject_comment: rejectReason }),
    onSuccess: () => navigate('/conversation'),
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed to return task. Please try again.'
      setRejectError(msg)
    },
  })

  function toggleCheck(id: string) {
    setChecked(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const summary: BASSummary | undefined = summaryData?.data?.summary
  const tasks: CaseTask[] = taskListData?.tasks ?? []
  const clientDetail: ClientDetail | undefined = taskListData?.client
  const caseId: string | undefined = taskListData?.caseId
  const isPayable = (summary?.fields['8A'] ?? 0) >= 0

  const xeroStatus = xeroStatusQ.data
  const qboStatus  = qboStatusQ.data
  // Show manual push button when connected but auto_push is OFF (auto_push=true means it already fired on certify)
  const showXeroPush = certified && xeroStatus?.connected && !xeroStatus.auto_push
  const showQboPush  = certified && qboStatus?.connected  && !qboStatus.auto_push
  const showXeroAuto = certified && xeroStatus?.connected && xeroStatus.auto_push
  const showQboAuto  = certified && qboStatus?.connected  && qboStatus.auto_push

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: case task list */}
      <TaskList
        tasks={tasks}
        currentTaskId={taskId ?? ''}
        collapsed={leftCollapsed}
        onToggle={() => setLeftCollapsed(v => !v)}
      />

      {/* Center */}
      <main className="flex flex-1 flex-col overflow-y-auto bg-gray-50 px-8 py-6">
        <div className="mb-4 flex items-center gap-2">
          <h1 className="text-xl font-semibold text-gray-900">Partner certification</h1>
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
            awaiting certification
          </span>
        </div>

        {isLoading && (
          <div className="flex h-40 items-center justify-center text-gray-400 text-sm">
            Loading BAS draft…
          </div>
        )}

        {error && (
          <div className="flex h-40 items-center justify-center text-red-400 text-sm">
            Failed to load BAS draft.
          </div>
        )}

        {summary && (
          <div className="mx-auto w-full max-w-xl">
            {/* Header */}
            <div className="mb-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-gray-900">{summary.business_name}</h2>
              <p className="text-sm text-gray-500">
                Period: {summary.period} · {summary.gst_method} basis · {summary.transaction_count} transactions
              </p>
            </div>

            {/* BAS fields */}
            <div className="mb-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <SectionTitle title="Sales (GST-inclusive)" />
              <FieldRow code="G1" label="Total sales" amount={summary.fields.G1} alwaysShow />
              <FieldRow code="G2" label="Export sales — GST-free" amount={summary.fields.G2} />
              <FieldRow code="G3" label="Other GST-free sales" amount={summary.fields.G3} />
              <FieldRow code="G4" label="Input-taxed sales" amount={summary.fields.G4} />
              <Divider />
              <FieldRow code="G5" label="Taxable sales" amount={summary.fields.G5} bold />
              <FieldRow code="1A" label="GST on sales" amount={summary.fields['1A']} bold alwaysShow />

              <SectionTitle title="Purchases (GST-inclusive)" />
              <FieldRow code="G10" label="Capital purchases" amount={summary.fields.G10} />
              <FieldRow code="G11" label="Non-capital purchases" amount={summary.fields.G11} alwaysShow />
              <Divider />
              <FieldRow code="G12" label="Total purchases" amount={summary.fields.G12} bold />
              <FieldRow code="1B" label="GST credits on purchases" amount={summary.fields['1B']} bold alwaysShow />

              <div className="mt-3 border-t border-gray-200 pt-2">
                <div className="flex items-baseline gap-3 py-1.5 font-semibold">
                  <span className="w-10 shrink-0 font-mono text-xs text-gray-500">8A</span>
                  <span className="grow text-sm text-gray-700">Net GST {isPayable ? 'payable' : 'refundable'}</span>
                  <span className={`shrink-0 font-mono text-base tabular-nums ${isPayable ? 'text-red-600' : 'text-green-600'}`}>
                    ${fmt(Math.abs(summary.fields['8A']))}
                  </span>
                </div>
              </div>
            </div>

            {/* Certification checkboxes */}
            <div className="mb-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-gray-800">
                Certification confirmations
                <span className="ml-2 text-xs font-normal text-gray-400">— all three required</span>
              </h3>

              <div className="space-y-3">
                {CERTIFICATION_ITEMS.map(item => (
                  <label
                    key={item.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors ${
                      checked[item.id]
                        ? 'border-indigo-300 bg-indigo-50'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={!!checked[item.id]}
                      onChange={() => toggleCheck(item.id)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-gray-700">{item.text}</span>
                  </label>
                ))}
              </div>

              {/* Professional declaration */}
              <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-xs text-indigo-700">
                By certifying, <strong>{user?.email}</strong> accepts professional responsibility
                for this BAS as the registered tax agent. The certified file will be archived
                and locked — this action cannot be undone.
              </div>
            </div>

            {/* Gate controls */}
            {certified ? (
              <div className="flex flex-col items-center gap-4 pb-2">
                <div className="flex items-center gap-2 text-sm font-medium text-green-700">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                  BAS certified and archived.
                </div>

                {/* Accounting software push */}
                {(showXeroAuto || showQboAuto || showXeroPush || showQboPush) && (
                  <div className="w-full rounded-xl border border-gray-200 bg-white p-4 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Push to accounting software</p>

                    {showXeroAuto && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <span className="text-green-500">✓</span>
                        Auto-pushed to Xero{xeroStatus?.selected_tenant_name ? ` (${xeroStatus.selected_tenant_name})` : ''}.
                      </div>
                    )}
                    {showQboAuto && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <span className="text-green-500">✓</span>
                        Auto-pushed to QuickBooks{qboStatus?.company_name ? ` (${qboStatus.company_name})` : ''}.
                      </div>
                    )}

                    {showXeroPush && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">
                          {pushedXero ? (
                            <span className="text-green-600 font-medium">✓ Pushed to Xero</span>
                          ) : 'Push BAS journal to Xero'}
                        </span>
                        {!pushedXero && (
                          <button
                            onClick={() => caseId && handlePushXero(caseId)}
                            disabled={pushingXero || !caseId}
                            className="px-4 py-1.5 text-sm font-medium bg-[#13B5EA] text-white rounded-lg hover:bg-[#0fa0d4] disabled:opacity-50"
                          >
                            {pushingXero ? 'Pushing…' : 'Push to Xero'}
                          </button>
                        )}
                      </div>
                    )}

                    {showQboPush && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">
                          {pushedQbo ? (
                            <span className="text-green-600 font-medium">✓ Pushed to QuickBooks</span>
                          ) : 'Push BAS journal to QuickBooks'}
                        </span>
                        {!pushedQbo && (
                          <button
                            onClick={() => caseId && handlePushQbo(caseId)}
                            disabled={pushingQbo || !caseId}
                            className="px-4 py-1.5 text-sm font-medium bg-[#2CA01C] text-white rounded-lg hover:bg-[#258918] disabled:opacity-50"
                          >
                            {pushingQbo ? 'Pushing…' : 'Push to QuickBooks'}
                          </button>
                        )}
                      </div>
                    )}

                    {pushError && (
                      <p className="text-xs text-red-600">{pushError}</p>
                    )}
                  </div>
                )}

                <button
                  onClick={() => navigate('/conversation')}
                  className="text-sm text-gray-500 hover:text-gray-800"
                >
                  Back to Chat
                </button>
              </div>
            ) : (
              <>
                <div className="flex justify-center gap-3 pb-2">
                  <button
                    onClick={() => setShowReject(true)}
                    className="rounded-lg border border-red-300 px-6 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                  >
                    Return for revision
                  </button>
                  <button
                    onClick={() => setShowCertify(true)}
                    disabled={!allChecked || certifyMut.isPending}
                    className="rounded-lg bg-indigo-600 px-6 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {certifyMut.isPending ? 'Certifying…' : 'Certify BAS'}
                  </button>
                </div>
                {!allChecked && (
                  <p className="mt-2 text-center text-xs text-gray-400">
                    Tick all three confirmations above to enable certification.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </main>

      {/* Right: Client Detail + Ask Sweeper */}
      <aside className={`flex ${rightCollapsed ? 'w-10' : 'w-72'} flex-shrink-0 flex-col border-l border-gray-200 bg-white transition-all duration-150`}>
        {rightCollapsed ? (
          <div className="flex flex-1 flex-col items-center pt-3">
            <button onClick={() => setRightCollapsed(false)} className="text-gray-400 hover:text-gray-600" title="Expand">‹</button>
          </div>
        ) : (
          <>
            <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-gray-200 px-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Client Detail</span>
              <button onClick={() => setRightCollapsed(true)} className="text-gray-400 hover:text-gray-600" title="Collapse">›</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <ClientDetailPanel client={clientDetail} />
            </div>
          </>
        )}
      </aside>

      {/* Modals */}
      {showCertify && summary && (
        <CertifyModal
          summary={summary}
          partnerEmail={user?.email ?? ''}
          onConfirm={() => certifyMut.mutate()}
          onClose={() => setShowCertify(false)}
          loading={certifyMut.isPending}
        />
      )}
      {showReject && (
        <>
          {rejectError && (
            <div className="fixed bottom-20 left-1/2 -translate-x-1/2 rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700 shadow-lg z-50">
              {rejectError}
            </div>
          )}
          <RejectModal
            reason={rejectReason}
            onReasonChange={setRejectReason}
            onConfirm={() => { setRejectError(null); rejectMut.mutate() }}
            onClose={() => { setShowReject(false); setRejectError(null) }}
            loading={rejectMut.isPending}
          />
        </>
      )}
    </div>
  )
}
