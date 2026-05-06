import { NextResponse } from 'next/server'
import { getProducts } from '@/lib/store'
import { getCompetitors } from '@/lib/products'
import { analyzeImages } from '@/lib/claude'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const products = await getProducts()
  const product = products.find((p) => p.id === id)

  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  }

  const competitors = getCompetitors(product, products)
  const analyses = await analyzeImages(product, competitors)

  return NextResponse.json({ analyses })
}
