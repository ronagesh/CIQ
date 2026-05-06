import { NextResponse } from 'next/server'
import { getProducts, getIssueCache, setIssueCache, clearCache } from '@/lib/store'
import { getQuantitativeScores, getCompetitors } from '@/lib/products'
import { scoreSeverity } from '@/lib/claude'
import type { IssueCard } from '@/lib/types'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const refresh = searchParams.get('refresh') === 'true'

  if (refresh) clearCache()

  const cached = getIssueCache()
  if (cached) {
    return NextResponse.json({ issues: cached, fromCache: true })
  }

  const products = await getProducts()

  const scored = await Promise.all(
    products.map(async (p) => {
      const q = getQuantitativeScores(p)
      const competitors = getCompetitors(p, products)
      try {
        const score = await scoreSeverity(p)
        const topCompetitor = competitors.find(c => c.avgRankSearch !== null)

        const rationale = topCompetitor
          ? `${score.rationale} ${topCompetitor.brand || topCompetitor.title.split(' ')[0]} (avg rank #${topCompetitor.avgRankSearch}) may serve as a reference.`
          : score.rationale

        const card: IssueCard = {
          productId: p.id,
          productTitle: p.title,
          brand: p.brand,
          issueType: score.issueType,
          severity: score.severity,
          suppressionRisk: score.suppressionRisk,
          suppressionConsequence: score.suppressionConsequence || '',
          rationale,
          quantitative: q,
        }
        return card
      } catch {
        return null
      }
    })
  )

  const issues = (scored.filter(Boolean) as IssueCard[])
    .sort((a, b) => {
      if (a.suppressionRisk && !b.suppressionRisk) return -1
      if (!a.suppressionRisk && b.suppressionRisk) return 1
      const severityOrder = { high: 0, medium: 1, low: 2 }
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity]
      if (severityDiff !== 0) return severityDiff
      const aRank = products.find(p => p.id === a.productId)?.avgRankSearch ?? Infinity
      const bRank = products.find(p => p.id === b.productId)?.avgRankSearch ?? Infinity
      return aRank - bRank
    })

  setIssueCache(issues)
  return NextResponse.json({ issues, fromCache: false })
}
