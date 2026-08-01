import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import PeriodPicker from '../components/PeriodPicker'

interface Client {
  id: string
  business_name: string
}

interface FileRow {
  file: File
  clientId: string
  period: string
  account: string  // Bank / Account label (e.g. "CBA Operating") — optional, free text
  // set after prepare
  fileId?: string
  caseId?: string
  uploadStatus?: 'pending' | 'uploading' | 'done' | 'error'
}

function defaultPeriod(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// The natural grouping key (client + period)
function naturalKey(row: FileRow) {
  return `${row.clientId}::${row.period}`
}

export default function BatchUploadPage() {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<FileRow[]>([])
  const [phase, setPhase] = useState<'edit' | 'uploading' | 'done'>('edit')
  const [error, setError] = useState('')
  // naturalKeys where user has opted to merge split fragments (same-account scenario)
  const [mergedGroups, setMergedGroups] = useState<Set<string>>(new Set())

  const { data: clientsData } = useQuery({
    queryKey: ['clients-list'],
    queryFn: () => api.get<{ data: Client[] }>('/api/v1/clients').then((r) => r.data.data),
  })
  const clients = clientsData ?? []

  function addFiles(files: FileList | File[]) {
    const arr = Array.from(files)
    const dp = defaultPeriod()
    setRows((prev) => [
      ...prev,
      ...arr.map((f) => ({ file: f, clientId: '', period: dp, account: '' })),
    ])
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    addFiles(e.dataTransfer.files)
  }, [])

  function removeRow(idx: number) {
    setRows((r) => r.filter((_, i) => i !== idx))
  }

  function setClient(idx: number, clientId: string) {
    setRows((r) => r.map((row, i) => i === idx ? { ...row, clientId } : row))
  }

  function setPeriod(idx: number, period: string) {
    setRows((r) => r.map((row, i) => i === idx ? { ...row, period } : row))
  }

  function setAccount(idx: number, account: string) {
    setRows((r) => r.map((row, i) => i === idx ? { ...row, account } : row))
  }

  function toggleMerge(key: string) {
    setMergedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Count files per naturalKey
  const naturalKeyCount: Record<string, number> = {}
  rows.forEach((row) => {
    if (row.clientId && row.period) {
      const k = naturalKey(row)
      naturalKeyCount[k] = (naturalKeyCount[k] ?? 0) + 1
    }
  })

  // Last row index per naturalKey — group-level controls rendered after this row
  const nkLastIndex: Record<string, number> = {}
  rows.forEach((row, i) => {
    if (row.clientId && row.period) {
      nkLastIndex[naturalKey(row)] = i
    }
  })

  // Multi-account group: 2+ files with distinct non-empty accounts → auto-merge into one folder
  function isMultiAccountGroup(nk: string): boolean {
    const groupRows = rows.filter(r => naturalKey(r) === nk && r.clientId && r.period)
    if (groupRows.length < 2) return false
    const accounts = groupRows.map(r => r.account.trim()).filter(Boolean)
    return accounts.length === groupRows.length && new Set(accounts).size === groupRows.length
  }

  // Fragment group: 2+ files, same/empty accounts — user can opt into merge
  function isFragmentGroup(nk: string): boolean {
    return naturalKeyCount[nk] > 1 && !isMultiAccountGroup(nk)
  }

  // Multi-account: always same case_key. Fragment: same case_key only if user opted in.
  function caseKeyFor(row: FileRow, idx: number): string {
    const nk = naturalKey(row)
    if (isMultiAccountGroup(nk)) return nk
    if (mergedGroups.has(nk)) return nk
    return `${nk}::${idx}`
  }

  // Count distinct case_keys to show summary
  const distinctCaseKeys = new Set(
    rows.filter(r => r.clientId && r.period).map((r, i) => caseKeyFor(r, i))
  )

  const canSubmit =
    rows.length > 0 &&
    rows.every((r) => r.clientId && r.period) &&
    phase === 'edit'

  async function handleStart() {
    setError('')
    setPhase('uploading')

    try {
      // Step 1 — prepare: create cases + files records
      const prepareRes = await api.post<{
        data: { filename: string; case_id: string; file_id: string; bucket: string; storage_path: string }[]
      }>('/api/v1/batch-upload/prepare', {
        items: rows.map((r, i) => ({
          filename: r.file.name,
          client_id: r.clientId,
          period: r.period,
          case_key: caseKeyFor(r, i),
          account: r.account.trim() || null,
        })),
      })

      const prepared = prepareRes.data.data
      const prepMap: Record<string, { fileId: string; caseId: string }> = {}
      prepared.forEach((p) => {
        prepMap[p.filename] = { fileId: p.file_id, caseId: p.case_id }
      })

      setRows((prev) =>
        prev.map((r) => ({
          ...r,
          fileId: prepMap[r.file.name]?.fileId,
          caseId: prepMap[r.file.name]?.caseId,
          uploadStatus: 'pending',
        }))
      )

      // Step 2 — upload each file
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const meta = prepMap[row.file.name]
        if (!meta) continue

        setRows((prev) =>
          prev.map((r, idx) => idx === i ? { ...r, uploadStatus: 'uploading' } : r)
        )

        const formData = new FormData()
        formData.append('file', row.file)
        await api.post(`/api/v1/batch-upload/files/${meta.fileId}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })

        setRows((prev) =>
          prev.map((r, idx) => idx === i ? { ...r, uploadStatus: 'done' } : r)
        )
      }

      // Step 3 — start extraction for all unique case_ids
      const caseIds = [...new Set(prepared.map((p) => p.case_id))]
      await api.post('/api/v1/batch-upload/start', { case_ids: caseIds })

      setPhase('done')
    } catch {
      setError('Upload failed — please check your connection and try again')
      setPhase('edit')
    }
  }

  useEffect(() => {
    if (phase !== 'done') return
    const t = setTimeout(() => navigate('/conversation'), 2000)
    return () => clearTimeout(t)
  }, [phase, navigate])

  if (phase === 'done') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
          <svg className="h-7 w-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-lg font-semibold text-gray-800">Extraction started</p>
        <p className="text-sm text-gray-500">
          {distinctCaseKeys.size} folder{distinctCaseKeys.size !== 1 ? 's' : ''} queued. Returning to Chat…
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-gray-900">Batch Upload</h1>
        <span className="text-sm text-gray-400">Upload bank statements for multiple clients at once</span>
      </div>

      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="mx-auto max-w-3xl space-y-4">

          {/* Drop zone */}
          <div
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => inputRef.current?.click()}
            className="mx-auto max-w-xl flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 py-10 hover:border-blue-400 hover:bg-blue-50"
          >
            <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <p className="text-sm font-medium text-gray-600">Drop PDF / Excel files here, or click to select</p>
            <p className="text-xs text-gray-400">PDF, XLSX, XLS, CSV — multiple files allowed</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => e.target.files && addFiles(e.target.files)}
            />
          </div>

          {/* File list */}
          {rows.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="border-b border-gray-100 bg-gray-50 px-4 py-2.5">
                <p className="text-xs font-medium text-gray-500">
                  {rows.length} file{rows.length !== 1 ? 's' : ''} — assign each to a client and period
                </p>
              </div>
              <div className="divide-y divide-gray-100">
                {rows.map((row, i) => {
                  const nk = naturalKey(row)
                  const isLastInGroup = nkLastIndex[nk] === i
                  const showMultiAccountNote = isLastInGroup && row.clientId && row.period && isMultiAccountGroup(nk)
                  const showFragmentMerge  = isLastInGroup && row.clientId && row.period && isFragmentGroup(nk)
                  const isMergedGroup = mergedGroups.has(nk)

                  return (
                    <div key={i}>
                      {/* File row */}
                      <div className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {/* File icon + name */}
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <svg className="h-4 w-4 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                            </svg>
                            <span className="truncate text-[13px] text-gray-700">{row.file.name}</span>
                          </div>

                          {/* Client dropdown */}
                          <select
                            value={row.clientId}
                            onChange={(e) => setClient(i, e.target.value)}
                            disabled={phase === 'uploading'}
                            className="w-56 flex-shrink-0 rounded-lg border border-gray-300 pl-2 pr-7 py-1.5 text-[13px] focus:border-blue-500 focus:outline-none disabled:opacity-50"
                          >
                            <option value="">— Select client —</option>
                            {clients.map((c) => (
                              <option key={c.id} value={c.id}>{c.business_name}</option>
                            ))}
                          </select>

                          {/* Period */}
                          <PeriodPicker
                            value={row.period}
                            onChange={(v) => setPeriod(i, v)}
                            disabled={phase === 'uploading'}
                          />

                          {/* Bank / Account */}
                          <input
                            type="text"
                            value={row.account}
                            onChange={(e) => setAccount(i, e.target.value)}
                            disabled={phase === 'uploading'}
                            placeholder="e.g. CBA Operating"
                            className="w-36 flex-shrink-0 rounded-lg border border-gray-300 px-2 py-1.5 text-[13px] placeholder-gray-400 focus:border-blue-500 focus:outline-none disabled:opacity-50"
                          />

                          {/* Upload status / remove */}
                          {phase === 'uploading' ? (
                            <span className="w-6 text-center text-[13px]">
                              {row.uploadStatus === 'done' ? (
                                <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              ) : row.uploadStatus === 'uploading' ? (
                                <svg className="h-4 w-4 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                                </svg>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </span>
                          ) : (
                            <button
                              onClick={() => removeRow(i)}
                              className="text-gray-300 hover:text-red-500"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Group-level: multi-account auto-merge notice (after last file in group) */}
                      {showMultiAccountNote && (
                        <div className="border-t border-blue-100 bg-blue-50 px-4 py-2 flex items-center gap-2">
                          <svg className="h-3.5 w-3.5 flex-shrink-0 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                          </svg>
                          <span className="text-[12px] text-blue-700">
                            Multiple accounts detected — these files will be combined into one folder for a consolidated BAS workpaper
                          </span>
                        </div>
                      )}

                      {/* Group-level: fragment merge checkbox (same/empty accounts, after last file in group) */}
                      {showFragmentMerge && (
                        <div className="border-t border-amber-100 bg-amber-50 px-4 py-2">
                          <label className="flex cursor-pointer items-center gap-2 text-[12px] text-amber-800">
                            <input
                              type="checkbox"
                              checked={isMergedGroup}
                              onChange={() => toggleMerge(nk)}
                              disabled={phase === 'uploading'}
                              className="h-3.5 w-3.5 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                            />
                            These files belong to the same account — merge into one folder (split statement)
                          </label>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>
          )}

          {/* Actions */}
          {rows.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">
                {rows.every((r) => r.clientId && r.period)
                  ? `${distinctCaseKeys.size} folder${distinctCaseKeys.size !== 1 ? 's' : ''} will be created`
                  : 'Assign all files to a client to continue'}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => navigate(-1)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStart}
                  disabled={!canSubmit}
                  className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {phase === 'uploading'
                    ? 'Uploading…'
                    : `Start Extraction (${rows.length} file${rows.length !== 1 ? 's' : ''})`}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
