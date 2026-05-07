# Ally — Amazon Content Intelligence Dashboard

Ally is a skill built for [CommerceIQ's](https://commerceiq.ai) AI teammate. It helps brand managers identify and fix Amazon listing content violations before they cause suppression — and benchmarks every SKU against its top competitors to surface the highest-impact improvements first.

**Live:** https://ciq-ally.vercel.app &nbsp;|&nbsp; **Spec:** [docs/SPEC.md](docs/SPEC.md)

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

## Scripts

```bash
npm run dev          # start dev server
npm run build        # production build
npm run seed         # score all products → data/scores.json
npx tsx scripts/enrich.ts   # deduplicate + enrich products.csv
```
