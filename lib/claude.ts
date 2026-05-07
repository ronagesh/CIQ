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
- Proposed title text MUST be ≤50 characters — count every character before writing, this is a hard limit
- Proposed description text MUST be ≤2000 characters
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

Check only these things:
1. WHITE BACKGROUND — is the studio background behind the product pure white? Flag if there is a clearly non-white background colour, gradient, or lifestyle scene behind the product.
2. PRODUCT COVERAGE — does the product occupy at least 80% of the image frame?
3. TEXT OR GRAPHICS IN THE WHITE SPACE — is there any text, badge, logo, or graphic element floating in the empty white background area OUTSIDE the product's physical boundary? This is the only overlay violation that matters. Do NOT look at the product itself for this check.
4. PRODUCT VISIBLE — is the product clearly identifiable?

For check 3, the rule is simple: if the element sits on or within the product (on a box panel, label, pouch, canister, wrapper) it is packaging — ignore it entirely regardless of what it says. Only flag something if it visibly sits in the white space outside the product's edge. When in doubt, do NOT flag.`,
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

// ── 5. Title shortener (post-processing enforcement) ──────────────────────────

export async function shortenTitle(title: string): Promise<string> {
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 64,
    messages: [{
      role: 'user',
      content: `Shorten this Amazon product title to 50 characters or fewer. Keep brand, product type, and the most important attribute (flavor or size). Return ONLY the shortened title — no quotes, no explanation.

Title: ${title}
Character limit: 50
Current length: ${title.length} chars`,
    }],
  })
  const shortened = msg.content[0].type === 'text' ? msg.content[0].text.trim() : title
  return shortened.length <= 50 ? shortened : shortened.slice(0, 50).replace(/\s\S*$/, '')
}

// ── 6. Summary ─────────────────────────────────────────────────────────────────

export function generateSummary(
  product: Product,
  suggestions: Suggestion[],
): string {
  // Build a lookup of dimension → approved text so we can slot in user edits verbatim
  const byDimension = new Map(suggestions.map(s => [s.dimension.toLowerCase(), s]))

  const title = byDimension.get('title')?.proposedText ?? product.title
  const description = byDimension.get('description')?.proposedText ?? product.description
  const bullets = product.bullets.map((b, i) => {
    const key = `bullet ${i + 1}`
    return byDimension.get(key)?.proposedText ?? b
  })

  const changeLog = suggestions.map(s =>
    `| ${s.dimension} | ${s.currentText.slice(0, 60).replace(/\|/g, '/')}… → ${s.proposedText.slice(0, 60).replace(/\|/g, '/')}… | ${s.guidelineCitation.slice(0, 80)} | ${s.competitorReference.slice(0, 80)} |`
  ).join('\n')

  return `# Content Update: ${product.id}

## Final Content

**Title**
${title}

**Bullet Points**
${bullets.map((b, i) => `${i + 1}. ${b}`).join('\n')}

**Description**
${description}

## Change Log

| Field | Change | Guideline Cited | Competitor Referenced |
|-------|--------|----------------|-----------------------|
${changeLog}
`
}
