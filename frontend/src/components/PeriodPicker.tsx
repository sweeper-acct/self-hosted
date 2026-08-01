const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export default function PeriodPicker({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  const [year, mon] = value ? value.split('-') : [String(new Date().getFullYear()), '07']
  const years = Array.from({ length: 6 }, (_, i) => String(new Date().getFullYear() - i))
  return (
    <div className="flex gap-1">
      <select
        value={mon}
        onChange={(e) => onChange(`${year}-${e.target.value}`)}
        disabled={disabled}
        className="rounded-lg border border-gray-300 pl-2 pr-6 py-1.5 text-[13px] focus:border-blue-500 focus:outline-none disabled:opacity-50"
      >
        {MONTHS.map((m, i) => (
          <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>
        ))}
      </select>
      <select
        value={year}
        onChange={(e) => onChange(`${e.target.value}-${mon}`)}
        disabled={disabled}
        className="rounded-lg border border-gray-300 pl-2 pr-6 py-1.5 text-[13px] focus:border-blue-500 focus:outline-none disabled:opacity-50"
      >
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  )
}
