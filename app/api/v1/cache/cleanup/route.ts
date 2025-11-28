import { NextRequest, NextResponse } from 'next/server'
import { globalSearchCache } from '@/lib/cache/searchCache'

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key')
    if (!apiKey || apiKey !== process.env.API_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const cleaned = await globalSearchCache.cleanup()

    return NextResponse.json({
      success: true,
      cleaned
    })
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || 'Unknown error'
    }, { status: 500 })
  }
}
