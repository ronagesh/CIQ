'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, TrendingUp, ChevronRight, Zap, RefreshCw } from 'lucide-react'
// Zap kept for empty-state icon
import { SeverityBadge } from '@/components/severity-badge'
import { QuantBar } from '@/components/quant-bar'
import type { IssueCard } from '@/lib/types'

export default function BrandDashboardPage() {
  const { brand: encodedBrand } = useParams<{ brand: string }>()
  const brand = decodeURIComponent(encodedBrand)
  const router = useRouter()

  const [issues, setIssues] = useState<IssueCard[]>([])
  const [loading, setLoading] = useState(true)
  const [cachedAt, setCachedAt] = useState<number | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [brandProducts, setBrandProducts] = useState<{ id: string; title: string }[]>([])

  const fetchFeed = useCallback(async (refresh = false) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/feed${refresh ? '?refresh=true' : ''}`)
      const data = await res.json()
      const all: IssueCard[] = data.issues ?? []
      setIssues(all.filter(i => (i.brand || 'Unknown Brand') === brand))
      setCachedAt(data.cachedAt ?? null)
    } finally {
      setLoading(false)
    }
  }, [brand])

  useEffect(() => { fetchFeed() }, [fetchFeed])

  useEffect(() => {
    fetch(`/api/products?brand=${encodeURIComponent(brand)}`)
      .then(r => r.json())
      .then(d => setBrandProducts(d.products ?? []))
  }, [brand])

  const filtered = selectedId === ''
    ? issues
    : issues.filter(i => i.productId === selectedId)

  function relativeTime(ts: number) {
    const mins = Math.floor((Date.now() - ts) / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    return hrs < 24 ? `${hrs}h ago` : new Date(ts).toLocaleDateString()
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">

      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/90 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center gap-3">
          <button
            onClick={() => router.push('/')}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-all flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/commerceiq-logo.jpg" alt="CommerceIQ" className="h-6 w-auto object-contain flex-shrink-0" />
            <h1 className="text-sm font-semibold text-zinc-900 truncate">{brand}</h1>
            <span className="text-xs text-zinc-400 hidden sm:inline flex-shrink-0">Content Dashboard</span>
          </div>
          <button
            onClick={() => fetchFeed(true)}
            disabled={loading}
            className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border border-zinc-200 bg-white text-zinc-500 hover:text-zinc-800 hover:border-zinc-300 transition-all disabled:opacity-40 flex-shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Analyzing…' : 'Refresh'}
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        {/* Stats + SKU picker */}
        <div className="flex items-center gap-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-4 flex items-center gap-3 flex-shrink-0">
            <TrendingUp className="w-4 h-4 text-zinc-400" />
            <div>
              <p className="text-2xl font-bold text-zinc-700 tabular-nums leading-none">{brandProducts.length || issues.length}</p>
              <p className="text-[11px] text-zinc-400 mt-1 font-medium uppercase tracking-wider">Total SKUs</p>
            </div>
          </div>
          <div className="flex-1 relative">
            <select
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
              className="w-full appearance-none bg-white border border-zinc-200 rounded-xl px-4 py-3 pr-10 text-sm text-zinc-800 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all cursor-pointer"
            >
              <option value="">All SKUs</option>
              {brandProducts.map(p => (
                <option key={p.id} value={p.id}>{p.id} — {p.title}</option>
              ))}
            </select>
            <ChevronRight className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none rotate-90" />
          </div>
        </div>

        {/* Feed */}
        {loading ? (
          <div className="space-y-2.5">
            {[...Array(4)].map((_, i) => <div key={i} className="h-28 rounded-xl skeleton" />)}
            <p className="text-center text-xs text-zinc-400 pt-2">Running content analysis…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-12 h-12 rounded-xl bg-white border border-zinc-200 flex items-center justify-center mb-4 shadow-sm">
              <Zap className="w-5 h-5 text-zinc-300" />
            </div>
            <p className="text-sm text-zinc-400">
              {issues.length === 0 ? `No issues found for ${brand}.` : 'No issues for the selected SKU.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {cachedAt && (
              <div className="flex items-center justify-end gap-1.5 pb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-300" />
                <span className="text-xs text-zinc-400">
                  Analyzed {relativeTime(cachedAt)} ·{' '}
                  <button
                    className="text-zinc-500 hover:text-zinc-800 transition-colors underline underline-offset-2"
                    onClick={() => fetchFeed(true)}
                  >
                    re-run
                  </button>
                </span>
              </div>
            )}

            {filtered.map((issue) => {
              const accentBorder = issue.suppressionRisk
                ? 'border-l-red-400'
                : issue.severity === 'high'
                  ? 'border-l-orange-400'
                  : issue.severity === 'medium'
                    ? 'border-l-yellow-400'
                    : 'border-l-zinc-300'

              return (
                <div
                  key={issue.productId}
                  className={`group relative rounded-xl border border-zinc-200 border-l-2 ${accentBorder} bg-white hover:border-zinc-300 hover:shadow-sm transition-all cursor-pointer p-5`}
                  onClick={() => router.push(`/report/${issue.productId}`)}
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <SeverityBadge severity={issue.severity} suppressionRisk={issue.suppressionRisk} />
                        <span className="text-xs text-zinc-500 bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded-md">
                          {issue.issueType}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-zinc-900 truncate mb-0.5">
                        {issue.productTitle}
                      </p>
                      <p className="text-xs text-zinc-400 font-mono">{issue.productId}</p>
                      <p className="text-xs text-zinc-500 mt-2.5 leading-relaxed line-clamp-2">
                        {issue.rationale}
                      </p>
                    </div>
                    <div className="w-36 flex-shrink-0 space-y-1 pt-0.5">
                      <QuantBar label="Title" value={issue.quantitative.titleLength} compAvg={issue.competitorAvgQuantitative?.titleLength} />
                      <QuantBar label="Bullets" value={issue.quantitative.bulletCount} compAvg={issue.competitorAvgQuantitative?.bulletCount} />
                      <QuantBar label="Desc" value={issue.quantitative.descriptionLength} compAvg={issue.competitorAvgQuantitative?.descriptionLength} />
                    </div>
                  </div>
                  <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
