import { Badge } from '@/components/ui/badge'
import type { SeverityLevel } from '@/lib/types'

export function SeverityBadge({ severity, suppressionRisk }: { severity: SeverityLevel; suppressionRisk?: boolean }) {
  if (suppressionRisk) {
    return <Badge className="bg-red-600 text-white hover:bg-red-700">Suppression Risk</Badge>
  }
  const styles: Record<SeverityLevel, string> = {
    high: 'bg-orange-500 text-white hover:bg-orange-600',
    medium: 'bg-yellow-500 text-white hover:bg-yellow-600',
    low: 'bg-slate-400 text-white hover:bg-slate-500',
  }
  return <Badge className={styles[severity]}>{severity.charAt(0).toUpperCase() + severity.slice(1)}</Badge>
}
