import { NextRequest, NextResponse } from 'next/server'
import { globalSearchCache } from '@/lib/cache/searchCache'

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key')
    if (!apiKey || apiKey !== process.env.API_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { query, filters, all = false } = await request.json()

    if (all) {
      const success = await globalSearchCache.invalidateAll()
      return NextResponse.json({
        success,
        message: 'All cache invalidated'
      })
    }

    if (!query) {
      return NextResponse.json({
        error: 'Query is required unless all=true'
      }, { status: 400 })
    }

    const success = await globalSearchCache.invalidate(query, filters || {})

    return NextResponse.json({
      success,
      message: `Cache invalidated for query: ${query}`
    })
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || 'Unknown error'
    }, { status: 500 })
  }
}
