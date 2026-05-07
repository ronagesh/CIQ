# Ally — Amazon Content Intelligence Dashboard

Ally is a skill built for [CommerceIQ's](https://commerceiq.ai) AI teammate. It helps brand managers identify and fix Amazon listing content violations before they cause suppression — and benchmarks every SKU against its top competitors to surface the highest-impact improvements first.

**Live:** https://ciq-ally.vercel.app &nbsp;|&nbsp; **Spec:** [docs/SPEC.md](docs/SPEC.md) &nbsp;|&nbsp; **Product Doc:** [Google Doc](https://docs.google.com/document/d/1eU48MMkJr7bptv45RvPuj_6ug-7sSpvjXgE3ubYUN9g/edit)

---

## The problem

Amazon listing suppression is silent and costly. A title that's one character too long, a prohibited symbol, or a missing image can pull a product from search results with no warning. At the same time, even compliant listings often underperform because their content is weaker than competitors'. Brand managers catch these issues manually, slowly, and inconsistently across large SKU portfolios.

## What Ally does

Ally combines deterministic rule checks with AI analysis to give brand managers a prioritized, actionable content audit for every SKU in their portfolio.

1. **Brand dashboard** — select a brand and see all SKUs ranked by content severity. Each card shows the primary violation, suppression risk, and a Better / On par / Worse comparison to competitor averages across title, bullets, description, and images. Suppression risks surface first so the most urgent issues are always at the top.

2. **Report page** — drill into any SKU for a full audit:
   - Three-panel top row: product info, ranked competitor set (each row is clickable to open that competitor's own report), and a Claude-assessed quality scorecard vs competitors.
   - Three AI-generated improvement suggestions, each with current vs proposed copy, a verbatim Amazon guideline citation, and a synthesized learning from the top 3 ranked competitors.
   - Real-time violation flags as you edit the proposed text — catching issues before you export.
   - Image compliance audit distinguishing true digital overlays from on-package text.
   - One-click markdown export using your exact edited text, no AI alteration.

---

## Stack

- **Next.js 16.2.5** (App Router, TypeScript)
- **Tailwind CSS v4**
- **Anthropic SDK** — claude-sonnet-4-6 for analysis and scoring, claude-haiku-4-5 for enrichment and title shortening
- **Vercel** for deployment

---

## Getting started

```bash
npm install
```

Add your Anthropic API key:

```bash
# .env.local
ANTHROPIC_API_KEY=sk-ant-...
```

Seed the severity scores (one-time, re-run when `data/products.csv` changes):

```bash
npm run seed
```

Start the dev server:

```bash
npm run dev
```

---

## Data pipeline

### Source data
`data/products.csv` — 67 deduplicated Amazon products (electrolyte/hydration category). Each row has product ID, title, bullets, description, images, search/category rank, brand, and category node.

### Enrichment (`scripts/enrich.ts`)
Run once to clean the raw CSV:
- Deduplicates to one row per `product_id` (keeps richest row by field coverage)
- Uses Claude Haiku to infer missing `retailer_brand_name` and `retailer_category_node`
- Writes `data/products_clean.csv`

```bash
npx tsx scripts/enrich.ts
```

### Scoring (`scripts/seed.ts` / `npm run seed`)
Pre-computes severity scores for all products and writes `data/scores.json`. The brand dashboard reads from this cache — no LLM calls at browse time.

Scoring logic (in priority order):
1. **Hard rule checks (code, no LLM):**
   - Title > 50 chars → `high` severity, suppression risk
   - Prohibited characters in title (`! * $ ? ® © ™`) → `high`, suppression risk for High ASCII
   - No images → `high`, suppression risk
   - No bullet points → `high`
   - No description → `high`
   - Description > 2000 chars → `medium`
2. **Qualitative LLM check** (only if all hard rules pass): Claude assesses the most critical remaining content issue and returns severity, suppression risk, issue type, and rationale.

Each `IssueCard` in `scores.json` also stores `competitorAvgQuantitative` (average quantitative scores across same-category competitors) to power the Better/Worse/On par badges without runtime LLM calls.

---

## API routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/brands` | GET | Returns sorted list of distinct brand names from scores.json |
| `/api/feed` | GET | Returns full `IssueCard[]` from scores.json |
| `/api/products` | GET | `?brand=X` returns `[{id, title}]` for SKU dropdown |
| `/api/report/[id]` | GET | Streams analysis for one product (see below) |
| `/api/images/[id]` | GET | Runs image compliance audit for product + top 3 competitors |
| `/api/summary` | POST | Generates markdown export from accepted suggestions |

### `/api/report/[id]` stream format

Returns newline-delimited JSON messages:

```
{"type":"meta", "product":{...}, "competitors":[...], "quantitative":{...}, "competitorAvgQuantitative":{...}}
{"type":"delta", "text":"..."}          // raw streaming text chunks
{"type":"suggestions", "suggestions":[...]}
{"type":"scorecard", "scorecard":{"title":"better"|"on par"|"worse", ...}}
```

After the stream is parsed, any suggestion with `dimension === "title"` and `proposedText.length > 50` is passed through a focused Haiku call (`shortenTitle`) to enforce the character limit in code — LLMs miscount characters.

---

## Key logic: content scoring rules

Limits used throughout (matching Amazon's actual guidelines):

| Field | Limit | Violation type |
|-------|-------|---------------|
| Title | 50 chars max | Suppression risk |
| Title | No `! * $ ? ® © ™` | Suppression risk (High ASCII) |
| Bullet points | 5 recommended | High severity if 0 |
| Description | 2000 chars max | Medium severity |
| Images | ≥1 required | Suppression risk |

---

## Key logic: image compliance

The image audit checks each product's main image (plus top 3 competitors) for:
- White background
- Product occupies ≥80% of image area
- No text/watermarks/borders added as a digital layer
- No promotional text overlaid on the photo
- Product clearly visible

**Overlay vs packaging distinction** — the model is explicitly instructed to only flag text/graphics that are clearly post-production digital overlays (floating badges, semi-transparent banners, drop-shadow callouts floating in white space). Text printed on the physical product packaging surface is never a violation, even if it includes brand names, callouts, or marketing copy. Tie-breaker: when in doubt, do not flag.

---

## Key logic: client-side violation checking

When a user edits proposed text in the report page, violations are checked in real time against the style guide:

**Title:** > 50 chars (suppression risk), prohibited chars (`! * $ ? ® © ™`), ALL CAPS words (4+ chars), promotional language (`sale`, `free ship`, `$X`), subjective commentary (`best seller`, `hot item`)

**Bullets:** ending punctuation, exclamation points, starts with lowercase, promotional language

**Description:** > 2000 chars, ALL CAPS, email/URL present, promotional language

Editing any field clears the existing markdown export so stale output is never copied.

---

## Prompts

All prompts use the full style guide (`lib/style-guide.ts`) injected into the system message as grounding context. All return structured JSON.

---

### 1. Qualitative severity scoring (`scripts/seed.ts`)

Only runs when a product passes all hard rule checks. Identifies the single most critical remaining content issue.

**System:** `You are an Amazon listing content auditor. Use only the rules in the style guide below. Return only valid JSON.` + style guide

**User:**
```
Audit this product listing for qualitative issues (the quantitative checks —
title length, image count, bullet count, description length — already pass).
Identify the single most critical remaining content issue.

Product ID: {id}
Brand: {brand}
Title ({N}/{MAX} chars): {title}
Bullets ({N}): {bullets joined by " | "}
Description ({N}/{MAX} chars): {description}
Images: {N}

Return JSON:
{
  "severity": "high" | "medium" | "low",
  "suppressionRisk": true | false,
  "suppressionConsequence": "brief description of Amazon enforcement consequence, or empty string",
  "issueType": "short label describing the qualitative issue",
  "rationale": "one sentence explaining the issue and its impact"
}
```

---

### 2. Analysis + suggestions (`lib/claude.ts` — `buildAnalysisPrompt`)

Streamed. Produces the content scorecard and 3 improvement suggestions.

**System:** `You are an expert Amazon listing content strategist. Use only the rules in the style guide below. Return only valid JSON.` + style guide

**User:**
```
Analyze this Amazon product listing and generate the top 3 highest-impact
improvement suggestions.

SELECTED SKU:
Brand: {brand}
Title ({N}/{MAX} chars): {title}
Bullets ({N}/{target}): {bullets}
Description ({N}/{MAX} chars): {description}
Images: {N}
Avg search rank: {rank}

COMPETITORS (ranked best first):
Competitor 1: {brand} (avg search rank: {rank})
  Title ({N} chars): {title}
  Bullets ({N}): {top 3 bullets}
  Description: {first 200 chars}
...

[NOTE: This product outranks all competitors. Frame suggestions as guideline
compliance and suppression-risk issues rather than competitive gaps.]  ← only if applicable

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
      "guidelineCitation": "Amazon [section] Guidelines: '[exact verbatim rule quote]'.",
      "competitorReference": "Synthesize a learning from the top 3 ranked competitors for
        this dimension. Focus on the pattern across the group, not a single brand.
        Use compliance framing if SKU is top-ranked.",
      "suppressionRisk": true | false,
      "suppressionConsequence": "brief description of enforcement consequence, or empty string"
    }
  ]
}

Scorecard rules:
- Judge content QUALITY vs competitors (clarity, specificity, guideline compliance,
  keyword relevance) — not just length
- "worse" if the dimension has a clear quality deficit or guideline violation vs competitors
- "better" if the dimension is noticeably stronger in quality than competitors
- "on par" if roughly equivalent

Suggestion rules:
- Return exactly 3 suggestions
- Only cite rules that appear verbatim in the provided style guide
- Never reference competitors whose content violates guidelines
- Proposed title text MUST be ≤50 characters — count every character, this is a hard limit
- Proposed description text MUST be ≤2000 characters
- Prioritize suppression-risk issues first
```

---

### 3. Image compliance (`lib/claude.ts` — `analyzeImages`)

Vision call. Runs for the product's main image and top 3 competitor main images.

**System:** `You are an Amazon product image compliance auditor. Use only the rules in the style guide below. Return only valid JSON.` + style guide

**User:** product image (base64) +
```
[This is the selected product image to audit. | This is a competitor image ({brand}, avg search rank: {rank}).]

Audit this Amazon product image against the style guide rules. Return JSON:
{
  "findings": [
    {
      "check": "check name e.g. 'White background'",
      "compliant": true | false,
      "detail": "one specific sentence describing what you see",
      "suppressionRisk": true | false
    }
  ],
  "overallCompliant": true | false,
  "suggestion": "one actionable fix, or null if compliant",
  "competitorComparison": "one sentence comparing to guidelines (competitor images only)"
}

Check only these things:
1. WHITE BACKGROUND — is the studio background behind the product pure white?
2. PRODUCT COVERAGE — does the product occupy at least 80% of the image frame?
3. TEXT OR GRAPHICS IN THE WHITE SPACE — is there any text, badge, logo, or graphic
   floating in the empty white background area OUTSIDE the product's physical boundary?
   This is the only overlay violation that matters. Do NOT look at the product itself.
4. PRODUCT VISIBLE — is the product clearly identifiable?

For check 3: if the element sits on or within the product (box panel, label, pouch,
canister, wrapper) it is packaging — ignore it regardless of what it says. Only flag
something if it visibly sits in the white space outside the product's edge.
When in doubt, do NOT flag.
```

---

### 4. Title shortener (`lib/claude.ts` — `shortenTitle`)

Post-processing enforcement. Only called when the analysis prompt returns a proposed title > 50 chars.

**System:** none

**User:**
```
Shorten this Amazon product title to 50 characters or fewer. Keep brand, product
type, and the most important attribute (flavor or size). Return ONLY the shortened
title — no quotes, no explanation.

Title: {title}
Character limit: 50
Current length: {N} chars
```

If the response is still > 50 chars, word-boundary truncation is applied as a final fallback.

---

### 5. Dataset enrichment (`scripts/enrich.ts`)

One-time offline step. Two separate Haiku calls per product with missing fields.

**Brand inference:**
```
What is the brand name for this Amazon product? Reply with ONLY the brand name,
nothing else.

Title: {title}
Bullets: {top 3 bullets}
Category: {category}
```

**Category inference:**
```
What is the Amazon category breadcrumb for this product?
Format: "Top Level › Sub Level › Sub Sub Level".
Reply with ONLY the breadcrumb, nothing else.

Title: {title}
```

---

### 6. Markdown export (`lib/claude.ts` — `generateSummary`)

No LLM involved. Pure template function — user's exact edited text is slotted in verbatim.

---

## Scripts

```bash
npm run dev          # start dev server
npm run build        # production build
npm run seed         # score all products → data/scores.json
npx tsx scripts/enrich.ts   # deduplicate + enrich products.csv
```
