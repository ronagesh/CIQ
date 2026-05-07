import type { Product } from './types'
import { loadProducts } from './products'
import { enrichProduct } from './claude'

// In-memory product cache — enrichment is stable per deployment
let products: Product[] | null = null

export async function getProducts(): Promise<Product[]> {
  if (products) return products

  const raw = loadProducts()

  const enriched = await Promise.all(
    raw.map(async (p) => {
      if (p.brand && p.categoryNode) return p
      try {
        const result = await enrichProduct(p)
        return {
          ...p,
          brand: p.brand || result.brand,
          categoryNode: p.categoryNode || result.categoryNode,
          inferredBrand: !p.brand ? result.brand : undefined,
          inferredCategory: !p.categoryNode ? result.categoryNode : undefined,
          enrichmentConfidence: result.confidence,
        }
      } catch {
        return p
      }
    })
  )

  products = enriched
  return products
}
