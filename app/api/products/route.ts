import { NextResponse } from 'next/server'
import { loadProducts } from '@/lib/products'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const brand = searchParams.get('brand') ?? ''
  const products = loadProducts()
  const brandProducts = products
    .filter(p => (p.brand || 'Unknown Brand') === brand)
    .map(p => ({ id: p.id, title: p.title }))
    .sort((a, b) => a.title.localeCompare(b.title))
  return NextResponse.json({ products: brandProducts, total: brandProducts.length })
}
