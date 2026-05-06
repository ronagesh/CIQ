import { NextResponse } from 'next/server'
import { getProducts } from '@/lib/store'
import { generateSummary } from '@/lib/claude'
import type { Suggestion } from '@/lib/types'

export async function POST(request: Request) {
  const { productId, approvedSuggestions } = await request.json() as {
    productId: string
    approvedSuggestions: Suggestion[]
  }

  const products = await getProducts()
  const product = products.find((p) => p.id === productId)

  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  }

  if (!approvedSuggestions?.length) {
    return NextResponse.json({ error: 'No approved suggestions' }, { status: 400 })
  }

  const markdown = await generateSummary(product, approvedSuggestions)
  return NextResponse.json({ markdown })
}
