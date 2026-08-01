import { useState, useMemo, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

// ── Types ─────────────────────────────────────────────────────────────────────

interface QueryDoc {
  id: string
  file_name: string
}

interface QueryAnswer {
  id: string
  transaction_row_ref: string | number | null
  client_answer: string | null
  status: 'pending' | 'answered' | 'resolved'
  answered_at: string | null
  docs?: QueryDoc[]
}

interface TransactionRow {
  account?: string
  date: string
  detail: string
  payee: string
  payer: string
  money_out: string
  money_in: string
  balance?: string
  gst_code: string
  coding_basis: string
  confidence_score: string
  flag_reason: string
  flagged: string
  category?: string
  review_status?: string
  review_reason?: string
  explanation?: string
  bas_participation?: string
  note?: string
}

interface TaskDetail {
  id: string
  task_type: string
  status: string
  case_id: string
  assigned_to: string | null
  reject_comment: string | null
  sla_due_at: string | null
  cases?: {
    period: string
    case_type: string
    firm_id: string
    clients?: { business_name: string; abn: string }
  }
}

interface CaseTask {
  id: string
  task_type: string
  status: string
  assigned_agent: string | null
}

interface TransactionsData {
  rows: TransactionRow[]
  file_id: string
  file_state: string
  row_count: number
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
  manager_review:      'Manager review',
  client_confirm:      'Client confirmation',
  certify:             'Certify',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isConflicting(row: TransactionRow): boolean {
  return row.coding_basis === 'conflicting_signals'
}

function merchantDisplay(row: TransactionRow): string {
  return row.payee || row.payer || '—'
}




const fmtAmt = (n: number) =>
  '$' + n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function amountDisplay(row: TransactionRow): { value: string; isDebit: boolean } {
  const out = parseFloat(row.money_out)
  if (out) return { value: fmtAmt(out), isDebit: true }
  const inp = parseFloat(row.money_in)
  if (inp) return { value: fmtAmt(inp), isDebit: false }
  return { value: '—', isDebit: true }
}

function gstAmount(row: TransactionRow, editedCode?: string, editedStatus?: string): string {
  if (row.category === 'income_platform') return '—'
  // Review Required = GST_PENDING; estimate is meaningless until accountant confirms GST code
  const status = editedStatus ?? row.review_status ?? ''
  if (status === 'Review Required') return '—'
  const code = editedCode ?? row.gst_code
  const hasGst = new Set(['GST_STANDARD', 'CAPITAL_GST', 'G1', 'G10', 'G11'])
  if (!code || !hasGst.has(code)) return '—'
  const raw = parseFloat(row.money_out || '0') || parseFloat(row.money_in || '0') || 0
  if (!raw) return '—'
  return fmtAmt(raw / 11)
}

function sortedByTaskOrder(tasks: CaseTask[]): CaseTask[] {
  return [...tasks].sort((a, b) => {
    const ai = TASK_ORDER.indexOf(a.task_type)
    const bi = TASK_ORDER.indexOf(b.task_type)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })
}

function computeGstSummary(rows: TransactionRow[]) {
  let g1 = 0, g10 = 0, g11 = 0
  for (const row of rows) {
    const out = parseFloat(row.money_out) || 0
    const inp = parseFloat(row.money_in) || 0
    // Semantic codes
    if (row.gst_code === 'GST_STANDARD') {
      if (inp > 0) g1 += inp; else g11 += out
    }
    if (row.gst_code === 'CAPITAL_GST') g10 += out
    // Legacy codes from firm custom rules
    if (row.gst_code === 'G1')  g1  += inp
    if (row.gst_code === 'G10') g10 += out
    if (row.gst_code === 'G11') g11 += out
  }
  const oneA = Math.round((g1 / 11) * 100) / 100
  const oneB = Math.round(((g10 + g11) / 11) * 100) / 100
  return { g1, g11, oneA, oneB, net: Math.round((oneA - oneB) * 100) / 100 }
}

// ── Small components ──────────────────────────────────────────────────────────

function StatusDot({ status, isCurrent = false }: { status: string; isCurrent?: boolean }) {
  if (isCurrent) {
    return <span className="inline-block h-2 w-2 flex-shrink-0 rounded-full bg-gray-900" />
  }
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
  return (
    <span className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${cls[status] ?? 'border border-gray-300 bg-transparent'}`} />
  )
}

// ── Left panel: Task list ─────────────────────────────────────────────────────

function TaskList({
  tasks, currentTaskId, collapsed, onToggle,
}: {
  tasks: CaseTask[]
  currentTaskId: string
  collapsed: boolean
  onToggle: () => void
}) {
  const sorted = sortedByTaskOrder(tasks)
  const activeIndex = sorted.findIndex((t) => ['in_progress', 'waiting_human'].includes(t.status))
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
          // Downstream tasks that appear "done" while an upstream gate is still open
          // are stale from a previous run — display them as pending (empty circle)
          const _DONE_STATUSES = new Set(['complete', 'approved', 'validated', 'reviewed', 'confirmed', 'certified'])
          const effectiveStatus =
            activeIndex !== -1 && idx > activeIndex && _DONE_STATUSES.has(t.status)
              ? 'pending'
              : t.status
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

// ── Sheet tabs ────────────────────────────────────────────────────────────────

function SheetTabs({
  active,
  onChange,
  counts,
}: {
  active: 1 | 2 | 3 | 4
  onChange: (s: 1 | 2 | 3 | 4) => void
  counts: [number, number, number, number]
}) {
  const tabs: { label: string; sheet: 1 | 2 | 3 | 4 }[] = [
    { label: 'All transactions', sheet: 1 },
    { label: 'Ready for GST',   sheet: 2 },
    { label: 'Non-GST',         sheet: 3 },
    { label: 'Review Required', sheet: 4 },
  ]
  return (
    <div className="flex flex-shrink-0 gap-1 border-b border-gray-200 bg-white px-4 pt-2">
      {tabs.map(({ label, sheet }, i) => (
        <button
          key={sheet}
          onClick={() => onChange(sheet)}
          className={`flex items-center gap-1.5 rounded-t-md px-3 py-1.5 text-xs font-medium transition-colors ${
            active === sheet
              ? 'border border-b-white border-gray-200 bg-white text-gray-900 -mb-px'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {label}
          <span className={`rounded-full px-1.5 py-0.5 text-xs ${active === sheet ? 'bg-gray-100 text-gray-700' : 'bg-gray-100 text-gray-500'}`}>
            {counts[i]}
          </span>
        </button>
      ))}
    </div>
  )
}

// ── Exclusion reason lookup (Non-BAS tab) ─────────────────────────────────────

const EXCLUSION_REASONS: Record<string, string> = {
  // Current v2 categories (BAS_EXCLUDED)
  'finance_loan:BAS_EXCLUDED':        'Loan drawdown — financing activity, not a taxable supply.',
  'finance_repayment:BAS_EXCLUDED':   'Loan repayment — financing activity, not a taxable supply.',
  'expense_tax:BAS_EXCLUDED':         'Payment to ATO — not a taxable supply.',
  'finance_card:BAS_EXCLUDED':        'Credit card repayment — settling existing liability, not a taxable supply.',
  'transfer_internal:BAS_EXCLUDED':   'Internal transfer between own accounts — not a taxable supply.',
  'expense_payroll:BAS_EXCLUDED':     'Wages and superannuation — outside the scope of GST.',
  'transfer_unknown:BAS_EXCLUDED':    'Unidentified transfer — verify accounts before excluding from BAS.',
  'finance_drawings:BAS_EXCLUDED':    'Owner drawing — not a business transaction subject to GST.',
  'finance_equity:BAS_EXCLUDED':      'Capital contribution — financing activity, not a taxable supply.',
  'income_government:BAS_EXCLUDED':   'Government refund — not assessable income for BAS purposes.',
  // Current v2 categories (INPUT_TAXED — Div 40 financial supplies)
  'expense_bank_fee:INPUT_TAXED':     'Bank fee — financial supply (Div 40), no ITC claimable.',
  'expense_interest:INPUT_TAXED':     'Loan interest — financial supply (Div 40), no ITC claimable.',
  // Legacy category keys — backward compat with old CSVs
  'loan_received:BAS_EXCLUDED':              'Loan drawdown — financing activity, not a taxable supply.',
  'loan_repayment:BAS_EXCLUDED':             'Loan repayment — financing activity, not a taxable supply.',
  'tax_payment:BAS_EXCLUDED':                'Payment to ATO — not a taxable supply.',
  'credit_card_repayment:BAS_EXCLUDED':      'Credit card repayment — settling existing liability, not a taxable supply.',
  'bank_fee:BAS_EXCLUDED':                   'Bank account fee — financial supply, no GST component.',
  'interest_expense:BAS_EXCLUDED':           'Interest payment — financial supply, no ITC claimable.',
  'expense_bank_fee:BAS_EXCLUDED':           'Bank account fee — financial supply, no GST component.',
  'expense_interest:BAS_EXCLUDED':           'Interest payment — financial supply, no ITC claimable.',
  'payroll:BAS_EXCLUDED':                    'Wages and superannuation — outside the scope of GST.',
  'transfer_in:BAS_EXCLUDED':                'Internal transfer between own accounts — not a taxable supply.',
  'transfer_out:BAS_EXCLUDED':               'Internal transfer between own accounts — not a taxable supply.',
  'owner_drawings:BAS_EXCLUDED':             'Owner drawing — not a business transaction subject to GST.',
  'capital_injection:BAS_EXCLUDED':          'Capital contribution — financing activity, not a taxable supply.',
  'owner_contribution:BAS_EXCLUDED':         'Owner contribution — financing activity, not a taxable supply.',
  'atm_cash:BAS_EXCLUDED':                   'Cash withdrawal — no GST supply event.',
  'government_refund:BAS_EXCLUDED':          'Government refund — not assessable income for BAS purposes.',
  'possible_internal_transfer:BAS_EXCLUDED': 'Suspected internal transfer — verify accounts before excluding.',
  // Legacy N-T / G20 keys
  'transfer_in:N-T':        'Internal transfer between accounts — not a taxable supply.',
  'transfer_out:N-T':       'Internal transfer or owner drawing — not a taxable supply.',
  'payroll:N-T':            'Wages and superannuation — outside the scope of GST.',
  'tax_payment:G20':        'Payment to ATO — not a taxable supply.',
  'loan_received:N-T':      'Loan proceeds — financing activity, not a taxable supply.',
  'capital_injection:N-T':  'Capital contribution — financing activity, not a taxable supply.',
  'owner_drawings:N-T':     'Owner drawing — not a business transaction subject to GST.',
  'owner_contribution:N-T': 'Owner contribution — financing activity, not a taxable supply.',
}

function exclusionReasonText(category: string | undefined, gstCode: string | undefined): string {
  const key = `${category || ''}:${gstCode || ''}`
  return EXCLUSION_REASONS[key] ?? '—'
}

// ── GST summary strip ─────────────────────────────────────────────────────────

const GST_CODES = [
  'GST_STANDARD',
  'GST_FREE',
  'INPUT_TAXED',
  'CAPITAL_GST',
  'EXPORT',
  'BAS_EXCLUDED',
]

const GST_CODE_LABELS: Record<string, string> = {
  GST_STANDARD: 'Taxable Supplies',
  GST_FREE:     'GST-Free Supplies',
  INPUT_TAXED:  'Input Taxed Supplies',
  CAPITAL_GST:  'Capital Acquisition',
  EXPORT:       'Exported Supplies',
  BAS_EXCLUDED: 'Out of Scope',
  GST_PENDING:  'Pending Classification',
  MIXED_SUPPLY: 'Mixed Supply',
}

const CATEGORY_OPTIONS = [
  // Income
  'income_sales', 'income_refund', 'income_interest', 'income_grant',
  'income_platform', 'income_government', 'income_individual', 'income_other',
  // Expense — L2 Accounting Nature (Category = Nature of Expense, not Merchant type)
  'expense_general', 'expense_materials', 'expense_tools', 'expense_hire',
  'expense_fuel', 'expense_vehicle', 'expense_software', 'expense_digital_services',
  'expense_telecom', 'expense_utilities', 'expense_insurance', 'expense_professional',
  'expense_marketing', 'expense_office', 'expense_rent', 'expense_payroll',
  'expense_bank_fee', 'expense_interest', 'expense_loan_fee',
  'expense_tax', 'expense_council', 'expense_government', 'expense_registration',
  'expense_travel', 'expense_meals', 'expense_accommodation',
  'expense_freight', 'expense_postage', 'expense_training', 'expense_convenience',
  'expense_other',
  // Asset
  'asset_equipment', 'asset_vehicle', 'asset_property', 'asset_software', 'asset_other',
  // Payment (outgoing to named entity, nature TBC)
  'payment_supplier', 'payment_individual',
  // Finance
  'finance_loan', 'finance_repayment', 'finance_equity', 'finance_drawings',
  'finance_vehicle', 'finance_card',
  // Transfer
  'transfer_internal', 'transfer_unknown',
]

// ── Transaction table ─────────────────────────────────────────────────────────

type RowEdit = { gst_code?: string; category?: string; review_status?: string; bas_participation?: string; note?: string }

const STATUS_OPTIONS = ['Inferred', 'Review Required'] as const

function TransactionTable({
  rows, edits, onEdit, activeSheet, querySelectedRows, onQueryToggle, onQuerySelectAll, queryAnswerByRef,
}: {
  rows: { row: TransactionRow; originalIdx: number }[]
  edits: Map<number, RowEdit>
  onEdit: (origIdx: number, field: keyof RowEdit, value: string) => void
  activeSheet: 1 | 2 | 3 | 4
  querySelectedRows?: Set<number>
  onQueryToggle?: (originalIdx: number) => void
  onQuerySelectAll?: (idxs: number[], shouldSelect: boolean) => void
  queryAnswerByRef?: Map<number, QueryAnswer>
}) {
  const [docPopover, setDocPopover] = useState<{ queryId: string; docs: QueryDoc[]; top: number; right: number } | null>(null)

  useEffect(() => {
    if (!docPopover) return
    const close = () => setDocPopover(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [docPopover])

  // Clear popover on sheet change
  useEffect(() => { setDocPopover(null) }, [activeSheet])

  async function openDocUrl(docId: string) {
    try {
      const res = await api.get<{ data: { url: string } }>(`/api/v1/documents/${docId}/download-url`)
      window.open(res.data.data.url, '_blank', 'noreferrer')
    } catch {
      // fail silently
    }
  }
  return (
    <table className="min-w-full border-collapse text-xs">
      <thead>
        <tr className="sticky top-0 z-10 bg-gray-50 text-left">
          <th className="border-b border-gray-200 px-3 py-2.5 font-medium text-gray-600">#</th>
          <th className="border-b border-gray-200 px-3 py-2.5 font-medium text-gray-600">Date</th>
          <th className="border-b border-gray-200 px-3 py-2.5 font-medium text-gray-600">Merchant</th>
          <th className="border-b border-gray-200 px-3 py-2.5 font-medium text-gray-600">Description</th>
          <th className="border-b border-gray-200 px-3 py-2.5 font-medium text-gray-600">Amount</th>
          <th className="border-b border-gray-200 px-3 py-2.5 font-medium text-gray-600">GST Amt</th>
          <th className="border-b border-gray-200 px-3 py-2.5 font-medium text-gray-600">GST Code</th>
          <th className="border-b border-gray-200 px-3 py-2.5 font-medium text-gray-600">Category</th>
          <th className="border-b border-gray-200 px-3 py-2.5 font-medium text-gray-600">Status</th>
          <th className="border-b border-gray-200 px-3 py-2.5 font-medium text-gray-600">Explanation</th>
          <th className="border-b border-gray-200 px-3 py-2.5 font-medium text-gray-600">Note</th>
          {queryAnswerByRef && queryAnswerByRef.size > 0 && (
            <th className="border-b border-gray-200 px-3 py-2.5 min-w-[140px] whitespace-nowrap font-medium text-blue-600">
              Client Reply
            </th>
          )}
          {onQueryToggle && activeSheet === 4 && (() => {
            const allIdxs   = rows.map(r => r.originalIdx)
            const allSel    = allIdxs.length > 0 && allIdxs.every(i => querySelectedRows?.has(i))
            const someSel   = !allSel && allIdxs.some(i => querySelectedRows?.has(i))
            return (
              <th className="border-b border-gray-200 px-3 py-2.5 whitespace-nowrap text-center">
                <div className="flex items-center justify-center gap-1">
                  <span className="text-[10px] text-indigo-500 font-semibold uppercase">Query</span>
                  <input
                    type="checkbox"
                    checked={allSel}
                    ref={el => { if (el) el.indeterminate = someSel }}
                    onChange={() => onQuerySelectAll?.(allIdxs, !allSel)}
                    className="h-3.5 w-3.5 rounded border-gray-300 accent-indigo-600"
                    title={allSel ? 'Deselect all' : 'Select all'}
                  />
                </div>
              </th>
            )
          })()}
        </tr>
      </thead>
      <tbody>
        {rows.map(({ row, originalIdx }) => {
          const effectiveStatus = edits.get(originalIdx)?.review_status ?? row.review_status ?? 'Inferred'
          const { value: amtVal, isDebit } = amountDisplay(row)
          const effectiveGstCode = edits.get(originalIdx)?.gst_code ?? row.gst_code ?? ''
          const effectiveBp = ['BAS_EXCLUDED', 'N-T'].includes(effectiveGstCode)
            ? 'excluded'
            : (edits.get(originalIdx)?.bas_participation ?? row.bas_participation ?? 'included')
          const rowBg = isConflicting(row)
            ? 'border-l-4 border-red-400 bg-red-50'
            : effectiveStatus === 'Review Required'
            ? 'bg-amber-50'
            : effectiveBp === 'excluded'
            ? 'bg-gray-50'
            : 'bg-white hover:bg-gray-50'
          return (
            <tr key={originalIdx} className={`border-b border-gray-100 ${rowBg}`}>
              <td className="px-3 py-2 text-gray-400 tabular-nums">{originalIdx + 1}</td>
              <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{row.date || '—'}</td>
              <td className="max-w-[120px] truncate px-3 py-2 text-gray-700" title={merchantDisplay(row) || ''}>{merchantDisplay(row)}</td>
              <td className="max-w-[180px] truncate px-3 py-2 text-gray-500" title={row.detail || ''}>{row.detail || '—'}</td>
              <td className={`px-3 py-2 tabular-nums whitespace-nowrap font-medium ${isDebit ? 'text-red-600' : 'text-green-600'}`}>
                {amtVal !== '—' ? amtVal : '—'}
              </td>
              <td className="px-3 py-2 tabular-nums text-gray-700">{gstAmount(row, edits.get(originalIdx)?.gst_code, edits.get(originalIdx)?.review_status)}</td>
              <td className="px-3 py-2">
                <select
                  value={edits.get(originalIdx)?.gst_code ?? row.gst_code ?? ''}
                  onChange={e => onEdit(originalIdx, 'gst_code', e.target.value)}
                  className="appearance-none rounded border border-transparent bg-transparent font-mono text-xs font-medium text-gray-800 hover:border-gray-300 focus:border-blue-400 focus:outline-none"
                >
                  {!row.gst_code && <option value="">— select —</option>}
                  {(() => { const cur = edits.get(originalIdx)?.gst_code ?? row.gst_code ?? ''; return !GST_CODES.includes(cur) && cur ? <option value={cur} disabled>{GST_CODE_LABELS[cur] ?? cur}</option> : null })()}
                  {GST_CODES.map(c => <option key={c} value={c}>{GST_CODE_LABELS[c] ?? c}</option>)}
                </select>
              </td>
              <td className="px-3 py-2">
                <select
                  value={edits.get(originalIdx)?.category ?? row.category ?? ''}
                  onChange={e => onEdit(originalIdx, 'category', e.target.value)}
                  className="appearance-none rounded border border-transparent bg-transparent text-xs text-gray-600 hover:border-gray-300 focus:border-blue-400 focus:outline-none"
                >
                  {(!row.category || row.category === 'unclassified') && <option value="">— select —</option>}
                  {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                </select>
              </td>
              <td className="px-3 py-2">
                <select
                  value={effectiveStatus}
                  onChange={e => onEdit(originalIdx, 'review_status', e.target.value)}
                  className="appearance-none rounded border border-transparent bg-transparent text-xs hover:border-gray-300 focus:border-blue-400 focus:outline-none"
                >
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </td>
              <td className="max-w-[200px] truncate px-3 py-2 text-gray-500" title={row.explanation || exclusionReasonText(row.category, row.gst_code)}>
                {row.explanation || exclusionReasonText(row.category, row.gst_code) || '—'}
              </td>
              <td className="px-3 py-2 min-w-[140px]">
                <input
                  type="text"
                  value={edits.get(originalIdx)?.note ?? row.note ?? ''}
                  onChange={e => onEdit(originalIdx, 'note', e.target.value)}
                  placeholder="Add note…"
                  className="w-full rounded border border-transparent bg-transparent text-[11px] text-gray-600 placeholder:text-gray-300 hover:border-gray-300 focus:border-blue-400 focus:outline-none px-1"
                />
              </td>
              {queryAnswerByRef && queryAnswerByRef.size > 0 && (() => {
                const qa = queryAnswerByRef.get(originalIdx)
                const clientAnswer = (qa?.status === 'answered' || qa?.status === 'resolved') ? qa!.client_answer : null
                const docs = qa?.docs ?? []
                if (!clientAnswer && docs.length === 0) {
                  return <td className="px-3 py-2 text-[11px] text-gray-300 italic">—</td>
                }
                const hasPopover = docPopover?.queryId === qa!.id
                return (
                  <td className="px-3 py-2 text-[11px] min-w-[140px] relative">
                    <div className="flex items-start gap-1.5">
                      <span className="text-blue-400 shrink-0 mt-0.5">💬</span>
                      <span className="italic text-blue-600 line-clamp-2 flex-1">{clientAnswer}</span>
                      {docs.length > 0 && (
                        <button
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${hasPopover ? 'bg-blue-100 text-blue-700' : 'bg-blue-50 text-blue-500 hover:bg-blue-100'}`}
                          title={docs.length === 1 ? `View: ${docs[0].file_name}` : `${docs.length} attachments`}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (docs.length === 1) {
                              openDocUrl(docs[0].id)
                            } else {
                              if (hasPopover) { setDocPopover(null) } else {
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                                setDocPopover({ queryId: qa!.id, docs, top: rect.bottom + 4, right: window.innerWidth - rect.right })
                              }
                            }
                          }}
                        >
                          📎{docs.length > 1 ? ` ${docs.length}` : ''}
                        </button>
                      )}
                    </div>
                    {hasPopover && (
                      <div
                        style={{ position: 'fixed', top: docPopover!.top, right: docPopover!.right }}
                        className="z-50 w-60 rounded-lg border border-gray-200 bg-white shadow-lg py-1"
                      >
                        <p className="px-3 pt-1.5 pb-1 text-[10px] text-gray-400 uppercase font-semibold tracking-wide">Attachments</p>
                        {docs.map(doc => (
                          <button
                            key={doc.id}
                            className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                            onClick={(e) => { e.stopPropagation(); openDocUrl(doc.id); setDocPopover(null) }}
                          >
                            <span className="text-gray-400 shrink-0">📄</span>
                            <span className="truncate">{doc.file_name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                )
              })()}
              {onQueryToggle && activeSheet === 4 && (
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={querySelectedRows?.has(originalIdx) ?? false}
                    onChange={() => onQueryToggle(originalIdx)}
                    className="h-3.5 w-3.5 rounded border-gray-300 accent-indigo-600"
                  />
                </td>
              )}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ── Right panel components ─────────────────────────────────────────────────────

function GstBreakdownSection({ rows }: { rows: TransactionRow[] }) {
  const { g1, g11, oneA, oneB, net } = computeGstSummary(rows)
  const fmt = (n: number) => '$' + n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const _EXCL_CODES = new Set(['BAS_EXCLUDED', 'N-T'])
  const isExcl = (r: TransactionRow) =>
    _EXCL_CODES.has(r.gst_code ?? '') || r.bas_participation === 'excluded'
  const sortedDates = rows.map(r => r.date).filter(Boolean).sort()
  const coverageFrom = sortedDates.length ? sortedDates[0] : '—'
  const coverageTo   = sortedDates.length ? sortedDates[sortedDates.length - 1] : '—'
  const countInferred = rows.filter(r => !isExcl(r) && r.review_status !== 'Review Required').length
  const countNonBas   = rows.filter(isExcl).length
  const countReview   = rows.filter(r => r.review_status === 'Review Required').length
  return (
    <div className="border-t border-gray-200 px-4 py-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">GST Breakdown</p>
      <div className="space-y-0">
        <div className="flex h-7 items-center justify-between">
          <span className="text-xs text-gray-500">Total Sales</span>
          <span className="font-mono text-xs font-medium text-gray-800">{fmt(g1)}</span>
        </div>
        <div className="flex h-7 items-center justify-between">
          <span className="text-xs text-gray-500">Non-Capital Purchases</span>
          <span className="font-mono text-xs font-medium text-gray-800">{fmt(g11)}</span>
        </div>
        <div className="flex h-7 items-center justify-between">
          <span className="text-xs text-gray-500">GST on Sales</span>
          <span className="font-mono text-xs font-medium text-gray-800">{fmt(oneA)}</span>
        </div>
        <div className="flex h-7 items-center justify-between">
          <span className="text-xs text-gray-500">GST on Purchases</span>
          <span className="font-mono text-xs font-medium text-gray-800">{fmt(oneB)}</span>
        </div>
        <div className={`mt-1.5 flex h-8 items-center justify-between rounded px-2 ${net >= 0 ? 'bg-red-50' : 'bg-green-50'}`}>
          <span className="text-xs font-semibold text-gray-700">Est. Net GST {net >= 0 ? '(Payable)' : '(Refundable)'}</span>
          <span className={`font-mono text-xs font-bold ${net >= 0 ? 'text-red-700' : 'text-green-700'}`}>
            {net >= 0 ? fmt(net) : '-' + fmt(Math.abs(net))}
          </span>
        </div>
        <div className="mt-3 space-y-0 border-t border-gray-200 pt-3">
          <div className="flex h-7 items-center justify-between">
            <span className="text-xs text-gray-500">Coverage</span>
            <span className="font-mono text-xs text-gray-700">{coverageFrom} – {coverageTo}</span>
          </div>
          <div className="flex h-7 items-center justify-between">
            <span className="text-xs text-gray-500">Transactions</span>
            <span className="font-mono text-xs font-medium text-gray-800">{rows.length}</span>
          </div>
          <div className="flex h-7 items-center justify-between">
            <span className="text-xs text-gray-500">Ready for GST</span>
            <span className="font-mono text-xs font-medium text-gray-800">{countInferred}</span>
          </div>
          <div className="flex h-7 items-center justify-between">
            <span className="text-xs text-gray-500">Non-GST</span>
            <span className="font-mono text-xs font-medium text-gray-800">{countNonBas}</span>
          </div>
          <div className="flex h-7 items-center justify-between">
            <span className="text-xs text-gray-500">Review Required</span>
            <span className={`font-mono text-xs font-medium ${countReview > 0 ? 'text-amber-600' : 'text-gray-800'}`}>{countReview}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Approve confirm modal ─────────────────────────────────────────────────────

function ApproveConfirmModal({
  rowCount, conflictCount, flaggedCount, comment, onCommentChange, onConfirm, onCancel, loading,
}: {
  rowCount: number
  conflictCount: number
  flaggedCount: number
  comment: string
  onCommentChange: (v: string) => void
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[26rem] rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Approve GST coding?</h2>
        <div className="mb-3 space-y-2">
          <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2.5">
            <svg className="h-4 w-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            <span className="text-sm text-gray-700">{rowCount} transaction{rowCount !== 1 ? 's' : ''} reviewed</span>
          </div>
          {conflictCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
              <svg className="h-4 w-4 flex-shrink-0 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              <span className="text-sm font-medium text-red-700">
                Approval blocked — {conflictCount} row{conflictCount !== 1 ? 's' : ''} with blank GST code.
              </span>
            </div>
          )}
          {flaggedCount > conflictCount && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
              <span className="text-sm text-amber-700">
                {flaggedCount - conflictCount} Review Required row{flaggedCount - conflictCount !== 1 ? 's' : ''} — confirmed reviewed?
              </span>
            </div>
          )}
        </div>
        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Review note <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <textarea
            value={comment}
            onChange={(e) => onCommentChange(e.target.value)}
            rows={2}
            placeholder="e.g. Confirmed Toyota loan as N-T — financing activity."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
            Go back
          </button>
          <button
            onClick={onConfirm}
            disabled={loading || conflictCount > 0}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-40"
          >
            {loading ? 'Approving…' : 'Confirm Approval'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Reject modal ──────────────────────────────────────────────────────────────

function RejectModal({
  reason, onReasonChange, onConfirm, onCancel, loading,
}: {
  reason: string
  onReasonChange: (v: string) => void
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-96 rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-base font-semibold text-gray-900">Reject GST coding</h2>
        <p className="mb-3 text-sm text-gray-500">
          Explain what needs to be corrected. This will be shown to the Junior and logged in the folder.
        </p>
        <textarea
          autoFocus
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          rows={3}
          placeholder="e.g. Rows 4 and 7 appear to be capital purchases — should be G10, not G11."
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <div className="mt-4 flex justify-end gap-3">
          <button onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={!reason.trim() || loading}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40"
          >
            {loading ? 'Rejecting…' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Generate Query Modal ──────────────────────────────────────────────────────

function GenerateQueryModal({
  caseId, selectedIdxs, allRows, edits, onClose,
}: {
  caseId: string
  selectedIdxs: Set<number>
  allRows: TransactionRow[]
  edits: Map<number, RowEdit>
  onClose: () => void
}) {
  const [password, setPassword] = useState('')
  const [generatedLink, setGeneratedLink] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleGenerate() {
    if (password.length < 4) { setError('Password must be at least 4 characters.'); return }
    setLoading(true); setError(null)
    const queries = [...selectedIdxs].map((originalIdx) => {
      const row = allRows[originalIdx]
      const out = parseFloat(row.money_out)
      const inp = parseFloat(row.money_in)
      return {
        transaction_row_ref: String(originalIdx),
        merchant: row.payee || row.payer || '—',
        amount: out
          ? `-$${out.toLocaleString('en-AU', { minimumFractionDigits: 2 })}`
          : inp
          ? `$${inp.toLocaleString('en-AU', { minimumFractionDigits: 2 })}`
          : '',
        date: row.date || undefined,
        description: row.detail || undefined,
        account: row.account || undefined,
        query_text: row.explanation || 'Please confirm the GST classification of this transaction.',
        context_note: (edits.get(originalIdx)?.note ?? row.note ?? undefined) || undefined,
      }
    })
    try {
      const res = await api.post<{ data: { token: string } }>(`/api/v1/cases/${caseId}/query-link`, { case_id: caseId, password, queries })
      const token = res.data.data.token
      setGeneratedLink(`${window.location.origin}/q/${token}`)
    } catch {
      setError('Failed to generate link. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function copyLink() {
    if (!generatedLink) return
    navigator.clipboard.writeText(generatedLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[460px] rounded-xl bg-white p-6 shadow-xl">
        {!generatedLink ? (
          <>
            <h2 className="mb-1 text-base font-semibold text-gray-900">Send client query</h2>
            <p className="mb-4 text-sm text-gray-500">
              {selectedIdxs.size} review-required transaction{selectedIdxs.size !== 1 ? 's' : ''} selected.
              Your client will receive a link to answer each question and submit back.
            </p>
            <label className="mb-1 block text-xs font-medium text-gray-700">Link password</label>
            <input
              autoFocus
              type="text"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Choose a short password for your client"
              className="mb-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <p className="mb-4 text-xs text-gray-400">Share this password separately (e.g. over phone or WeChat). Min 4 characters.</p>
            {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-3">
              <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
              <button
                onClick={handleGenerate}
                disabled={loading || password.length < 4}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
              >
                {loading ? 'Generating…' : 'Generate link'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="mb-1 text-base font-semibold text-gray-900">Query link ready</h2>
            <p className="mb-3 text-sm text-gray-500">Copy this link and send it to your client via any channel.</p>
            <div className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
              <p className="break-all text-xs font-mono text-indigo-700">{generatedLink}</p>
            </div>
            <p className="mb-4 text-xs text-gray-500">
              <span className="font-medium">Password:</span> {password}
            </p>
            <p className="mb-4 text-xs text-gray-400">
              <span className="font-medium">Questions:</span> {selectedIdxs.size} transaction{selectedIdxs.size !== 1 ? 's' : ''}
            </p>
            <p className="text-xs text-gray-400">Share the password separately from the link.</p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={copyLink}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${copied ? 'bg-green-600' : 'bg-indigo-600 hover:bg-indigo-700'}`}
              >
                {copied ? 'Copied!' : 'Copy link'}
              </button>
              <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SeniorReviewPage() {
  const { taskId } = useParams<{ taskId: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const queryClient = useQueryClient()

  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [activeSheet, setActiveSheet] = useState<1 | 2 | 3 | 4>(1)
  const [accountFilter, setAccountFilter] = useState<string>('ALL')
  const [edits, setEdits] = useState<Map<number, RowEdit>>(new Map())
  const [querySelectedRows, setQuerySelectedRows] = useState<Set<number>>(new Set())
  const [showQueryModal, setShowQueryModal] = useState(false)
  const handleEdit = (idx: number, field: keyof RowEdit, value: string) => {
    setEdits(prev => {
      const next = new Map(prev)
      next.set(idx, { ...prev.get(idx), [field]: value })
      return next
    })
  }

  function toggleQueryRow(originalIdx: number) {
    setQuerySelectedRows(prev => {
      const next = new Set(prev)
      if (next.has(originalIdx)) next.delete(originalIdx); else next.add(originalIdx)
      return next
    })
  }

  function selectAllQueryRows(idxs: number[], shouldSelect: boolean) {
    setQuerySelectedRows(prev => {
      const next = new Set(prev)
      idxs.forEach(i => (shouldSelect ? next.add(i) : next.delete(i)))
      return next
    })
  }
  const [approveOpen, setApproveOpen] = useState(false)
  const [approveComment, setApproveComment] = useState('')
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  // ── Queries ────────────────────────────────────────────────────────────────

  const taskQuery = useQuery({
    queryKey: ['task', taskId],
    queryFn: () =>
      api.get<{ data: TaskDetail }>(`/api/v1/tasks/${taskId}`).then((r) => r.data.data),
    enabled: !!taskId,
    retry: false,
    throwOnError: false,
  })

  useEffect(() => {
    if (!taskQuery.error) return
    const status = (taskQuery.error as { response?: { status?: number } })?.response?.status
    if (status === 404 || status === 403) navigate('/conversation')
  }, [taskQuery.error, navigate])

  const task = taskQuery.data
  const caseId = task?.case_id

  const caseTasksQuery = useQuery({
    queryKey: ['case-tasks', caseId],
    queryFn: () =>
      api.get<{ data: CaseTask[] }>(`/api/v1/tasks?case_id=${caseId}&page_size=20`).then((r) => r.data.data),
    enabled: !!caseId,
  })

  const transactionsQuery = useQuery({
    queryKey: ['task-transactions', taskId],
    queryFn: () =>
      api.get<{ data: TransactionsData }>(`/api/v1/tasks/${taskId}/transactions`).then((r) => r.data.data),
    enabled: !!taskId,
  })

  const caseQueriesQuery = useQuery({
    queryKey: ['case-queries', caseId],
    queryFn: () =>
      api
        .get<{ data: { queries: QueryAnswer[] } }>(`/api/v1/cases/${caseId}/queries`)
        .then((r) => r.data.data.queries ?? []),
    enabled: !!caseId,
    staleTime: 0,
    refetchOnMount: true,
  })

  const queryAnswerByRef = (() => {
    const map = new Map<number, QueryAnswer>()
    for (const q of caseQueriesQuery.data ?? []) {
      const ref = q.transaction_row_ref != null ? Number(q.transaction_row_ref) : null
      if (q.client_answer && ref != null && !isNaN(ref)) {
        const existing = map.get(ref)
        if (!existing || (q.answered_at ?? '') > (existing.answered_at ?? '')) {
          map.set(ref, q)
        }
      }
    }
    return map
  })()

  // ── Mutations ──────────────────────────────────────────────────────────────

  const approveMutation = useMutation({
    mutationFn: (comment: string) => {
      const editList = Array.from(edits.entries()).flatMap(([origIdx, rowEdit]) => {
        const row = allRows[origIdx]
        if (!row) return []
        return (Object.entries(rowEdit) as [keyof RowEdit, string | undefined][])
          .filter(([, newVal]) => newVal !== undefined)
          .map(([field, newVal]) => {
            const oldVal =
              field === 'gst_code'       ? (row.gst_code ?? '') :
              field === 'category'       ? (row.category ?? '') :
              field === 'review_status'  ? (row.review_status ?? 'Inferred') :
                                           (row.note ?? '')
            return { row_ref: String(origIdx + 1), field, old_value: oldVal, new_value: newVal as string }
          })
      })
      return api.post(`/api/v1/tasks/${taskId}/approve`, {
        comment: comment || null,
        edits: editList.length > 0 ? editList : null,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId] })
      queryClient.invalidateQueries({ queryKey: ['case-tasks', caseId] })
      queryClient.invalidateQueries({ queryKey: ['conversation-opening'] })
      setApproveOpen(false)
      setApproveComment('')
      setActionError(null)
      setTimeout(() => navigate('/conversation'), 1500)
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Approval failed — please try again.'
      setActionError(msg)
      setApproveOpen(false)
    },
  })

  const rejectMutation = useMutation({
    mutationFn: (reason: string) =>
      api.post(`/api/v1/tasks/${taskId}/reject`, { reject_comment: reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId] })
      queryClient.invalidateQueries({ queryKey: ['case-tasks', caseId] })
      queryClient.invalidateQueries({ queryKey: ['conversation-opening'] })
      setRejectOpen(false)
      setRejectReason('')
      setActionError(null)
      setTimeout(() => navigate('/conversation'), 1500)
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Rejection failed — please try again.'
      setActionError(msg)
      setRejectOpen(false)
    },
  })

  // ── Derived values ─────────────────────────────────────────────────────────

  const allRows = transactionsQuery.data?.rows ?? []

  const uniqueAccounts = useMemo(() => {
    const accs = new Set(allRows.map((r) => r.account ?? '').filter(Boolean))
    return [...accs].sort()
  }, [allRows])

  const hasMultipleAccounts = uniqueAccounts.length > 1

  const accountFilteredRows = useMemo(() => {
    if (!hasMultipleAccounts || accountFilter === 'ALL') return allRows
    return allRows.filter((r) => (r.account ?? '') === accountFilter)
  }, [allRows, accountFilter, hasMultipleAccounts])

  // Build tuples with stable allRows indices so edits Map keys are always absolute
  const sheetRowsWithIdx = useMemo(() => {
    const withIdx = accountFilteredRows.map((row) => ({
      row,
      originalIdx: allRows.indexOf(row),
    }))
    if (activeSheet === 1) return withIdx
    return withIdx.filter(({ row, originalIdx }) => {
      const status   = edits.get(originalIdx)?.review_status ?? row.review_status ?? 'Inferred'
      const effCode  = edits.get(originalIdx)?.gst_code ?? row.gst_code ?? ''
      const bp       = ['BAS_EXCLUDED', 'N-T'].includes(effCode)
        ? 'excluded'
        : (edits.get(originalIdx)?.bas_participation ?? row.bas_participation ?? 'included')
      if (activeSheet === 2) return bp !== 'excluded' && status !== 'Review Required'
      if (activeSheet === 3) return bp === 'excluded'
      // Sheet 4: ALL review-required rows regardless of bas_participation
      // (TRANSFER_SUSPECTED = excluded + Review Required → appears in both Non-GST and Review Required)
      return status === 'Review Required'
    })
  }, [accountFilteredRows, activeSheet, allRows, edits])

  const counts: [number, number, number, number] = useMemo(() => {
    let readyForBas = 0, nonBas = 0, reviewRequired = 0
    accountFilteredRows.forEach((row) => {
      const origIdx  = allRows.indexOf(row)
      const status   = edits.get(origIdx)?.review_status ?? row.review_status ?? 'Inferred'
      const effCode  = edits.get(origIdx)?.gst_code ?? row.gst_code ?? ''
      const bp       = ['BAS_EXCLUDED', 'N-T'].includes(effCode)
        ? 'excluded'
        : (edits.get(origIdx)?.bas_participation ?? row.bas_participation ?? 'included')
      if (bp === 'excluded') nonBas++
      if (status === 'Review Required') reviewRequired++  // independent of bp — can overlap with nonBas
      if (bp !== 'excluded' && status !== 'Review Required') readyForBas++
    })
    return [accountFilteredRows.length, readyForBas, nonBas, reviewRequired]
  }, [accountFilteredRows, allRows, edits])

  const conflictCount = allRows.filter(isConflicting).length
  const reviewRequiredCount = useMemo(() =>
    allRows.reduce((count, row, origIdx) => {
      const status = edits.get(origIdx)?.review_status ?? row.review_status ?? 'Inferred'
      return count + (status === 'Review Required' ? 1 : 0)
    }, 0)
  , [allRows, edits])
  const isWaitingHuman = task?.status === 'waiting_human'
  const clientName = task?.cases?.clients?.business_name ?? 'Client'
  const period = task?.cases?.period ?? ''


  // ── Render ─────────────────────────────────────────────────────────────────

  if (taskQuery.isLoading) {
    return <div className="flex h-full items-center justify-center text-gray-400">Loading task…</div>
  }

  if (taskQuery.isError || !task) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-gray-500">
        <p>Task not found or you don't have access.</p>
        <Link to="/conversation" className="text-sm text-blue-600 underline">Back to Hermes</Link>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Topbar */}
      <div className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4">
        <Link to="/conversation" className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Link>
        <div className="h-5 w-px bg-gray-200" />
        <span className="text-sm font-medium text-gray-900">{clientName}</span>
        {period && <><span className="text-gray-400">·</span><span className="text-sm text-gray-600">{period}</span></>}
        <span className="text-gray-400">·</span>
        <span className="text-sm text-gray-600">GST Prep Review</span>
        <div className="ml-auto flex items-center gap-2">
          {task.status === 'reviewed' && (
            <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">Approved</span>
          )}
          {task.status === 'rejected' && (
            <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">Rejected</span>
          )}
          {reviewRequiredCount > 0 && isWaitingHuman && (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
              {reviewRequiredCount} Review Required
            </span>
          )}
          {profile && <span className="text-xs capitalize text-gray-400">{profile.user_role}</span>}
        </div>
      </div>

      {/* Three-column body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left: Task list */}
        <TaskList
          tasks={caseTasksQuery.data ?? []}
          currentTaskId={taskId ?? ''}
          collapsed={leftCollapsed}
          onToggle={() => setLeftCollapsed((v) => !v)}
        />

        {/* Center: Table + controls */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* State banners */}
          {task.status === 'reviewed' && (
            <div className="flex-shrink-0 border-b border-green-200 bg-green-50 px-4 py-2.5">
              <p className="text-sm text-green-700">Approved — BAS draft has been queued.</p>
            </div>
          )}
          {task.status === 'rejected' && (
            <div className="flex-shrink-0 border-b border-red-200 bg-red-50 px-4 py-2.5">
              <p className="text-sm text-red-700">Rejected: {task.reject_comment || 'No reason provided.'}</p>
            </div>
          )}
          {conflictCount > 0 && isWaitingHuman && (
            <div className="flex flex-shrink-0 items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-2">
              <svg className="h-4 w-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              <span className="text-sm font-medium text-red-700">
                {conflictCount} row{conflictCount > 1 ? 's' : ''} with conflicting signals — GST code blank. Reject and ask the Junior to assign a code.
              </span>
            </div>
          )}

          {/* Account filter */}
          {hasMultipleAccounts && (
            <div className="flex h-14 flex-shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-4">
              <span className="text-xs text-gray-500">Account:</span>
              <select
                value={accountFilter}
                onChange={(e) => { setAccountFilter(e.target.value); setActiveSheet(1) }}
                className="rounded border border-gray-300 pl-2 pr-7 py-1 text-xs text-gray-700 focus:border-blue-500 focus:outline-none"
              >
                <option value="ALL">All accounts ({allRows.length})</option>
                {uniqueAccounts.map((acc) => (
                  <option key={acc} value={acc}>
                    {acc} ({allRows.filter((r) => (r.account ?? '') === acc).length})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Sheet tabs */}
          {allRows.length > 0 && (
            <SheetTabs active={activeSheet} onChange={(s) => { setActiveSheet(s); if (s !== 4) setQuerySelectedRows(new Set()) }} counts={counts} />
          )}

          {/* Query toolbar — sheet 4 + waiting_human only */}
          {activeSheet === 4 && isWaitingHuman && (
            <div className="flex flex-shrink-0 items-center gap-2 bg-indigo-50 px-4 py-1.5 text-xs text-indigo-600">
              <span>Check rows below to send a query to your client</span>
              {querySelectedRows.size > 0 && (
                <>
                  <span className="text-indigo-300">|</span>
                  <button
                    onClick={() => setShowQueryModal(true)}
                    className="rounded-md bg-indigo-600 px-3 py-1 text-[11px] font-medium text-white hover:bg-indigo-700"
                  >
                    Send query ({querySelectedRows.size} row{querySelectedRows.size !== 1 ? 's' : ''})
                  </button>
                  <button
                    onClick={() => setQuerySelectedRows(new Set())}
                    className="text-[11px] text-indigo-400 hover:text-indigo-600"
                  >
                    Clear
                  </button>
                </>
              )}
            </div>
          )}

          {/* Workpaper title — persistent across all sheets */}
          {clientName && (
            <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-6 py-2.5">
              <span className="text-sm font-semibold text-gray-900">
                {clientName}{period ? ` — ${period} BAS/GST` : ''}
              </span>
              <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
                DRAFT
              </span>
            </div>
          )}

          {/* Table */}
          <div className="flex-1 overflow-auto">
            {transactionsQuery.isLoading ? (
              <div className="flex h-full items-center justify-center text-gray-400">Loading transactions…</div>
            ) : transactionsQuery.isError ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-400">
                <p className="text-sm">Could not load transaction data.</p>
                <p className="text-xs">The file may still be processing — refresh in a moment.</p>
              </div>
            ) : sheetRowsWithIdx.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">No transactions in this sheet.</div>
            ) : (
              <TransactionTable
                rows={sheetRowsWithIdx}
                edits={edits}
                onEdit={handleEdit}
                activeSheet={activeSheet}
                querySelectedRows={isWaitingHuman ? querySelectedRows : undefined}
                onQueryToggle={isWaitingHuman ? toggleQueryRow : undefined}
                onQuerySelectAll={isWaitingHuman ? selectAllQueryRows : undefined}
                queryAnswerByRef={queryAnswerByRef.size > 0 ? queryAnswerByRef : undefined}
              />
            )}
          </div>

          {/* Gate controls */}
          <div className="flex-shrink-0 border-t border-gray-200 bg-white px-4 py-4">
            {actionError && <p className="mb-3 text-sm text-red-600">{actionError}</p>}
            {isWaitingHuman ? (
              <div className="flex flex-col items-end gap-1.5">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setApproveOpen(true)}
                    disabled={approveMutation.isPending || allRows.length === 0 || conflictCount > 0 || reviewRequiredCount > 0}
                    className="rounded-lg bg-gray-900 px-5 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-40"
                  >
                    {approveMutation.isPending ? 'Approving…' : `Approve ${allRows.length} transactions`}
                  </button>
                  <button
                    onClick={() => setRejectOpen(true)}
                    disabled={approveMutation.isPending}
                    className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
                  >
                    Reject
                  </button>
                </div>
                {reviewRequiredCount > 0 && (
                  <p className="text-xs text-amber-600">
                    Resolve {reviewRequiredCount} Review Required row{reviewRequiredCount !== 1 ? 's' : ''} to approve
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => navigate('/conversation')}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Back to Hermes
                </button>
                <span className="text-sm text-gray-400 capitalize">Task status: {task.status.replace(/_/g, ' ')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: GST Breakdown + Ask Sweeper */}
        <aside className={`flex ${rightCollapsed ? 'w-10' : 'w-72'} flex-shrink-0 flex-col border-l border-gray-200 bg-white transition-all duration-150`}>
          {rightCollapsed ? (
            <div className="flex flex-1 flex-col items-center pt-3">
              <button onClick={() => setRightCollapsed(false)} className="text-gray-400 hover:text-gray-600" title="Expand">‹</button>
            </div>
          ) : (
            <>
              <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-gray-200 px-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">GST Breakdown</span>
                <button onClick={() => setRightCollapsed(true)} className="text-gray-400 hover:text-gray-600" title="Collapse">›</button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {allRows.length > 0 && <GstBreakdownSection rows={allRows} />}
              </div>
            </>
          )}
        </aside>
      </div>

      {/* Query modal */}
      {showQueryModal && caseId && (
        <GenerateQueryModal
          caseId={caseId}
          selectedIdxs={querySelectedRows}
          allRows={allRows}
          edits={edits}
          onClose={() => { setShowQueryModal(false); setQuerySelectedRows(new Set()) }}
        />
      )}

      {/* Approve modal */}
      {approveOpen && (
        <ApproveConfirmModal
          rowCount={allRows.length}
          conflictCount={conflictCount}
          flaggedCount={reviewRequiredCount}
          comment={approveComment}
          onCommentChange={setApproveComment}
          onConfirm={() => approveMutation.mutate(approveComment)}
          onCancel={() => setApproveOpen(false)}
          loading={approveMutation.isPending}
        />
      )}

      {/* Reject modal */}
      {rejectOpen && (
        <RejectModal
          reason={rejectReason}
          onReasonChange={setRejectReason}
          onConfirm={() => { if (rejectReason.trim()) rejectMutation.mutate(rejectReason.trim()) }}
          onCancel={() => { setRejectOpen(false); setRejectReason('') }}
          loading={rejectMutation.isPending}
        />
      )}
    </div>
  )
}
