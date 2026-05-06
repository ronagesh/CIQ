import { NextResponse } from 'next/server'
import { getCompetitors, getQuantitativeScores, avgQuantitative } from '@/lib/products'
import { getProducts } from '@/lib/store'
import { streamAnalysis } from '@/lib/claude'

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
  const quantitative = getQuantitativeScores(product)
  const competitorAvg = avgQuantitative(competitors)

  const stream = await streamAnalysis(product, competitors, quantitative)

  let fullText = ''
  const readable = new ReadableStream({
    async start(controller) {
      // First send product/competitor metadata
      const meta = JSON.stringify({
        type: 'meta',
        product: {
          id: product.id,
          title: product.title,
          brand: product.brand,
          categoryNode: product.categoryNode,
          bullets: product.bullets,
          description: product.description,
          images: product.images,
          avgRankSearch: product.avgRankSearch,
        },
        competitors: competitors.slice(0, 5).map(c => ({
          id: c.id,
          title: c.title,
          brand: c.brand,
          avgRankSearch: c.avgRankSearch,
        })),
        quantitative,
        competitorAvgQuantitative: competitorAvg,
      })
      controller.enqueue(new TextEncoder().encode(meta + '\n'))

      for await (const chunk of stream) {
        if (
          chunk.type === 'content_block_delta' &&
          chunk.delta.type === 'text_delta'
        ) {
          fullText += chunk.delta.text
          controller.enqueue(
            new TextEncoder().encode(
              JSON.stringify({ type: 'delta', text: chunk.delta.text }) + '\n'
            )
          )
        }
      }

      // Parse and validate suggestions before sending final
      try {
        const jsonMatch = fullText.match(/\[[\s\S]*\]/)
        if (jsonMatch) {
          const suggestions = JSON.parse(jsonMatch[0])
          controller.enqueue(
            new TextEncoder().encode(
              JSON.stringify({ type: 'suggestions', suggestions }) + '\n'
            )
          )
        }
      } catch {
        // stream already sent raw text
      }

      controller.close()
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  })
}
