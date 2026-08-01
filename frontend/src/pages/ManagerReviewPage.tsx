import { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TransactionRow {
  account?: string
  date: string
  detail: string
  payee: string
  payer: string
  money_out: string
  money_in: string
  gst_code: string
  coding_basis: string
  category?: string
  review_status?: string
  bas_participation?: string
  explanation?: string
  note?: string
}

interface BASFields {
  G1: number; G2: number; G3: number; G4: number; G5: number; '1A': number
  G10: number; G11: number; G12: number; '1B': number; '8A': number
}

interface BASSummary {
  business_name: string
  period: string
  gst_method: string
  generated_at: string
  fields: BASFields
  transaction_count: number
  flagged_count: number
}

interface ClientDetail {
  id: string
  business_name: string
  abn: string | null
  entity_type: string
  gst_registered: boolean | null
  gst_registered_from: string | null
  address: string | null
  engagement_date: string | null
  contact_email: string | null
  status: string
}

interface CaseTask {
  id: string
  task_type: string
  status: string
  assigned_agent: string | null
}

interface ConfirmLink {
  id: string
  token: string
  password: string | null
  created_at: string
  expires_at: string
  submitted_at: string | null
  confirmed_at: string | null
  status: 'pending' | 'signed' | 'confirmed' | 'expired'
  sender_name: string | null
}

type Phase = 'review' | 'confirm_send' | 'confirm_wait' | 'confirm_signed' | 'done'

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

const ENTITY_TYPE_LABELS: Record<string, string> = {
  company:     'Australian Private Company',
  trust:       'Trust',
  partnership: 'Partnership',
  sole_trader: 'Sole Trader',
  individual:  'Individual',
  smsf:        'SMSF',
  other:       'Other',
}

type ManagerTab = 'bas-summary' | 'all' | 'income' | 'expense' | 'excluded' | 'notes'

const _GST_AMT_CODES = new Set(['GST_STANDARD', 'CAPITAL_GST', 'G11', 'G10', 'G1'])

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatABN(abn: string | null | undefined): string {
  if (!abn) return '—'
  const d = abn.replace(/\D/g, '')
  if (d.length !== 11) return abn
  return `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8, 11)}`
}

function merchantDisplay(row: TransactionRow): string {
  return row.payee || row.payer || '—'
}

function amountDisplay(row: TransactionRow): { value: string; isDebit: boolean } {
  const out = parseFloat(row.money_out)
  if (out) return { value: '$' + fmt(out), isDebit: true }
  const inp = parseFloat(row.money_in)
  if (inp) return { value: '$' + fmt(inp), isDebit: false }
  return { value: '—', isDebit: true }
}

function gstAmtDisplay(row: TransactionRow): string {
  if ((row.category ?? '') === 'income_platform') return '—'
  if (!_GST_AMT_CODES.has(row.gst_code ?? '')) return '—'
  const amount = parseFloat(row.money_out || '0') || parseFloat(row.money_in || '0')
  if (!amount) return '—'
  return '$' + fmt(amount / 11)
}

const _EXCLUDED_GST_CODES = new Set(['BAS_EXCLUDED', 'N-T'])

function isExcluded(row: TransactionRow): boolean {
  if (row.bas_participation != null) return row.bas_participation === 'excluded'
  // Legacy fallback for old CSVs without bas_participation field
  return _EXCLUDED_GST_CODES.has(row.gst_code ?? '')
}

function isReviewRequired(row: TransactionRow): boolean {
  return (row.review_status ?? '').toLowerCase() === 'review required'
}

function isIncome(row: TransactionRow): boolean {
  return parseFloat(row.money_in || '0') > 0
}

function isExpense(row: TransactionRow): boolean {
  return parseFloat(row.money_out || '0') > 0
}

function getSheetRows(tab: ManagerTab, rows: TransactionRow[]): TransactionRow[] {
  switch (tab) {
    case 'all':      return rows
    case 'income':   return rows.filter(r => isIncome(r) && !isExcluded(r))
    case 'expense':  return rows.filter(r => isExpense(r) && !isExcluded(r))
    case 'excluded': return rows.filter(isExcluded)
    case 'notes':    return rows.filter(r => (r.note ?? '').trim() !== '')
    default: return rows
  }
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

// ── TaskList ──────────────────────────────────────────────────────────────────

function TaskList({ tasks, currentTaskId, collapsed, onToggle }: {
  tasks: CaseTask[]; currentTaskId: string; collapsed: boolean; onToggle: () => void
}) {
  const sorted = sortedByTaskOrder(tasks)
  const activeIndex = sorted.findIndex(t => ['in_progress', 'waiting_human'].includes(t.status))
  const _DONE = new Set(['complete', 'approved', 'validated', 'reviewed', 'confirmed', 'certified'])
  return (
    <div className={`flex flex-col ${collapsed ? 'w-10' : 'w-60'} flex-shrink-0 border-r border-gray-200 bg-white transition-all duration-150`}>
      <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-gray-200 px-3">
        {!collapsed && <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Folder steps</span>}
        <button onClick={onToggle} className="ml-auto text-gray-400 hover:text-gray-600">
          {collapsed ? '›' : '‹'}
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        {sorted.map((t, idx) => {
          const isActiveDot = activeIndex !== -1 ? idx === activeIndex : t.id === currentTaskId
          const isViewing = t.id === currentTaskId
          const effectiveStatus = activeIndex !== -1 && idx > activeIndex && _DONE.has(t.status) ? 'pending' : t.status
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

// ── StatusChip ────────────────────────────────────────────────────────────────

function StatusChip({ row }: { row: TransactionRow }) {
  if (isExcluded(row)) return <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-500">Excluded</span>
  if (isReviewRequired(row)) return <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700">Review Required</span>
  return <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-green-100 text-green-700">Inferred</span>
}

// ── BAS summary sub-components ────────────────────────────────────────────────

function FieldRow({ code, label, amount, bold, indent }: {
  code: string; label: string; amount: number; bold?: boolean; indent?: boolean
}) {
  return (
    <div className={`flex items-baseline gap-3 py-1.5 ${bold ? 'font-semibold' : ''}`}>
      <span className={`w-10 shrink-0 font-mono text-sm ${bold ? 'font-bold text-gray-700' : 'font-semibold text-gray-400'} ${indent ? 'pl-4' : ''}`}>
        {code}
      </span>
      <span className={`grow text-sm ${bold ? 'font-bold text-gray-900' : 'text-gray-600'} ${indent ? 'text-gray-500' : ''}`}>{label}</span>
      <span className={`shrink-0 font-mono text-sm font-normal tabular-nums ${amount < 0 ? 'text-red-600' : 'text-gray-900'}`}>
        {amount < 0 ? `$(${fmt(Math.abs(amount))})` : `$${fmt(amount)}`}
      </span>
    </div>
  )
}

function Divider() { return <div className="my-1 border-t border-gray-200" /> }

function SectionHead({ title }: { title: string }) {
  return <div className="mb-1 mt-4 text-xs font-semibold uppercase tracking-widest text-gray-400">{title}</div>
}

// ── Transaction table (read-only) ─────────────────────────────────────────────

function TxTable({ rows }: { rows: TransactionRow[] }) {
  const hasMulti = new Set(rows.map(r => r.account ?? '').filter(Boolean)).size > 1
  if (rows.length === 0) {
    return <div className="flex h-32 items-center justify-center text-sm text-gray-400">No transactions on this sheet.</div>
  }
  return (
    <table className="w-full border-collapse text-left">
      <thead className="sticky top-0 z-10 bg-gray-50">
        <tr className="border-b border-gray-200">
          <th className="w-8 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">#</th>
          {hasMulti && <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Account</th>}
          <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Date</th>
          <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Merchant</th>
          <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Description</th>
          <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-gray-400">Amount</th>
          <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-gray-400">GST Amt (Est.)</th>
          <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">GST Code</th>
          <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Category</th>
          <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Status</th>
          <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Note</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const excluded = isExcluded(row)
          const reviewReq = isReviewRequired(row)
          const { value, isDebit } = amountDisplay(row)
          const rowBg = excluded ? 'bg-gray-50' : reviewReq ? 'bg-amber-50' : 'bg-white hover:bg-gray-50'
          return (
            <tr key={i} className={`border-b border-gray-100 ${rowBg}`}>
              <td className="px-3 py-1.5 text-xs text-gray-400">{i + 1}</td>
              {hasMulti && <td className="max-w-[100px] truncate px-3 py-1.5 text-xs text-gray-500">{row.account || '—'}</td>}
              <td className="whitespace-nowrap px-3 py-1.5 text-xs text-gray-600">{row.date}</td>
              <td className="max-w-[140px] truncate px-3 py-1.5 text-xs text-gray-800" title={merchantDisplay(row)}>{merchantDisplay(row)}</td>
              <td className="max-w-[200px] truncate px-3 py-1.5 text-xs text-gray-500" title={row.detail}>{row.detail}</td>
              <td className={`whitespace-nowrap px-3 py-1.5 text-right font-mono text-xs font-medium ${isDebit ? 'text-red-600' : 'text-green-600'}`}>{value}</td>
              <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono text-xs text-gray-500">{gstAmtDisplay(row)}</td>
              <td className="px-3 py-1.5 font-mono text-xs text-gray-700">{row.gst_code || '—'}</td>
              <td className="max-w-[120px] truncate px-3 py-1.5 text-xs text-gray-500">{row.category || '—'}</td>
              <td className="px-3 py-1.5"><StatusChip row={row} /></td>
              <td className="max-w-[160px] truncate px-3 py-1.5 text-xs text-gray-500" title={row.note}>{row.note || '—'}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ── Client detail card ────────────────────────────────────────────────────────

function ClientCard({ client }: { client: ClientDetail | undefined }) {
  if (!client) return <div className="px-4 py-4 text-xs text-gray-400">Loading client…</div>
  const rows: [string, string][] = [
    ['Entity name', client.business_name],
    ...(client.abn ? [['ABN', formatABN(client.abn)] as [string, string]] : []),
    ['Entity type', ENTITY_TYPE_LABELS[client.entity_type] ?? client.entity_type],
    ...(client.gst_registered_from ? [['GST registered', `From ${fmtDate(client.gst_registered_from)}`] as [string, string]] : []),
    ...(client.address ? [['Address', client.address] as [string, string]] : []),
    ...(client.engagement_date ? [['Engaged since', fmtDate(client.engagement_date)] as [string, string]] : []),
    ...(client.contact_email ? [['Contact email', client.contact_email] as [string, string]] : []),
  ]
  return (
    <div className="px-4 py-3 text-xs">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Client Detail</p>
      {rows.map(([label, value]) => (
        <div key={label} className="border-b border-gray-100 py-2 last:border-0">
          <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
          <p className="text-gray-700">{value}</p>
        </div>
      ))}
      <div className="border-b border-gray-100 py-2 last:border-0">
        <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-wider text-gray-400">Status</p>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
          client.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
        }`}>
          <span className={`h-1.5 w-1.5 rounded-full ${client.status === 'open' ? 'bg-green-500' : 'bg-gray-400'}`} />
          {client.status}
        </span>
      </div>
    </div>
  )
}

// ── Modals ────────────────────────────────────────────────────────────────────

function ApproveModal({ summary, comment, onCommentChange, onConfirm, onClose, loading }: {
  summary: BASSummary; comment: string; onCommentChange: (v: string) => void
  onConfirm: () => void; onClose: () => void; loading: boolean
}) {
  const { fields } = summary
  const isPayable = fields['8A'] >= 0
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">Approve BAS draft</h2>
        <p className="mb-4 text-sm text-gray-500">
          Approving the BAS draft for {summary.business_name} — {summary.period}.
        </p>
        <div className="mb-4 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">GST on sales (1A)</span>
            <span className="font-mono">${fmt(fields['1A'])}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Input tax credits (1B)</span>
            <span className="font-mono">${fmt(fields['1B'])}</span>
          </div>
          <div className="my-1 border-t border-gray-200" />
          <div className="flex justify-between font-semibold">
            <span className={isPayable ? 'text-red-700' : 'text-green-700'}>
              Net GST {isPayable ? 'payable' : 'refundable'} (8A)
            </span>
            <span className={`font-mono ${isPayable ? 'text-red-700' : 'text-green-700'}`}>
              ${fmt(Math.abs(fields['8A']))}
            </span>
          </div>
        </div>
        <label className="mb-4 block text-sm font-medium text-gray-700">
          Comment (optional)
          <textarea
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            rows={3}
            placeholder="Add a note for the audit trail…"
            value={comment}
            onChange={e => onCommentChange(e.target.value)}
          />
        </label>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-lg border border-gray-300 py-2 text-sm text-gray-700 hover:bg-gray-50" disabled={loading}>Cancel</button>
          <button onClick={onConfirm} className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50" disabled={loading}>
            {loading ? 'Approving…' : 'Confirm approval'}
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
        <h2 className="mb-1 text-lg font-semibold text-gray-900">Reject BAS draft</h2>
        <p className="mb-4 text-sm text-gray-500">The Senior will need to revise and resubmit.</p>
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
            {loading ? 'Rejecting…' : 'Confirm rejection'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ManagerReviewPage() {
  const { taskId } = useParams<{ taskId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [showApprove, setShowApprove] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [approveComment, setApproveComment] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState<ManagerTab>('bas-summary')

  // Phase state — true once Manager clicks Approve in this session
  const [approveJustDone, setApproveJustDone] = useState(false)
  // Confirm-link generation form
  const [linkPassword, setLinkPassword] = useState('')
  const [linkPasswordError, setLinkPasswordError] = useState('')
  const [linkCopied, setLinkCopied] = useState(false)

  const { data: summaryData, isLoading: summaryLoading, error: summaryError } = useQuery({
    queryKey: ['bas-summary', taskId],
    queryFn: () => api.get<{ data: { summary: BASSummary; file_id: string } }>(`/api/v1/tasks/${taskId}/bas-summary`).then(r => r.data),
    enabled: !!taskId,
    retry: false,
    throwOnError: false,
  })

  useEffect(() => {
    if (!summaryError) return
    const status = (summaryError as { response?: { status?: number } })?.response?.status
    if (status === 404 || status === 403) navigate('/conversation')
  }, [summaryError, navigate])

  const { data: txData, isLoading: txLoading } = useQuery({
    queryKey: ['transactions-mgr', taskId],
    queryFn: () => api.get<{ data: { rows: TransactionRow[] } }>(`/api/v1/tasks/${taskId}/transactions`).then(r => r.data),
    enabled: !!taskId,
  })

  const { data: caseInfoData } = useQuery({
    queryKey: ['case-info-mgr', taskId],
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
        caseId,
        tasks: tasksRes.data.data as CaseTask[],
        client: clientRes.data.data as ClientDetail,
      }
    },
    enabled: !!taskId,
  })

  const summary: BASSummary | undefined = summaryData?.data?.summary
  const allRows: TransactionRow[] = txData?.data?.rows ?? []
  const tasks: CaseTask[] = caseInfoData?.tasks ?? []
  const client: ClientDetail | undefined = caseInfoData?.client
  const caseId: string | undefined = caseInfoData?.caseId

  // Derive phase from task statuses — only fetch confirm-links once past 'review'
  const mrTask = tasks.find(t => t.task_type === 'manager_review')
  const ccTask = tasks.find(t => t.task_type === 'client_confirm')
  const pastReview = approveJustDone || (mrTask !== undefined && mrTask.status !== 'waiting_human')

  const { data: confirmLinksData, refetch: refetchLinks } = useQuery({
    queryKey: ['confirm-links-mgr', caseId],
    queryFn: () =>
      api.get<{ data: { links: ConfirmLink[] } }>(`/api/v1/cases/${caseId}/confirm-links`).then(r => r.data),
    enabled: !!caseId && pastReview,
    refetchInterval: (q) => {
      const links = (q.state.data as { data?: { links?: ConfirmLink[] } } | undefined)?.data?.links ?? []
      const active = links.find((l: ConfirmLink) => !l.confirmed_at)
      return active && !active.submitted_at ? 15_000 : false
    },
  })

  const confirmLinks: ConfirmLink[] = confirmLinksData?.data?.links ?? []
  const activeLink: ConfirmLink | undefined = confirmLinks.find(l => !l.confirmed_at)

  const phase: Phase = (() => {
    if (!approveJustDone && mrTask?.status === 'waiting_human') return 'review'
    if (ccTask?.status === 'complete') return 'done'
    if (activeLink?.submitted_at) return 'confirm_signed'
    if (activeLink) return 'confirm_wait'
    return 'confirm_send'
  })()

  const approveMut = useMutation({
    mutationFn: () => api.post(`/api/v1/tasks/${taskId}/approve`, { comment: approveComment || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['case-info-mgr', taskId] })
      setApproveJustDone(true)
      setShowApprove(false)
    },
  })

  const rejectMut = useMutation({
    mutationFn: () => api.post(`/api/v1/tasks/${taskId}/reject`, { reject_comment: rejectReason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bas-summary', taskId] }); navigate('/conversation') },
  })

  const createLinkMut = useMutation({
    mutationFn: () => api.post(`/api/v1/cases/${caseId}/confirm-link`, { password: linkPassword }),
    onSuccess: () => {
      setLinkPassword('')
      setLinkPasswordError('')
      refetchLinks()
    },
    onError: (err: { response?: { data?: { detail?: unknown } } }) => {
      const det = err?.response?.data?.detail
      setLinkPasswordError(typeof det === 'string' ? det : 'Failed to generate link. Please try again.')
    },
  })

  const confirmReceiptMut = useMutation({
    mutationFn: () => {
      const ccTaskId = ccTask?.id
      if (!ccTaskId) throw new Error('client_confirm task not found')
      return api.post(`/api/v1/tasks/${ccTaskId}/approve`, { comment: 'Client signed confirmation received and verified.' })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['case-info-mgr', taskId] })
      qc.invalidateQueries({ queryKey: ['confirm-links-mgr', caseId] })
      navigate('/conversation')
    },
  })

  const revokeLinkMut = useMutation({
    mutationFn: (linkId: string) =>
      api.delete(`/api/v1/cases/${caseId}/confirm-links/${linkId}`),
    onSuccess: () => refetchLinks(),
  })

  const sheetRows = useMemo(() => getSheetRows(activeTab, allRows), [activeTab, allRows])

  const incomeCount   = allRows.filter(r => isIncome(r) && !isExcluded(r)).length
  const expenseCount  = allRows.filter(r => isExpense(r) && !isExcluded(r)).length
  const excludedCount = allRows.filter(isExcluded).length
  const notesCount    = allRows.filter(r => (r.note ?? '').trim() !== '').length

  const tabs: { key: ManagerTab; label: string; count?: number }[] = [
    { key: 'bas-summary', label: 'BAS Summary' },
    { key: 'all',         label: 'All',           count: allRows.length },
    { key: 'income',      label: 'Total Income',  count: incomeCount },
    { key: 'expense',     label: 'Total Expense', count: expenseCount },
    { key: 'excluded',    label: 'Excluded',      count: excludedCount },
    { key: 'notes',       label: 'Team Notes',    count: notesCount },
  ]

  function renderBASFields() {
    if (summaryLoading) return <div className="flex h-48 items-center justify-center text-sm text-gray-400">Loading…</div>
    if (summaryError || !summary) return <div className="flex h-48 items-center justify-center text-sm text-red-400">Failed to load BAS summary.</div>
    const { fields } = summary
    const isPayable = fields['8A'] >= 0
    const hasSalesSubItems = fields.G2 > 0 || fields.G3 > 0 || fields.G4 > 0
    const hasCapital = fields.G10 > 0
    return (
      <div className="mx-auto max-w-xl">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <SectionHead title="Sales (GST-inclusive)" />
          <FieldRow code="G1" label="Total sales" amount={fields.G1} />
          {fields.G2 > 0 && <FieldRow code="G2" label="Export sales — GST-free" amount={fields.G2} />}
          {fields.G3 > 0 && <FieldRow code="G3" label="Other GST-free sales" amount={fields.G3} />}
          {fields.G4 > 0 && <FieldRow code="G4" label="Input-taxed sales" amount={fields.G4} />}
          {hasSalesSubItems && <Divider />}
          {hasSalesSubItems && <FieldRow code="G5" label="Taxable sales" amount={fields.G5} bold />}
          <FieldRow code="1A" label="GST on sales" amount={fields['1A']} bold />
          <SectionHead title="Purchases (GST-inclusive)" />
          {hasCapital && <FieldRow code="G10" label="Capital purchases" amount={fields.G10} />}
          <FieldRow code="G11" label="Non-capital purchases" amount={fields.G11} />
          {hasCapital && <Divider />}
          {hasCapital && <FieldRow code="G12" label="Total purchases (G10 + G11)" amount={fields.G12} bold />}
          <FieldRow code="1B" label="GST credits on purchases" amount={fields['1B']} bold />
          <div className="mt-3 border-t border-gray-200 pt-2">
            <div className="flex items-baseline gap-3 py-1.5">
              <span className="w-10 shrink-0 font-mono text-sm font-semibold text-gray-500">8A</span>
              <span className="grow text-sm font-semibold text-gray-700">Net GST {isPayable ? 'payable' : 'refundable'}</span>
              <span className={`shrink-0 font-mono text-sm font-semibold tabular-nums ${isPayable ? 'text-red-600' : 'text-green-600'}`}>
                ${fmt(Math.abs(fields['8A']))}
              </span>
            </div>
          </div>

          {/* Client reference block */}
          {client && (
            <div className="mt-10 border-t border-gray-100 pt-6">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Client</p>
              <p className="text-sm font-semibold text-gray-900">{client.business_name}</p>
              <div className="mt-1.5 space-y-0.5 text-xs text-gray-500">
                {client.abn && <p>ABN {formatABN(client.abn)} · {ENTITY_TYPE_LABELS[client.entity_type] ?? client.entity_type}</p>}
                {client.gst_registered_from && <p>GST registered from {fmtDate(client.gst_registered_from)}</p>}
                {client.address && <p>{client.address}</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Phase-specific helper: link URL ────────────────────────────────────────
  const linkUrl = activeLink ? `${window.location.origin}/c/${activeLink.token}` : ''

  function copyLink() {
    navigator.clipboard.writeText(linkUrl).then(() => {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    })
  }

  function handleGenerateLink() {
    if (!caseId) {
      setLinkPasswordError('Case not loaded yet. Please wait a moment and try again.')
      return
    }
    if (linkPassword.trim().length < 4) {
      setLinkPasswordError('Password must be at least 4 characters.')
      return
    }
    setLinkPasswordError('')
    createLinkMut.mutate()
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: folder steps */}
      <TaskList
        tasks={tasks}
        currentTaskId={taskId ?? ''}
        collapsed={leftCollapsed}
        onToggle={() => setLeftCollapsed(v => !v)}
      />

      {/* Center */}
      <main className="flex flex-1 flex-col overflow-hidden bg-gray-50">
        {/* Header bar — phase-conditional */}
        <div className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-6">
          {phase === 'review' && (
            <>
              <h1 className="text-base font-semibold text-gray-900">BAS draft — manager review</h1>
              {summary && (
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                  awaiting your approval
                </span>
              )}
              <div className="ml-auto flex gap-2">
                <button
                  onClick={() => setShowReject(true)}
                  className="rounded-lg border border-red-300 px-4 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
                >
                  Reject
                </button>
                <button
                  onClick={() => setShowApprove(true)}
                  disabled={!summary}
                  className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
                >
                  Approve
                </button>
              </div>
            </>
          )}
          {phase === 'confirm_send' && (
            <>
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-xs font-bold text-white">✓</span>
              <h1 className="text-base font-semibold text-gray-900">BAS approved — send to client</h1>
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">Step 2 of 2</span>
            </>
          )}
          {phase === 'confirm_wait' && (
            <>
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-amber-400" />
              <h1 className="text-base font-semibold text-gray-900">Confirmation link sent · awaiting client</h1>
            </>
          )}
          {phase === 'confirm_signed' && (
            <>
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-xs font-bold text-white">✓</span>
              <h1 className="text-base font-semibold text-gray-900">Client returned signed document</h1>
              <div className="ml-auto">
                <button
                  onClick={() => confirmReceiptMut.mutate()}
                  disabled={confirmReceiptMut.isPending}
                  className="rounded-lg bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {confirmReceiptMut.isPending ? 'Confirming…' : 'Confirm & close loop'}
                </button>
              </div>
            </>
          )}
          {phase === 'done' && (
            <>
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-xs font-bold text-white">✓</span>
              <h1 className="text-base font-semibold text-gray-900">Client confirmed</h1>
              <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">Complete</span>
            </>
          )}
        </div>

        {/* Phase banner — between header and tabs */}
        {phase === 'confirm_send' && (
          <div className="flex-shrink-0 border-b border-blue-200 bg-blue-50 px-6 py-4">
            <p className="mb-3 text-sm font-medium text-blue-900">
              Generate a secure link for your client to download, sign and return the BAS statement.
            </p>
            <div className="flex items-start gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-blue-800">Link password <span className="text-blue-500">(min 4 chars)</span></label>
                <input
                  type="text"
                  value={linkPassword}
                  onChange={e => { setLinkPassword(e.target.value); setLinkPasswordError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleGenerateLink()}
                  placeholder="e.g. AlphaSON26"
                  className="w-52 rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {linkPasswordError && <p className="text-xs text-red-600">{linkPasswordError}</p>}
              </div>
              <button
                onClick={handleGenerateLink}
                disabled={createLinkMut.isPending}
                className="mt-5 rounded-lg bg-blue-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
              >
                {createLinkMut.isPending ? 'Generating…' : 'Generate confirmation link'}
              </button>
            </div>
          </div>
        )}

        {phase === 'confirm_wait' && activeLink && (
          <div className="flex-shrink-0 border-b border-amber-200 bg-amber-50 px-6 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Confirmation link</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded border border-amber-200 bg-white px-2.5 py-1 text-xs font-mono text-gray-700">
                    {linkUrl}
                  </code>
                  <button
                    onClick={copyLink}
                    className={`shrink-0 rounded px-3 py-1 text-xs font-medium transition-colors ${
                      linkCopied ? 'bg-green-600 text-white' : 'bg-amber-700 text-white hover:bg-amber-800'
                    }`}
                  >
                    {linkCopied ? 'Copied!' : 'Copy link'}
                  </button>
                </div>
                {activeLink.password && (
                  <p className="text-xs text-amber-800">
                    Password: <span className="font-mono font-semibold">{activeLink.password}</span>
                  </p>
                )}
                <p className="text-xs text-amber-700">
                  Waiting for client to download, sign and return the document…
                </p>
              </div>
              <button
                onClick={() => { if (window.confirm('Revoke this link? The client will no longer be able to use it.')) revokeLinkMut.mutate(activeLink.id) }}
                disabled={revokeLinkMut.isPending}
                className="shrink-0 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
              >
                Revoke
              </button>
            </div>
          </div>
        )}

        {phase === 'confirm_signed' && activeLink && (
          <div className="flex-shrink-0 border-b border-green-200 bg-green-50 px-6 py-3">
            <div className="flex items-center gap-3">
              <span className="text-green-600">📄</span>
              <div>
                <p className="text-sm font-medium text-green-900">Client returned the signed BAS statement</p>
                <p className="text-xs text-green-700">
                  Received {activeLink.submitted_at ? new Date(activeLink.submitted_at).toLocaleString('en-AU') : ''}
                  {' · '}Document is available in Supporting Evidence below.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tab bar — hide transaction sheet tabs when count = 0 */}
        <div className="flex flex-shrink-0 items-end gap-1 border-b border-gray-200 bg-white px-6 pt-1">
          {tabs
            .filter(tab => tab.count === undefined || tab.count > 0)
            .map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 border-b-2 px-3 pb-2 pt-1.5 text-xs font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
                {tab.count !== undefined && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                    activeTab === tab.key ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Workpaper title — persistent across all tabs */}
          {(summary?.business_name || client?.business_name) && (
            <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-6 py-2.5">
              <span className="text-sm font-semibold text-gray-900">
                {summary?.business_name || client?.business_name}
                {summary?.period ? ` — ${summary.period} BAS/GST` : ''}
              </span>
              <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
                DRAFT
              </span>
            </div>
          )}
          {activeTab === 'bas-summary' ? (
            <div className="px-8 py-6">{renderBASFields()}</div>
          ) : (
            <div className="overflow-x-auto">
              {txLoading
                ? <div className="flex h-48 items-center justify-center text-sm text-gray-400">Loading transactions…</div>
                : <TxTable rows={sheetRows} />
              }
            </div>
          )}
        </div>
      </main>

      {/* Right: client detail + Ask Sweeper */}
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
              <ClientCard client={client} />
            </div>
          </>
        )}
      </aside>

      {/* Modals */}
      {showApprove && summary && (
        <ApproveModal
          summary={summary}
          comment={approveComment}
          onCommentChange={setApproveComment}
          onConfirm={() => approveMut.mutate()}
          onClose={() => setShowApprove(false)}
          loading={approveMut.isPending}
        />
      )}
      {showReject && (
        <RejectModal
          reason={rejectReason}
          onReasonChange={setRejectReason}
          onConfirm={() => rejectMut.mutate()}
          onClose={() => setShowReject(false)}
          loading={rejectMut.isPending}
        />
      )}
    </div>
  )
}
