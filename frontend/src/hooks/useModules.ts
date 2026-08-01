import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export interface TeamModule {
  module_name: string
  active: boolean
  inherited: boolean
  activated_at: string | null
}

export interface FirmModule {
  module_name: string
  active: boolean
  activated_at: string | null
}

export const MODULE_META: Record<string, { label: string; description: string; locked?: boolean }> = {
  bas_gst: {
    label: 'BAS / GST',
    description: 'Bank statement extraction, GST coding and BAS workpaper preparation.',
  },
  payroll: {
    label: 'Payroll / PAYG',
    description: 'Single Touch Payroll, PAYG withholding and superannuation guarantee.',
  },
  tax_individual: {
    label: 'Tax Returns — Individual',
    description: 'Individual income tax returns including rental, investment and sole trader income.',
  },
  tax_company: {
    label: 'Tax Returns — Company',
    description: 'Company, trust and partnership tax return preparation and lodgement.',
  },
  smsf: {
    label: 'SMSF',
    description: 'Self-managed superannuation fund audit, compliance and annual return.',
  },
  asic: {
    label: 'ASIC',
    description: 'Company registration, annual reviews and changes of details.',
  },
  advisory: {
    label: 'Advisory',
    description: 'Financial modelling, CFO advisory and business planning services.',
  },
}

export function useModules() {
  return useQuery({
    queryKey: ['firm-modules'],
    queryFn: () =>
      api.get<{ data: FirmModule[] }>('/api/v1/firm/modules').then(r => r.data.data),
    staleTime: 5 * 60 * 1000,
  })
}

export function useActiveModules(): Set<string> {
  const { data } = useModules()
  return new Set((data ?? []).filter(m => m.active).map(m => m.module_name))
}

export function useTeamModules(teamId: string | undefined) {
  return useQuery({
    queryKey: ['team-modules', teamId],
    queryFn: () =>
      api.get<{ data: TeamModule[] }>(`/api/v1/teams/${teamId}/modules`).then(r => r.data.data),
    enabled: !!teamId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useSetTeamModule(teamId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ moduleName, active }: { moduleName: string; active: boolean }) =>
      api.put(`/api/v1/teams/${teamId}/modules/${moduleName}`, { active }).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-modules', teamId] })
    },
  })
}

export function useToggleModule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ moduleName, active }: { moduleName: string; active: boolean }) =>
      api.put(`/api/v1/firm/modules/${moduleName}`, { active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['firm-modules'] })
    },
  })
}
