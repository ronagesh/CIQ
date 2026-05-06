import type { Product, IssueCard } from './types'
import { loadProducts } from './products'
import { enrichProduct } from './claude'

// Global singleton — populated on first use
let products: Product[] | null = null
let issueCache: IssueCard[] | null = null

export async function getProducts(): Promise<Product[]> {
  if (products) return products

  const raw = loadProducts()

  // Enrich products with missing brand or categoryNode
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

export function getIssueCache(): IssueCard[] | null {
  return issueCache
}

export function setIssueCache(issues: IssueCard[]): void {
  issueCache = issues
}

export function clearCache(): void {
  issueCache = null
  // Don't clear products — enrichment is stable
}
