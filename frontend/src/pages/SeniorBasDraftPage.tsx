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
  prepared_by: string
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

// ── Constants ─────────────────────────────────────────────────────────────────

const TASK_ORDER = [
  'extract', 'validate_extraction', 'gst_prep', 'validate_gst',
  'senior_review', 'bas_draft', 'senior_bas_review', 'manager_review',
  'client_confirm', 'certify',
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

type SheetKey = 'bas-draft' | 'bank' | 'income' | 'expense' | 'exclude' | 'note'

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
  // Review Required = GST_PENDING; estimate is meaningless until accountant confirms GST code
  if ((row.review_status ?? '') === 'Review Required') return '—'
  const code = row.gst_code ?? ''
  const hasGst = ['GST_STANDARD', 'CAPITAL_GST', 'G1', 'G10', 'G11'].includes(code)
  if (!hasGst) return '—'
  const amount = parseFloat(row.money_out || '0') || parseFloat(row.money_in || '0')
  if (!amount) return '—'
  return '$' + fmt(amount / 11)
}

const _EXCLUDED_GST_CODES = new Set(['BAS_EXCLUDED', 'N-T'])

function isExcluded(row: TransactionRow): boolean {
  if (row.bas_participation != null) return row.bas_participation === 'excluded'
  return _EXCLUDED_GST_CODES.has(row.gst_code ?? '')
}

function isReviewRequired(row: TransactionRow): boolean {
  return (row.review_status ?? '').toLowerCase() === 'review required'
}

function getIndexedSheetRows(
  sheet: SheetKey,
  rows: TransactionRow[],
): { row: TransactionRow; origIdx: number }[] {
  const indexed = rows.map((row, origIdx) => ({ row, origIdx }))
  switch (sheet) {
    case 'bank':    return indexed
    case 'income':  return indexed.filter(({ row }) => parseFloat(row.money_in || '0') > 0 && !isExcluded(row))
    case 'expense': return indexed.filter(({ row }) => parseFloat(row.money_out || '0') > 0 && !isExcluded(row))
    case 'exclude': return indexed.filter(({ row }) => isExcluded(row))
    case 'note':    return indexed.filter(({ row }) => (row.note ?? '').trim() !== '')
    default:        return []
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
        <button onClick={onToggle} className="ml-auto text-gray-400 hover:text-gray-600" title={collapsed ? 'Expand' : 'Collapse'}>
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

// ── ApproveModal ──────────────────────────────────────────────────────────────

function ApproveModal({ summary, comment, onCommentChange, onConfirm, onClose, loading }: {
  summary: BASSummary; comment: string; onCommentChange: (v: string) => void
  onConfirm: () => void; onClose: () => void; loading: boolean
}) {
  const { fields } = summary
  const isPayable = fields['8A'] >= 0
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">Confirm BAS draft</h2>
        <p className="mb-4 text-sm text-gray-500">
          Confirming the BAS draft for {summary.business_name} — {summary.period} is correct and ready for manager approval.
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
          <div className="my-2 border-t border-gray-200" />
          <div className="flex justify-between font-semibold">
            <span className={isPayable ? 'text-red-700' : 'text-green-700'}>Net GST {isPayable ? 'payable' : 'refundable'} (8A)</span>
            <span className={`font-mono ${isPayable ? 'text-red-700' : 'text-green-700'}`}>${fmt(Math.abs(fields['8A']))}</span>
          </div>
        </div>
        <label className="mb-4 block text-sm font-medium text-gray-700">
          Note (optional)
          <textarea className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            rows={3} placeholder="Add a note for the audit trail…" value={comment} onChange={e => onCommentChange(e.target.value)} />
        </label>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-lg border border-gray-300 py-2 text-sm text-gray-700 hover:bg-gray-50" disabled={loading}>Cancel</button>
          <button onClick={onConfirm} className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50" disabled={loading}>
            {loading ? 'Confirming…' : 'Confirm & send to manager'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── RejectModal ───────────────────────────────────────────────────────────────

function RejectModal({ reason, onReasonChange, onConfirm, onClose, loading, error }: {
  reason: string; onReasonChange: (v: string) => void
  onConfirm: () => void; onClose: () => void; loading: boolean; error?: string | null
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">Return BAS draft</h2>
        <p className="mb-4 text-sm text-gray-500">The BAS draft will be returned for regeneration.</p>
        <label className="mb-4 block text-sm font-medium text-gray-700">
          Reason <span className="text-red-500">*</span>
          <textarea className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            rows={4} placeholder="Describe what needs to be corrected…" value={reason} onChange={e => onReasonChange(e.target.value)} />
        </label>
        {error && (
          <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-lg border border-gray-300 py-2 text-sm text-gray-700 hover:bg-gray-50" disabled={loading}>Cancel</button>
          <button onClick={onConfirm} className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50" disabled={loading || !reason.trim()}>
            {loading ? 'Returning…' : 'Return for revision'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── BAS Draft center panel ────────────────────────────────────────────────────

function BASDraftCenter({ summary, client }: { summary: BASSummary; client?: ClientDetail }) {
  const { fields } = summary
  const isPayable = fields['8A'] >= 0

  function FieldRow({ code, label, amount, bold = false }: { code: string; label: string; amount: number; bold?: boolean }) {
    return (
      <div className={`flex items-baseline gap-3 py-2 ${bold ? 'border-t border-gray-100' : ''}`}>
        <span className={`w-12 shrink-0 font-mono text-sm ${bold ? 'font-bold text-gray-700' : 'font-semibold text-gray-400'}`}>{code}</span>
        <span className={`grow text-sm ${bold ? 'font-bold text-gray-900' : 'text-gray-600'}`}>{label}</span>
        <span className="shrink-0 font-mono text-sm font-normal tabular-nums text-gray-900">
          ${fmt(amount)}
        </span>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-xl px-8 py-10">
        {/* Header */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900">BAS Draft Summary</h2>
          <p className="mt-0.5 text-sm text-gray-500">{summary.business_name} · {summary.period}</p>
          <p className="mt-0.5 text-xs text-gray-400">
            {summary.gst_method === 'cash' ? 'Cash basis' : 'Accruals basis'} · {summary.transaction_count} transactions
          </p>
        </div>

        {/* Sales */}
        <div className="mb-5 overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 bg-gray-50 px-4 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Sales</span>
          </div>
          <div className="px-4 py-1">
            {(() => {
              const hasSub = fields.G2 > 0 || fields.G3 > 0 || fields.G4 > 0
              return (
                <>
                  <FieldRow code="G1" label="Total sales (GST inclusive)" amount={fields.G1} />
                  {fields.G2 > 0 && <FieldRow code="G2" label="Export sales (GST-free)" amount={fields.G2} />}
                  {fields.G3 > 0 && <FieldRow code="G3" label="Other GST-free sales" amount={fields.G3} />}
                  {fields.G4 > 0 && <FieldRow code="G4" label="Input-taxed sales" amount={fields.G4} />}
                  {hasSub && <FieldRow code="G5" label="Taxable sales" amount={fields.G5} bold />}
                  <FieldRow code="1A" label="GST on sales" amount={fields['1A']} bold />
                </>
              )
            })()}
          </div>
        </div>

        {/* Purchases */}
        <div className="mb-5 overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 bg-gray-50 px-4 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Purchases</span>
          </div>
          <div className="px-4 py-1">
            {(() => {
              const hasCap = fields.G10 > 0
              return (
                <>
                  {hasCap && <FieldRow code="G10" label="Capital purchases (GST inclusive)" amount={fields.G10} />}
                  <FieldRow code="G11" label="Non-capital purchases (GST inclusive)" amount={fields.G11} />
                  {hasCap && <FieldRow code="G12" label="Total purchases (G10 + G11)" amount={fields.G12} bold />}
                  <FieldRow code="1B" label="GST credits on purchases" amount={fields['1B']} bold />
                </>
              )
            })()}
          </div>
        </div>

        {/* Net position */}
        <div className={`overflow-hidden rounded-xl border px-4 py-3 ${isPayable ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
          <div className="flex items-baseline gap-3">
            <span className="w-12 shrink-0 font-mono text-sm font-bold text-gray-700">8A</span>
            <span className={`grow text-sm font-semibold ${isPayable ? 'text-red-800' : 'text-green-800'}`}>
              Net GST {isPayable ? 'payable' : 'refundable'}
            </span>
            <span className={`shrink-0 font-mono text-base font-bold tabular-nums ${isPayable ? 'text-red-700' : 'text-green-700'}`}>
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

// ── Transaction table (Bank / Income / Expense / Exclude / Note sheets) ───────

function TransactionTable({
  indexedRows,
  noteEdits,
  onNoteChange,
}: {
  indexedRows: { row: TransactionRow; origIdx: number }[]
  noteEdits: Map<number, string>
  onNoteChange: (origIdx: number, value: string) => void
}) {
  if (indexedRows.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-gray-400">
        No transactions on this sheet.
      </div>
    )
  }
  return (
    <table className="w-full border-collapse text-left">
      <thead className="sticky top-0 z-10 bg-gray-50">
        <tr className="border-b border-gray-200">
          <th className="w-8 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">#</th>
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
        {indexedRows.map(({ row, origIdx }, i) => {
          const excluded = isExcluded(row)
          const reviewReq = isReviewRequired(row)
          const { value, isDebit } = amountDisplay(row)
          const rowBg = reviewReq ? 'bg-amber-50' : excluded ? 'bg-gray-50' : 'bg-white hover:bg-gray-50'
          const noteValue = noteEdits.has(origIdx) ? noteEdits.get(origIdx)! : (row.note ?? '')
          return (
            <tr key={origIdx} className={`border-b border-gray-100 ${rowBg}`}>
              <td className="px-3 py-1.5 text-xs text-gray-400">{i + 1}</td>
              <td className="whitespace-nowrap px-3 py-1.5 text-xs text-gray-600">{row.date}</td>
              <td className="max-w-[140px] truncate px-3 py-1.5 text-xs text-gray-800" title={merchantDisplay(row) || ''}>{merchantDisplay(row)}</td>
              <td className="max-w-[200px] truncate px-3 py-1.5 text-xs text-gray-500" title={row.detail || ''}>{row.detail}</td>
              <td className={`whitespace-nowrap px-3 py-1.5 text-right font-mono text-xs font-medium ${isDebit ? 'text-red-600' : 'text-green-600'}`}>{value}</td>
              <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono text-xs text-gray-500">{gstAmtDisplay(row)}</td>
              <td className="px-3 py-1.5 font-mono text-xs text-gray-700">{row.gst_code || '—'}</td>
              <td className="max-w-[120px] truncate px-3 py-1.5 text-xs text-gray-500">{row.category || '—'}</td>
              <td className="px-3 py-1.5"><StatusChip row={row} /></td>
              <td className="px-1.5 py-1">
                <input
                  type="text"
                  value={noteValue}
                  onChange={e => onNoteChange(origIdx, e.target.value)}
                  placeholder="Add note…"
                  className="w-full min-w-[120px] rounded border border-transparent px-1.5 py-0.5 text-xs text-gray-700 placeholder-gray-300 hover:border-gray-200 focus:border-blue-400 focus:outline-none focus:ring-0"
                />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ── Client Detail right panel ─────────────────────────────────────────────────

function ClientDetailPanel({ client }: { client: ClientDetail | undefined }) {
  if (!client) {
    return <p className="px-4 py-4 text-xs text-gray-400">Loading client details…</p>
  }

  function Row({ label, value }: { label: string; value: string }) {
    return (
      <div className="border-b border-gray-100 py-2.5 last:border-0">
        <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
        <p className="break-words text-xs text-gray-800">{value}</p>
      </div>
    )
  }

  const statusLabel = client.status === 'open' ? 'Open' : client.status === 'closed' ? 'Closed' : client.status

  return (
    <div className="px-4 py-3">
      <Row label="Entity name" value={client.business_name} />
      {client.abn && <Row label="ABN" value={formatABN(client.abn)} />}
      <Row label="Entity type" value={ENTITY_TYPE_LABELS[client.entity_type] ?? client.entity_type} />
      {client.gst_registered_from && (
        <Row label="GST registered" value={`From ${fmtDate(client.gst_registered_from)}`} />
      )}
      {client.address && <Row label="Address" value={client.address} />}
      {client.engagement_date && (
        <Row label="Engaged since" value={fmtDate(client.engagement_date)} />
      )}
      {client.contact_email && <Row label="Contact email" value={client.contact_email} />}
      <div className="border-b border-gray-100 py-2.5 last:border-0">
        <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-wider text-gray-400">Status</p>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
          client.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
        }`}>
          <span className={`h-1.5 w-1.5 rounded-full ${client.status === 'open' ? 'bg-green-500' : 'bg-gray-400'}`} />
          {statusLabel}
        </span>
      </div>

    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SeniorBasDraftPage() {
  const { taskId } = useParams<{ taskId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [showApprove, setShowApprove] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [approveComment, setApproveComment] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [rejectError, setRejectError] = useState<string | null>(null)
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [activeSheet, setActiveSheet] = useState<SheetKey>('bas-draft')
  const [noteEdits, setNoteEdits] = useState<Map<number, string>>(new Map())

  function handleNoteChange(origIdx: number, value: string) {
    setNoteEdits(prev => new Map(prev).set(origIdx, value))
  }

  // BAS summary (from final/ JSON)
  const { data: summaryData, isLoading: summaryLoading, error: summaryError } = useQuery({
    queryKey: ['bas-summary', taskId],
    queryFn: () => api.get<{ data: { summary: BASSummary } }>(`/api/v1/tasks/${taskId}/bas-summary`).then(r => r.data),
    enabled: !!taskId,
    retry: false,
    throwOnError: false,
  })

  useEffect(() => {
    if (!summaryError) return
    const status = (summaryError as { response?: { status?: number } })?.response?.status
    if (status === 404 || status === 403) navigate('/conversation')
  }, [summaryError, navigate])

  // Transaction rows (from reviewed/ CSV)
  const { data: txData, isLoading: txLoading } = useQuery({
    queryKey: ['transactions', taskId],
    queryFn: () => api.get<{ data: { rows: TransactionRow[] } }>(`/api/v1/tasks/${taskId}/transactions`).then(r => r.data),
    enabled: !!taskId,
  })

  // Case tasks + client details
  const { data: caseInfoData } = useQuery({
    queryKey: ['case-info-sbd', taskId],
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
        tasks: tasksRes.data.data as CaseTask[],
        client: clientRes.data.data as ClientDetail,
      }
    },
    enabled: !!taskId,
  })

  const approveMut = useMutation({
    mutationFn: () => {
      const edits = Array.from(noteEdits.entries())
        .filter(([origIdx, note]) => note !== (allRows[origIdx]?.note ?? ''))
        .map(([origIdx, note]) => ({
          row_ref: String(origIdx + 1),
          field: 'note',
          old_value: allRows[origIdx]?.note ?? '',
          new_value: note,
        }))
      return api.post(`/api/v1/tasks/${taskId}/approve`, {
        comment: approveComment || null,
        edits: edits.length > 0 ? edits : null,
      })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bas-summary', taskId] }); navigate('/conversation') },
  })

  const rejectMut = useMutation({
    mutationFn: () => api.post(`/api/v1/tasks/${taskId}/reject`, { reject_comment: rejectReason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bas-summary', taskId] }); navigate('/conversation') },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setRejectError(msg ?? 'Failed to return for revision. Please try again.')
    },
  })

  const summary: BASSummary | undefined = summaryData?.data?.summary
  const allRows: TransactionRow[] = txData?.data?.rows ?? []
  const tasks: CaseTask[] = caseInfoData?.tasks ?? []
  const client: ClientDetail | undefined = caseInfoData?.client

  const sheetCounts = useMemo(() => ({
    bank:    allRows.length,
    income:  allRows.filter(r => parseFloat(r.money_in || '0') > 0 && !isExcluded(r)).length,
    expense: allRows.filter(r => parseFloat(r.money_out || '0') > 0 && !isExcluded(r)).length,
    exclude: allRows.filter(r => isExcluded(r)).length,
    note:    allRows.filter(r => (r.note ?? '').trim() !== '' || noteEdits.get(allRows.indexOf(r)) !== undefined).length,
  }), [allRows, noteEdits])

  const indexedSheetRows = useMemo(
    () => getIndexedSheetRows(activeSheet, allRows),
    [activeSheet, allRows],
  )

  const SHEET_TABS: { key: SheetKey; label: string; count?: number }[] = [
    { key: 'bas-draft', label: 'BAS Draft' },
    { key: 'bank',      label: 'All',           count: sheetCounts.bank },
    { key: 'income',    label: 'Total Income',  count: sheetCounts.income },
    { key: 'expense',   label: 'Total Expense', count: sheetCounts.expense },
    { key: 'exclude',   label: 'Excluded',      count: sheetCounts.exclude },
    { key: 'note',      label: 'Team Notes',    count: sheetCounts.note },
  ]

  return (
    <div className="flex h-full overflow-hidden">

      {/* Left: Folder Steps */}
      <TaskList
        tasks={tasks}
        currentTaskId={taskId ?? ''}
        collapsed={leftCollapsed}
        onToggle={() => setLeftCollapsed(v => !v)}
      />

      {/* Center */}
      <main className="flex flex-1 flex-col overflow-hidden bg-gray-50">

        {/* Header */}
        <div className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-6">
          <h1 className="text-base font-semibold text-gray-900">BAS draft review</h1>
          {summary && (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
              awaiting your review
            </span>
          )}
          {summary && (
            <span className="ml-auto text-xs text-gray-400">{summary.business_name} · {summary.period}</span>
          )}
        </div>

        {/* Sheet tabs */}
        <div className="flex h-10 flex-shrink-0 items-center gap-1 border-b border-gray-200 bg-white px-4">
          {SHEET_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveSheet(tab.key)}
              className={`flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-colors ${
                activeSheet === tab.key
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  activeSheet === tab.key ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-auto">
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
          {activeSheet === 'bas-draft' ? (
            summaryLoading ? (
              <div className="flex h-32 items-center justify-center text-sm text-gray-400">Loading BAS draft…</div>
            ) : summaryError || !summary ? (
              <div className="flex h-32 items-center justify-center text-sm text-red-400">Failed to load BAS summary.</div>
            ) : (
              <BASDraftCenter summary={summary} client={client} />
            )
          ) : (
            txLoading ? (
              <div className="flex h-32 items-center justify-center text-sm text-gray-400">Loading workpaper…</div>
            ) : (
              <TransactionTable
                indexedRows={indexedSheetRows}
                noteEdits={noteEdits}
                onNoteChange={handleNoteChange}
              />
            )
          )}
        </div>

        {/* Approve / Reject controls */}
        <div className="flex flex-shrink-0 items-center justify-end gap-3 border-t border-gray-200 bg-white px-6 py-3">
          <button
            onClick={() => setShowReject(true)}
            className="rounded-lg border border-red-300 px-5 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Return for revision
          </button>
          <button
            onClick={() => setShowApprove(true)}
            disabled={!summary}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            Confirm &amp; send to manager
          </button>
        </div>
      </main>

      {/* Right: Client Detail */}
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
              <ClientDetailPanel client={client} />
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
          onConfirm={() => { setRejectError(null); rejectMut.mutate() }}
          onClose={() => { setShowReject(false); setRejectError(null) }}
          loading={rejectMut.isPending}
          error={rejectError}
        />
      )}
    </div>
  )
}
