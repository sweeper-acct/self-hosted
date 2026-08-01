import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

interface Client {
  id: string
  business_name: string
  abn: string
  entity_type: string
  bas_cycle: 'monthly' | 'quarterly' | 'annual'
  gst_method: 'cash' | 'accruals'
  status: 'open' | 'closed'
  assigned_junior: string | null
  teams: { id: string; name: string; parent_team_id: string | null } | null
  junior: { name: string } | null
  creator: { name: string } | null
}

const STATUS_BADGE: Record<string, string> = {
  open:   'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-500',
}

const CYCLE_LABEL: Record<string, string> = {
  monthly:   'Monthly',
  quarterly: 'Quarterly',
  annual:    'Annual',
}

export default function ClientListPage() {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: () =>
      api.get<{ data: Client[]; meta: { total: number } }>('/api/v1/clients')
        .then((r) => r.data),
  })

  const clients = data?.data ?? []

  // Only show Group column if any client belongs to a group (has parent_team_id)
  const hasGroups = clients.some((c) => c.teams?.parent_team_id != null)

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Clients</h1>
          {data && (
            <p className="text-sm text-gray-500">{data.meta.total} client{data.meta.total !== 1 ? 's' : ''}</p>
          )}
        </div>
        <button
          onClick={() => navigate('/clients/new')}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Client
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center text-sm text-gray-400">Loading…</div>
        ) : clients.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-gray-400">
            <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2h5M12 12a4 4 0 100-8 4 4 0 000 8z" />
            </svg>
            <p className="text-sm">No clients yet</p>
            <button
              onClick={() => navigate('/clients/new')}
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              Register first client →
            </button>
          </div>
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead className="sticky top-0 bg-gray-50">
              <tr>
                <th className="px-4 py-2.5 font-medium text-gray-500">Business Name</th>
                <th className="px-4 py-2.5 font-medium text-gray-500">ABN</th>
                <th className="px-4 py-2.5 font-medium text-gray-500">Entity Type</th>
                <th className="px-4 py-2.5 font-medium text-gray-500">BAS Cycle</th>
                <th className="px-4 py-2.5 font-medium text-gray-500">GST Method</th>
                {hasGroups && <th className="px-4 py-2.5 font-medium text-gray-500">Group</th>}
                <th className="px-4 py-2.5 font-medium text-gray-500">Assigned to</th>
                <th className="px-4 py-2.5 font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {clients.map((c) => {
                const groupName = c.teams?.parent_team_id ? c.teams.name : null
                const assignedName = c.junior?.name ?? c.creator?.name ?? null
                return (
                  <tr
                    key={c.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => navigate(`/clients/${c.id}`)}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">{c.business_name}</td>
                    <td className="px-4 py-3 font-mono text-gray-600">{c.abn}</td>
                    <td className="px-4 py-3 text-gray-600">{c.entity_type}</td>
                    <td className="px-4 py-3 text-gray-600">{CYCLE_LABEL[c.bas_cycle] ?? c.bas_cycle}</td>
                    <td className="px-4 py-3 capitalize text-gray-600">{c.gst_method}</td>
                    {hasGroups && (
                      <td className="px-4 py-3 text-gray-600">
                        {groupName
                          ? <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">{groupName}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                    )}
                    <td className="px-4 py-3 text-gray-600">
                      {assignedName ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[c.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {c.status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
