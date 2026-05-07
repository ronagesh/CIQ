// Amazon Product Listing & Content Guide — key rules extracted for LLM grounding
export const STYLE_GUIDE = `
# Amazon Product Listing & Content Guide (Pet Supplies / General)

## Product Title
- Capitalise the first letter of each word (except conjunctions: and, or, for; articles: the, a, an; prepositions <5 letters: in, on, over, with)
- Use numerals (2 instead of two)
- If bundled, state value in parenthesis as (pack of X)
- 50 characters maximum
- Do NOT use ALL CAPS
- Do NOT include price, quantity, seller info, or promotional messages (sale, free shipping)
- Do NOT include symbols (! * $ ?)
- Do NOT include subjective commentary (Hot Item, Best Seller)
- Do NOT include Type 1 High ASCII characters (®, ©, ™) or special characters
- Format: [Brand] + [sub-brand if applicable] + [product type] + [style] + [quantity/size if applicable]
- Suppression risk: titles that violate character limits or include prohibited characters can cause listing suppression

## Product Images
- White background required; no coloured backgrounds or lifestyle pictures as main image
- 500px minimum; 1000px preferred (enables zoom)
- Product must occupy at least 80% of image area
- JPEG format, RGB encoding (not CMYK)
- No borders, watermarks, text, or decorations on main image
- No placeholder images
- No promotional text (sale, free ship) on images
- No erotic images, drawings, or animated images
- Suppression/suspension risk: bad images will be removed and may result in a suspension of your SellerCentral account

## Key Product Features (Bullet Points)
- Highlight the five key features customers should consider
- Begin each bullet point with a capital letter
- Write with sentence fragments; do NOT include ending punctuation
- Do NOT include promotional or pricing information
- Do NOT include delivery or company information
- Do NOT use hyphens, symbols, periods, or exclamation points
- Write all numbers as numerals
- Separate multiple phrases with semicolons
- Spell out measurements (inch, feet)
- Be as specific as possible; avoid vague statements
- No company-specific information

## Product Description
- Limited to 2000 characters
- Describe major product features including size, used-for, style
- Include accurate dimensions, care instructions, warranty information
- Use correct grammar and complete sentences
- Be sure product claims are truthful and substantiated
- Do NOT include seller name, email, website URL, or company-specific information
- Do NOT include promotional language (sale, free shipping)
- Do NOT write in ALL CAPS; use sentence case

## Search Terms
- Up to 5 search term fields of 50 characters each (250 total)
- Use single words, not phrases
- Do not repeat words already in the title
- Think like a customer — use synonyms and related terms

## Violation Consequences
- Listing suppression (removed from search): title violations, image violations
- Listing removal (ASIN taken down): prohibited content, false claims
- Account health warnings / SellerCentral account suspension: repeated violations, especially image rule violations
`
