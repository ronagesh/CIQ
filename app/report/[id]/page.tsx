'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, AlertTriangle, CheckCircle, XCircle, ChevronDown, ChevronUp, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SeverityBadge } from '@/components/severity-badge'
import { QuantBar } from '@/components/quant-bar'
import type { Suggestion, QuantitativeScores } from '@/lib/types'

interface Meta {
  product: {
    id: string
    title: string
    brand: string
    categoryNode: string
    bullets: string[]
    description: string
    images: string[]
    avgRankSearch: number | null
  }
  competitors: { id: string; title: string; brand: string; avgRankSearch: number | null }[]
  quantitative: QuantitativeScores
  competitorAvgQuantitative: QuantitativeScores
}

type ApprovalState = 'pending' | 'approved' | 'rejected'

export default function ReportPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [meta, setMeta] = useState<Meta | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [streaming, setStreaming] = useState(true)
  const [approvals, setApprovals] = useState<ApprovalState[]>([])
  const [expandedIdx, setExpandedIdx] = useState<number | null>(0)
  const [markdown, setMarkdown] = useState<string | null>(null)
  const [generatingSummary, setGeneratingSummary] = useState(false)
  const [copied, setCopied] = useState(false)
  const bufferRef = useRef('')

  useEffect(() => {
    if (!id) return
    bufferRef.current = ''

    fetch(`/api/report/${id}`)
      .then(res => {
        const reader = res.body!.getReader()
        const decoder = new TextDecoder()

        function pump(): Promise<void> {
          return reader.read().then(({ done, value }) => {
            if (done) { setStreaming(false); return }
            const chunk = decoder.decode(value, { stream: true })
            const lines = chunk.split('\n').filter(Boolean)
            for (const line of lines) {
              try {
                const msg = JSON.parse(line)
                if (msg.type === 'meta') setMeta(msg)
                if (msg.type === 'suggestions') {
                  setSuggestions(msg.suggestions)
                  setApprovals(new Array(msg.suggestions.length).fill('pending'))
                }
              } catch { /* partial chunk */ }
            }
            return pump()
          })
        }
        return pump()
      })
      .catch(() => setStreaming(false))
  }, [id])

  const allReviewed = approvals.length > 0 && approvals.every(a => a !== 'pending')
  const approvedSuggestions = suggestions.filter((_, i) => approvals[i] === 'approved')

  const handleGenerateSummary = async () => {
    if (!meta || approvedSuggestions.length === 0) return
    setGeneratingSummary(true)
    try {
      const res = await fetch('/api/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: meta.product.id, approvedSuggestions }),
      })
      const data = await res.json()
      setMarkdown(data.markdown)
    } finally {
      setGeneratingSummary(false)
    }
  }

  const handleCopy = () => {
    if (!markdown) return
    navigator.clipboard.writeText(markdown)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!meta && streaming) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-500">Loading analysis…</p>
        </div>
      </div>
    )
  }

  if (!meta) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-500">Product not found.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <button onClick={() => router.push('/')} className="text-slate-400 hover:text-slate-700">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-slate-900 truncate text-sm">{meta.product.title}</p>
            <p className="text-xs text-slate-500">{meta.product.brand} · {meta.product.id}</p>
          </div>
          {streaming && (
            <Badge variant="outline" className="text-xs gap-1.5 text-slate-500">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
              Analyzing…
            </Badge>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Comparison table */}
        <Card className="p-5">
          <h2 className="font-semibold text-slate-800 text-sm mb-4">Content Scorecard</h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3">
            <div>
              <p className="text-xs font-medium text-slate-500 mb-2">This Product</p>
              <div className="space-y-2.5">
                <QuantBar label="Title length" value={meta.quantitative.titleLength} max={50} />
                <QuantBar label="Bullet count" value={meta.quantitative.bulletCount} max={5} target={5} />
                <QuantBar label="Description" value={Math.min(meta.quantitative.descriptionLength, 200)} max={200} target={50} />
                <QuantBar label="Images" value={meta.quantitative.imageCount} max={7} target={3} />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 mb-2">Competitor Average ({meta.competitors.length} products)</p>
              <div className="space-y-2.5">
                <QuantBar label="Title length" value={meta.competitorAvgQuantitative.titleLength} max={50} />
                <QuantBar label="Bullet count" value={meta.competitorAvgQuantitative.bulletCount} max={5} target={5} />
                <QuantBar label="Description" value={Math.min(meta.competitorAvgQuantitative.descriptionLength, 200)} max={200} target={50} />
                <QuantBar label="Images" value={meta.competitorAvgQuantitative.imageCount} max={7} target={3} />
              </div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-xs text-slate-500 font-medium mb-2">Competitor set</p>
            <div className="flex flex-wrap gap-2">
              {meta.competitors.slice(0, 6).map(c => (
                <span key={c.id} className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded">
                  {c.brand || c.title.split(' ')[0]}
                  {c.avgRankSearch ? ` #${c.avgRankSearch}` : ''}
                </span>
              ))}
            </div>
          </div>
        </Card>

        {/* Suggestions */}
        <div>
          <h2 className="font-semibold text-slate-800 text-sm mb-3">
            Top 3 Suggestions
            {streaming && suggestions.length === 0 && (
              <span className="ml-2 text-slate-400 font-normal">generating…</span>
            )}
          </h2>
          <div className="space-y-3">
            {suggestions.map((s, i) => {
              const state = approvals[i] ?? 'pending'
              const isExpanded = expandedIdx === i

              return (
                <Card key={i} className={`overflow-hidden transition-all ${
                  state === 'approved' ? 'border-emerald-300 bg-emerald-50/30' :
                  state === 'rejected' ? 'border-slate-200 opacity-60' : 'border-slate-200'
                }`}>
                  <div
                    className="p-4 cursor-pointer flex items-start justify-between gap-3"
                    onClick={() => setExpandedIdx(isExpanded ? null : i)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                          {s.dimension}
                        </span>
                        {s.suppressionRisk && (
                          <span className="flex items-center gap-1 text-xs text-red-600">
                            <AlertTriangle className="w-3 h-3" />
                            {s.suppressionConsequence || 'Suppression risk'}
                          </span>
                        )}
                        {state === 'approved' && <CheckCircle className="w-4 h-4 text-emerald-500" />}
                        {state === 'rejected' && <XCircle className="w-4 h-4 text-slate-400" />}
                      </div>
                      <p className="text-xs text-slate-600 line-clamp-1">{s.guidelineCitation}</p>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" /> : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />}
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-4 border-t border-slate-100 pt-4">
                      {/* Before / After */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs font-medium text-slate-500 mb-1.5">Before</p>
                          <div className="bg-red-50 border border-red-100 rounded p-3 text-xs text-slate-700 leading-relaxed">
                            {s.currentText}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-slate-500 mb-1.5">After</p>
                          <div className="bg-emerald-50 border border-emerald-100 rounded p-3 text-xs text-slate-700 leading-relaxed">
                            {s.proposedText}
                          </div>
                        </div>
                      </div>

                      {/* Citations */}
                      <div className="space-y-2">
                        <div className="bg-blue-50 border border-blue-100 rounded p-3 text-xs text-blue-800 leading-relaxed">
                          <span className="font-semibold">Guideline: </span>{s.guidelineCitation}
                        </div>
                        <div className="bg-slate-50 border border-slate-100 rounded p-3 text-xs text-slate-700 leading-relaxed">
                          <span className="font-semibold">Competitor reference: </span>{s.competitorReference}
                        </div>
                      </div>

                      {/* Approve / Reject */}
                      {state === 'pending' && (
                        <div className="flex gap-2 pt-1">
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                            onClick={(e) => {
                              e.stopPropagation()
                              const next = [...approvals]; next[i] = 'approved'; setApprovals(next)
                            }}
                          >
                            <CheckCircle className="w-3.5 h-3.5" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-slate-600"
                            onClick={(e) => {
                              e.stopPropagation()
                              const next = [...approvals]; next[i] = 'rejected'; setApprovals(next)
                            }}
                          >
                            <XCircle className="w-3.5 h-3.5" /> Reject
                          </Button>
                        </div>
                      )}
                      {state !== 'pending' && (
                        <button
                          className="text-xs text-slate-400 underline"
                          onClick={(e) => {
                            e.stopPropagation()
                            const next = [...approvals]; next[i] = 'pending'; setApprovals(next)
                          }}
                        >
                          Undo
                        </button>
                      )}
                    </div>
                  )}
                </Card>
              )
            })}

            {suggestions.length === 0 && !streaming && (
              <p className="text-sm text-slate-400 text-center py-8">No suggestions generated.</p>
            )}
          </div>
        </div>

        {/* Generate summary */}
        {allReviewed && !markdown && (
          <div className="flex justify-end">
            <Button
              onClick={handleGenerateSummary}
              disabled={generatingSummary || approvedSuggestions.length === 0}
              className="bg-slate-900 hover:bg-slate-800 text-white gap-2"
            >
              {generatingSummary ? (
                <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Generating…</>
              ) : (
                approvedSuggestions.length === 0
                  ? 'No suggestions approved'
                  : `Generate Markdown Summary (${approvedSuggestions.length} change${approvedSuggestions.length > 1 ? 's' : ''})`
              )}
            </Button>
          </div>
        )}

        {/* Markdown output */}
        {markdown && (
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-800 text-sm">Final Markdown Summary</h2>
              <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5 text-xs">
                <Copy className="w-3 h-3" />
                {copied ? 'Copied!' : 'Copy'}
              </Button>
            </div>
            <pre className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded p-4 overflow-auto whitespace-pre-wrap leading-relaxed">
              {markdown}
            </pre>
          </Card>
        )}
      </main>
    </div>
  )
}
