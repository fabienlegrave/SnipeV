/**
 * Gestionnaire de webhooks pour les notifications d'alertes
 */

import { logger } from '../logger'
import { globalRetryStrategy } from '../retry/exponentialBackoff'
import type { AlertMatch } from '../types/alerts'
import type { ApiItem } from '../types/core'

export interface WebhookConfig {
  id: string
  url: string
  secret?: string
  events: WebhookEvent[]
  isActive: boolean
  headers?: Record<string, string>
  retryConfig?: {
    maxRetries: number
    timeoutMs: number
  }
}

export type WebhookEvent = 'alert.match' | 'alert.created' | 'alert.updated' | 'item.favorited' | 'scrape.completed'

export interface WebhookPayload {
  event: WebhookEvent
  timestamp: string
  data: unknown
  signature?: string
}

export interface AlertMatchPayload {
  alert: {
    id: number
    title: string
    maxPrice: number
    platform: string | null
  }
  item: {
    id: number
    title: string
    price: number
    url: string
    photos: string[]
    brand: string | null
    size: string | null
  }
  matchReason: string
}

export class WebhookManager {
  private webhooks: Map<string, WebhookConfig> = new Map()

  register(config: WebhookConfig): void {
    this.webhooks.set(config.id, config)
    logger.info(`📡 Webhook registered: ${config.id} -> ${config.url}`)
  }

  unregister(webhookId: string): void {
    this.webhooks.delete(webhookId)
    logger.info(`📡 Webhook unregistered: ${webhookId}`)
  }

  getAll(): WebhookConfig[] {
    return Array.from(this.webhooks.values())
  }

  getActiveWebhooks(event: WebhookEvent): WebhookConfig[] {
    return Array.from(this.webhooks.values()).filter(
      webhook => webhook.isActive && webhook.events.includes(event)
    )
  }

  private async sendWebhook(webhook: WebhookConfig, payload: WebhookPayload): Promise<boolean> {
    const maxRetries = webhook.retryConfig?.maxRetries || 3
    const timeoutMs = webhook.retryConfig?.timeoutMs || 10000

    const result = await globalRetryStrategy.execute(async () => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'User-Agent': 'Vinted-Scraper-Webhook/1.0',
          ...webhook.headers
        }

        if (webhook.secret) {
          headers['X-Webhook-Signature'] = await this.generateSignature(payload, webhook.secret)
        }

        const response = await fetch(webhook.url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal
        })

        if (!response.ok) {
          throw new Error(`Webhook failed with status ${response.status}`)
        }

        return response.json().catch(() => ({}))
      } finally {
        clearTimeout(timeoutId)
      }
    }, `webhook:${webhook.id}`)

    return result.success
  }

  private async generateSignature(payload: WebhookPayload, secret: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(JSON.stringify(payload))
    const key = encoder.encode(secret)

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )

    const signature = await crypto.subtle.sign('HMAC', cryptoKey, data)
    return Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }

  async notifyAlertMatch(match: AlertMatch): Promise<{ sent: number; failed: number }> {
    const webhooks = this.getActiveWebhooks('alert.match')

    if (webhooks.length === 0) {
      return { sent: 0, failed: 0 }
    }

    const payload: WebhookPayload = {
      event: 'alert.match',
      timestamp: new Date().toISOString(),
      data: this.formatAlertMatchPayload(match)
    }

    let sent = 0
    let failed = 0

    const promises = webhooks.map(async webhook => {
      const success = await this.sendWebhook(webhook, payload)
      if (success) {
        sent++
        logger.info(`✅ Webhook sent successfully: ${webhook.id}`)
      } else {
        failed++
        logger.error(`❌ Webhook failed: ${webhook.id}`)
      }
    })

    await Promise.allSettled(promises)

    return { sent, failed }
  }

  private formatAlertMatchPayload(match: AlertMatch): AlertMatchPayload {
    const item = match.item
    return {
      alert: {
        id: match.alertId,
        title: match.alertTitle,
        maxPrice: 0,
        platform: null
      },
      item: {
        id: item.id,
        title: item.title,
        price: item.price?.amount || 0,
        url: item.url || `https://www.vinted.fr/items/${item.id}`,
        photos: item.photos?.map(p => p.url || p.full_size_url).filter(Boolean) || [],
        brand: item.brand || null,
        size: item.size_title || null
      },
      matchReason: match.matchReason
    }
  }

  async testWebhook(webhookId: string): Promise<{ success: boolean; error?: string }> {
    const webhook = this.webhooks.get(webhookId)

    if (!webhook) {
      return { success: false, error: 'Webhook not found' }
    }

    const payload: WebhookPayload = {
      event: 'alert.match',
      timestamp: new Date().toISOString(),
      data: {
        test: true,
        message: 'This is a test webhook'
      }
    }

    try {
      const success = await this.sendWebhook(webhook, payload)
      return { success }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }
}

export const globalWebhookManager = new WebhookManager()

if (process.env.DISCORD_WEBHOOK_URL) {
  globalWebhookManager.register({
    id: 'discord-default',
    url: process.env.DISCORD_WEBHOOK_URL,
    events: ['alert.match'],
    isActive: true,
    headers: {
      'Content-Type': 'application/json'
    }
  })
}

if (process.env.SLACK_WEBHOOK_URL) {
  globalWebhookManager.register({
    id: 'slack-default',
    url: process.env.SLACK_WEBHOOK_URL,
    events: ['alert.match'],
    isActive: true
  })
}
