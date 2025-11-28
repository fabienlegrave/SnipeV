import { NextRequest, NextResponse } from 'next/server'
import { globalSearchCache } from '@/lib/cache/searchCache'
import { globalDistributor } from '@/lib/workers/searchDistributor'
import { SearchFailoverManager } from '@/lib/scrape/searchWithFailover'

export async function GET(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key')
    if (!apiKey || apiKey !== process.env.API_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const metrics = {
      timestamp: new Date().toISOString(),
      cache: await globalSearchCache.getStats(),
      distributor: globalDistributor.getStats(),
      failover: SearchFailoverManager.getStats(),
      process: {
        uptime: process.uptime(),
        memory: {
          heapUsed: process.memoryUsage().heapUsed,
          heapTotal: process.memoryUsage().heapTotal,
          rss: process.memoryUsage().rss,
          external: process.memoryUsage().external
        },
        cpu: process.cpuUsage()
      }
    }

    return NextResponse.json({
      success: true,
      metrics
    })
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || 'Unknown error'
    }, { status: 500 })
  }
}
