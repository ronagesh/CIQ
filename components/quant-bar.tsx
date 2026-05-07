'use client'

interface QuantBarProps {
  label: string
  value: number
  compAvg?: number
  // legacy props kept for any remaining callers
  max?: number
  target?: number
}

type Signal = 'better' | 'on par' | 'worse'

const BADGE: Record<Signal, { label: string; cls: string }> = {
  better:   { label: '↑ Better',  cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  'on par': { label: '= On par',  cls: 'text-zinc-500 bg-zinc-50 border-zinc-200' },
  worse:    { label: '↓ Worse',   cls: 'text-amber-700 bg-amber-50 border-amber-200' },
}

export function QuantBar({ label, value, compAvg }: QuantBarProps) {
  if (!compAvg) {
    return (
      <div className="flex items-center justify-between gap-2 py-0.5">
        <span className="text-[11px] text-zinc-500">{label}</span>
        <span className="text-[10px] font-medium text-zinc-600">{value}</span>
      </div>
    )
  }

  const ratio = compAvg > 0 ? value / compAvg : 1
  const s: Signal = ratio >= 1.08 ? 'better' : ratio <= 0.92 ? 'worse' : 'on par'
  const { label: badgeLabel, cls } = BADGE[s]

  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <span className={`text-[9px] font-semibold border rounded-full px-1.5 py-0.5 leading-none ${cls}`}>{badgeLabel}</span>
    </div>
  )
}
