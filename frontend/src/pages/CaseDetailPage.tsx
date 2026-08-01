import { useNavigate, useParams, Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { api } from '../lib/api'
import { caseTypeLabel } from '../lib/case-types'
import { useAuth } from '../contexts/AuthContext'

interface CaseDetail {
  id: string; case_type: string; period: string; status: string; current_step: string
  clients: { business_name: string; abn: string }
}
interface Task {
  id: string; task_type: string; status: string
  assigned_agent: string; assigned_to: string | null
  completed_at: string | null; reject_comment: string | null
}
interface CaseFile {
  id: string; file_name: string; file_type: string
  file_state: string; source: string; uploaded_at: string; storage_path: string
  users: { name: string } | null
}
interface CaseDocument {
  id: string; file_name: string; document_type: string
  note: string | null; uploaded_at: string
  uploaded_by_user: { name: string } | null
}
interface CaseQuery {
  id: string
  transaction_row_ref: number | null
  merchant: string | null
  amount: string | null
  date: string | null
  query_text: string
  client_answer: string | null
  status: 'pending' | 'answered' | 'resolved'
  answered_at: string | null
}
interface QueryLink {
  id: string
  token: string
  password: string | null
  created_at: string
  expires_at: string
  submitted_at: string | null
  status: 'pending' | 'answered' | 'expired'
  query_count: number
  answered_count: number
  sender_name: string | null
  queries: CaseQuery[]
}

const DOC_TYPE_LABELS: Record<string, string> = {
  receipt:             'Receipt',
  invoice:             'Invoice',
  payroll:             'Payroll',
  ato_statement:       'ATO Statement',
  ato_receipt:         'ATO Receipt',
  bas_confirmation:    'BAS Confirmation',
  signed_confirmation: 'Signed Confirmation',
  screenshot:          'Screenshot',
  contract:            'Contract',
  other:               'Other',
}

function formatDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function fileByline(f: CaseFile): string {
  let type: string
  if (f.file_type === 'json') {
    type = f.file_state === 'archived' ? 'BAS Report' : 'BAS Summary'
  } else {
    type = f.file_type.toUpperCase()
  }
  const who = f.users?.name ?? (f.source === 'agent_generated' ? 'Sweeper AI' : '—')
  const date = formatDate(f.uploaded_at)
  return `${type} · ${who} · ${date}`
}

function fileDisplayName(f: CaseFile): string {
  if (f.file_type === 'json') {
    if (f.file_state === 'archived') return 'BAS Report (Certified)'
    if (f.file_state === 'final')    return 'BAS Draft Summary'
  }
  if (f.file_type === 'pdf' && f.file_name.startsWith('BAS_Confirmation')) {
    return 'BAS Confirmation (Client copy)'
  }
  return f.file_name
}

const STEP_ORDER = [
  'extract', 'validate_extraction', 'gst_prep', 'validate_gst',
  'senior_review', 'bas_draft', 'senior_bas_review', 'manager_review', 'client_confirm', 'certify',
]

const STEP_LABEL: Record<string, string> = {
  extract:             'Extract',
  validate_extraction: 'Validate',
  gst_prep:            'GST Prep',
  validate_gst:        'Review GST',
  senior_review:       'GST Review',
  bas_draft:           'BAS Draft',
  senior_bas_review:   'Sr BAS',
  manager_review:      'Mgr Review',
  client_confirm:      'Client',
  certify:             'Certify',
}

// waiting_human task → frontend route segment
const TASK_ROUTE: Record<string, string> = {
  validate_extraction: 'validate',
  validate_gst:        'validate',
  senior_review:       'review',
  senior_bas_review:   'senior-bas-draft',
  manager_review:      'bas-draft',
  client_confirm:      'client-confirm',
  certify:             'certify',
}

const FILE_STATE_BADGE: Record<string, string> = {
  validated: 'bg-blue-100 text-blue-700',
  processed: 'bg-purple-100 text-purple-700',
  reviewed:  'bg-indigo-100 text-indigo-700',
  final:     'bg-green-100 text-green-700',
  archived:  'bg-gray-100 text-gray-600',
}

const CERTIFIED_STATES = new Set(['validated', 'processed', 'reviewed', 'final', 'archived'])

// Which roles may act on each task type
const TASK_ALLOWED_ROLES: Record<string, string[]> = {
  validate_extraction: ['junior', 'senior', 'manager', 'partner', 'admin'],
  validate_gst:        ['junior', 'senior', 'manager', 'partner', 'admin'],
  senior_review:       ['senior', 'manager', 'partner', 'admin'],
  senior_bas_review:   ['senior', 'manager', 'partner', 'admin'],
  manager_review:      ['manager', 'partner', 'admin'],
  client_confirm:      ['partner', 'admin'],
  certify:             ['partner', 'admin'],
}

export default function CaseDetailPage() {
  const { clientId, caseId } = useParams<{ clientId: string; caseId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { profile } = useAuth()

  const { data: caseData, isLoading } = useQuery({
    queryKey: ['case', caseId],
    queryFn: () =>
      api.get<{ data: CaseDetail }>(`/api/v1/cases/${caseId}`).then((r) => r.data.data),
    enabled: !!caseId,
  })

  const { data: tasksData } = useQuery({
    queryKey: ['case-tasks', caseId],
    queryFn: () =>
      api.get<{ data: Task[] }>(`/api/v1/cases/${caseId}/tasks`).then((r) => r.data.data),
    enabled: !!caseId,
    refetchInterval: 10_000, // poll while agent tasks run
  })

  const { data: filesData } = useQuery({
    queryKey: ['case-files', caseId],
    queryFn: () =>
      api.get<{ data: CaseFile[] }>(`/api/v1/cases/${caseId}/files`).then((r) => r.data.data),
    enabled: !!caseId,
    refetchInterval: 10_000,
  })

  const caseDetail = caseData
  const tasks = tasksData ?? []
  const allFiles = filesData ?? []
  const rawFiles = allFiles.filter((f) => f.file_state === 'raw')

  // Keep only the latest file per (file_state, file_name) — eliminates duplicates from
  // reject/resubmit cycles while preserving multi-account files with different names.
  const FILE_STATE_ORDER = ['archived', 'final', 'reviewed', 'processed', 'validated']
  const certifiedFiles = Object.values(
    allFiles
      .filter((f) => CERTIFIED_STATES.has(f.file_state))
      .reduce((acc, f) => {
        const key = `${f.file_state}::${f.file_name}`
        const prev = acc[key]
        if (!prev || new Date(f.uploaded_at) > new Date(prev.uploaded_at)) acc[key] = f
        return acc
      }, {} as Record<string, CaseFile>)
  ).sort((a, b) => FILE_STATE_ORDER.indexOf(a.file_state) - FILE_STATE_ORDER.indexOf(b.file_state))

  // Build task status map for pipeline
  const taskMap: Record<string, Task> = {}
  tasks.forEach((t) => { taskMap[t.task_type] = t })

  // Find current action — only if this role is allowed to act on it
  const actionTask = tasks.find((t) => {
    if (t.status !== 'waiting_human') return false
    const allowed = TASK_ALLOWED_ROLES[t.task_type]
    return allowed ? allowed.includes(profile?.user_role ?? '') : false
  })

  const TERMINAL = new Set(['validated','reviewed','approved','confirmed','certified','complete'])
  const canDeleteRaw = !TERMINAL.has(taskMap['validate_extraction']?.status ?? '')

  // Resolve workpaper task id (validate_gst → senior_review → senior_bas_review)
  function gstTaskId() {
    return taskMap['validate_gst']?.id ?? taskMap['senior_review']?.id ?? taskMap['senior_bas_review']?.id
  }

  async function _blobDownload(url: string, filename: string, mime: string) {
    const res = await api.get<ArrayBuffer>(url, { responseType: 'arraybuffer' })
    const blob = new Blob([res.data], { type: mime })
    const objUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objUrl; a.download = filename
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(objUrl), 5000)
  }

  // GST workpaper Excel download (processed/reviewed → 5-sheet .xlsx)
  async function downloadWorkpaperXlsx(sourceFileName: string) {
    const id = gstTaskId(); if (!id) return
    const xlsxName = sourceFileName.replace(/\.csv$/i, '.xlsx')
    await _blobDownload(
      `/api/v1/tasks/${id}/workpaper.xlsx`,
      xlsxName,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
  }

  // BAS Summary Excel download (final/archived JSON → formatted .xlsx)
  async function downloadBasSummaryXlsx() {
    const id = taskMap['bas_draft']?.id ?? taskMap['certify']?.id
    if (!id) return
    await _blobDownload(
      `/api/v1/tasks/${id}/bas-summary.xlsx`,
      'BAS_Draft_Summary.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
  }


  // Download file
  async function downloadFile(fileId: string, fileName: string) {
    const res = await api.get<{ data: { url: string } }>(`/api/v1/files/${fileId}/download-url`)
    const r = await fetch(res.data.data.url)
    const buf = await r.arrayBuffer()
    const ext = fileName.split('.').pop()?.toLowerCase()
    const mime = ext === 'csv' ? 'text/csv'
               : ext === 'json' ? 'application/json'
               : ext === 'pdf' ? 'application/pdf'
               : 'application/octet-stream'
    const blob = new Blob([buf], { type: mime })
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000)
  }

  const deleteFile = useMutation({
    mutationFn: (fileId: string) => api.delete(`/api/v1/files/${fileId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['case-files', caseId] }),
  })

  // Client Query Links (batch management)
  const { data: queryLinksData, refetch: refetchQueryLinks } = useQuery({
    queryKey: ['case-query-links', caseId],
    queryFn: () =>
      api.get<{ data: { links: QueryLink[] } }>(`/api/v1/cases/${caseId}/query-links`)
        .then((r) => r.data.data.links),
    enabled: !!caseId,
  })
  const queryLinks = queryLinksData ?? []

  const [collapsedLinks, setCollapsedLinks] = useState<Set<string>>(new Set())
  const [copiedLink, setCopiedLink] = useState<string | null>(null)
  function copyQueryLink(token: string) {
    const url = `${window.location.origin}/q/${token}`
    navigator.clipboard.writeText(url).then(() => {
      setCopiedLink(token)
      setTimeout(() => setCopiedLink(null), 2000)
    })
  }
  function toggleLink(id: string) {
    setCollapsedLinks((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const resolveQuery = useMutation({
    mutationFn: ({ queryId, resolved }: { queryId: string; resolved: boolean }) =>
      api.patch(`/api/v1/queries/${queryId}/resolve`, { resolved }),
    onSuccess: () => refetchQueryLinks(),
  })

  const revokeLink = useMutation({
    mutationFn: (linkId: string) =>
      api.delete(`/api/v1/cases/${caseId}/query-links/${linkId}`),
    onSuccess: () => {
      refetchQueryLinks()
      qc.invalidateQueries({ queryKey: ['case-queries', caseId] })
    },
  })

  // Supporting Evidence
  const [showUploadEvidence, setShowUploadEvidence] = useState(false)
  const [docType, setDocType] = useState('receipt')
  const [docNote, setDocNote] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const evidenceInputRef = useRef<HTMLInputElement>(null)

  const { data: docsData, refetch: refetchDocs } = useQuery({
    queryKey: ['case-documents', caseId],
    queryFn: () =>
      api.get<{ data: { documents: CaseDocument[] } }>(`/api/v1/cases/${caseId}/documents`)
        .then((r) => r.data.data.documents),
    enabled: !!caseId,
  })
  const documents = docsData ?? []

  function onFilesSelected(files: FileList) {
    setPendingFiles(Array.from(files))
    setUploadError('')
  }

  async function confirmUpload() {
    if (!pendingFiles.length) return
    setUploading(true); setUploadError('')
    let failed = 0
    for (const file of pendingFiles) {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('document_type', docType)
      if (docNote) fd.append('note', docNote)
      try {
        await api.post(`/api/v1/cases/${caseId}/documents`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      } catch {
        failed++
      }
    }
    setUploading(false)
    if (failed > 0) {
      setUploadError(`${failed} file(s) failed to upload.`)
    } else {
      setShowUploadEvidence(false)
      setDocNote('')
      setPendingFiles([])
      if (evidenceInputRef.current) evidenceInputRef.current.value = ''
    }
    refetchDocs()
  }

  const deleteDoc = useMutation({
    mutationFn: (docId: string) => api.delete(`/api/v1/documents/${docId}`),
    onSuccess: () => refetchDocs(),
  })

  async function downloadDoc(docId: string, fileName: string) {
    const res = await api.get<{ data: { url: string } }>(`/api/v1/documents/${docId}/download-url`)
    const r = await fetch(res.data.data.url)
    const buf = await r.arrayBuffer()
    const ext = fileName.split('.').pop()?.toLowerCase()
    const mime = ext === 'pdf' ? 'application/pdf'
               : ['png','jpg','jpeg'].includes(ext ?? '') ? `image/${ext}`
               : 'application/octet-stream'
    const blob = new Blob([buf], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = fileName
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  if (isLoading) {
    return <div className="flex h-full items-center justify-center text-sm text-gray-400">Loading…</div>
  }
  if (!caseDetail) {
    return <div className="flex h-full items-center justify-center text-sm text-gray-400">Folder not found</div>
  }

  const clientName = caseDetail.clients?.business_name ?? '…'

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <Link to={`/clients/${clientId}`} className="text-gray-400 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">
                <Link to={`/clients/${clientId}`} className="hover:text-blue-600">{clientName}</Link>
                {' '}·{' '}
              </span>
              <h1 className="text-base font-semibold text-gray-900">{caseDetail.period}</h1>
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                {caseTypeLabel(caseDetail.case_type)}
              </span>
              <span className="text-xs text-gray-300">Ref: {caseId?.slice(0, 8)}</span>
            </div>
          </div>
        </div>

        {taskMap['extract']?.status === 'pending' ? (
          <Link
            to="/upload"
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            Upload Statement
          </Link>
        ) : actionTask && TASK_ROUTE[actionTask.task_type] && (
          <button
            onClick={() => navigate(`/${TASK_ROUTE[actionTask.task_type]}/${actionTask.id}`)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {STEP_LABEL[actionTask.task_type]} →
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto px-6 py-6 space-y-6">

        {/* Task pipeline */}
        <section className="rounded-xl border border-gray-200 bg-white px-5 py-4">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-400">Workflow</h2>
          <div className="flex items-center gap-0 overflow-x-auto pb-1">
            {STEP_ORDER.filter((s) => taskMap[s]).map((step, i, arr) => {
              const task = taskMap[step]
              if (!task) return null
              const isLast = i === arr.length - 1

              const isDone = ['complete', 'validated', 'reviewed', 'confirmed', 'certified', 'approved'].includes(task.status)
              // Suppress "done" appearance for steps after the current waiting_human gate
              const waitingIdx = arr.findIndex((s) => taskMap[s]?.status === 'waiting_human')
              const isAfterGate = waitingIdx >= 0 && i > waitingIdx
              const effectivelyDone = isDone && !isAfterGate

              const dot =
                effectivelyDone                 ? 'bg-green-500' :
                task.status === 'waiting_human' ? 'bg-blue-500 ring-2 ring-blue-200' :
                task.status === 'in_progress'   ? 'bg-blue-400 animate-pulse' :
                task.status === 'rejected'      ? 'bg-red-500' :
                'bg-gray-200'

              const label =
                effectivelyDone                 ? 'text-green-600' :
                task.status === 'waiting_human' ? 'text-blue-600 font-semibold' :
                task.status === 'in_progress'   ? 'text-blue-500' :
                task.status === 'rejected'      ? 'text-red-500' :
                'text-gray-400'

              return (
                <div key={step} className="flex items-center">
                  <div className="flex flex-col items-center gap-1 min-w-[72px]">
                    <div className={`h-3 w-3 rounded-full ${dot}`} />
                    <span className={`text-center text-[11px] leading-tight ${label}`}>
                      {STEP_LABEL[step]}
                    </span>
                  </div>
                  {!isLast && (
                    <div className={`mb-4 h-px w-6 flex-shrink-0 ${
                      effectivelyDone ? 'bg-green-300' : 'bg-gray-200'
                    }`} />
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* Files */}
        <section className="rounded-xl border border-gray-200 bg-white px-5 py-4">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-400">Files</h2>

          {/* Source documents (raw uploads) */}
          {rawFiles.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-400">Source documents</p>
              <div className="space-y-2">
                {rawFiles.map((f) => (
                  <div key={f.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      <div>
                        <p className="text-[13px] font-medium text-gray-800">{f.file_name}</p>
                        <p className="text-[11px] text-gray-400">{fileByline(f)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => downloadFile(f.id, f.file_name)} className="text-gray-400 hover:text-blue-600" title="Download">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                      </button>
                      {canDeleteRaw && <button
                          onClick={() => { if (window.confirm('Delete this file?')) deleteFile.mutate(f.id) }}
                          disabled={deleteFile.isPending}
                          className="text-gray-300 hover:text-red-500 disabled:opacity-40"
                          title="Delete"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Workpaper files (validated and above) */}
          {certifiedFiles.length === 0 ? (
            <p className="text-[13px] text-gray-400">
              No workpaper files yet — extraction CSV appears here after validation.
            </p>
          ) : (
            <>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-400">Working paper files</p>
              <div className="space-y-2">
                {certifiedFiles.map((f) => (
                <div key={f.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                    <div>
                      <p className="text-[13px] font-medium text-gray-800">{fileDisplayName(f)}</p>
                      <p className="text-[11px] text-gray-400">{fileByline(f)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${FILE_STATE_BADGE[f.file_state] ?? 'bg-gray-100 text-gray-500'}`}>
                      {f.file_state}
                    </span>
                    {f.file_type === 'csv' && ['processed', 'reviewed'].includes(f.file_state) ? (
                      /* GST-coded CSV: download as 5-sheet Excel workpaper */
                      <button
                        onClick={() => downloadWorkpaperXlsx(f.file_name)}
                        className="text-gray-400 hover:text-green-600"
                        title="Download Excel workpaper"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M10 3v18M3 3h18v18H3z" />
                        </svg>
                      </button>
                    ) : f.file_type === 'json' && ['final', 'archived'].includes(f.file_state) ? (
                      /* BAS Summary JSON: download as formatted Excel summary */
                      <button
                        onClick={() => downloadBasSummaryXlsx()}
                        className="text-gray-400 hover:text-green-600"
                        title="Download BAS Summary Excel"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M10 3v18M3 3h18v18H3z" />
                        </svg>
                      </button>
                    ) : (
                      <button
                        onClick={() => downloadFile(f.id, f.file_name)}
                        className="text-gray-400 hover:text-blue-600"
                        title="Download"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            </>
          )}
        </section>

        {/* Supporting Evidence */}
        <section className="rounded-xl border border-gray-200 bg-white px-5 py-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Supporting Evidence</h2>
            <button
              onClick={() => { setShowUploadEvidence(true); setUploadError('') }}
              className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Upload
            </button>
          </div>

          {/* Upload panel */}
          {showUploadEvidence && (
            <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-blue-700">Upload supporting evidence</span>
                <button onClick={() => { setShowUploadEvidence(false); setPendingFiles([]); setDocNote('') }} className="text-blue-400 hover:text-blue-600 text-xs">✕</button>
              </div>

              {/* Step 1 — choose files */}
              <div className="flex items-center gap-3">
                <input
                  ref={evidenceInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,.heic,.webp,.xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => { if (e.target.files?.length) onFilesSelected(e.target.files) }}
                />
                <button
                  onClick={() => evidenceInputRef.current?.click()}
                  disabled={uploading}
                  className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                >
                  Choose files
                </button>
                <span className="text-[11px] text-gray-400">PDF, images, Excel, CSV · multiple files supported</span>
              </div>

              {/* Selected files preview */}
              {pendingFiles.length > 0 && (
                <div className="space-y-1">
                  {pendingFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-[12px] text-gray-700">
                      <svg className="h-3.5 w-3.5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                      <span className="truncate max-w-[200px]">{f.name}</span>
                      <span className="text-gray-400">{(f.size / 1024).toFixed(0)} KB</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Step 2 — type + note + confirm (only shown after files selected) */}
              {pendingFiles.length > 0 && (
                <div className="space-y-2 border-t border-blue-100 pt-3">
                  <div className="flex items-center gap-3">
                    <select
                      value={docType}
                      onChange={(e) => setDocType(e.target.value)}
                      className="rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700"
                    >
                      {Object.entries(DOC_TYPE_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="Note — e.g. Bunnings receipt for $163 job materials"
                      value={docNote}
                      onChange={(e) => setDocNote(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') confirmUpload() }}
                      className="flex-1 rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 placeholder-gray-400"
                      autoFocus
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={confirmUpload}
                      disabled={uploading}
                      className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {uploading ? 'Uploading…' : `Upload ${pendingFiles.length} file${pendingFiles.length > 1 ? 's' : ''}`}
                    </button>
                    <span className="text-[11px] text-gray-400">Note will be saved alongside each file</span>
                  </div>
                </div>
              )}

              {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
            </div>
          )}

          {/* Document list */}
          {documents.length === 0 ? (
            <p className="text-[13px] text-gray-400">No supporting evidence uploaded yet.</p>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => {
                const ext = doc.file_name.split('.').pop()?.toLowerCase() ?? ''
                const isImage = ['png','jpg','jpeg','heic','webp'].includes(ext)
                return (
                  <div key={doc.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      {isImage ? (
                        <svg className="h-4 w-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 16.5V6.75A2.25 2.25 0 015.25 4.5h13.5A2.25 2.25 0 0121 6.75v10.5" />
                        </svg>
                      ) : (
                        <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                        </svg>
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-[13px] font-medium text-gray-800">{doc.file_name}</p>
                          <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-500">
                            {DOC_TYPE_LABELS[doc.document_type] ?? doc.document_type}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400">
                          {doc.uploaded_by_user?.name ?? 'Client'} · {formatDate(doc.uploaded_at)}
                        </p>
                        {doc.note && (
                          <p className="mt-0.5 text-[12px] text-gray-600 italic">"{doc.note}"</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => downloadDoc(doc.id, doc.file_name)} className="text-gray-400 hover:text-blue-600" title="Download">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                      </button>
                      <button
                        onClick={() => { if (window.confirm('Delete this file?')) deleteDoc.mutate(doc.id) }}
                        className="text-gray-300 hover:text-red-500"
                        title="Delete"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Client Queries — link batch management */}
        {queryLinks.length > 0 && (
          <section className="rounded-xl border border-gray-200 bg-white px-5 py-4">
            <div className="mb-4 flex items-center gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Client Queries</h2>
              <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                {queryLinks.length} batch{queryLinks.length !== 1 ? 'es' : ''}
                {' · '}
                {queryLinks.reduce((s, l) => s + l.answered_count, 0)} answered
              </span>
            </div>

            <div className="space-y-3">
              {queryLinks.map((link) => {
                const isCollapsed = collapsedLinks.has(link.id)
                const batchBg    = link.status === 'answered' ? 'bg-blue-50'  : link.status === 'expired' ? 'bg-gray-50'  : 'bg-amber-50'
                const batchBorder= link.status === 'answered' ? 'border-blue-100' : link.status === 'expired' ? 'border-gray-200' : 'border-amber-200'
                const statusPill = link.status === 'answered'
                  ? 'bg-blue-100 text-blue-700'
                  : link.status === 'expired'
                  ? 'bg-gray-100 text-gray-500'
                  : 'bg-amber-100 text-amber-700'
                const statusLabel = link.status === 'answered' ? 'Answered' : link.status === 'expired' ? 'Expired' : 'Pending'

                return (
                  <div key={link.id} className={`rounded-lg border ${batchBorder} overflow-hidden`}>
                    {/* Batch header */}
                    <div className={`px-4 py-2.5 ${batchBg}`}>
                      <div className="flex items-center gap-2.5">
                        <button
                          onClick={() => toggleLink(link.id)}
                          className="shrink-0 text-gray-400 hover:text-gray-600"
                          title={isCollapsed ? 'Expand' : 'Collapse'}
                        >
                          <svg className={`h-3.5 w-3.5 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                        <div className="flex flex-1 items-center gap-3 min-w-0">
                          <span className="text-[12px] font-medium text-gray-700">Sent {formatDate(link.created_at)}</span>
                          <span className="text-[11px] text-gray-400">{link.query_count} question{link.query_count !== 1 ? 's' : ''}</span>
                          {link.sender_name && (
                            <span className="text-[11px] text-gray-400">by <span className="font-medium text-gray-600">{link.sender_name}</span></span>
                          )}
                          {link.answered_count > 0 && link.status !== 'answered' && (
                            <span className="text-[11px] text-blue-500">{link.answered_count}/{link.query_count} answered</span>
                          )}
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusPill}`}>{statusLabel}</span>
                        {link.status !== 'answered' && (
                          <button
                            onClick={() => {
                              const n = link.query_count
                              const msg = link.status === 'expired'
                                ? `Remove this expired link and its ${n} unanswered question${n !== 1 ? 's' : ''}?`
                                : `Revoke this query batch? ${n} pending question${n !== 1 ? 's' : ''} will be deleted.`
                              if (window.confirm(msg)) revokeLink.mutate(link.id)
                            }}
                            disabled={revokeLink.isPending}
                            className={`shrink-0 rounded px-2 py-1 text-[11px] font-medium disabled:opacity-50 ${
                              link.status === 'expired'
                                ? 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                                : 'bg-red-100 text-red-600 hover:bg-red-200'
                            }`}
                          >
                            {link.status === 'expired' ? 'Clean up' : 'Revoke'}
                          </button>
                        )}
                      </div>
                      {/* Link + password row — shown for pending/expired only */}
                      {link.status !== 'answered' && (
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-6">
                          <span className="truncate text-[11px] font-mono text-gray-500 max-w-[340px]">
                            {`${window.location.origin}/q/${link.token}`}
                          </span>
                          <button
                            onClick={() => copyQueryLink(link.token)}
                            className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                              copiedLink === link.token
                                ? 'bg-green-100 text-green-700'
                                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            {copiedLink === link.token ? 'Copied!' : 'Copy link'}
                          </button>
                          {link.password && (
                            <span className="text-[11px] text-gray-500">
                              Password: <span className="font-mono font-semibold text-gray-700">{link.password}</span>
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Individual queries */}
                    {!isCollapsed && (
                      <div className="divide-y divide-gray-100">
                        {link.queries.map((q) => {
                          const isAnswered = q.status === 'answered'
                          const isResolved = q.status === 'resolved'
                          return (
                            <div key={q.id} className="px-4 py-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="mb-1 flex flex-wrap items-center gap-2">
                                    {q.date && <span className="text-[10px] text-gray-400 tabular-nums">{q.date}</span>}
                                    {q.merchant && <span className="text-[12px] font-semibold text-gray-800">{q.merchant}</span>}
                                    {q.amount && <span className="text-[11px] font-mono text-red-500">{q.amount}</span>}
                                    <span className={`ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-medium ${isResolved ? 'bg-green-100 text-green-700' : isAnswered ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                                      {isResolved ? 'Resolved' : isAnswered ? 'Answered' : 'Pending'}
                                    </span>
                                  </div>
                                  <p className="mb-1 text-[11px] text-gray-500">{q.query_text}</p>
                                  {q.client_answer ? (
                                    <div className="mt-1.5 rounded border border-blue-100 bg-white px-3 py-2">
                                      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-400">Client's answer</p>
                                      <p className="text-[12px] text-gray-700">{q.client_answer}</p>
                                    </div>
                                  ) : (
                                    <p className="text-[11px] italic text-gray-400">Awaiting client response…</p>
                                  )}
                                </div>
                                <div className="flex shrink-0 flex-col items-end gap-1.5">
                                  {isAnswered && (
                                    <button
                                      onClick={() => resolveQuery.mutate({ queryId: q.id, resolved: true })}
                                      disabled={resolveQuery.isPending}
                                      className="rounded-lg bg-green-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-green-700 disabled:opacity-50"
                                    >
                                      Mark resolved
                                    </button>
                                  )}
                                  {isResolved && (
                                    <button
                                      onClick={() => resolveQuery.mutate({ queryId: q.id, resolved: false })}
                                      disabled={resolveQuery.isPending}
                                      className="text-[11px] text-gray-400 underline underline-offset-2 hover:text-gray-600"
                                    >
                                      Unresolve
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}

      </div>
    </div>
  )
}
