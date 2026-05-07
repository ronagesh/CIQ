import type { SeverityLevel } from '@/lib/types'

export function SeverityBadge({ severity, suppressionRisk }: { severity: SeverityLevel; suppressionRisk?: boolean }) {
  if (suppressionRisk) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
        Suppression Risk
      </span>
    )
  }

  const styles: Record<SeverityLevel, string> = {
    high: 'bg-orange-100 text-orange-700 border-orange-200',
    medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    low: 'bg-zinc-100 text-zinc-500 border-zinc-200',
  }

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${styles[severity]}`}>
      {severity.charAt(0).toUpperCase() + severity.slice(1)}
    </span>
  )
}
