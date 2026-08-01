import { useAuth } from '../contexts/AuthContext'
import { useModules, useToggleModule, MODULE_META } from '../hooks/useModules'

const MODULE_ORDER = ['bas_gst', 'payroll', 'tax_individual', 'tax_company', 'smsf', 'asic', 'advisory']

const COMING_SOON = new Set(['payroll', 'tax_individual', 'tax_company', 'smsf', 'asic', 'advisory'])

export default function ModulesSettingsPage() {
  const { profile } = useAuth()
  const role = profile?.user_role ?? ''
  const canManage = ['owner', 'admin'].includes(role)

  const { data: modules, isLoading } = useModules()
  const toggleMutation = useToggleModule()

  const activeMap = new Map((modules ?? []).map(m => [m.module_name, m.active]))
  // bas_gst is always active even if DB row is missing (seed may not have run yet)
  if (!activeMap.has('bas_gst')) activeMap.set('bas_gst', true)

  function handleToggle(moduleName: string, current: boolean) {
    if (!canManage) return
    toggleMutation.mutate({ moduleName, active: !current })
  }

  return (
    <div className="flex h-full flex-col overflow-auto bg-gray-50">
      <div className="flex h-14 flex-shrink-0 items-center border-b border-gray-200 bg-white px-6">
        <h1 className="text-base font-semibold text-gray-900">Business Modules</h1>
      </div>

      <div className="flex-1 p-6">
        <div className="mx-auto max-w-2xl">
          <p className="mb-6 text-sm text-gray-500">
            Activate the service lines your firm offers. Each module unlocks its own workflow,
            workpaper pages and agent. Small firms typically activate one; full-service firms activate several.
          </p>

          {isLoading ? (
            <div className="flex h-40 items-center justify-center text-sm text-gray-400">Loading…</div>
          ) : (
            <div className="space-y-3">
              {MODULE_ORDER.map(name => {
                const meta = MODULE_META[name]
                const active = activeMap.get(name) ?? false
                const comingSoon = COMING_SOON.has(name)

                if (comingSoon) return null

                return (
                  <div
                    key={name}
                    className={`flex items-start justify-between rounded-xl border bg-white p-5 transition-colors ${
                      active ? 'border-blue-200' : 'border-gray-200'
                    }`}
                  >
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900">{meta.label}</p>
                        {comingSoon && (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                            Coming soon
                          </span>
                        )}
                        {active && (
                          <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700 ring-1 ring-green-200">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-gray-500">{meta.description}</p>
                    </div>

                    {/* Toggle */}
                    <button
                      type="button"
                      disabled={!canManage || toggleMutation.isPending}
                      onClick={() => handleToggle(name, active)}
                      className={`relative mt-0.5 inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full overflow-hidden border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${
                        active ? 'bg-blue-600' : 'bg-gray-200'
                      }`}
                      aria-label={`${active ? 'Deactivate' : 'Activate'} ${meta.label}`}
                    >
                      <span
                        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
                          active ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {!canManage && (
            <p className="mt-4 text-xs text-gray-400">
              Only owners and admins can change module settings.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
