import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { globalSearchCache } from '@/lib/cache/searchCache'
import { SearchFailoverManager } from '@/lib/scrape/searchWithFailover'

export async function GET(request: NextRequest) {
  try {
    const health: any = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      components: {}
    }

    // Database
    try {
      if (supabase) {
        const { error } = await supabase.from('vinted_credentials').select('id').limit(1)
        health.components.database = {
          status: error ? 'unhealthy' : 'healthy',
          error: error?.message
        }
      } else {
        health.components.database = {
          status: 'unavailable'
        }
      }
    } catch (error) {
      health.components.database = {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : String(error)
      }
    }

    // Cache
    try {
      const cacheStats = await globalSearchCache.getStats()
      health.components.cache = {
        status: 'healthy',
        stats: cacheStats
      }
    } catch (error) {
      health.components.cache = {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : String(error)
      }
    }

    // Search Failover
    try {
      const failoverStats = SearchFailoverManager.getStats()
      health.components.searchFailover = {
        status: failoverStats.consecutive403 >= 3 ? 'warning' : 'healthy',
        stats: failoverStats
      }
    } catch (error) {
      health.components.searchFailover = {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : String(error)
      }
    }

    // Memory
    const memUsage = process.memoryUsage()
    health.components.memory = {
      status: 'healthy',
      heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
      heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      rss: `${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`,
      external: `${(memUsage.external / 1024 / 1024).toFixed(2)} MB`
    }

    // Environment
    health.environment = {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      region: process.env.FLY_REGION || 'local',
      appName: process.env.FLY_APP_NAME || 'local'
    }

    const unhealthyComponents = Object.values(health.components).filter(
      (c: any) => c.status === 'unhealthy'
    )

    if (unhealthyComponents.length > 0) {
      health.status = 'degraded'
    }

    return NextResponse.json(health)
  } catch (error: any) {
    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message || 'Unknown error'
    }, { status: 500 })
  }
}
