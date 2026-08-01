import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'


interface Director {
  name: string
  position: string
  email: string
  phone: string
}

interface Junior {
  id: string
  name: string
  email: string
}

const EMPTY_DIRECTOR: Director = { name: '', position: '', email: '', phone: '' }

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function EngagementDatePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const init = value ? value.split('-') : ['', '', '']
  const [d, setD] = useState(init[2] ? String(parseInt(init[2])) : '')
  const [m, setM] = useState(init[1] ? String(parseInt(init[1])) : '')
  const [y, setY] = useState(init[0] || '')

  const sel = 'rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white'
  const handle = (ny: string, nm: string, nd: string) => {
    setY(ny); setM(nm); setD(nd)
    if (ny && nm && nd) onChange(`${ny}-${nm.padStart(2,'0')}-${nd.padStart(2,'0')}`)
  }
  const days = Array.from({ length: 31 }, (_, i) => i + 1)
  const years = Array.from({ length: 30 }, (_, i) => new Date().getFullYear() - i)
  return (
    <div className="flex gap-2">
      <select className={`${sel} w-20`} value={d} onChange={e => handle(y, m, e.target.value)}>
        <option value="">Day</option>
        {days.map(n => <option key={n} value={String(n)}>{n}</option>)}
      </select>
      <select className={`${sel} w-36`} value={m} onChange={e => handle(y, e.target.value, d)}>
        <option value="">Month</option>
        {MONTHS.map((name, i) => <option key={i+1} value={String(i+1)}>{name}</option>)}
      </select>
      <select className={`${sel} w-24`} value={y} onChange={e => handle(e.target.value, m, d)}>
        <option value="">Year</option>
        {years.map(n => <option key={n} value={String(n)}>{n}</option>)}
      </select>
    </div>
  )
}

export default function ClientNewPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const isJunior = profile?.user_role === 'junior'

  const [abnInput, setAbnInput] = useState('')

  const ENTITY_TYPES = [
    { value: 'company',     label: 'Australian Private Company' },
    { value: 'trust',       label: 'Trust' },
    { value: 'partnership', label: 'Partnership' },
    { value: 'sole_trader', label: 'Sole Trader' },
    { value: 'individual',  label: 'Individual' },
    { value: 'smsf',        label: 'SMSF' },
    { value: 'other',       label: 'Other' },
  ]

  // Form state
  const [form, setForm] = useState({
    business_name: '',
    entity_type: 'company' as string,
    industry: '',
    address: '',
    bas_cycle: 'quarterly' as 'monthly' | 'quarterly' | 'annual',
    gst_method: 'cash' as 'cash' | 'accruals',
    assigned_junior: '',
    engagement_date: '',
    contact_email: '',
  })
  const [directors, setDirectors] = useState<Director[]>([])
  const [submitError, setSubmitError] = useState('')

  // Juniors dropdown (not needed for juniors)
  const { data: juniorsData } = useQuery({
    queryKey: ['juniors'],
    queryFn: () => api.get<{ data: Junior[] }>('/api/v1/users/juniors').then((r) => r.data.data),
    enabled: !isJunior,
  })
  const juniors = juniorsData ?? []

  function addDirector() {
    setDirectors((d) => [...d, { ...EMPTY_DIRECTOR }])
  }

  function removeDirector(i: number) {
    setDirectors((d) => d.filter((_, idx) => idx !== i))
  }

  function updateDirector(i: number, field: keyof Director, value: string) {
    setDirectors((d) => d.map((dir, idx) => idx === i ? { ...dir, [field]: value } : dir))
  }

  const createMutation = useMutation({
    mutationFn: () =>
      api.post('/api/v1/clients', {
        business_name: form.business_name,
        abn: abnInput.replace(/[\s-]/g, ''),
        entity_type: form.entity_type,
        industry: form.industry,
        address: form.address,
        gst_registered: null,
        gst_registered_from: null,
        bas_cycle: form.bas_cycle,
        gst_method: form.gst_method,
        engagement_date: form.engagement_date || null,
        contact_email: form.contact_email || null,
        assigned_junior: isJunior ? undefined : (form.assigned_junior || undefined),
        directors: directors.filter((d) => d.name.trim()),
      }),
    onSuccess: () => navigate('/clients'),
    onError: () => setSubmitError('Failed to register client — please try again'),
  })

  const canSubmit = form.business_name && form.industry && form.address

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-6 py-4">
        <button
          onClick={() => navigate('/clients')}
          className="text-gray-400 hover:text-gray-600"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold text-gray-900">New Client</h1>
      </div>

      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="mx-auto max-w-2xl space-y-6">

          {/* Client Details */}
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold text-gray-700">Client Details</h2>
            <div className="space-y-3">
              <Field label="ABN">
                <input
                  type="text"
                  placeholder="e.g. 51 123 456 789"
                  value={abnInput}
                  onChange={(e) => setAbnInput(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3.5 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </Field>
              <Field label="Business Name">
                <input
                  type="text"
                  value={form.business_name}
                  onChange={(e) => setForm((f) => ({ ...f, business_name: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  placeholder="Full registered name"
                />
              </Field>
              <Field label="Industry">
                <input
                  type="text"
                  value={form.industry}
                  onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  placeholder="e.g. Cafe, Building & Construction, Retail"
                />
              </Field>
              <Field label="Main Business Location">
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  placeholder="e.g. VIC 3000"
                />
              </Field>
              <Field label="Entity Type">
                <select
                  value={form.entity_type}
                  onChange={(e) => setForm((f) => ({ ...f, entity_type: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  {ENTITY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Engagement Date">
                <EngagementDatePicker
                  value={form.engagement_date}
                  onChange={(v) => setForm((f) => ({ ...f, engagement_date: v }))}
                />
              </Field>
              <Field label="Contact Email">
                <input
                  type="email"
                  placeholder="accounting@client.com.au"
                  value={form.contact_email}
                  onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="BAS Cycle">
                  <select
                    value={form.bas_cycle}
                    onChange={(e) => setForm((f) => ({ ...f, bas_cycle: e.target.value as typeof form.bas_cycle }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="annual">Annual</option>
                  </select>
                </Field>
                <Field label="GST Method">
                  <select
                    value={form.gst_method}
                    onChange={(e) => setForm((f) => ({ ...f, gst_method: e.target.value as typeof form.gst_method }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="cash">Cash</option>
                    <option value="accruals">Accruals</option>
                  </select>
                </Field>
              </div>
            </div>
          </section>

          {/* Assigned Junior */}
          {isJunior ? (
            <section className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="mb-4 text-sm font-semibold text-gray-700">Assigned Bookkeeper</h2>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
                  Waiting for assignment
                </span>
                <span className="text-xs text-gray-400">A Senior will assign this client after review.</span>
              </div>
            </section>
          ) : (
            <section className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="mb-4 text-sm font-semibold text-gray-700">Assigned Junior</h2>
              <Field label="Bookkeeper">
                <select
                  value={form.assigned_junior}
                  onChange={(e) => setForm((f) => ({ ...f, assigned_junior: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="">— Assign later —</option>
                  {juniors.map((j) => (
                    <option key={j.id} value={j.id}>{j.name}</option>
                  ))}
                </select>
              </Field>
            </section>
          )}

          {/* Directors */}
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">Directors</h2>
              <button
                onClick={addDirector}
                className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add Director
              </button>
            </div>
            {directors.length === 0 ? (
              <p className="text-[13px] text-gray-400">No directors added yet</p>
            ) : (
              <div className="space-y-4">
                {directors.map((dir, i) => (
                  <div key={i} className="rounded-lg bg-gray-50 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-500">Director {i + 1}</span>
                      <button
                        onClick={() => removeDirector(i)}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="Full name"
                        value={dir.name}
                        onChange={(e) => updateDirector(i, 'name', e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] focus:border-blue-500 focus:outline-none"
                      />
                      <input
                        type="text"
                        placeholder="Position (e.g. Director)"
                        value={dir.position}
                        onChange={(e) => updateDirector(i, 'position', e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] focus:border-blue-500 focus:outline-none"
                      />
                      <input
                        type="email"
                        placeholder="Email (optional)"
                        value={dir.email}
                        onChange={(e) => updateDirector(i, 'email', e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] focus:border-blue-500 focus:outline-none"
                      />
                      <input
                        type="tel"
                        placeholder="Phone (optional)"
                        value={dir.phone}
                        onChange={(e) => updateDirector(i, 'phone', e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Actions */}
          {submitError && (
            <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{submitError}</p>
          )}
          <div className="flex justify-end gap-3 pb-8">
            <button
              onClick={() => navigate('/clients')}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => createMutation.mutate()}
              disabled={!canSubmit || createMutation.isPending}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Registering…' : 'Register Client'}
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-500">{label}</label>
      {children}
    </div>
  )
}
