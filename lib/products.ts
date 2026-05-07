import fs from 'fs'
import path from 'path'
import { parse } from 'csv-parse/sync'
import type { RawProduct, Product, QuantitativeScores } from './types'

function parseImages(raw: string): string[] {
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return raw ? [raw] : []
  }
}

function parseBullets(raw: string): string[] {
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return raw ? [raw] : []
  }
}

function parseRank(raw: string): number | null {
  const n = parseFloat(raw)
  return isNaN(n) || n === 0 ? null : n
}

function richness(row: RawProduct): number {
  let score = 0
  if (row.title) score += 2
  if (row.bullet_points && row.bullet_points !== '[]') score += 2
  if (row.description_filled) score += 2
  if (row.retailer_brand_name) score += 1
  if (row.retailer_category_node) score += 1
  if (row.image_url && row.image_url !== '[]') score += 1
  return score
}

export function loadProducts(): Product[] {
  const csvPath = path.join(process.cwd(), 'data', 'products.csv')
  const raw = fs.readFileSync(csvPath, 'utf-8')
  const rows: RawProduct[] = parse(raw, { columns: true, skip_empty_lines: true })

  // Dedup by product_id — keep richest row
  const byId = new Map<string, RawProduct>()
  for (const row of rows) {
    const existing = byId.get(row.product_id)
    if (!existing || richness(row) > richness(existing)) {
      byId.set(row.product_id, row)
    }
  }

  return Array.from(byId.values()).map((row) => ({
    id: row.product_id,
    title: row.title || '',
    universe: row.universe || '',
    images: parseImages(row.image_url),
    bullets: parseBullets(row.bullet_points),
    minRankSearch: parseRank(row.min_rank_search),
    avgRankSearch: parseRank(row.avg_rank_search),
    minRankCategory: parseRank(row.min_rank_category),
    avgRankCategory: parseRank(row.avg_rank_category),
    categoryNode: row.retailer_category_node || '',
    brand: row.retailer_brand_name || '',
    description: row.description_filled || '',
  }))
}

export function getQuantitativeScores(p: Product): QuantitativeScores {
  return {
    titleLength: p.title.length,
    titleLengthMax: 50,
    bulletCount: p.bullets.length,
    bulletCountTarget: 5,
    descriptionLength: p.description.length,
    descriptionLengthMax: 2000,
    imageCount: p.images.length,
  }
}

export function getCompetitors(product: Product, all: Product[]): Product[] {
  if (!product.categoryNode) return []

  let competitors = all.filter(
    (p) => p.id !== product.id && p.categoryNode === product.categoryNode
  )

  // Fall back to broader node (last segment removed) if too few
  if (competitors.length < 2 && product.categoryNode.includes('›')) {
    const broader = product.categoryNode.split('›').slice(0, -1).join('›').trim()
    competitors = all.filter(
      (p) => p.id !== product.id && p.categoryNode.startsWith(broader)
    )
  }

  // Sort by avgRankSearch ascending (best ranked first), unranked last
  return competitors.sort((a, b) => {
    if (a.avgRankSearch === null && b.avgRankSearch === null) return 0
    if (a.avgRankSearch === null) return 1
    if (b.avgRankSearch === null) return -1
    return a.avgRankSearch - b.avgRankSearch
  })
}

export function avgQuantitative(products: Product[]): QuantitativeScores {
  if (products.length === 0) {
    return { titleLength: 0, titleLengthMax: 50, bulletCount: 0, bulletCountTarget: 5, descriptionLength: 0, descriptionLengthMax: 2000, imageCount: 0 }
  }
  return {
    titleLength: Math.round(products.reduce((s, p) => s + p.title.length, 0) / products.length),
    titleLengthMax: 50,
    bulletCount: Math.round(products.reduce((s, p) => s + p.bullets.length, 0) / products.length),
    bulletCountTarget: 5,
    descriptionLength: Math.round(products.reduce((s, p) => s + p.description.length, 0) / products.length),
    descriptionLengthMax: 2000,
    imageCount: Math.round(products.reduce((s, p) => s + p.images.length, 0) / products.length),
  }
}
