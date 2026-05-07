import fs from 'fs'
import path from 'path'
import type { IssueCard } from './types'

export interface FeedData {
  issues: IssueCard[]
  cachedAt: number
}

export function getFeed(): FeedData {
  const scorePath = path.join(process.cwd(), 'data', 'scores.json')
  if (!fs.existsSync(scorePath)) {
    return { issues: [], cachedAt: 0 }
  }
  const raw = fs.readFileSync(scorePath, 'utf-8')
  return JSON.parse(raw) as FeedData
}
