import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''
const ACCEPT = '.jpg,.jpeg,.png,.heic,.webp,.pdf,.xlsx,.xls'
const MAX_FILE_BYTES = 50 * 1024 * 1024 // 50 MB

interface QueryItem {
  id: string
  transaction_row_ref: string | null
  merchant: string | null
  amount: string | null
  date: string | null
  description: string | null
  account: string | null
  query_text: string
  context_note: string | null
  status: string
  client_answer: string | null
}

interface FormData {
  business_name: string
  period: string
  already_submitted: boolean
  queries: QueryItem[]
}

type FileStatus = 'uploading' | 'done' | 'error'

interface FileAttachment {
  localId: string
  name: string
  status: FileStatus
  docId?: string   // server-assigned case_documents.id, available after upload succeeds
  error?: string
}

function shortId(id: string) { return id.slice(0, 8) }

// Strip masked card number references (e.g. "AU CARD XX8013 VALUE DATE") from bank descriptions.
// These are payment instrument metadata — not useful to the client and visually noisy.
const CARD_REF_RE = /\bcard\s+x{1,2}[a-z0-9]+\b/gi
function cleanDescription(desc: string | undefined): string | undefined {
  if (!desc) return desc
  return desc.replace(CARD_REF_RE, '').replace(/\s{2,}/g, ' ').trim()
}

// ── Module-level component (stable reference across renders) ─────────────────

function FileChip({ a, onRetry }: { a: FileAttachment; onRetry: () => void }) {
  const isImg = /\.(jpg|jpeg|png|heic|webp)$/i.test(a.name)
  return (
    <div
      className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] ${
        a.status === 'done'      ? 'border-green-200 bg-green-50 text-green-700' :
        a.status === 'uploading' ? 'border-gray-200 bg-gray-50 text-gray-500' :
                                   'border-red-200 bg-red-50 text-red-600 cursor-pointer'
      }`}
      onClick={() => { if (a.status === 'error') onRetry() }}
    >
      {a.status === 'uploading' ? (
        <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
        </svg>
      ) : a.status === 'done' ? (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
        </svg>
      ) : (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/>
        </svg>
      )}
      <span className="truncate max-w-[140px]">
        {isImg ? '🖼 ' : '📄 '}{a.name}
      </span>
      {a.status === 'done' && a.docId && (
        <span className="text-green-500 font-mono" title={`Doc ID: ${a.docId}`}>#{shortId(a.docId)}</span>
      )}
      {a.status === 'error' && <span className="text-red-400">Tap to retry</span>}
    </div>
  )
}

function fmtPeriod(p: string): string {
  const [year, month] = p.split('-')
  if (!month) return p
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${names[parseInt(month, 10) - 1] ?? month} ${year}`
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ClientQueryPage() {
  const { token } = useParams<{ token: string }>()

  const SESSION_KEY = `q_pwd_${token}`   // sessionStorage — cleared when tab closes
  const DRAFT_KEY   = `q_draft_${token}` // localStorage   — survives tab close / second login

  const [password, setPassword] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [formData, setFormData] = useState<FormData | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [attachments, setAttachments] = useState<Record<string, FileAttachment[]>>({})
  const [authError, setAuthError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // One hidden file input ref per query — keyed by query id
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // Auto-verify on refresh if password was saved in sessionStorage
  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY)
    if (saved) {
      setPassword(saved)
      doVerify(saved)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function doVerify(pwd: string) {
    setVerifying(true)
    setAuthError(null)
    try {
      const res = await axios.post<{ data: FormData }>(
        `${API_BASE}/api/v1/q/${token}/form`,
        { password: pwd },
      )
      sessionStorage.setItem(SESSION_KEY, pwd)
      const data = res.data.data

      // Merge: server answer (already submitted) takes priority; draft fills the rest
      const draft: Record<string, string> = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}')
      const init: Record<string, string> = {}
      for (const q of data.queries) {
        init[q.id] = q.client_answer ?? draft[q.id] ?? ''
      }
      setAnswers(init)
      setFormData(data)
    } catch (e: unknown) {
      sessionStorage.removeItem(SESSION_KEY)
      const status = (e as { response?: { status?: number } })?.response?.status
      if (status === 403) setAuthError('Incorrect password. Please try again.')
      else if (status === 410) setAuthError('This link has expired. Please contact your accountant for a new link.')
      else if (status === 404) setAuthError('This link was not found. It may have been revoked.')
      else setAuthError('Something went wrong. Please try again.')
    }
    setVerifying(false)
  }

  function verifyPassword() {
    if (!password.trim()) return
    doVerify(password)
  }

  function updateAnswer(queryId: string, value: string) {
    setAnswers(prev => {
      const next = { ...prev, [queryId]: value }
      localStorage.setItem(DRAFT_KEY, JSON.stringify(next))
      return next
    })
  }

  async function uploadFile(queryId: string, file: File) {
    const localId = Math.random().toString(36).slice(2)
    if (file.size > MAX_FILE_BYTES) {
      setAttachments(prev => ({
        ...prev,
        [queryId]: [...(prev[queryId] ?? []), { localId, name: file.name, status: 'error', error: 'File too large (max 50 MB)' }],
      }))
      return
    }
    setAttachments(prev => ({
      ...prev,
      [queryId]: [...(prev[queryId] ?? []), { localId, name: file.name, status: 'uploading' }],
    }))
    const fd = new FormData()
    fd.append('password', password)
    fd.append('query_id', queryId)
    fd.append('file', file)
    try {
      const res = await axios.post<{ data: { doc_id: string } }>(`${API_BASE}/api/v1/q/${token}/upload`, fd)
      const docId = res.data?.data?.doc_id
      setAttachments(prev => ({
        ...prev,
        [queryId]: (prev[queryId] ?? []).map(a =>
          a.localId === localId ? { ...a, status: 'done' as FileStatus, docId } : a,
        ),
      }))
    } catch {
      setAttachments(prev => ({
        ...prev,
        [queryId]: (prev[queryId] ?? []).map(a =>
          a.localId === localId ? { ...a, status: 'error' as FileStatus, error: 'Upload failed — tap to retry' } : a,
        ),
      }))
    }
  }

  function handleFileChange(queryId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    for (const f of files) uploadFile(queryId, f)
    e.target.value = '' // reset so same file can be re-selected after error
  }

  async function handleSubmit() {
    if (!formData) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      await axios.post(`${API_BASE}/api/v1/q/${token}/submit`, {
        token,
        password,
        answers: formData.queries.map((q) => ({
          query_id: q.id,
          client_answer: answers[q.id] ?? '',
        })),
      })
      localStorage.removeItem(DRAFT_KEY)
      sessionStorage.removeItem(SESSION_KEY)
      setSubmitted(true)
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number; data?: { detail?: string } } })?.response?.status
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      if (status === 409) setSubmitError('This query has already been submitted.')
      else if (detail) setSubmitError(`Submission failed: ${detail}`)
      else setSubmitError('Submission failed. Please check your connection and try again.')
    }
    setSubmitting(false)
  }

  // ── Submitted confirmation ──────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-lg rounded-xl bg-white p-8 shadow-sm text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-gray-900">Answers submitted</h1>
          <p className="text-sm text-gray-500">
            Thank you. Your accountant has received your responses and will review them shortly.
          </p>
          <p className="text-xs text-gray-400 pt-2">You can close this page.</p>
        </div>
      </div>
    )
  }

  // ── Already submitted ───────────────────────────────────────────────────────
  if (formData?.already_submitted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-lg rounded-xl bg-white p-8 shadow-sm text-center space-y-3">
          <h1 className="text-lg font-semibold text-gray-900">Already submitted</h1>
          <p className="text-sm text-gray-500">
            Your responses have already been submitted for this query. Please contact your accountant if you need to make changes.
          </p>
        </div>
      </div>
    )
  }

  // ── Password gate ───────────────────────────────────────────────────────────
  if (!formData) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-sm space-y-5">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">GST Verification Query</h1>
            <p className="mt-1 text-sm text-gray-500">
              Your accountant has sent you a query about some transactions. Enter the password you received to open it.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Password</label>
            <input
              autoFocus
              type="text"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setAuthError(null) }}
              onKeyDown={(e) => e.key === 'Enter' && verifyPassword()}
              placeholder="Enter password"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            {authError && <p className="mt-2 text-sm text-red-600">{authError}</p>}
          </div>
          <button
            onClick={verifyPassword}
            disabled={verifying || !password.trim()}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            {verifying ? 'Verifying…' : 'Open query'}
          </button>
        </div>
      </div>
    )
  }

  // ── Query form ──────────────────────────────────────────────────────────────
  const allAnswered = formData.queries.every((q) => (answers[q.id] ?? '').trim().length > 0)
  const allFiles = Object.values(attachments).flat()
  const hasUploading = allFiles.some(a => a.status === 'uploading')
  const hasUploadError = allFiles.some(a => a.status === 'error')

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-6">

        {/* Header */}
        <div className="rounded-xl bg-white px-6 py-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">GST Verification Query</p>
          <h1 className="mt-1 text-xl font-semibold text-gray-900">{formData.business_name}</h1>
          <p className="text-sm text-gray-500">Period: {fmtPeriod(formData.period)}</p>
          <p className="mt-3 text-sm text-gray-600">
            Your accountant needs clarification on the following transactions to complete your GST workpaper.
            Please answer each question and attach any receipts or documents if available.
          </p>
        </div>

        {/* Questions */}
        {formData.queries.map((q, i) => (
          <div key={q.id} className="rounded-xl bg-white px-6 py-5 shadow-sm space-y-3">
            {/* Header row */}
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Question {i + 1} of {formData.queries.length}
              </p>
              <span
                className="font-mono text-[10px] text-gray-300 select-all"
                title={`Query ID: ${q.id}`}
              >
                #{shortId(q.id)}
              </span>
            </div>

            {/* Two-column: transaction (left) ⟶ explanation (right) */}
            <div className="flex flex-col sm:flex-row items-stretch gap-2">
              {/* Transaction card */}
              <div className="flex-1 min-w-0 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                {/* Meta row: date + account badge */}
                <div className="flex items-center gap-2 mb-1">
                  {q.date && (
                    <span className="text-[11px] text-gray-400 tabular-nums">{q.date}</span>
                  )}
                  {q.account && (
                    <span className="text-[10px] font-semibold text-gray-500 bg-gray-200 rounded px-1.5 py-0.5 tracking-wide">
                      {q.account}
                    </span>
                  )}
                  {q.amount && (
                    <span className={`ml-auto shrink-0 font-mono font-bold text-sm tabular-nums ${q.amount.startsWith('-') ? 'text-red-500' : 'text-green-600'}`}>
                      {q.amount}
                    </span>
                  )}
                </div>
                {/* Merchant name */}
                <p className="text-[14px] font-semibold text-gray-900 leading-snug">
                  {q.merchant || '—'}
                </p>
                {/* Bank description */}
                {q.description && (
                  <p className="mt-0.5 text-[11px] text-gray-400 break-words line-clamp-2 leading-relaxed uppercase tracking-wide">
                    {cleanDescription(q.description)}
                  </p>
                )}
              </div>

              {/* Hook arrow */}
              <div className="hidden sm:flex items-center justify-center text-gray-300 shrink-0">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>

              {/* Explanation card */}
              <div className="flex-[1.1] rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-500 mb-1">
                  What we need to know
                </p>
                <p className="text-sm text-gray-700 leading-relaxed">{q.query_text}</p>
                {q.context_note && (
                  <p className="mt-1.5 text-xs text-gray-500 italic">Note: {q.context_note}</p>
                )}
              </div>
            </div>

            {/* Text answer */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Your answer</label>
              <textarea
                rows={3}
                value={answers[q.id] ?? ''}
                onChange={(e) => updateAnswer(q.id, e.target.value)}
                placeholder="e.g. This was a purchase of office supplies for the business."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-none"
              />
            </div>

            {/* File attachments */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-gray-600">
                  Supporting documents <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <button
                  type="button"
                  onClick={() => fileInputRefs.current[q.id]?.click()}
                  className="flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  Attach file
                </button>
                <input
                  ref={el => { fileInputRefs.current[q.id] = el }}
                  type="file"
                  multiple
                  accept={ACCEPT}
                  className="hidden"
                  onChange={(e) => handleFileChange(q.id, e)}
                />
              </div>
              {(attachments[q.id] ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {(attachments[q.id] ?? []).map(a => (
                    <FileChip key={a.localId} a={a} onRetry={() => fileInputRefs.current[q.id]?.click()} />
                  ))}
                </div>
              )}
              {(attachments[q.id] ?? []).length === 0 && (
                <p className="text-[11px] text-gray-400">Receipt, invoice, screenshot or Excel — jpg, png, pdf, xlsx accepted</p>
              )}
            </div>
          </div>
        ))}

        {/* Submit */}
        <div className="rounded-xl bg-white px-6 py-5 shadow-sm space-y-3">
          {!allAnswered && (
            <p className="text-xs text-amber-600">
              Please answer all {formData.queries.length} question{formData.queries.length !== 1 ? 's' : ''} before submitting.
            </p>
          )}
          {hasUploading && (
            <p className="text-xs text-gray-500">Waiting for files to finish uploading…</p>
          )}
          {hasUploadError && (
            <p className="text-xs text-red-600">Some files failed to upload. Tap the red chip to retry, or remove the file before submitting.</p>
          )}
          {submitError && <p className="text-sm text-red-600">{submitError}</p>}
          <button
            onClick={handleSubmit}
            disabled={submitting || !allAnswered || hasUploading || hasUploadError}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            {submitting ? 'Submitting…' : 'Submit answers'}
          </button>
          <p className="text-center text-[11px] text-gray-400">
            Your responses are sent securely to your accountant. This link expires 7 days after it was created.
          </p>
        </div>

      </div>
    </div>
  )
}
