/**
 * Rate Limiter en mémoire avec support multi-clés
 * Utilise un algorithme de token bucket pour un rate limiting fluide
 */

import { logger } from '../logger'

interface RateLimitEntry {
  tokens: number
  lastRefill: number
  requestCount: number
}

interface RateLimitConfig {
  maxRequests: number
  windowMs: number
  keyGenerator?: (req: Request) => string
}

export class RateLimiter {
  private requests = new Map<string, RateLimitEntry>()
  private config: Required<RateLimitConfig>
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor(config: RateLimitConfig) {
    this.config = {
      maxRequests: config.maxRequests,
      windowMs: config.windowMs,
      keyGenerator: config.keyGenerator || this.defaultKeyGenerator
    }

    this.startCleanup()
  }

  private defaultKeyGenerator(req: Request): string {
    const forwarded = req.headers.get('x-forwarded-for')
    const ip = forwarded ? forwarded.split(',')[0] : req.headers.get('x-real-ip') || 'unknown'
    return `ip:${ip}`
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup()
    }, this.config.windowMs)
  }

  private cleanup(): void {
    const now = Date.now()
    const threshold = now - this.config.windowMs * 2

    let removed = 0
    for (const [key, entry] of this.requests.entries()) {
      if (entry.lastRefill < threshold) {
        this.requests.delete(key)
        removed++
      }
    }

    if (removed > 0) {
      logger.debug(`Rate limiter cleanup: removed ${removed} expired entries`)
    }
  }

  async check(req: Request): Promise<{ allowed: boolean; limit: number; remaining: number; reset: number; retryAfter?: number }> {
    const key = this.config.keyGenerator(req)
    const now = Date.now()

    let entry = this.requests.get(key)

    if (!entry) {
      entry = {
        tokens: this.config.maxRequests,
        lastRefill: now,
        requestCount: 0
      }
      this.requests.set(key, entry)
    }

    const timePassed = now - entry.lastRefill
    const refillAmount = (timePassed / this.config.windowMs) * this.config.maxRequests
    entry.tokens = Math.min(this.config.maxRequests, entry.tokens + refillAmount)
    entry.lastRefill = now

    const allowed = entry.tokens >= 1

    if (allowed) {
      entry.tokens -= 1
      entry.requestCount++
    }

    const remaining = Math.floor(entry.tokens)
    const resetTime = now + ((1 - (entry.tokens % 1)) * this.config.windowMs / this.config.maxRequests)
    const retryAfter = allowed ? undefined : Math.ceil((1 - entry.tokens) * this.config.windowMs / this.config.maxRequests / 1000)

    return {
      allowed,
      limit: this.config.maxRequests,
      remaining: Math.max(0, remaining),
      reset: Math.ceil(resetTime / 1000),
      retryAfter
    }
  }

  getStats(): { totalKeys: number; totalRequests: number } {
    let totalRequests = 0
    for (const entry of this.requests.values()) {
      totalRequests += entry.requestCount
    }

    return {
      totalKeys: this.requests.size,
      totalRequests
    }
  }

  reset(key?: string): void {
    if (key) {
      this.requests.delete(key)
    } else {
      this.requests.clear()
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.requests.clear()
  }
}

export const globalRateLimiter = new RateLimiter({
  maxRequests: 100,
  windowMs: 60 * 1000 // 100 requêtes par minute
})

export const strictRateLimiter = new RateLimiter({
  maxRequests: 10,
  windowMs: 60 * 1000 // 10 requêtes par minute pour les endpoints sensibles
})

export function createApiKeyLimiter(): RateLimiter {
  return new RateLimiter({
    maxRequests: 1000,
    windowMs: 60 * 1000,
    keyGenerator: (req: Request) => {
      const apiKey = req.headers.get('x-api-key')
      return apiKey ? `apikey:${apiKey}` : 'anonymous'
    }
  })
}
