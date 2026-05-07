/**
 * Deduplicates products.csv to one row per product_id and fills missing
 * retailer_brand_name / retailer_category_node fields via Claude.
 *
 * Run with: npx tsx scripts/enrich.ts
 * Output:   data/products_clean.csv  (then manually replace products.csv if happy)
 */

import fs from 'fs'
import path from 'path'

// Load .env.local
try {
  const lines = fs.readFileSync('.env.local', 'utf-8').split('\n')
  for (const line of lines) {
    const eq = line.indexOf('=')
    if (eq > 0 && !line.startsWith('#')) {
      const key = line.slice(0, eq).trim()
      const val = line.slice(eq + 1).trim()
      if (key && !(key in process.env)) process.env[key] = val.replace(/^["']|["']$/g, '')
    }
  }
} catch { /* rely on shell env */ }

import { parse } from 'csv-parse/sync'
import { stringify } from 'csv-stringify/sync'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

interface Row {
  product_id: string
  title: string
  universe: string
  image_url: string
  bullet_points: string
  min_rank_search: string
  avg_rank_search: string
  min_rank_category: string
  avg_rank_category: string
  retailer_category_node: string
  retailer_brand_name: string
  description_filled: string
}

function richness(row: Row): number {
  let s = 0
  if (row.title) s += 2
  if (row.bullet_points && row.bullet_points !== '[]') s += 2
  if (row.description_filled) s += 2
  if (row.retailer_brand_name) s += 1
  if (row.retailer_category_node) s += 1
  if (row.image_url && row.image_url !== '[]') s += 1
  if (row.avg_rank_search) s += 1
  return s
}

async function inferBrand(row: Row): Promise<string> {
  const bullets = (() => { try { return (JSON.parse(row.bullet_points) as string[]).slice(0, 3).join(' | ') } catch { return row.bullet_points.slice(0, 200) } })()
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 64,
    messages: [{
      role: 'user',
      content: `What is the brand name for this Amazon product? Reply with ONLY the brand name, nothing else.

Title: ${row.title}
Bullets: ${bullets}
Category: ${row.retailer_category_node}`,
    }],
  })
  return msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
}

async function inferCategory(row: Row): Promise<string> {
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 64,
    messages: [{
      role: 'user',
      content: `What is the Amazon category breadcrumb for this product? Format: "Top Level › Sub Level › Sub Sub Level". Reply with ONLY the breadcrumb, nothing else.

Title: ${row.title}`,
    }],
  })
  return msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
}

async function main() {
  const csvPath = path.join(process.cwd(), 'data', 'products.csv')
  const raw = fs.readFileSync(csvPath, 'utf-8')
  const rows: Row[] = parse(raw, { columns: true, skip_empty_lines: true })

  console.log(`Input: ${rows.length} rows`)

  // Step 1: Deduplicate — keep richest row per product_id
  const byId = new Map<string, Row>()
  for (const row of rows) {
    const existing = byId.get(row.product_id)
    if (!existing || richness(row) > richness(existing)) {
      byId.set(row.product_id, row)
    }
  }
  const deduped = Array.from(byId.values())
  console.log(`After dedup: ${deduped.length} rows\n`)

  // Step 2: Enrich missing fields
  let brandFixed = 0
  let categoryFixed = 0

  for (let i = 0; i < deduped.length; i++) {
    const row = deduped[i]
    const needsBrand = !row.retailer_brand_name.trim()
    const needsCategory = !row.retailer_category_node.trim()

    if (!needsBrand && !needsCategory) continue

    process.stdout.write(`[${i + 1}/${deduped.length}] ${row.product_id} — `)

    if (needsBrand) {
      try {
        const brand = await inferBrand(row)
        row.retailer_brand_name = brand
        process.stdout.write(`brand="${brand}" `)
        brandFixed++
      } catch (e) {
        process.stdout.write(`brand=ERR `)
      }
    }

    if (needsCategory) {
      try {
        const cat = await inferCategory(row)
        row.retailer_category_node = cat
        process.stdout.write(`category="${cat}" `)
        categoryFixed++
      } catch (e) {
        process.stdout.write(`category=ERR `)
      }
    }

    console.log()
    await new Promise(r => setTimeout(r, 150))
  }

  // Step 3: Write cleaned CSV
  const outPath = path.join(process.cwd(), 'data', 'products_clean.csv')
  const columns = ['product_id','title','universe','image_url','bullet_points','min_rank_search','avg_rank_search','min_rank_category','avg_rank_category','retailer_category_node','retailer_brand_name','description_filled']
  const output = stringify(deduped, { header: true, columns })
  fs.writeFileSync(outPath, output)

  console.log(`\n✓ Wrote ${deduped.length} rows to data/products_clean.csv`)
  console.log(`  brands filled: ${brandFixed}, categories filled: ${categoryFixed}`)
}

main().catch(err => { console.error(err); process.exit(1) })
