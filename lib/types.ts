export interface RawProduct {
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

export interface Product {
  id: string
  title: string
  universe: string
  images: string[]
  bullets: string[]
  minRankSearch: number | null
  avgRankSearch: number | null
  minRankCategory: number | null
  avgRankCategory: number | null
  categoryNode: string
  brand: string
  description: string
  // enriched fields
  inferredBrand?: string
  inferredCategory?: string
  enrichmentConfidence?: 'high' | 'low'
}

export interface QuantitativeScores {
  titleLength: number
  titleLengthMax: number
  bulletCount: number
  bulletCountTarget: number
  descriptionLength: number
  descriptionLengthMax: number
  imageCount: number
}

export type SeverityLevel = 'high' | 'medium' | 'low'

export interface IssueCard {
  productId: string
  productTitle: string
  brand: string
  issueType: string
  severity: SeverityLevel
  suppressionRisk: boolean
  suppressionConsequence?: string
  rationale: string
  quantitative: QuantitativeScores
  competitorAvgQuantitative?: QuantitativeScores
}

export interface Suggestion {
  dimension: string
  currentText: string
  proposedText: string
  guidelineCitation: string
  competitorReference: string
  suppressionRisk: boolean
  suppressionConsequence?: string
}

export interface ImageFinding {
  check: string
  compliant: boolean
  detail: string
  suppressionRisk: boolean
}

export interface ImageAnalysis {
  productId: string
  imageUrl: string
  findings: ImageFinding[]
  overallCompliant: boolean
  suggestion: string | null
  competitorComparison: string
}

export interface ReportData {
  product: Product
  competitors: Product[]
  quantitative: QuantitativeScores
  competitorAvgQuantitative: QuantitativeScores
  suggestions: Suggestion[]
}
