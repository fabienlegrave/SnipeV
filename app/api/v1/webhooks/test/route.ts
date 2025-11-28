import { NextRequest, NextResponse } from 'next/server'
import { globalWebhookManager } from '@/lib/webhooks/webhookManager'

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key')
    if (!apiKey || apiKey !== process.env.API_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { webhookId } = await request.json()

    if (!webhookId) {
      return NextResponse.json({
        error: 'Missing required field: webhookId'
      }, { status: 400 })
    }

    const result = await globalWebhookManager.testWebhook(webhookId)

    return NextResponse.json({
      success: result.success,
      error: result.error
    })
  } catch (error: unknown) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
