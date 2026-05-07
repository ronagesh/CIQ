'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown } from 'lucide-react'

export default function BrandSelectorPage() {
  const router = useRouter()
  const [brands, setBrands] = useState<string[]>([])
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/brands')
      .then(r => r.json())
      .then(d => setBrands(d.brands ?? []))
      .finally(() => setLoading(false))
  }, [])

  const handleContinue = () => {
    if (selected) router.push(`/brand/${encodeURIComponent(selected)}`)
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/commerceiq-logo.jpg" alt="CommerceIQ" className="h-7 w-auto object-contain" />
        </div>
      </header>

      {/* Centered selector */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/commerceiq-logo.jpg" alt="CommerceIQ" className="h-10 w-auto object-contain mx-auto mb-4" />
            <h1 className="text-xl font-bold text-zinc-900 mb-1">Welcome to Ally</h1>
            <p className="text-sm text-zinc-500">Select your brand to view your content dashboard.</p>
          </div>

          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                Brand
              </label>
              <div className="relative">
                <select
                  value={selected}
                  onChange={e => setSelected(e.target.value)}
                  disabled={loading}
                  className="w-full appearance-none bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 pr-10 text-sm text-zinc-800 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all disabled:opacity-50 cursor-pointer"
                >
                  <option value="">
                    {loading ? 'Loading brands…' : 'Select a brand…'}
                  </option>
                  {brands.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
              </div>
            </div>

            <button
              onClick={handleContinue}
              disabled={!selected}
              className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-violet-200"
            >
              View Dashboard →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
