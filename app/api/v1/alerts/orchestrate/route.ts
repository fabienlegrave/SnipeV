import { NextRequest, NextResponse } from 'next/server'
import { globalAlertsOrchestrator } from '@/lib/alerts/alertsOrchestrator'

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key')
    if (!apiKey || apiKey !== process.env.API_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { fullCookies, resetCacheStats = false } = await request.json()

    if (resetCacheStats) {
      globalAlertsOrchestrator.resetCacheStats()
    }

    const result = await globalAlertsOrchestrator.checkAllAlerts({
      fullCookies
    })

    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || 'Unknown error'
    }, { status: 500 })
  }
}
