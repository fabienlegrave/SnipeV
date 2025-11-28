import { NextRequest, NextResponse } from 'next/server'
import { globalQueue } from '@/lib/queue/simpleQueue'

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key')
    if (!apiKey || apiKey !== process.env.API_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { type, data, priority, maxAttempts } = await request.json()

    if (!type || !data) {
      return NextResponse.json({
        error: 'Missing required fields: type, data'
      }, { status: 400 })
    }

    const jobId = await globalQueue.add(type, data, { priority, maxAttempts })

    return NextResponse.json({
      success: true,
      jobId
    })
  } catch (error: unknown) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
