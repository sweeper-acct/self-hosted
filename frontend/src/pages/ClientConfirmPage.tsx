import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

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

interface CaseTask { id: string; task_type: string; status: string }

interface ClientDetail {
  id: string; business_name: string; abn: string | null
  entity_type: string; gst_registered: boolean | null
  gst_registered_from: string | null; address: string | null
  engagement_date: string | null; contact_email: string | null; status: string
}

interface TransactionRow {
  date: string; detail: string; payee?: string; payer?: string
  money_out?: string; money_in?: string; balance?: string
  gst_code?: string; category?: string; review_status?: string
  bas_participation?: string; note?: string; explanation?: string
  signed_amount?: string
}

type TabId = 'bas-summary' | 'bank' | 'income' | 'expense' | 'exclude' | 'note'

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

const _EXCL_GST_CODES = new Set(['BAS_EXCLUDED', 'N-T'])

const ENTITY_TYPE_LABELS: Record<string, string> = {
  sole_trader: 'Sole Trader', company: 'Company', partnership: 'Partnership',
  trust: 'Trust', other: 'Other', australian_private_company: 'Australian Private Company',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatABN(abn: string): string {
  const d = abn.replace(/\D/g, '')
  return d.length === 11 ? `${d.slice(0,2)} ${d.slice(2,5)} ${d.slice(5,8)} ${d.slice(8)}` : abn
}

function fmtDate(s: string): string {
  try { return new Date(s).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return s }
}

function fmtAmt(s: string | undefined): string {
  if (!s) return ''
  const n = parseFloat(s)
  return isNaN(n) ? s : n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function isExcluded(row: TransactionRow): boolean {
  if (row.bas_participation != null) return row.bas_participation === 'excluded'
  return _EXCL_GST_CODES.has(row.gst_code ?? '')
}

function getRowSheet(row: TransactionRow): 'income' | 'expense' | 'exclude' {
  if (isExcluded(row)) return 'exclude'
  const amt = parseFloat(row.signed_amount ?? '')
  if (!isNaN(amt)) return amt >= 0 ? 'income' : 'expense'
  if (row.money_in && parseFloat(row.money_in) > 0) return 'income'
  return 'expense'
}

function gstAmt(row: TransactionRow): string {
  const GST_CODES = new Set(['GST_STANDARD', 'CAPITAL_GST', 'G1', 'G10', 'G11'])
  if (!GST_CODES.has(row.gst_code ?? '')) return '—'
  const base = parseFloat(row.signed_amount ?? '') || parseFloat(row.money_out ?? '') || parseFloat(row.money_in ?? '') || 0
  return `$${fmt(Math.abs(base) / 11)}`
}

function sortedByTaskOrder(tasks: CaseTask[]): CaseTask[] {
  return [...tasks].sort((a, b) => {
    const ai = TASK_ORDER.indexOf(a.task_type)
    const bi = TASK_ORDER.indexOf(b.task_type)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })
}

// ── StatusDot ─────────────────────────────────────────────────────────────────

function StatusDot({ status, isCurrent = false }: { status: string; isCurrent?: boolean }) {
  if (isCurrent) return <span className="inline-block h-2 w-2 flex-shrink-0 rounded-full bg-gray-900" />
  const cls: Record<string, string> = {
    pending:       'border border-gray-300 bg-transparent',
    in_progress:   'bg-blue-400',
    waiting_human: 'bg-amber-400',
    approved: 'bg-green-500', validated: 'bg-green-500', reviewed: 'bg-green-500',
    confirmed: 'bg-green-500', certified: 'bg-green-500', complete: 'bg-green-500',
    rejected: 'bg-red-400',
  }
  return <span className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${cls[status] ?? 'border border-gray-300 bg-transparent'}`} />
}

// ── Folder Steps (left panel) ─────────────────────────────────────────────────

function TaskList({ tasks, currentTaskId, collapsed, onToggle }: {
  tasks: CaseTask[]; currentTaskId: string; collapsed: boolean; onToggle: () => void
}) {
  const sorted = sortedByTaskOrder(tasks)
  const activeIndex = sorted.findIndex((t) => ['in_progress', 'waiting_human'].includes(t.status))
  const _DONE = new Set(['complete', 'approved', 'validated', 'reviewed', 'confirmed', 'certified'])
  return (
    <div className={`flex flex-col ${collapsed ? 'w-10' : 'w-60'} flex-shrink-0 border-r border-gray-200 bg-white transition-all duration-150`}>
      <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-gray-200 px-3">
        {!collapsed && <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Folder steps</span>}
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
              {!collapsed && <span className="truncate text-sm">{TASK_LABELS[t.task_type] ?? t.task_type}</span>}
            </div>
          )
        })}
      </nav>
    </div>
  )
}

// ── BAS Summary fields ────────────────────────────────────────────────────────

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

// ── Transaction table (read-only) ─────────────────────────────────────────────

function TransactionTable({ rows }: { rows: TransactionRow[] }) {
  if (rows.length === 0) {
    return <div className="flex h-32 items-center justify-center text-sm text-gray-400">No transactions in this view.</div>
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-xs">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="sticky top-0 left-0 z-20 px-3 py-2 font-semibold text-gray-500 bg-gray-50 border-b border-gray-200 whitespace-nowrap">Date</th>
            <th className="sticky top-0 left-16 z-20 px-3 py-2 font-semibold text-gray-500 bg-gray-50 border-b border-gray-200">Merchant</th>
            <th className="sticky top-0 z-10 px-3 py-2 font-semibold text-gray-500 bg-gray-50 border-b border-gray-200 max-w-[220px]">Description</th>
            <th className="sticky top-0 z-10 px-3 py-2 font-semibold text-gray-500 bg-gray-50 border-b border-gray-200 text-right">Amount</th>
            <th className="sticky top-0 z-10 px-3 py-2 font-semibold text-gray-500 bg-gray-50 border-b border-gray-200 text-right">GST Amt (Est.)</th>
            <th className="sticky top-0 z-10 px-3 py-2 font-semibold text-gray-500 bg-gray-50 border-b border-gray-200">GST Code</th>
            <th className="sticky top-0 z-10 px-3 py-2 font-semibold text-gray-500 bg-gray-50 border-b border-gray-200">Category</th>
            <th className="sticky top-0 z-10 px-3 py-2 font-semibold text-gray-500 bg-gray-50 border-b border-gray-200">Status</th>
            <th className="sticky top-0 z-10 px-3 py-2 font-semibold text-gray-500 bg-gray-50 border-b border-gray-200">Note</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row, i) => {
            const excl = isExcluded(row)
            const isReview = row.review_status === 'Review Required'
            const bgCls = excl ? 'bg-gray-50' : isReview ? 'bg-amber-50' : ''
            const out = row.money_out ? parseFloat(row.money_out) : 0
            const inn = row.money_in  ? parseFloat(row.money_in)  : 0
            const hasOut = out > 0
            const hasIn  = inn > 0
            const merchant = (hasOut ? row.payee : row.payer) ?? ''
            return (
              <tr key={i} className={`hover:bg-blue-50 ${bgCls}`}>
                <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap sticky left-0 bg-inherit">{row.date}</td>
                <td className="px-3 py-1.5 font-medium text-gray-800 max-w-[150px] truncate sticky left-16 bg-inherit" title={merchant}>
                  {merchant || '—'}
                </td>
                <td className="px-3 py-1.5 text-gray-500 max-w-[220px] truncate" title={row.detail}>{row.detail}</td>
                <td className={`px-3 py-1.5 text-right font-mono tabular-nums whitespace-nowrap ${hasOut ? 'text-red-600' : 'text-green-700'}`}>
                  {hasOut ? `$${fmtAmt(row.money_out)}` : hasIn ? `$${fmtAmt(row.money_in)}` : '—'}
                </td>
                <td className="px-3 py-1.5 text-right text-gray-400 font-mono whitespace-nowrap">{gstAmt(row)}</td>
                <td className="px-3 py-1.5 text-gray-700">{row.gst_code || '—'}</td>
                <td className="px-3 py-1.5 text-gray-500">{row.category || '—'}</td>
                <td className="px-3 py-1.5">
                  {row.review_status === 'Review Required' ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Review Required</span>
                  ) : (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Inferred</span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-gray-500 max-w-[160px] truncate" title={row.note}>{row.note || ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Client Detail right panel ─────────────────────────────────────────────────

function ClientDetailPanel({ client, onEmailSave }: {
  client: ClientDetail | undefined
  onEmailSave?: (email: string) => Promise<void>
}) {
  const [editingEmail, setEditingEmail] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [saving, setSaving] = useState(false)

  function Row({ label, value }: { label: string; value: string }) {
    return (
      <div className="border-b border-gray-100 py-2.5 last:border-0">
        <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
        <p className="break-words text-xs text-gray-800">{value}</p>
      </div>
    )
  }

  if (!client) return <p className="px-4 py-4 text-xs text-gray-400">Loading client details…</p>

  async function handleEmailSave() {
    if (!onEmailSave || !emailInput.trim()) return
    setSaving(true)
    try { await onEmailSave(emailInput.trim()); setEditingEmail(false) }
    finally { setSaving(false) }
  }

  return (
    <div className="px-4 py-3">
      <Row label="Entity name" value={client.business_name} />
      {client.abn && <Row label="ABN" value={formatABN(client.abn)} />}
      <Row label="Entity type" value={ENTITY_TYPE_LABELS[client.entity_type] ?? client.entity_type} />
      {client.gst_registered_from && <Row label="GST registered" value={`From ${fmtDate(client.gst_registered_from)}`} />}
      {client.address && <Row label="Address" value={client.address} />}
      {client.engagement_date && <Row label="Engaged since" value={fmtDate(client.engagement_date)} />}

      {/* Contact email — inline editable */}
      <div className="border-b border-gray-100 py-2.5 last:border-0">
        <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-wider text-gray-400">Contact email</p>
        {editingEmail ? (
          <div className="flex flex-col gap-1 mt-1">
            <input
              type="email"
              autoFocus
              value={emailInput}
              onChange={e => setEmailInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleEmailSave(); if (e.key === 'Escape') setEditingEmail(false) }}
              placeholder="accounting@client.com.au"
              className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-indigo-400 focus:outline-none"
            />
            <div className="flex gap-1">
              <button onClick={handleEmailSave} disabled={saving || !emailInput.trim()}
                className="flex-1 rounded bg-indigo-600 py-1 text-[10px] font-medium text-white hover:bg-indigo-700 disabled:opacity-40">
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setEditingEmail(false)}
                className="flex-1 rounded border border-gray-300 py-1 text-[10px] text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        ) : client.contact_email ? (
          <div className="flex items-center justify-between gap-1">
            <p className="break-words text-xs text-gray-800">{client.contact_email}</p>
            <button onClick={() => { setEmailInput(client.contact_email ?? ''); setEditingEmail(true) }}
              className="flex-shrink-0 text-gray-300 hover:text-indigo-500" title="Edit email">✏</button>
          </div>
        ) : (
          <button onClick={() => { setEmailInput(''); setEditingEmail(true) }}
            className="flex items-center gap-1 text-xs italic text-gray-400 hover:text-indigo-600">
            <span>Not set</span>
            <span className="text-[10px]">✏</span>
          </button>
        )}
      </div>

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

// ── Confirm modal ─────────────────────────────────────────────────────────────

function ConfirmModal({ summary, comment, onCommentChange, onConfirm, onClose, loading }: {
  summary: BASSummary; comment: string; onCommentChange: (v: string) => void
  onConfirm: () => void; onClose: () => void; loading: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">Record client confirmation</h2>
        <p className="mb-4 text-sm text-gray-500">
          Confirm that <strong>{summary.business_name}</strong> has reviewed and approved the BAS for <strong>{summary.period}</strong>.
        </p>
        <div className="mb-4 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Net GST (8A)</span>
            <span className="font-mono font-semibold">${fmt(Math.abs(summary.fields['8A']))}</span>
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {summary.fields['8A'] >= 0 ? 'Payable to ATO' : 'Refundable from ATO'}
          </div>
        </div>
        <label className="mb-4 block text-sm font-medium text-gray-700">
          Confirmation method <span className="font-normal text-gray-400">(optional)</span>
          <textarea
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            rows={3}
            placeholder="e.g. Client confirmed via email on 25 Mar 2025. Attached to client file."
            value={comment}
            onChange={e => onCommentChange(e.target.value)}
          />
        </label>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-lg border border-gray-300 py-2 text-sm text-gray-700 hover:bg-gray-50" disabled={loading}>Cancel</button>
          <button onClick={onConfirm} className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50" disabled={loading}>
            {loading ? 'Recording…' : 'Record confirmation'}
          </button>
        </div>
      </div>
    </div>
  )
}

function RejectModal({ reason, onReasonChange, onConfirm, onClose, loading }: {
  reason: string; onReasonChange: (v: string) => void
  onConfirm: () => void; onClose: () => void; loading: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">Send back for revision</h2>
        <p className="mb-4 text-sm text-gray-500">The BAS draft will be returned and the folder put on hold.</p>
        <label className="mb-4 block text-sm font-medium text-gray-700">
          Reason <span className="text-red-500">*</span>
          <textarea
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            rows={4}
            placeholder="Describe what needs to be corrected…"
            value={reason}
            onChange={e => onReasonChange(e.target.value)}
          />
        </label>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-lg border border-gray-300 py-2 text-sm text-gray-700 hover:bg-gray-50" disabled={loading}>Cancel</button>
          <button onClick={onConfirm} className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50" disabled={loading || !reason.trim()}>
            {loading ? 'Sending back…' : 'Send back'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ClientConfirmPage() {
  const { taskId } = useParams<{ taskId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [activeTab, setActiveTab] = useState<TabId>('bas-summary')
  const [showConfirm, setShowConfirm] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [comment, setComment] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [rejectError, setRejectError] = useState<string | null>(null)
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)

  const { data: summaryData, isLoading, error } = useQuery({
    queryKey: ['bas-summary', taskId],
    queryFn: () => api.get<{ data: { summary: BASSummary; file_id: string } }>(`/api/v1/tasks/${taskId}/bas-summary`).then(r => r.data),
    enabled: !!taskId,
    retry: false,
    throwOnError: false,
  })

  // Redirect to conversation if task no longer exists (e.g. after data reset)
  useEffect(() => {
    if (!error) return
    const status = (error as { response?: { status?: number } })?.response?.status
    if (status === 404 || status === 403) navigate('/conversation')
  }, [error, navigate])

  const { data: txData } = useQuery({
    queryKey: ['task-transactions', taskId],
    queryFn: () => api.get<{ data: { rows: TransactionRow[] } }>(`/api/v1/tasks/${taskId}/transactions`).then(r => r.data),
    enabled: !!taskId,
  })

  const { data: taskListData } = useQuery({
    queryKey: ['case-tasks-confirm', taskId],
    queryFn: async () => {
      const taskRes = await api.get<{ data: { case_id: string } }>(`/api/v1/tasks/${taskId}`).then(r => r.data)
      const caseId = taskRes.data.case_id
      const [tasksRes, caseRes] = await Promise.all([
        api.get<{ data: CaseTask[] }>(`/api/v1/cases/${caseId}/tasks`),
        api.get<{ data: { client_id: string } }>(`/api/v1/cases/${caseId}`),
      ])
      const clientId = caseRes.data.data.client_id
      const clientRes = await api.get<{ data: ClientDetail }>(`/api/v1/clients/${clientId}`)
      return { tasks: tasksRes.data.data, client: clientRes.data.data }
    },
    enabled: !!taskId,
  })

  const approveMut = useMutation({
    mutationFn: () => api.post(`/api/v1/tasks/${taskId}/approve`, { comment: comment || null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bas-summary', taskId] }); navigate('/conversation') },
  })

  const rejectMut = useMutation({
    mutationFn: () => api.post(`/api/v1/tasks/${taskId}/reject`, { reject_comment: rejectReason }),
    onSuccess: () => navigate('/conversation'),
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed to return task.'
      setRejectError(msg)
    },
  })

  async function handleEmailSave(email: string) {
    if (!clientDetail?.id) return
    await api.patch(`/api/v1/clients/${clientDetail.id}`, { contact_email: email })
    qc.invalidateQueries({ queryKey: ['case-tasks-confirm', taskId] })
  }

  const summary: BASSummary | undefined = summaryData?.data?.summary
  const isPayable = (summary?.fields['8A'] ?? 0) >= 0
  const allRows: TransactionRow[] = txData?.data?.rows ?? []
  const tasks: CaseTask[] = taskListData?.tasks ?? []
  const clientDetail: ClientDetail | undefined = taskListData?.client

  // Tab counts
  const incomeRows  = allRows.filter(r => !isExcluded(r) && getRowSheet(r) === 'income')
  const expenseRows = allRows.filter(r => !isExcluded(r) && getRowSheet(r) === 'expense')
  const excludeRows = allRows.filter(isExcluded)
  const noteRows    = allRows.filter(r => (r.note ?? '').trim() !== '')

  const TABS: { id: TabId; label: string; count?: number }[] = [
    { id: 'bas-summary', label: 'BAS Summary' },
    { id: 'bank',    label: 'Bank',    count: allRows.length },
    { id: 'income',  label: 'Income',  count: incomeRows.length },
    { id: 'expense', label: 'Expense', count: expenseRows.length },
    { id: 'exclude', label: 'Non-GST', count: excludeRows.length },
    { id: 'note',    label: 'Team Notes', count: noteRows.length },
  ]

  function tabRows(): TransactionRow[] {
    if (activeTab === 'bank')    return allRows
    if (activeTab === 'income')  return incomeRows
    if (activeTab === 'expense') return expenseRows
    if (activeTab === 'exclude') return excludeRows
    if (activeTab === 'note')    return noteRows
    return []
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: folder steps */}
      <TaskList tasks={tasks} currentTaskId={taskId ?? ''} collapsed={leftCollapsed} onToggle={() => setLeftCollapsed(v => !v)} />

      {/* Center */}
      <main className="flex flex-1 flex-col overflow-hidden bg-gray-50">
        {/* Header */}
        <div className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-6">
          <h1 className="text-base font-semibold text-gray-900">Client confirmation</h1>
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">awaiting confirmation</span>
          {summary && (
            <span className="ml-1 text-sm text-gray-400">{summary.business_name} · {summary.period}</span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex h-10 flex-shrink-0 items-end gap-0 border-b border-gray-200 bg-white px-6">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`mr-1 flex items-center gap-1.5 rounded-t px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-b-2 border-indigo-600 text-indigo-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {tab.count != null && (
                <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                  activeTab === tab.id ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex h-40 items-center justify-center text-sm text-gray-400">Loading…</div>
          )}
          {error && (
            <div className="flex h-40 items-center justify-center text-sm text-red-400">Failed to load BAS draft.</div>
          )}

          {/* BAS Summary tab */}
          {activeTab === 'bas-summary' && summary && (
            <div className="mx-auto max-w-xl px-4 py-6">
              {/* Context note */}
              <div className="mb-5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                Record that the client has reviewed and approved this BAS draft.
                This is a manual step — confirmation may have been received by phone, email, or signed document.
              </div>

              {/* Header card */}
              <div className="mb-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-base font-semibold text-gray-900">{summary.business_name}</h2>
                <p className="text-sm text-gray-500">Period: {summary.period} · {summary.transaction_count} transactions</p>
              </div>

              {/* BAS fields */}
              <div className="mb-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="mb-1 mt-0 text-xs font-semibold uppercase tracking-widest text-gray-400">Sales (GST-inclusive)</div>
                <FieldRow code="G1"  label="Total sales"            amount={summary.fields.G1}  alwaysShow />
                <FieldRow code="G2"  label="Export sales — GST-free" amount={summary.fields.G2} />
                <FieldRow code="G3"  label="Other GST-free sales"   amount={summary.fields.G3} />
                <FieldRow code="G4"  label="Input-taxed sales"      amount={summary.fields.G4} />
                <div className="my-1 border-t border-gray-200" />
                <FieldRow code="G5"  label="Taxable sales"          amount={summary.fields.G5}  bold />
                <FieldRow code="1A"  label="GST on sales"           amount={summary.fields['1A']} bold alwaysShow />

                <div className="mb-1 mt-4 text-xs font-semibold uppercase tracking-widest text-gray-400">Purchases (GST-inclusive)</div>
                <FieldRow code="G10" label="Capital purchases"      amount={summary.fields.G10} />
                <FieldRow code="G11" label="Non-capital purchases"  amount={summary.fields.G11} alwaysShow />
                <div className="my-1 border-t border-gray-200" />
                <FieldRow code="G12" label="Total purchases"        amount={summary.fields.G12} bold />
                <FieldRow code="1B"  label="GST credits on purchases" amount={summary.fields['1B']} bold alwaysShow />

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

              {/* Cover — Prepared for */}
              {clientDetail && (
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Prepared for</p>
                  <p className="text-sm font-semibold text-gray-900">{clientDetail.business_name}</p>
                  {clientDetail.abn && (
                    <p className="mt-0.5 text-sm text-gray-600">ABN {formatABN(clientDetail.abn)}</p>
                  )}
                  {clientDetail.address && (
                    <p className="mt-0.5 text-sm text-gray-600">{clientDetail.address}</p>
                  )}
                  {clientDetail.contact_email ? (
                    <p className="mt-0.5 text-sm text-gray-600">{clientDetail.contact_email}</p>
                  ) : (
                    <p className="mt-0.5 text-sm italic text-gray-400">Contact email not set</p>
                  )}
                  <div className="mt-4 space-y-1.5 border-t border-gray-100 pt-3">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="w-24 shrink-0 text-gray-500">Period</span>
                      <span className="text-gray-800">{summary.period}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="w-24 shrink-0 text-gray-500">GST basis</span>
                      <span className="text-gray-800">{summary.gst_method === 'cash' ? 'Cash' : 'Accruals'}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Transaction tabs */}
          {activeTab !== 'bas-summary' && (
            <div className="p-0">
              <TransactionTable rows={tabRows()} />
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex h-14 flex-shrink-0 items-center justify-end gap-3 border-t border-gray-200 bg-white px-6">
          <button onClick={() => setShowReject(true)} className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
            Send back
          </button>
          <button onClick={() => setShowConfirm(true)} disabled={!summary} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40">
            Record client confirmation
          </button>
        </div>
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
            {/* Top: client info */}
            <div className="flex-1 overflow-y-auto">
              <ClientDetailPanel client={clientDetail} onEmailSave={handleEmailSave} />
            </div>
          </>
        )}
      </aside>

      {/* Modals */}
      {showConfirm && summary && (
        <ConfirmModal
          summary={summary}
          comment={comment}
          onCommentChange={setComment}
          onConfirm={() => approveMut.mutate()}
          onClose={() => setShowConfirm(false)}
          loading={approveMut.isPending}
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
