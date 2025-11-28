import { NextRequest, NextResponse } from 'next/server'
import { globalDistributor } from '@/lib/workers/searchDistributor'

export async function GET(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key')
    if (!apiKey || apiKey !== process.env.API_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const stats = globalDistributor.getStats()

    return NextResponse.json({
      success: true,
      stats
    })
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || 'Unknown error'
    }, { status: 500 })
  }
}
