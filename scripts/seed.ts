/**
 * Pre-computes severity scores for all products and writes data/scores.json.
 * Run with: npm run seed
 *
 * Re-run whenever products.csv changes.
 */

import fs from 'fs'

// Load .env.local so ANTHROPIC_API_KEY is available outside Next.js
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
} catch { /* no .env.local, rely on shell env */ }

import path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { loadProducts, getQuantitativeScores, getCompetitors, avgQuantitative } from '../lib/products'
import { STYLE_GUIDE } from '../lib/style-guide'
import type { Product, IssueCard } from '../lib/types'

const client = new Anthropic()

const TITLE_MAX = 50
const DESC_MAX = 2000

interface ScoreResult {
  severity: 'high' | 'medium' | 'low'
  suppressionRisk: boolean
  suppressionConsequence: string
  issueType: string
  rationale: string
  usedLLM: boolean
}

// Pure code checks — no hallucination possible.
// Returns the most critical violation if one exists, null otherwise.
function checkHardRules(product: Product): ScoreResult | null {
  const q = getQuantitativeScores(product)

  // Title length — exact character count, suppression risk per style guide
  if (q.titleLength > TITLE_MAX) {
    return {
      severity: 'high',
      suppressionRisk: true,
      suppressionConsequence: 'Listing suppression — title exceeds character limit',
      issueType: 'Title too long',
      rationale: `Title is ${q.titleLength} characters, ${q.titleLength - TITLE_MAX} over the ${TITLE_MAX}-character maximum. Titles violating character limits risk listing suppression.`,
      usedLLM: false,
    }
  }

  // Prohibited symbols in title (!  *  $  ?  ®  ©  ™)
  const badChars = [...new Set((product.title.match(/[!*$?®©™]/g) ?? []))]
  if (badChars.length > 0) {
    return {
      severity: 'high',
      suppressionRisk: /[®©™]/.test(product.title),
      suppressionConsequence: /[®©™]/.test(product.title)
        ? 'Listing suppression — Type 1 High ASCII characters in title'
        : '',
      issueType: 'Prohibited characters in title',
      rationale: `Title contains prohibited characters: ${badChars.join(' ')}. These violate Amazon title guidelines and can cause suppression.`,
      usedLLM: false,
    }
  }

  // No images
  if (q.imageCount === 0) {
    return {
      severity: 'high',
      suppressionRisk: true,
      suppressionConsequence: 'Listing suppression — no product images',
      issueType: 'No images',
      rationale: 'Product has no images. Images are required by Amazon; missing images cause listing suppression.',
      usedLLM: false,
    }
  }

  // No bullet points
  if (q.bulletCount === 0) {
    return {
      severity: 'high',
      suppressionRisk: false,
      suppressionConsequence: '',
      issueType: 'Missing bullet points',
      rationale: 'Product has no key feature bullets. Amazon recommends 5 bullets highlighting key features.',
      usedLLM: false,
    }
  }

  // No description
  if (q.descriptionLength === 0) {
    return {
      severity: 'high',
      suppressionRisk: false,
      suppressionConsequence: '',
      issueType: 'Missing description',
      rationale: 'Product has no description. A well-crafted description improves discoverability and conversion.',
      usedLLM: false,
    }
  }

  // Description over limit
  if (q.descriptionLength > DESC_MAX) {
    return {
      severity: 'medium',
      suppressionRisk: false,
      suppressionConsequence: '',
      issueType: 'Description too long',
      rationale: `Description is ${q.descriptionLength} characters, ${q.descriptionLength - DESC_MAX} over the ${DESC_MAX}-character limit.`,
      usedLLM: false,
    }
  }

  return null // no hard violations — defer to LLM for qualitative assessment
}

async function scoreProduct(product: Product, maxAttempts = 4): Promise<ScoreResult> {
  // Check measurable rule violations in code first — no LLM needed
  const hardViolation = checkHardRules(product)
  if (hardViolation) return hardViolation

  // No hard violations — ask Claude to assess qualitative issues
  const q = getQuantitativeScores(product)
  let lastErr: unknown

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const msg = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        system: `You are an Amazon listing content auditor. Use only the rules in the style guide below. Return only valid JSON.\n\n${STYLE_GUIDE}`,
        messages: [{
          role: 'user',
          content: `Audit this product listing for qualitative issues (the quantitative checks — title length, image count, bullet count, description length — already pass). Identify the single most critical remaining content issue.

Product ID: ${product.id}
Brand: ${product.brand || '(unknown)'}
Title (${q.titleLength}/${TITLE_MAX} chars): ${product.title}
Bullets (${q.bulletCount}): ${product.bullets.join(' | ')}
Description (${q.descriptionLength}/${DESC_MAX} chars): ${product.description}
Images: ${q.imageCount}

Return JSON:
{
  "severity": "high" | "medium" | "low",
  "suppressionRisk": true | false,
  "suppressionConsequence": "brief description of Amazon enforcement consequence, or empty string",
  "issueType": "short label describing the qualitative issue",
  "rationale": "one sentence explaining the issue and its impact"
}`,
        }],
      })

      const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
      const json = text.match(/\{[\s\S]*\}/)
      if (!json) throw new Error('no json in response')
      return { ...JSON.parse(json[0]) as Omit<ScoreResult, 'usedLLM'>, usedLLM: true }
    } catch (err: unknown) {
      lastErr = err
      const status = (err as { status?: number })?.status
      if ((status === 429 || status === 529) && attempt < maxAttempts - 1) {
        const delay = Math.pow(2, attempt + 1) * 1000
        console.log(`  rate limited, retrying in ${delay / 1000}s…`)
        await new Promise(r => setTimeout(r, delay))
        continue
      }
      throw err
    }
  }
  throw lastErr
}

async function main() {
  console.log('Loading products from CSV…')
  const products = loadProducts()
  console.log(`  ${products.length} unique products\n`)

  const issues: IssueCard[] = []
  let codeScored = 0
  let llmScored = 0
  let failed = 0

  for (let i = 0; i < products.length; i++) {
    const p = products[i]
    process.stdout.write(`[${i + 1}/${products.length}] ${p.brand || '(unknown)'} — ${p.id}… `)

    try {
      const score = await scoreProduct(p)
      const competitors = getCompetitors(p, products)
      const topCompetitor = competitors.find(c => c.avgRankSearch !== null)
      const rationale = topCompetitor
        ? `${score.rationale} ${topCompetitor.brand || topCompetitor.title.split(' ')[0]} (avg rank #${topCompetitor.avgRankSearch}) may serve as a reference.`
        : score.rationale

      issues.push({
        productId: p.id,
        productTitle: p.title,
        brand: p.brand,
        issueType: score.issueType,
        severity: score.severity,
        suppressionRisk: score.suppressionRisk,
        suppressionConsequence: score.suppressionConsequence || '',
        rationale,
        quantitative: getQuantitativeScores(p),
        competitorAvgQuantitative: avgQuantitative(competitors),
      })

      const tag = score.usedLLM ? 'llm' : 'code'
      console.log(`✓ [${tag}] ${score.severity}${score.suppressionRisk ? ' ⚠ suppression' : ''}`)
      score.usedLLM ? llmScored++ : codeScored++
    } catch (err: unknown) {
      console.log(`✗ ${(err as Error).message}`)
      failed++
    }

    // Only throttle when we made an LLM call
    const madeApiCall = !checkHardRules(p)
    if (madeApiCall && i < products.length - 1) {
      await new Promise(r => setTimeout(r, 200))
    }
  }

  // Sort: suppression risks first, then by severity, then by search rank
  const severityOrder = { high: 0, medium: 1, low: 2 }
  const sorted = issues.sort((a, b) => {
    if (a.suppressionRisk && !b.suppressionRisk) return -1
    if (!a.suppressionRisk && b.suppressionRisk) return 1
    const diff = severityOrder[a.severity] - severityOrder[b.severity]
    if (diff !== 0) return diff
    const aRank = products.find(p => p.id === a.productId)?.avgRankSearch ?? Infinity
    const bRank = products.find(p => p.id === b.productId)?.avgRankSearch ?? Infinity
    return aRank - bRank
  })

  const outPath = path.join(process.cwd(), 'data', 'scores.json')
  fs.writeFileSync(outPath, JSON.stringify({ issues: sorted, cachedAt: Date.now() }, null, 2))

  console.log(`\n✓ Wrote ${sorted.length} issues to data/scores.json`)
  console.log(`  code: ${codeScored}, llm: ${llmScored}, failed: ${failed}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
