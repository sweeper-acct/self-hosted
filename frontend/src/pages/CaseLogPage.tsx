import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

interface LogRow {
  id: string
  logged_at: string
  case_id: string | null
  period: string | null
  client_id: string | null
  client_name: string | null
  actor_type: string
  actor_name: string
  action: string
  action_label: string
  note: string
  output_snapshot: Record<string, unknown>
}

interface Client {
  id: string
  business_name: string
}

interface CaseItem {
  id: string
  period: string
}

const ACTOR_TYPES = [
  { value: '', label: 'All actors' },
  { value: 'human', label: 'Human' },
  { value: 'bookkeeping_agent', label: 'Bookkeeping Agent' },
  { value: 'bas_agent', label: 'BAS Agent' },
  { value: 'hermes_orchestrator', label: 'Orchestrator' },
]

const ACTIONS = [
  { value: '', label: 'All actions' },
  { value: 'extraction_complete', label: 'Extraction complete' },
  { value: 'gst_prep_complete', label: 'GST coding complete' },
  { value: 'validate', label: 'Validated' },
  { value: 'approve', label: 'Approved' },
  { value: 'reject', label: 'Rejected' },
  { value: 'certify', label: 'Certified' },
  { value: 'bas_draft_complete', label: 'BAS draft complete' },
  { value: 'diagnostic_observation', label: 'Diagnostic note' },
]

const ACTOR_CHIPS: Record<string, string> = {
  human:                'bg-blue-100 text-blue-700',
  bookkeeping_agent:    'bg-purple-100 text-purple-700',
  bas_agent:            'bg-indigo-100 text-indigo-700',
  hermes_orchestrator:  'bg-gray-200 text-gray-600',
}

function fmtDateTime(s: string): string {
  if (!s) return '—'
  try {
    const d = new Date(s)
    return d.toLocaleString('en-AU', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    })
  } catch { return s }
}

export default function CaseLogPage() {
  const [clientId, setClientId] = useState('')
  const [period, setPeriod] = useState('')
  const [actorType, setActorType] = useState('')
  const [action, setAction] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const PAGE_SIZE = 50

  const params = new URLSearchParams()
  if (clientId)  params.set('client_id', clientId)
  if (period)    params.set('period', period)
  if (actorType) params.set('actor_type', actorType)
  if (action)    params.set('action', action)
  if (fromDate)  params.set('from_date', fromDate)
  if (toDate)    params.set('to_date', toDate)
  params.set('page', String(page))
  params.set('page_size', String(PAGE_SIZE))

  const { data, isLoading } = useQuery({
    queryKey: ['case-log', clientId, period, actorType, action, fromDate, toDate, page],
    queryFn: () => api.get<{ data: LogRow[]; meta: { total: number } }>(
      `/api/v1/cases/log?${params}`
    ).then(r => r.data),
  })

  const { data: clientsData } = useQuery({
    queryKey: ['clients-for-filter'],
    queryFn: () => api.get<{ data: Client[] }>('/api/v1/clients').then(r => r.data),
  })

  const { data: casesData } = useQuery({
    queryKey: ['cases-for-period-filter', clientId],
    queryFn: () => api.get<{ data: CaseItem[] }>(`/api/v1/clients/${clientId}/cases?page_size=200`).then(r => r.data),
    enabled: !!clientId,
  })

  const rows: LogRow[] = data?.data ?? []
  const total: number = data?.meta?.total ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const clients: Client[] = clientsData?.data ?? []

  // Sorted unique periods for the selected client
  const availablePeriods: string[] = clientId
    ? [...new Set((casesData?.data ?? []).map(c => c.period))].sort().reverse()
    : []

  function resetFilters() {
    setClientId(''); setPeriod(''); setActorType(''); setAction('')
    setFromDate(''); setToDate(''); setPage(1)
  }

  async function handleExport() {
    setExporting(true)
    try {
      const p = new URLSearchParams()
      if (clientId)  p.set('client_id', clientId)
      if (period)    p.set('period', period)
      if (actorType) p.set('actor_type', actorType)
      if (action)    p.set('action', action)
      if (fromDate)  p.set('from_date', fromDate)
      if (toDate)    p.set('to_date', toDate)
      const resp = await api.get(`/api/v1/cases/log/export.csv?${p}`, { responseType: 'blob' })
      const blob = new Blob([resp.data as BlobPart], { type: 'text/csv' })
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = 'sweeper-audit-log.csv'
      a.click()
      URL.revokeObjectURL(href)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex h-full flex-col bg-gray-50">
      {/* Header */}
      <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6">
        <h1 className="text-base font-semibold text-gray-900">Case Log</h1>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-shrink-0 flex-wrap items-end gap-3 border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Client</label>
          <select
            value={clientId}
            onChange={e => { setClientId(e.target.value); setPeriod(''); setPage(1) }}
            className="h-8 rounded border border-gray-200 bg-white pl-2 pr-6 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-400"
          >
            <option value="">All clients</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.business_name}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Folder</label>
          {availablePeriods.length > 0 ? (
            <select
              value={period}
              onChange={e => { setPeriod(e.target.value); setPage(1) }}
              className="h-8 rounded border border-gray-200 bg-white pl-2 pr-6 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-400"
            >
              <option value="">All folders</option>
              {availablePeriods.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          ) : (
            <input
              type="text"
              placeholder="e.g. 2026-07"
              value={period}
              onChange={e => { setPeriod(e.target.value); setPage(1) }}
              className="h-8 w-28 rounded border border-gray-200 px-2 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-400"
            />
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Actor</label>
          <select
            value={actorType}
            onChange={e => { setActorType(e.target.value); setPage(1) }}
            className="h-8 rounded border border-gray-200 bg-white pl-2 pr-6 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-400"
          >
            {ACTOR_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Action</label>
          <select
            value={action}
            onChange={e => { setAction(e.target.value); setPage(1) }}
            className="h-8 rounded border border-gray-200 bg-white pl-2 pr-6 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-400"
          >
            {ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">From</label>
          <DateSelect value={fromDate} onChange={v => { setFromDate(v); setPage(1) }} />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">To</label>
          <DateSelect value={toDate} onChange={v => { setToDate(v); setPage(1) }} />
        </div>

        <button
          onClick={resetFilters}
          className="h-8 rounded border border-gray-200 px-3 text-xs text-gray-500 hover:bg-gray-50"
        >
          Reset
        </button>

        <span className="ml-auto text-xs text-gray-400">
          {isLoading ? 'Loading…' : `${total} entries`}
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-gray-50">
            <tr className="border-b border-gray-200">
              <th className="px-4 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">Date / Time</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">Client</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">Period</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">Actor</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">Action</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-500">Note</th>
              <th className="px-4 py-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-400">No entries found</td>
              </tr>
            )}
            {rows.map(row => (
              <>
                <tr
                  key={row.id}
                  className="border-b border-gray-100 hover:bg-white cursor-pointer"
                  onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                >
                  <td className="px-4 py-2 tabular-nums text-gray-500 whitespace-nowrap">{fmtDateTime(row.logged_at)}</td>
                  <td className="px-4 py-2 font-medium text-gray-800 whitespace-nowrap">{row.client_name ?? '—'}</td>
                  <td className="px-4 py-2 tabular-nums text-gray-600 whitespace-nowrap">{row.period ?? '—'}</td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${ACTOR_CHIPS[row.actor_type] ?? 'bg-gray-100 text-gray-600'}`}>
                      {row.actor_name}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-700 whitespace-nowrap">{row.action_label}</td>
                  <td className="max-w-xs truncate px-4 py-2 text-gray-400" title={row.note}>{row.note || '—'}</td>
                  <td className="px-2 py-2 text-gray-300 text-center">{expanded === row.id ? '▲' : '▼'}</td>
                </tr>
                {expanded === row.id && (
                  <tr key={row.id + '-detail'}>
                    <td colSpan={7} className="border-b border-gray-200 bg-gray-50 px-0 py-0">
                      {/* accent bar + content */}
                      <div className="flex">
                        <div className="w-1 shrink-0 bg-gray-300" />
                        <div className="flex flex-1 items-start gap-10 px-6 py-4">

                          {/* Case link block */}
                          <div className="shrink-0">
                            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Case</p>
                            <p className="font-mono text-[11px] text-gray-400">{row.case_id?.slice(0, 8)}…</p>
                            {row.client_id && row.case_id && (
                              <Link
                                to={`/clients/${row.client_id}/cases/${row.case_id}`}
                                className="mt-2 inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700 hover:border-gray-400 hover:bg-gray-50"
                                onClick={e => e.stopPropagation()}
                              >
                                Open case →
                              </Link>
                            )}
                          </div>

                          {/* Divider */}
                          <div className="self-stretch w-px bg-gray-200" />

                          {/* Snapshot detail */}
                          <SnapshotDetail action={row.action} snapshot={row.output_snapshot} note={row.note} />

                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-shrink-0 items-center justify-between border-t border-gray-200 bg-white px-6 py-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            className="rounded border border-gray-200 px-3 py-1 text-xs text-gray-600 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
            className="rounded border border-gray-200 px-3 py-1 text-xs text-gray-600 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}

// ── Date selector (avoids OS-locale Chinese placeholders on type=date) ───────

const MONTHS = [
  { v: '01', l: 'Jan' }, { v: '02', l: 'Feb' }, { v: '03', l: 'Mar' },
  { v: '04', l: 'Apr' }, { v: '05', l: 'May' }, { v: '06', l: 'Jun' },
  { v: '07', l: 'Jul' }, { v: '08', l: 'Aug' }, { v: '09', l: 'Sep' },
  { v: '10', l: 'Oct' }, { v: '11', l: 'Nov' }, { v: '12', l: 'Dec' },
]
const CUR_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 5 }, (_, i) => String(CUR_YEAR - i))
const SEL = 'h-8 rounded border border-gray-200 bg-white px-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-400'

function DateSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parts = value ? value.split('-') : ['', '', '']
  const [y, setY] = useState(parts[0])
  const [m, setM] = useState(parts[1])
  const [d, setD] = useState(parts[2])

  useEffect(() => { if (!value) { setY(''); setM(''); setD('') } }, [value])

  function emit(ny: string, nm: string, nd: string) {
    if (ny && nm && nd) onChange(`${ny}-${nm}-${nd}`)
    else onChange('')
  }

  const daysInMonth = y && m ? new Date(Number(y), Number(m), 0).getDate() : 31
  const days = Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, '0'))

  return (
    <div className="flex gap-1">
      <select value={d} onChange={e => { setD(e.target.value); emit(y, m, e.target.value) }} className={`${SEL} w-14`}>
        <option value="">Day</option>
        {days.map(v => <option key={v} value={v}>{v}</option>)}
      </select>
      <select value={m} onChange={e => { setM(e.target.value); emit(y, e.target.value, d) }} className={`${SEL} w-14`}>
        <option value="">Mon</option>
        {MONTHS.map(mo => <option key={mo.v} value={mo.v}>{mo.l}</option>)}
      </select>
      <select value={y} onChange={e => { setY(e.target.value); emit(e.target.value, m, d) }} className={`${SEL} w-16`}>
        <option value="">Year</option>
        {YEARS.map(v => <option key={v} value={v}>{v}</option>)}
      </select>
    </div>
  )
}

// ── Snapshot detail renderer ──────────────────────────────────────────────────

function kv(label: string, value: string | number | null | undefined) {
  if (value == null || value === '') return null
  return (
    <div key={label} className="flex gap-2 text-xs">
      <span className="text-gray-400 whitespace-nowrap">{label}</span>
      <span className="text-gray-700">{String(value)}</span>
    </div>
  )
}

function SnapshotDetail({
  action, snapshot, note,
}: { action: string; snapshot: Record<string, unknown>; note: string }) {
  const s = snapshot ?? {}

  let items: (React.ReactElement | null)[] = []

  if (action === 'extraction_complete') {
    const conf = s.confidence_summary as Record<string, unknown> | undefined
    items = [
      kv('Rows extracted', s.row_count as number),
      kv('High confidence', conf?.high as number),
      kv('Low confidence', conf?.low as number),
    ]
  } else if (action === 'gst_prep_complete') {
    items = [
      kv('Rows coded', s.row_count as number),
      kv('Flagged', s.flagged_count as number),
      kv('Model', s.model as string),
    ]
  } else if (action === 'bas_draft_complete') {
    items = [
      kv('G11 Purchases', s.g11 != null ? `$${Number(s.g11).toLocaleString('en-AU', { minimumFractionDigits: 2 })}` : null),
      kv('1B Credits',    s.input_tax_credits != null ? `$${Number(s.input_tax_credits).toLocaleString('en-AU', { minimumFractionDigits: 2 })}` : null),
      kv('8A Net GST',    s.net_gst != null ? `$${Number(s.net_gst).toLocaleString('en-AU', { minimumFractionDigits: 2 })}` : null),
    ]
  } else if (action === 'delegate') {
    items = [
      kv('Case type', s.case_type as string),
      kv('Tasks created', s.task_count as number),
    ]
  } else if (action === 'validate' || action === 'approve') {
    items = [
      kv('Edits made', s.edit_count as number),
      note ? kv('Note', note) : null,
    ]
  } else if (action === 'reject') {
    items = [kv('Reason', note || (s.reject_comment as string))]
  } else if (action === 'certify') {
    items = [kv('Certified by', s.certified_by as string)]
  } else if (note) {
    items = [kv('Note', note)]
  }

  const visible = items.filter(Boolean)
  if (visible.length === 0) return null

  return (
    <div className="flex flex-col gap-1.5">
      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Details</p>
      {visible}
    </div>
  )
}
