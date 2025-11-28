import { NextRequest, NextResponse } from 'next/server'
import { globalQueue } from '@/lib/queue/simpleQueue'

export async function GET(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key')
    if (!apiKey || apiKey !== process.env.API_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const jobId = request.nextUrl.searchParams.get('jobId')

    if (jobId) {
      const job = globalQueue.getJob(jobId)
      if (!job) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 })
      }

      return NextResponse.json({
        success: true,
        job
      })
    }

    const stats = globalQueue.getStats()

    return NextResponse.json({
      success: true,
      stats
    })
  } catch (error: unknown) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
