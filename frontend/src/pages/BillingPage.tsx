import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

// ── Plan catalogue (mirrors backend _PLAN_CONFIG) ────────────────────────────
const PLANS = [
  { name: 'starter', label: 'Starter', monthlyPrice: 800,  annualPrice: 8000,  includes: { clients: 60,  teamMembers: 10, reads: 75,  storage: '100 GB', teamLabel: 'Small Accounting Firm' } },
  { name: 'growth',  label: 'Growth',  monthlyPrice: 1800, annualPrice: 18000, includes: { clients: 150, teamMembers: 30, reads: 180, storage: '300 GB', teamLabel: 'Mid-size Practice'      } },
  { name: 'scale',   label: 'Scale',   monthlyPrice: 3500, annualPrice: 35000, includes: { clients: 300, teamMembers: 50, reads: 360, storage: '600 GB', teamLabel: 'Large Practice'         } },
]

// BAS/GST module features shown in plan cards (same across all plans except reads quota)
const BAS_GST_MODULE_FEATURES = [
  { label: 'BAS / GST Module'              },
  { label: 'Human validation gate'         },
  // reads/mo inserted dynamically per plan
  { label: 'Working paper suite'           },
  { label: 'Client query portal'           },
  { label: 'Magic link client access'      },
  { label: 'Client confirmation node'      },
  { label: 'Structured data · Excel export'},
  { label: 'Xero / QuickBooks push'        },
]

const PLATFORM_FEATURES = [
  { label: 'Isolated partner workspaces', value: '✓' },
  { label: 'SLA tracking',            value: '✓' },
  { label: 'Real-time task alerts',   value: '✓' },
  { label: 'Case log (5-yr)',         value: '✓' },
]

const TOPUPS = [
  { size: 'small',  label: 'Small',  reads: 10, price: 110, save: null },
  { size: 'medium', label: 'Medium', reads: 30, price: 330, save: null },
  { size: 'large',  label: 'Large',  reads: 50, price: 550, save: null },
]

function fmt(n: number) { return n.toLocaleString('en-AU') }

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  if (bytes >= 1024)      return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">
      {children}
    </p>
  )
}

interface BillingData {
  plan: string
  plan_interval: string
  trial_active: boolean
  trial_ends: string | null
  trial_plan: string | null
  extractions_used: number
  extractions_limit: number
  credits_remaining: number
  team_members_count: number
  team_members_limit: number
  clients_count: number
  clients_limit: number
  storage_used_bytes: number
  storage_limit_bytes: number
  reset_date: string
  monthly_price: number
  cancel_at_period_end: boolean
  cancel_at: string | null
  subscription_status: string
  cancelled_at: string | null
}

function UsageBar({ used, limit }: { used: number; limit: number }) {
  const pct = Math.min(used / limit, 1)
  const fill = pct >= 1 ? 'bg-red-500' : pct >= 0.8 ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div className="h-[7px] w-full overflow-hidden rounded-full bg-gray-100">
      <div className={`h-full rounded-full transition-all duration-500 ${fill}`} style={{ width: `${pct * 100}%` }} />
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const { profile } = useAuth()
  const location = useLocation()
  const qc = useQueryClient()
  const [interval, setInterval] = useState<'monthly' | 'annual'>('monthly')
  const [loadingKey, setLoadingKey] = useState<string | null>(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  const checkoutStatus = new URLSearchParams(location.search).get('checkout')

  const { data: raw, isLoading } = useQuery({
    queryKey: ['firm-billing'],
    queryFn: () => api.get('/api/v1/firms/billing').then(r => r.data.data as BillingData),
    refetchInterval: 60_000,
  })

  const checkoutMut = useMutation({
    mutationFn: async (params: { type: string; plan?: string; interval?: string; size?: string; _key: string }) => {
      const { _key: _, ...body } = params
      const res = await api.post('/api/v1/firms/billing/checkout', body)
      return res.data.data as { checkout_url: string }
    },
    onSuccess: (data) => {
      window.location.href = data.checkout_url
    },
    onError: (err: unknown) => {
      setLoadingKey(null)
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      alert(msg ?? 'Failed to open checkout. Please try again.')
    },
  })

  const portalMut = useMutation({
    mutationFn: () => api.post('/api/v1/firms/billing/portal').then(r => r.data.data as { portal_url: string }),
    onSuccess: (data) => { window.location.href = data.portal_url },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      alert(msg ?? 'Failed to open billing portal. Please try again.')
    },
  })

  const cancelMut = useMutation({
    mutationFn: () => api.post('/api/v1/firms/billing/cancel'),
    onSuccess: () => { setShowCancelConfirm(false); qc.invalidateQueries({ queryKey: ['firm-billing'] }) },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      alert(msg ?? 'Failed to cancel subscription. Please try again.')
    },
  })

  const reactivateMut = useMutation({
    mutationFn: () => api.post('/api/v1/firms/billing/reactivate'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['firm-billing'] }),
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      alert(msg ?? 'Failed to reactivate subscription. Please try again.')
    },
  })

  function startCheckout(params: { type: string; plan?: string; interval?: string; size?: string }, key: string) {
    if (loadingKey) return
    setLoadingKey(key)
    checkoutMut.mutate({ ...params, _key: key })
  }

  if (isLoading || !raw) {
    return (
      <div className="flex h-full flex-col overflow-auto bg-gray-50">
        <div className="flex h-14 flex-shrink-0 items-center border-b border-gray-200 bg-white px-6">
          <h1 className="text-base font-semibold text-gray-900">Plan &amp; Billing</h1>
        </div>
        <div className="flex flex-1 items-center justify-center text-sm text-gray-400">Loading…</div>
      </div>
    )
  }

  const d = raw
  const currentPlan = PLANS.find(p => p.name === d.plan) ?? PLANS[0]
  const pct = Math.min(d.extractions_used / d.extractions_limit, 1)
  const pctPct = Math.round(pct * 100)
  const totalAvail = d.extractions_limit + d.credits_remaining
  const nextInvoiceDate = d.reset_date
  const storageUsedGb = d.storage_used_bytes / (1024 ** 3)
  const storageLimitGb = d.storage_limit_bytes / (1024 ** 3)
  const storagePct = Math.min(storageUsedGb / storageLimitGb, 1)

  const canManage = profile?.user_role === 'owner'

  return (
    <div className="flex h-full flex-col overflow-auto bg-gray-50">
      {/* Header */}
      <div className="flex h-14 flex-shrink-0 items-center border-b border-gray-200 bg-white px-6">
        <h1 className="text-base font-semibold text-gray-900">Plan &amp; Billing</h1>
      </div>

      <div className="mx-auto w-full max-w-[860px] space-y-8 px-6 py-8">

        {/* Checkout status banner */}
        {checkoutStatus === 'success' && (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            ✓ Payment successful — your plan will be updated shortly.
          </div>
        )}
        {checkoutStatus === 'cancelled' && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
            Checkout cancelled — no charge was made.
          </div>
        )}

        {/* Trial banner */}
        {d.trial_active && (
          <div className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            Trial active · <strong>{d.trial_plan ? d.trial_plan.charAt(0).toUpperCase() + d.trial_plan.slice(1) : 'Growth'} plan</strong> · Expires <strong>{d.trial_ends}</strong>
          </div>
        )}

        {/* Cancelled banner — subscription ended, data preserved */}
        {d.subscription_status === 'cancelled' && (
          <div className="flex items-center justify-between rounded-lg border border-red-300 bg-red-50 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-red-800">Subscription ended — your data is preserved</p>
              <p className="mt-0.5 text-xs text-red-700">
                Reactivate to regain full access. Data is archived and will not be deleted.
              </p>
            </div>
            {canManage && (
              <button
                onClick={() => startCheckout({ type: 'subscription', plan: d.plan || 'starter', interval: d.plan_interval || 'monthly' }, 'reactivate')}
                disabled={checkoutMut.isPending}
                className="ml-4 shrink-0 rounded-lg bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {checkoutMut.isPending ? 'Loading…' : 'Reactivate subscription'}
              </button>
            )}
          </div>
        )}

        {/* Cancellation pending banner */}
        {d.subscription_status !== 'cancelled' && d.cancel_at_period_end && (
          <div className="flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
            <p className="text-sm text-amber-800">
              ⚠ Your subscription will cancel on <strong>{d.cancel_at}</strong>. Access continues until then.
            </p>
            {canManage && (
              <button
                onClick={() => reactivateMut.mutate()}
                disabled={reactivateMut.isPending}
                className="ml-4 shrink-0 rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-50"
              >
                {reactivateMut.isPending ? 'Reactivating…' : 'Keep subscription'}
              </button>
            )}
          </div>
        )}

        {/* ── Current plan status ─────────────────────────────────── */}
        <div>
          <SectionLabel>Current plan</SectionLabel>
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-gray-900">{currentPlan.label}</h2>
                {d.subscription_status === 'cancelled' ? (
                  <span className="rounded-full border border-red-300 bg-red-50 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-700">
                    Cancelled
                  </span>
                ) : d.trial_active ? (
                  <span className="rounded-full border border-blue-300 bg-blue-50 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700">
                    Trial
                  </span>
                ) : d.cancel_at_period_end ? (
                  <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                    Cancelling
                  </span>
                ) : (
                  <span className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                    Active
                  </span>
                )}
                {d.plan_interval === 'annual' && (
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700">
                    Annual
                  </span>
                )}
              </div>
              <span className="text-sm font-semibold text-gray-900">
                AU${fmt(currentPlan.monthlyPrice)}<span className="font-normal text-gray-400">/month + GST</span>
              </span>
            </div>

            <div className="mb-1.5 flex justify-between text-xs text-gray-500">
              <span>AI Normalization this month</span>
              <span>
                <strong className="text-gray-900">{d.extractions_used}</strong>
                {' '}/ {totalAvail > d.extractions_limit ? `${d.extractions_limit} + ${d.credits_remaining} credits` : d.extractions_limit} used ({pctPct}%)
              </span>
            </div>
            <UsageBar used={d.extractions_used} limit={totalAvail} />
            <div className="mt-1.5 flex justify-between text-[11px] text-gray-400">
              <span>Resets {d.reset_date}</span>
              {pct >= 1 && <span className="font-semibold text-red-600">⛔ Limit reached — AI Normalization paused</span>}
              {pct >= 0.8 && pct < 1 && <span className="font-semibold text-amber-600">⚠ Approaching limit</span>}
            </div>

            <div className="mt-5 mb-1.5 flex justify-between text-xs text-gray-500">
              <span>Storage</span>
              <span>
                <strong className="text-gray-900">{formatBytes(d.storage_used_bytes)}</strong>
                {' '}/ {storageLimitGb.toFixed(0)} GB used ({storagePct < 0.001 ? '<0.1' : Math.round(storagePct * 100)}%)
              </span>
            </div>
            <UsageBar used={storageUsedGb} limit={storageLimitGb} />
            {storagePct >= 1 && (
              <p className="mt-1 text-[11px] font-semibold text-red-600">⛔ Storage limit reached — file uploads paused</p>
            )}
            {storagePct >= 0.8 && storagePct < 1 && (
              <p className="mt-1 text-[11px] font-semibold text-amber-600">⚠ Approaching storage limit</p>
            )}

            <div className="mt-5 grid grid-cols-4 divide-x divide-gray-200 overflow-hidden rounded-lg border border-gray-200">
              {[
                { label: 'Active clients', value: d.clients_count, sub: `of ${d.clients_limit} included` },
                { label: 'Team members', value: d.team_members_count, sub: `of ${d.team_members_limit} included` },
                { label: 'Top-up credits', value: d.credits_remaining, sub: 'reads remaining' },
                { label: 'Next invoice', value: `AU$${fmt(d.plan_interval === 'annual' ? currentPlan.annualPrice : currentPlan.monthlyPrice)}`, sub: nextInvoiceDate },
              ].map(s => (
                <div key={s.label} className="bg-white py-3 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{s.label}</p>
                  <p className="mt-1 text-[15px] font-bold text-gray-900 tabular-nums">{s.value}</p>
                  <p className="text-[11px] text-gray-400">{s.sub}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Change plan ─────────────────────────────────────────── */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <SectionLabel>Change plan</SectionLabel>
            {/* Interval toggle */}
            <div className="flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs">
              {(['monthly', 'annual'] as const).map(iv => (
                <button
                  key={iv}
                  onClick={() => setInterval(iv)}
                  className={`rounded-md px-3 py-1 font-semibold capitalize transition-colors ${
                    interval === iv ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  {iv === 'annual' ? 'Annual' : 'Monthly'}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {PLANS.map(plan => {
              const isCurrent = plan.name === d.plan && d.plan_interval === interval
              const isSamePlanDiffInterval = plan.name === d.plan && d.plan_interval !== interval
              const displayPrice = interval === 'annual' ? plan.annualPrice : plan.monthlyPrice
              const isUpgrade = plan.monthlyPrice > currentPlan.monthlyPrice
              return (
                <div
                  key={plan.name}
                  className={`flex flex-col gap-3 rounded-xl border p-5 transition-shadow hover:shadow-md ${
                    isCurrent ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 bg-white'
                  }`}
                >
                  <p className={`text-[10px] font-bold uppercase tracking-widest ${isCurrent ? 'text-emerald-600' : 'text-gray-400'}`}>
                    {plan.label}
                  </p>
                  <div className="flex items-baseline gap-0.5">
                    <span className="text-sm font-semibold text-gray-900">AU$</span>
                    <span className="text-3xl font-bold tracking-tight text-gray-900 tabular-nums">{fmt(displayPrice)}</span>
                    <span className="ml-1 text-xs text-gray-400">/{interval === 'annual' ? 'yr' : 'mo'} + GST</span>
                  </div>
                  <div className="flex-1 space-y-3 text-xs text-gray-500">
                    {/* BAS / GST module */}
                    <div>
                      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                        AI Workforce
                      </p>
                      <ul className="space-y-1.5">
                        {BAS_GST_MODULE_FEATURES.map(f => (
                          <li key={f.label} className="flex justify-between">
                            <span>{f.label}</span>
                            <strong className="text-gray-900">✓</strong>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Platform */}
                    <div className="border-t border-gray-100 pt-2.5">
                      <ul className="space-y-1.5">
                        <li className="flex justify-between"><span>AI Normalization/mo</span><strong className="text-gray-900">{plan.includes.reads} runs</strong></li>
                        <li className="flex justify-between"><span>Active clients</span><strong className="text-gray-900">Up to {plan.includes.clients}</strong></li>
                        <li className="flex justify-between"><span>Storage</span><strong className="text-gray-900">{plan.includes.storage}</strong></li>
                        {PLATFORM_FEATURES.map(f => (
                          <li key={f.label} className="flex justify-between">
                            <span>{f.label}</span>
                            <strong className="text-gray-900">{f.value}</strong>
                          </li>
                        ))}
                        <li className="pt-2 mt-1 border-t border-gray-100 text-center">
                          {plan.includes.teamLabel} · {plan.includes.teamMembers} staff
                        </li>
                      </ul>
                    </div>

                    {interval === 'annual' ? (
                      <p className="pt-1 text-center font-semibold text-emerald-600">Save 2 months</p>
                    ) : (
                      <p className="pt-1">&nbsp;</p>
                    )}
                  </div>
                  {isCurrent ? (
                    <button disabled className="w-full rounded-lg border border-emerald-300 bg-transparent py-2 text-xs font-semibold text-emerald-700">
                      ✓ Current plan
                    </button>
                  ) : isSamePlanDiffInterval ? (
                    <button
                      disabled={!canManage || loadingKey === `plan-${plan.name}`}
                      onClick={() => startCheckout({ type: 'subscription', plan: plan.name, interval }, `plan-${plan.name}`)}
                      className="w-full rounded-lg border border-blue-300 bg-blue-50 py-2 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-50"
                    >
                      {loadingKey === `plan-${plan.name}` ? 'Redirecting…' : `Switch to ${interval === 'annual' ? 'Annual' : 'Monthly'}`}
                    </button>
                  ) : isUpgrade ? (
                    <button
                      disabled={!canManage || loadingKey === `plan-${plan.name}`}
                      onClick={() => startCheckout({ type: 'subscription', plan: plan.name, interval }, `plan-${plan.name}`)}
                      className="w-full rounded-lg bg-gray-900 py-2 text-xs font-semibold text-white transition-colors hover:bg-gray-700 disabled:opacity-50"
                    >
                      {loadingKey === `plan-${plan.name}` ? 'Redirecting…' : `Upgrade to ${plan.label}`}
                    </button>
                  ) : (
                    <button
                      disabled={!canManage || loadingKey === `plan-${plan.name}`}
                      onClick={() => startCheckout({ type: 'subscription', plan: plan.name, interval }, `plan-${plan.name}`)}
                      className="w-full rounded-lg border border-gray-200 bg-transparent py-2 text-xs font-semibold text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-900 disabled:opacity-50"
                    >
                      {loadingKey === `plan-${plan.name}` ? 'Redirecting…' : `Downgrade to ${plan.label}`}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Top-up packs — only shown when firm has an active paid plan ── */}
        {d.plan !== 'starter' && d.subscription_status !== 'cancelled' && (
          <div>
            <SectionLabel>Need more AI Normalization this month?</SectionLabel>
            <div className="grid grid-cols-3 gap-3">
              {TOPUPS.map(t => {
                return (
                  <div key={t.size} className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{t.label} pack</span>
                      {t.save && (
                        <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                          Save AU${t.save}
                        </span>
                      )}
                    </div>
                    <div className="text-3xl font-bold tracking-tight text-gray-900 tabular-nums">
                      {t.reads}<span className="ml-1.5 text-sm font-normal text-gray-400">AI Normalization runs</span>
                    </div>
                    <div>
                      <span className="text-sm font-bold text-gray-900">AU${fmt(t.price)} + GST</span>
                    </div>
                    <button
                      disabled={!canManage || loadingKey === `topup-${t.size}`}
                      onClick={() => startCheckout({ type: 'topup', size: t.size }, `topup-${t.size}`)}
                      className="w-full rounded-lg border border-gray-200 bg-transparent py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 hover:border-gray-400 disabled:opacity-50"
                    >
                      {loadingKey === `topup-${t.size}` ? 'Redirecting…' : 'Buy this pack'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Billing footer ───────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-3">
            <p className="text-xs text-gray-500">
              Billing · <span className="font-semibold text-gray-900">Powered by Stripe</span>
              {' '}· Receipts sent to owner email · + GST on all prices
            </p>
            <div className="flex shrink-0 items-center gap-4 pl-6">
              {canManage && d.plan !== 'starter' && d.subscription_status !== 'cancelled' && (
                <button
                  onClick={() => portalMut.mutate()}
                  disabled={portalMut.isPending}
                  className="text-xs text-gray-500 underline-offset-2 hover:text-gray-900 hover:underline disabled:opacity-50"
                >
                  {portalMut.isPending ? 'Opening…' : 'Manage billing ↗'}
                </button>
              )}
              {canManage && !d.cancel_at_period_end && d.plan !== 'starter' && d.subscription_status !== 'cancelled' && (
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  className="text-xs text-gray-400 underline-offset-2 hover:text-red-500 hover:underline"
                >
                  Cancel subscription
                </button>
              )}
            </div>
          </div>
          <p className="mt-1.5 px-1 text-[11px] text-gray-400">
            Upgrades are charged immediately (prorated). Downgrades take effect immediately — unused time is applied as credit to your next invoice.
          </p>
        </div>

      </div>

      {/* ── Cancel confirmation modal ────────────────────────────── */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-base font-bold text-gray-900">Cancel subscription?</h3>
            <p className="mb-1 text-sm text-gray-600">
              Your <strong>{currentPlan.label}</strong> plan will remain active until{' '}
              <strong>{d.cancel_at ?? d.reset_date}</strong>.
            </p>
            <p className="mb-6 text-sm text-gray-500">
              After that, your account reverts to the free Starter plan (75 AI Normalization runs/month). No refund is issued for the current period.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="flex-1 rounded-lg border border-gray-200 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Keep subscription
              </button>
              <button
                onClick={() => cancelMut.mutate()}
                disabled={cancelMut.isPending}
                className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {cancelMut.isPending ? 'Cancelling…' : 'Yes, cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
