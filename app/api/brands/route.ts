import { NextResponse } from 'next/server'
import { loadProducts } from '@/lib/products'

export async function GET() {
  const products = loadProducts()
  // Only include brands where at least one product has a real title and bullets,
  // and the brand name itself looks like a brand (not UI text like "Learn more")
  const brandSet = new Set<string>()
  for (const p of products) {
    if (!p.brand || p.brand.length > 50 || p.brand.includes(' more')) continue
    if (p.title.length < 15) continue
    if (p.bullets.length === 0 && p.description.length < 20) continue
    brandSet.add(p.brand)
  }
  const brands = [...brandSet].sort()
  return NextResponse.json({ brands })
}
