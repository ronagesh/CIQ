import { NextResponse } from 'next/server'
import { getFeed } from '@/lib/feed'

export async function GET() {
  const data = getFeed()
  return NextResponse.json(data)
}
