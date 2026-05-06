'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, RefreshCw, AlertTriangle, Zap } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SeverityBadge } from '@/components/severity-badge'
import { QuantBar } from '@/components/quant-bar'
import type { IssueCard } from '@/lib/types'

export default function HomePage() {
  const router = useRouter()
  const [issues, setIssues] = useState<IssueCard[]>([])
  const [loading, setLoading] = useState(true)
  const [fromCache, setFromCache] = useState(false)
  const [search, setSearch] = useState('')

  const fetchFeed = useCallback(async (refresh = false) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/feed${refresh ? '?refresh=true' : ''}`)
      const data = await res.json()
      setIssues(data.issues)
      setFromCache(data.fromCache)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchFeed() }, [fetchFeed])

  const filtered = issues.filter(i =>
    search === '' ||
    i.productTitle.toLowerCase().includes(search.toLowerCase()) ||
    i.productId.toLowerCase().includes(search.toLowerCase()) ||
    i.brand.toLowerCase().includes(search.toLowerCase())
  )

  const suppressionCount = issues.filter(i => i.suppressionRisk).length
  const highCount = issues.filter(i => i.severity === 'high' && !i.suppressionRisk).length

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Ally</h1>
            <p className="text-xs text-slate-500">Competitor Content Intelligence</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchFeed(true)}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Analyzing…' : 'Refresh'}
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {!loading && issues.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-red-600">{suppressionCount}</p>
              <p className="text-xs text-red-500 mt-0.5">Suppression Risks</p>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-orange-600">{highCount}</p>
              <p className="text-xs text-orange-500 mt-0.5">High Severity</p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-slate-700">{issues.length}</p>
              <p className="text-xs text-slate-500 mt-0.5">Total Issues</p>
            </div>
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search by product name, ASIN, or brand…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-28 bg-white rounded-lg border border-slate-200 animate-pulse" />
            ))}
            <p className="text-center text-sm text-slate-400 pt-2">
              Running content analysis across all products…
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Zap className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p>No issues found{search ? ' for your search' : ''}.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {fromCache && (
              <p className="text-xs text-slate-400 text-right">
                Showing cached results ·{' '}
                <button className="underline" onClick={() => fetchFeed(true)}>refresh</button>
              </p>
            )}
            {filtered.map((issue) => (
              <Card
                key={issue.productId}
                className="p-5 cursor-pointer hover:shadow-md transition-shadow border-slate-200 hover:border-slate-300"
                onClick={() => router.push(`/report/${issue.productId}`)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      {issue.suppressionRisk && (
                        <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                      )}
                      <SeverityBadge severity={issue.severity} suppressionRisk={issue.suppressionRisk} />
                      <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                        {issue.issueType}
                      </span>
                    </div>
                    <p className="font-medium text-slate-900 truncate text-sm">{issue.productTitle}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{issue.brand || 'Unknown brand'} · {issue.productId}</p>
                    <p className="text-xs text-slate-600 mt-2 leading-relaxed line-clamp-2">{issue.rationale}</p>
                  </div>
                  <div className="w-36 flex-shrink-0 space-y-2 pt-1">
                    <QuantBar label="Title" value={issue.quantitative.titleLength} max={50} />
                    <QuantBar label="Bullets" value={issue.quantitative.bulletCount} max={5} target={5} />
                    <QuantBar label="Desc" value={Math.min(issue.quantitative.descriptionLength, 200)} max={200} target={50} />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
