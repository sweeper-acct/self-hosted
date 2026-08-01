export const CASE_TYPE_LABELS: Record<string, string> = {
  bas_gst: 'BAS / GST',
  tax_return: 'Tax Return',
  payroll: 'Payroll',
  smsf: 'SMSF',
  asic: 'ASIC',
  audit: 'Audit',
  advisory: 'Advisory',
}

export function caseTypeLabel(caseType: string): string {
  return CASE_TYPE_LABELS[caseType] ?? caseType
}
