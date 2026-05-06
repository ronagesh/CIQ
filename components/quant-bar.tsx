'use client'

interface QuantBarProps {
  label: string
  value: number
  max: number
  target?: number
  unit?: string
  invert?: boolean // lower is better (rank)
}

export function QuantBar({ label, value, max, target, unit = '', invert }: QuantBarProps) {
  const pct = Math.min((value / max) * 100, 100)
  const isViolation = value > max
  const isUndertilized = target !== undefined && value < target

  let barColor = 'bg-emerald-500'
  if (isViolation) barColor = 'bg-red-500'
  else if (isUndertilized) barColor = 'bg-yellow-400'

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs text-slate-500">
        <span>{label}</span>
        <span className={isViolation ? 'text-red-600 font-semibold' : ''}>
          {value}{unit} / {max}{unit}
        </span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
