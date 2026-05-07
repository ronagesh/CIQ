'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, AlertTriangle, CheckCircle, XCircle,
  Copy, ImageIcon, Zap, Sparkles, TrendingUp, ChevronDown, ChevronUp
} from 'lucide-react'
import type { Suggestion, QuantitativeScores, ImageAnalysis } from '@/lib/types'

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

type QualitySignal = 'better' | 'on par' | 'worse'

function ScoreRow({ label, signal }: { label: string; signal: QualitySignal | null }) {
  if (!signal) {
    return (
      <div className="flex items-center justify-between gap-2 py-1">
        <span className="text-[11px] font-medium text-zinc-500">{label}</span>
        <span className="text-[9px] text-zinc-300 border border-zinc-200 rounded-full px-1.5 py-0.5 leading-none">—</span>
      </div>
    )
  }
  const badge = {
    better:   { label: '↑ Better',  cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    'on par': { label: '= On par',  cls: 'text-zinc-500 bg-zinc-50 border-zinc-200'          },
    worse:    { label: '↓ Worse',   cls: 'text-amber-700 bg-amber-50 border-amber-200'       },
  }[signal]
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="text-[11px] font-medium text-zinc-600">{label}</span>
      <span className={`text-[9px] font-semibold border rounded-full px-1.5 py-0.5 leading-none ${badge.cls}`}>{badge.label}</span>
    </div>
  )
}

export default function ReportPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [meta, setMeta] = useState<Meta | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [editedTexts, setEditedTexts] = useState<string[]>([])
  const [streaming, setStreaming] = useState(true)
  const [scorecard, setScorecard] = useState<Record<string, QualitySignal> | null>(null)
  const [expandedIdx, setExpandedIdx] = useState<number | null>(0)
  const [markdown, setMarkdown] = useState<string | null>(null)
  const [generatingSummary, setGeneratingSummary] = useState(false)
  const [copied, setCopied] = useState(false)
  const [imageAnalyses, setImageAnalyses] = useState<ImageAnalysis[]>([])
  const [imageLoading, setImageLoading] = useState(true)
  const [violations, setViolations] = useState<string[][]>([])
  const bufferRef = useRef('')

  function checkViolations(text: string, dimension: string): string[] {
    const errs: string[] = []
    const dim = dimension.toLowerCase()
    if (dim === 'title') {
      if (text.length > 50) errs.push(`${text.length} chars — max 50 (suppression risk)`)
      const bad = [...new Set((text.match(/[!*$?®©™]/g) ?? []))]
      if (bad.length) errs.push(`Prohibited characters: ${bad.join(' ')}`)
      if (/\b[A-Z]{4,}\b/.test(text)) errs.push('Do not use ALL CAPS')
      if (/\bfree\s+ship|\bsale\b/i.test(text) || /\$\d/.test(text)) errs.push('No price, quantity, or promotional messages')
      if (/\bbest\s+seller\b|\bhot\s+item\b/i.test(text)) errs.push('No subjective commentary (Best Seller, Hot Item)')
    } else if (dim.startsWith('bullet')) {
      if (/[.!]$/.test(text.trim())) errs.push('No ending punctuation')
      if (/!/.test(text)) errs.push('No exclamation points')
      if (text.length > 0 && text[0] !== text[0].toUpperCase()) errs.push('Must begin with a capital letter')
      if (/\bfree\s+ship|\bsale\b/i.test(text)) errs.push('No promotional or pricing information')
    } else if (dim === 'description') {
      if (text.length > 2000) errs.push(`${text.length} chars — max 2000`)
      if (/[A-Z]{5,}/.test(text)) errs.push('Do not write in ALL CAPS')
      if (/@\w+|\bhttp/i.test(text)) errs.push('No email addresses or URLs')
      if (/\bfree\s+ship|\bsale\b/i.test(text)) errs.push('No promotional language')
    }
    return errs
  }

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
            const lines = decoder.decode(value, { stream: true }).split('\n').filter(Boolean)
            for (const line of lines) {
              try {
                const msg = JSON.parse(line)
                if (msg.type === 'meta') setMeta(msg)
                if (msg.type === 'suggestions') {
                  setSuggestions(msg.suggestions)
                  setEditedTexts(msg.suggestions.map((s: Suggestion) => s.proposedText))
                }
                if (msg.type === 'scorecard') setScorecard(msg.scorecard)
              } catch { /* partial chunk */ }
            }
            return pump()
          })
        }
        return pump()
      })
      .catch(() => setStreaming(false))

    fetch(`/api/images/${id}`)
      .then(res => res.json())
      .then(data => setImageAnalyses(data.analyses ?? []))
      .catch(() => {})
      .finally(() => setImageLoading(false))
  }, [id])

  const allSuggestions = suggestions.map((s, i) => ({ ...s, proposedText: editedTexts[i] ?? s.proposedText }))
  const productImageAnalysis = imageAnalyses.find(a => a.productId === id)
  const competitorImageAnalyses = imageAnalyses.filter(a => a.productId !== id)

  const handleGenerateSummary = async () => {
    if (!meta || allSuggestions.length === 0) return
    setGeneratingSummary(true)
    try {
      const res = await fetch('/api/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: meta.product.id, approvedSuggestions: allSuggestions }),
      })
      const data = await res.json()
      setMarkdown(data.markdown)
    } finally {
      setGeneratingSummary(false)
    }
  }

  if (!meta && streaming) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-zinc-200 border-t-violet-500 animate-spin" />
          <p className="text-sm text-zinc-400">Loading analysis…</p>
        </div>
      </div>
    )
  }

  if (!meta) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <p className="text-sm text-zinc-400">Product not found.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">

      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-all flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-zinc-900 leading-snug mb-0.5">{meta.product.title}</p>
            <p className="text-xs text-zinc-400 leading-none">
              {meta.product.brand}
              <span className="mx-1.5 text-zinc-300">·</span>
              <span className="font-mono">{meta.product.id}</span>
              {meta.product.avgRankSearch && (
                <><span className="mx-1.5 text-zinc-300">·</span>Avg. search rank #{meta.product.avgRankSearch}</>
              )}
            </p>
          </div>
          {streaming && (
            <div className="flex items-center gap-1.5 text-xs text-zinc-500 border border-zinc-200 rounded-full px-3 py-1 bg-zinc-50 flex-shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
              Analyzing
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-4">

        {/* ── TOP ROW: 3 info tiles ── */}
        <div className="grid grid-cols-3 gap-4">

          {/* Product tile */}
          <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden flex">
            {meta.product.images[0] && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={meta.product.images[0]} alt="" className="w-20 h-20 object-contain bg-zinc-50 p-2 flex-shrink-0 self-center" />
            )}
            <div className="px-3 py-3 space-y-0.5 min-w-0 self-center">
              <p className="text-[11px] font-semibold text-zinc-800 leading-snug line-clamp-2 hover:line-clamp-none transition-all cursor-default" title={meta.product.title}>{meta.product.title}</p>
              <p className="text-[10px] text-zinc-400 font-mono">{meta.product.id}</p>
              {meta.product.categoryNode && (
                <p className="text-[10px] text-zinc-400 leading-snug line-clamp-1">{meta.product.categoryNode}</p>
              )}
              {meta.product.avgRankSearch && (
                <p className="text-[10px] text-violet-600 font-medium">Avg. search rank #{meta.product.avgRankSearch}</p>
              )}
            </div>
          </div>

          {/* Competitor set tile */}
          <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-zinc-100 flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5 text-zinc-400" />
              <h3 className="text-xs font-semibold text-zinc-700">Competitor Set</h3>
              <span className="ml-auto text-[10px] text-zinc-400">{meta.competitors.length} competitors</span>
            </div>
            <div className="divide-y divide-zinc-50">
              {meta.competitors.slice(0, 5).map((c, i) => (
                <button
                  key={c.id}
                  onClick={() => router.push(`/report/${c.id}`)}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-50 transition-colors text-left group"
                >
                  <span className="w-4 h-4 rounded-full bg-zinc-100 flex items-center justify-center text-[9px] font-bold text-zinc-500 flex-shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-zinc-700 truncate group-hover:text-violet-600 transition-colors">{c.brand || c.title.split(' ')[0]}</p>
                    <p className="text-[10px] text-zinc-400">{c.avgRankSearch ? `avg search rank #${c.avgRankSearch}` : 'unranked'}</p>
                  </div>
                  <ChevronDown className="w-3 h-3 text-zinc-300 -rotate-90 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>

          {/* Content scorecard tile */}
          <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-zinc-100 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-zinc-700">vs. Competitors</h3>
              {streaming && !scorecard && (
                <span className="text-[10px] text-zinc-400 animate-pulse">analyzing…</span>
              )}
            </div>
            <div className="px-4 py-2 divide-y divide-zinc-50">
              <ScoreRow label="Title" signal={scorecard?.title ?? null} />
              <ScoreRow label="Bullets" signal={scorecard?.bullets ?? null} />
              <ScoreRow label="Description" signal={scorecard?.description ?? null} />
              <ScoreRow label="Images" signal={scorecard?.images ?? null} />
            </div>
          </div>

        </div>

        {/* ── MAIN CONTENT ── */}
        <div className="space-y-4">

          {/* ── RECOMMENDATIONS ── */}
          <div className="rounded-xl border border-violet-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-violet-100 bg-violet-50/40 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-3.5 h-3.5 text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-zinc-900">Content Recommendations</h2>
                  <p className="text-xs text-zinc-500">
                    {suggestions.length > 0 ? suggestions.length : 3} highest-impact improvements · click to expand
                  </p>
                </div>
              </div>
              {streaming && suggestions.length === 0 && (
                <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                  generating…
                </span>
              )}
            </div>

            {/* Skeletons */}
            {suggestions.length === 0 && streaming && (
              <div className="divide-y divide-zinc-100">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="px-5 py-4 flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full skeleton flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-4 w-24 rounded skeleton" />
                      <div className="h-3 w-48 rounded skeleton" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {suggestions.length === 0 && !streaming && (
              <p className="px-5 py-10 text-center text-sm text-zinc-400">No suggestions generated.</p>
            )}

            {/* Accordion items */}
            <div className="divide-y divide-zinc-100">
              {suggestions.map((s, i) => {
                const isExpanded = expandedIdx === i
                const isEdited = editedTexts[i] !== undefined && editedTexts[i] !== s.proposedText

                return (
                  <div key={i}>

                    {/* ── Accordion header ── */}
                    <button
                      className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-zinc-50/70 transition-colors"
                      onClick={() => setExpandedIdx(isExpanded ? null : i)}
                    >
                      <span className="w-5 h-5 rounded-full bg-violet-100 text-violet-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                        {i + 1}
                      </span>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-zinc-800">{s.dimension}</span>
                          {s.suppressionRisk && (
                            <span className="flex items-center gap-1 text-[11px] text-red-600 bg-red-50 border border-red-100 rounded-full px-2 py-0.5 leading-none">
                              <AlertTriangle className="w-2.5 h-2.5" /> Suppression risk
                            </span>
                          )}
                          {isEdited && (
                            <span className="text-[10px] text-violet-600 bg-violet-50 border border-violet-200 rounded-full px-1.5 py-0.5 font-medium leading-none">edited</span>
                          )}
                        </div>
                        {!isExpanded && (
                          <p className="text-[11px] text-zinc-400 truncate mt-0.5 leading-snug">
                            {s.currentText.slice(0, 100)}{s.currentText.length > 100 ? '…' : ''}
                          </p>
                        )}
                      </div>

                      <span className="text-zinc-300 flex-shrink-0">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </span>
                    </button>

                    {/* ── Expanded body ── */}
                    {isExpanded && (
                      <div className="px-5 pb-5 space-y-3 border-t border-zinc-100 bg-zinc-50/30">

                        <div className="grid grid-cols-2 gap-3 pt-4">
                          <div>
                            <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wider mb-1.5">
                              Current · {s.currentText.length} chars
                            </p>
                            <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2.5 text-xs text-zinc-700 leading-relaxed min-h-[60px]">
                              {s.currentText}
                            </div>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider mb-1.5">
                              Proposed · {(editedTexts[i] ?? s.proposedText).length} chars
                            </p>
                            <textarea
                              value={editedTexts[i] ?? s.proposedText}
                              onChange={e => {
                                const n = [...editedTexts]; n[i] = e.target.value; setEditedTexts(n)
                                const v = [...violations]; v[i] = checkViolations(e.target.value, s.dimension); setViolations(v)
                                setMarkdown(null)
                                e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'
                              }}
                              ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' } }}
                              rows={1}
                              className="w-full bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5 text-xs text-zinc-700 leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-emerald-300 transition-all overflow-hidden"
                            />
                            <div className="flex items-start justify-between gap-2 mt-0.5 min-h-[16px]">
                              {violations[i]?.length > 0 ? (
                                <div className="flex flex-col gap-0.5">
                                  {violations[i].map((v, vi) => (
                                    <span key={vi} className="flex items-center gap-1 text-[10px] text-amber-700 leading-snug">
                                      <AlertTriangle className="w-2.5 h-2.5 flex-shrink-0" />{v}
                                    </span>
                                  ))}
                                </div>
                              ) : <span />}
                              {isEdited && (
                                <button
                                  className="text-[10px] text-zinc-400 hover:text-zinc-600 underline underline-offset-2 flex-shrink-0"
                                  onClick={() => {
                                    const n = [...editedTexts]; n[i] = s.proposedText; setEditedTexts(n)
                                    const v = [...violations]; v[i] = []; setViolations(v)
                                  }}
                                >
                                  Reset to original
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1.5 pt-1">
                          <p className="text-[11px] text-zinc-600 leading-relaxed">
                            <span className="font-semibold text-blue-600">Guideline:</span>{' '}{s.guidelineCitation}
                          </p>
                          <p className="text-[11px] text-zinc-500 leading-relaxed">
                            <span className="font-semibold text-zinc-600">Competitor:</span>{' '}{s.competitorReference}
                          </p>
                        </div>

                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Export */}
            {suggestions.length > 0 && !streaming && (
              <div className="px-5 py-4 border-t border-violet-100 bg-violet-50/30 flex items-center justify-between">
                <p className="text-xs text-zinc-500">{suggestions.length} recommendation{suggestions.length > 1 ? 's' : ''} ready to export</p>
                <button
                  onClick={handleGenerateSummary}
                  disabled={generatingSummary}
                  className="flex items-center gap-2 text-sm font-medium px-5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-violet-200"
                >
                  {generatingSummary ? (
                    <><span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" /> Generating…</>
                  ) : markdown ? (
                    <><Sparkles className="w-3.5 h-3.5" /> Regenerate Markdown</>
                  ) : (
                    <><Sparkles className="w-3.5 h-3.5" /> Generate Markdown Summary</>
                  )}
                </button>
              </div>
            )}

            {markdown && (
              <div className="border-t border-zinc-200">
                <div className="flex items-center justify-between px-5 py-3 bg-zinc-50 border-b border-zinc-100">
                  <div className="flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="text-xs font-semibold text-zinc-700">Markdown Summary</span>
                  </div>
                  <button
                    onClick={() => { navigator.clipboard.writeText(markdown); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-zinc-200 bg-white text-zinc-500 hover:text-zinc-800 transition-all"
                  >
                    <Copy className="w-3 h-3" /> {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <pre className="px-5 py-4 text-xs text-zinc-600 bg-white overflow-auto whitespace-pre-wrap leading-relaxed font-mono max-h-96">
                  {markdown}
                </pre>
              </div>
            )}
          </div>

          {/* ── IMAGE COMPLIANCE ── */}
          <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-3.5 h-3.5 text-zinc-400" />
                <h2 className="text-sm font-semibold text-zinc-800">Image Compliance</h2>
              </div>
              {imageLoading && <span className="text-xs text-zinc-400 animate-pulse">analyzing…</span>}
            </div>

            {imageLoading ? (
              <div className="p-5 space-y-2.5">
                {[...Array(2)].map((_, i) => <div key={i} className="h-14 rounded-lg skeleton" />)}
              </div>
            ) : imageAnalyses.length === 0 ? (
              <p className="px-5 py-8 text-xs text-zinc-400 text-center">No images available to analyze.</p>
            ) : (
              <div className="p-5 space-y-5">
                {productImageAnalysis && (
                  <div className="flex gap-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={productImageAnalysis.imageUrl} alt="" className="w-20 h-20 object-contain rounded-xl border border-zinc-200 bg-zinc-50 flex-shrink-0 shadow-sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-semibold text-zinc-700">Your Main Image</span>
                        {productImageAnalysis.overallCompliant
                          ? <span className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5"><CheckCircle className="w-3 h-3" /> Compliant</span>
                          : <span className="flex items-center gap-1 text-xs text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5"><XCircle className="w-3 h-3" /> Issues found</span>}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {productImageAnalysis.findings.map((f, fi) => (
                          <div key={fi} className="flex items-start gap-1.5 text-xs">
                            {f.compliant
                              ? <CheckCircle className="w-3 h-3 text-emerald-500 flex-shrink-0 mt-0.5" />
                              : <XCircle className="w-3 h-3 text-red-500 flex-shrink-0 mt-0.5" />}
                            <span className={f.compliant ? 'text-zinc-400' : 'text-zinc-700'}>
                              <span className="font-medium">{f.check}:</span>{' '}{f.detail}
                              {f.suppressionRisk && !f.compliant && <span className="ml-1 text-red-600 font-semibold">· Suppression risk</span>}
                            </span>
                          </div>
                        ))}
                      </div>
                      {productImageAnalysis.suggestion && (
                        <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800 leading-relaxed">
                          <span className="font-semibold">Fix: </span>{productImageAnalysis.suggestion}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {competitorImageAnalyses.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">Competitor Main Images</p>
                    <div className="space-y-2.5">
                      {competitorImageAnalyses.map(a => (
                        <div key={a.productId} className="flex items-center gap-3">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={a.imageUrl} alt="" className="w-16 h-16 object-contain rounded-lg border border-zinc-200 bg-white shadow-sm flex-shrink-0" />
                          <div className="flex items-start gap-1.5 flex-1 min-w-0">
                            {a.overallCompliant
                              ? <CheckCircle className="w-3 h-3 text-emerald-500 flex-shrink-0 mt-0.5" />
                              : <XCircle className="w-3 h-3 text-red-400 flex-shrink-0 mt-0.5" />}
                            <p className="text-xs text-zinc-500 leading-relaxed">{a.competitorComparison}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  )
}
