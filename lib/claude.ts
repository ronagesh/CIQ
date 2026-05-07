import Anthropic from '@anthropic-ai/sdk'
import { STYLE_GUIDE } from './style-guide'
import type { Product, IssueCard, Suggestion, QuantitativeScores, ImageAnalysis } from './types'
import { getQuantitativeScores } from './products'

const client = new Anthropic()

// ── 1. Enrichment ──────────────────────────────────────────────────────────────

export async function enrichProduct(product: Product): Promise<{
  brand: string
  categoryNode: string
  confidence: 'high' | 'low'
}> {
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    system: 'You are a product data enrichment assistant. Return only valid JSON.',
    messages: [{
      role: 'user',
      content: `Given this Amazon product, infer the brand name and most appropriate Amazon category node.

Title: ${product.title}
Bullets: ${product.bullets.slice(0, 3).join(' | ')}

Return JSON: { "brand": "...", "categoryNode": "...", "confidence": "high" | "low" }
- brand: the manufacturer/brand name inferred from the title
- categoryNode: Amazon browse path like "Health & Household › Diet & Sports Nutrition › Sports Nutrition › Electrolyte Replacements"
- confidence: "high" if you are certain, "low" if guessing`
    }],
  })

  try {
    const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
    const json = text.match(/\{[\s\S]*\}/)
    if (!json) throw new Error('no json')
    return JSON.parse(json[0])
  } catch {
    return { brand: product.brand, categoryNode: product.categoryNode, confidence: 'low' }
  }
}

// ── 2. Severity Scoring (batch) ────────────────────────────────────────────────

export async function scoreSeverity(product: Product): Promise<{
  severity: 'high' | 'medium' | 'low'
  suppressionRisk: boolean
  suppressionConsequence: string
  issueType: string
  rationale: string
}> {
  const q = getQuantitativeScores(product)

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: `You are an Amazon listing content auditor. Use only the rules in the style guide below. Return only valid JSON.\n\n${STYLE_GUIDE}`,
    messages: [{
      role: 'user',
      content: `Audit this product listing and identify the single most critical content issue.

Product ID: ${product.id}
Brand: ${product.brand || '(unknown)'}
Title (${q.titleLength} chars): ${product.title}
Bullet count: ${q.bulletCount} bullets
Bullets: ${product.bullets.join(' | ')}
Description (${q.descriptionLength} chars): ${product.description}
Image count: ${q.imageCount}

Return JSON:
{
  "severity": "high" | "medium" | "low",
  "suppressionRisk": true | false,
  "suppressionConsequence": "brief description of Amazon enforcement consequence, or empty string",
  "issueType": "short label e.g. 'Title too long' or 'Missing description'",
  "rationale": "one sentence explaining the issue and its impact"
}`
    }],
  })

  try {
    const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
    const json = text.match(/\{[\s\S]*\}/)
    if (!json) throw new Error('no json')
    return JSON.parse(json[0])
  } catch {
    return {
      severity: 'medium',
      suppressionRisk: false,
      suppressionConsequence: '',
      issueType: 'Content issue detected',
      rationale: 'Manual review recommended.',
    }
  }
}

// ── 3. Analysis (streaming) ────────────────────────────────────────────────────

export function buildAnalysisPrompt(
  product: Product,
  competitors: Product[],
  quantitative: QuantitativeScores,
): string {
  const topCompetitors = competitors.slice(0, 5)
  const competitorLines = topCompetitors.map((c, i) =>
    `Competitor ${i + 1}: ${c.brand || c.title.split(' ')[0]} (avg search rank: ${c.avgRankSearch ?? 'unranked'})
  Title (${c.title.length} chars): ${c.title}
  Bullets (${c.bullets.length}): ${c.bullets.slice(0, 3).join(' | ')}
  Description: ${c.description.slice(0, 200)}`
  ).join('\n\n')

  const isTopRanked = product.avgRankSearch !== null &&
    topCompetitors.every(c => c.avgRankSearch === null || product.avgRankSearch! <= c.avgRankSearch)

  return `Analyze this Amazon product listing and generate the top 3 highest-impact improvement suggestions.

SELECTED SKU:
Brand: ${product.brand || '(unknown)'}
Title (${quantitative.titleLength}/${quantitative.titleLengthMax} chars): ${product.title}
Bullets (${quantitative.bulletCount}/${quantitative.bulletCountTarget}): ${product.bullets.join(' | ')}
Description (${quantitative.descriptionLength}/${quantitative.descriptionLengthMax} chars): ${product.description}
Images: ${quantitative.imageCount}
Avg search rank: ${product.avgRankSearch ?? 'unranked'}

COMPETITORS (ranked best first):
${competitorLines || 'No ranked competitors available.'}

${isTopRanked ? 'NOTE: This product outranks all competitors. Frame suggestions as guideline compliance and suppression-risk issues rather than competitive gaps.' : ''}

Return a JSON object:
{
  "scorecard": {
    "title": "better" | "on par" | "worse",
    "bullets": "better" | "on par" | "worse",
    "description": "better" | "on par" | "worse",
    "images": "better" | "on par" | "worse"
  },
  "suggestions": [
    {
      "dimension": "e.g. Title / Bullet 2 / Description",
      "currentText": "the current text for this dimension",
      "proposedText": "your ready-to-use replacement copy",
      "guidelineCitation": "Amazon [section] Guidelines: '[exact verbatim rule quote from the style guide]'. Seller Central URL if applicable.",
      "competitorReference": "e.g. 'Liquid I.V. (avg search rank #3) achieves this at 47 characters while retaining brand, flavor, and pack size' — or compliance framing if SKU is top-ranked",
      "suppressionRisk": true | false,
      "suppressionConsequence": "brief description of Amazon enforcement consequence if violated, or empty string"
    }
  ]
}

Scorecard rules:
- Judge content QUALITY vs competitors (clarity, specificity, guideline compliance, keyword relevance) — not just length
- "worse" if the dimension has a clear quality deficit or guideline violation vs competitors
- "better" if the dimension is noticeably stronger in quality than competitors
- "on par" if roughly equivalent

Suggestion rules:
- Return exactly 3 suggestions
- Only cite rules that appear verbatim in the provided style guide
- Never reference competitors whose content violates guidelines
- Proposed text must be shorter/better on quantitative dimensions than current text
- Prioritize suppression-risk issues first`
}

export async function streamAnalysis(
  product: Product,
  competitors: Product[],
  quantitative: QuantitativeScores,
) {
  const prompt = buildAnalysisPrompt(product, competitors, quantitative)

  return client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: `You are an expert Amazon listing content strategist. Use only the rules in the style guide below. Return only valid JSON.\n\n${STYLE_GUIDE}`,
    messages: [{ role: 'user', content: prompt }],
  })
}

// ── 4. Image Analysis ─────────────────────────────────────────────────────────

async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    return Buffer.from(buf).toString('base64')
  } catch {
    return null
  }
}

export async function analyzeImages(
  product: Product,
  competitors: Product[],
): Promise<ImageAnalysis[]> {
  // Analyze main image for product + top 3 competitors
  const targets = [product, ...competitors.slice(0, 3)]

  const results = await Promise.all(
    targets.map(async (p) => {
      const imageUrl = p.images[0]
      if (!imageUrl) return null

      const base64 = await fetchImageAsBase64(imageUrl)
      if (!base64) return null

      const isProduct = p.id === product.id
      const competitorContext = !isProduct
        ? `This is a competitor image (${p.brand || p.title.split(' ')[0]}, avg search rank: ${p.avgRankSearch ?? 'unranked'}).`
        : 'This is the selected product image to audit.'

      try {
        const msg = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system: `You are an Amazon product image compliance auditor. Use only the rules in the style guide below. Return only valid JSON.\n\n${STYLE_GUIDE}`,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
              },
              {
                type: 'text',
                text: `${competitorContext}

Audit this Amazon product image against the style guide rules. Return JSON:
{
  "findings": [
    {
      "check": "check name e.g. 'White background' or 'Product coverage' or 'No text overlays'",
      "compliant": true | false,
      "detail": "one specific sentence — if non-compliant, quote the exact offending text verbatim (e.g. 'Text overlay reads \"NO SUGAR ♦ NO KCALS\" at top of pack') or describe the exact visual element and its location in the frame; if compliant, confirm what you see",
      "suppressionRisk": true | false
    }
  ],
  "overallCompliant": true | false,
  "suggestion": "if not compliant: one actionable fix naming the specific element to remove or change, or null if compliant",
  "competitorComparison": "${isProduct ? 'leave empty string' : `one sentence comparing this competitor image to standard guidelines, citing any specific text or element observed`}"
}

Check all of: white background, product occupies 80%+ of image area, no text/watermarks/borders/decorations ADDED TO THE PHOTO (overlays, sale badges, brand watermarks, floating callouts) — text or logos that are part of the physical product packaging are NOT violations, product clearly visible and identifiable.
Do NOT flag: text printed on the product itself, symbols (®, ©, ™) on the product packaging, or lifestyle backgrounds that are simply the product's own colorful packaging. DO flag: non-white studio background behind the product, promotional text overlaid on the photo (e.g. "SALE", "FREE SHIPPING"), or watermarks added to the image.`,
              },
            ],
          }],
        })

        const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
        const json = text.match(/\{[\s\S]*\}/)
        if (!json) throw new Error('no json')
        const parsed = JSON.parse(json[0])

        return {
          productId: p.id,
          imageUrl,
          ...parsed,
        } as ImageAnalysis
      } catch {
        return null
      }
    })
  )

  return results.filter((r): r is ImageAnalysis => r !== null)
}

// ── 5. Summary ─────────────────────────────────────────────────────────────────

export async function generateSummary(
  product: Product,
  approvedSuggestions: Suggestion[],
): Promise<string> {
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: 'You are a technical writer producing clean Markdown for Amazon listing uploads.',
    messages: [{
      role: 'user',
      content: `Generate a final Markdown summary for this product with approved changes applied.

Product: ${product.title} (${product.id})

Approved changes:
${approvedSuggestions.map((s, i) => `${i + 1}. ${s.dimension}
   Current: ${s.currentText}
   Approved replacement: ${s.proposedText}
   Guideline: ${s.guidelineCitation}
   Competitor reference: ${s.competitorReference}`).join('\n\n')}

Produce a Markdown document with:
1. A "## Final Content" section with the updated title, bullet points, and description
2. A "## Change Log" table with columns: Field | Change | Guideline Cited | Competitor Referenced

Use the original product content for any fields not covered by the approved changes:
Original title: ${product.title}
Original bullets:
${product.bullets.map((b, i) => `${i + 1}. ${b}`).join('\n')}
Original description: ${product.description}`
    }],
  })

  return msg.content[0].type === 'text' ? msg.content[0].text : ''
}
