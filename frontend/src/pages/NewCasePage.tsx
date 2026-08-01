import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '../lib/api'
import { APP_NAME } from '../lib/config'
import { useTeamModules, MODULE_META } from '../hooks/useModules'
import { useAuth } from '../contexts/AuthContext'

// Modules with fully built workflows
const BUILT_MODULES = new Set(['bas_gst'])

const MODULE_ORDER = ['bas_gst', 'payroll', 'tax_individual', 'tax_company', 'smsf', 'asic', 'advisory']

// Maps module_name → case_type sent to backend
const MODULE_CASE_TYPE: Record<string, string> = {
  bas_gst:        'bas_gst',
  payroll:        'payroll',
  tax_individual: 'tax_individual',
  tax_company:    'tax_company',
  smsf:           'smsf',
  asic:           'asic',
  advisory:       'advisory',
}

interface Client {
  id: string
  business_name: string
  abn: string
}

export default function NewCasePage() {
  const navigate = useNavigate()
  const [selectedModule, setSelectedModule] = useState<string | null>(null)
  const [clientId, setClientId]   = useState('')
  const [period, setPeriod]       = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const { profile } = useAuth()
  const { data: modules, isLoading: modulesLoading } = useTeamModules(profile?.team_id)
  const activeSet = new Set((modules ?? []).filter(m => m.active).map(m => m.module_name))

  const { data: clientsData } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const res = await api.get<{ data: Client[] }>('/api/v1/clients')
      return res.data.data
    },
  })
  const clients = clientsData ?? []

  const createCase = useMutation({
    mutationFn: async () => {
      const caseType = MODULE_CASE_TYPE[selectedModule!] ?? selectedModule!
      const res = await api.post<{ data: { id: string } }>('/api/v1/cases', {
        client_id: clientId,
        case_type: caseType,
        period,
      })
      return res.data.data
    },
    onSuccess: () => navigate('/conversation'),
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setFormError(msg ?? 'Failed to create case. Please try again.')
    },
  })

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError(null)
    if (!clientId) { setFormError('Please select a client.'); return }
    if (!period.match(/^\d{4}-\d{2}$/)) { setFormError('Period must be YYYY-MM (e.g. 2025-06).'); return }
    createCase.mutate()
  }

  // ── Detail / form view ────────────────────────────────────────────────────────
  if (selectedModule) {
    const meta = MODULE_META[selectedModule]
    return (
      <div className="mx-auto max-w-lg px-6 py-10">
        <button
          onClick={() => { setSelectedModule(null); setFormError(null) }}
          className="mb-6 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back
        </button>

        <h1 className="text-2xl font-semibold text-gray-900">{meta.label}</h1>
        <p className="mt-1 text-sm text-gray-500">{meta.description}</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700">Client</label>
            <select
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              className="mt-1.5 block w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm focus:border-gray-400 focus:outline-none"
            >
              <option value="">Select a client…</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.business_name} · {c.abn}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Period</label>
            <input
              type="text"
              placeholder="YYYY-MM (e.g. 2025-06)"
              value={period}
              onChange={e => setPeriod(e.target.value)}
              className="mt-1.5 block w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm focus:border-gray-400 focus:outline-none"
            />
          </div>

          {formError && (
            <p className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{formError}</p>
          )}

          <button
            type="submit"
            disabled={createCase.isPending}
            className="flex w-full justify-center rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:opacity-50"
          >
            {createCase.isPending ? 'Creating…' : `Create ${meta.label} folder`}
          </button>
        </form>
      </div>
    )
  }

  // ── Module picker ─────────────────────────────────────────────────────────────
  const enabledModules   = MODULE_ORDER.filter(m => activeSet.has(m))
  const disabledModules  = MODULE_ORDER.filter(m => !activeSet.has(m))

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">New folder</h1>
        <p className="mt-1 text-sm text-gray-500">
          Select the type of work to create a folder in {APP_NAME}.
        </p>
      </div>

      {modulesLoading ? (
        <div className="flex h-40 items-center justify-center text-sm text-gray-400">Loading…</div>
      ) : (
        <div className="space-y-6">
          {/* Enabled modules */}
          <div className="grid gap-3">
            {enabledModules.map(name => {
              const meta = MODULE_META[name]
              const built = BUILT_MODULES.has(name)
              return built ? (
                <button
                  key={name}
                  type="button"
                  onClick={() => setSelectedModule(name)}
                  className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-4 text-left shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50 focus:outline-none"
                >
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{meta.label}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{meta.description}</p>
                  </div>
                  <svg className="h-5 w-5 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ) : (
                <div key={name} className="flex w-full items-center justify-between rounded-xl border border-blue-100 bg-blue-50 px-5 py-4">
                  <div>
                    <p className="text-sm font-semibold text-blue-800">{meta.label}</p>
                    <p className="mt-0.5 text-xs text-blue-600">{meta.description}</p>
                  </div>
                  <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                    Workflow coming soon
                  </span>
                </div>
              )
            })}
          </div>

          {/* Modules not enabled for this firm */}
          {disabledModules.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                Not enabled
              </p>
              <div className="grid gap-2">
                {disabledModules.map(name => {
                  const meta = MODULE_META[name]
                  return (
                    <div key={name} className="flex w-full items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-5 py-3.5 opacity-60">
                      <div>
                        <p className="text-sm font-semibold text-gray-500">{meta.label}</p>
                        <p className="mt-0.5 text-xs text-gray-400">{meta.description}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="mt-3 text-xs text-gray-400">
                Enable modules in{' '}
                <a href="/settings/modules" className="text-blue-500 hover:underline">
                  Settings → Business Modules
                </a>
                .
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
