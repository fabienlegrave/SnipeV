import { NextRequest, NextResponse } from 'next/server'
import { globalWebhookManager } from '@/lib/webhooks/webhookManager'
import type { WebhookConfig } from '@/lib/webhooks/webhookManager'

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key')
    if (!apiKey || apiKey !== process.env.API_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const config: WebhookConfig = await request.json()

    if (!config.id || !config.url || !config.events) {
      return NextResponse.json({
        error: 'Missing required fields: id, url, events'
      }, { status: 400 })
    }

    globalWebhookManager.register(config)

    return NextResponse.json({
      success: true,
      webhook: config
    })
  } catch (error: unknown) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key')
    if (!apiKey || apiKey !== process.env.API_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const webhooks = globalWebhookManager.getAll()

    return NextResponse.json({
      success: true,
      webhooks
    })
  } catch (error: unknown) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
