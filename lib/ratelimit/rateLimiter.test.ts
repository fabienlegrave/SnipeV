import { describe, it, expect, beforeEach } from 'vitest'
import { RateLimiter } from './rateLimiter'

describe('RateLimiter', () => {
  let limiter: RateLimiter

  beforeEach(() => {
    limiter = new RateLimiter({
      maxRequests: 5,
      windowMs: 1000
    })
  })

  it('should allow requests within limit', async () => {
    const mockRequest = {
      headers: {
        get: () => '127.0.0.1'
      }
    } as Request

    for (let i = 0; i < 5; i++) {
      const result = await limiter.check(mockRequest)
      expect(result.allowed).toBe(true)
    }
  })

  it('should block requests exceeding limit', async () => {
    const mockRequest = {
      headers: {
        get: () => '127.0.0.1'
      }
    } as Request

    for (let i = 0; i < 5; i++) {
      await limiter.check(mockRequest)
    }

    const result = await limiter.check(mockRequest)
    expect(result.allowed).toBe(false)
    expect(result.retryAfter).toBeGreaterThan(0)
  })

  it('should refill tokens over time', async () => {
    const mockRequest = {
      headers: {
        get: () => '127.0.0.1'
      }
    } as Request

    for (let i = 0; i < 5; i++) {
      await limiter.check(mockRequest)
    }

    await new Promise(resolve => setTimeout(resolve, 300))

    const result = await limiter.check(mockRequest)
    expect(result.allowed).toBe(true)
  })

  it('should track different keys separately', async () => {
    const mockRequest1 = {
      headers: {
        get: () => '127.0.0.1'
      }
    } as Request

    const mockRequest2 = {
      headers: {
        get: () => '192.168.1.1'
      }
    } as Request

    for (let i = 0; i < 5; i++) {
      await limiter.check(mockRequest1)
    }

    const result1 = await limiter.check(mockRequest1)
    const result2 = await limiter.check(mockRequest2)

    expect(result1.allowed).toBe(false)
    expect(result2.allowed).toBe(true)
  })

  it('should provide accurate remaining count', async () => {
    const mockRequest = {
      headers: {
        get: () => '127.0.0.1'
      }
    } as Request

    const result1 = await limiter.check(mockRequest)
    expect(result1.remaining).toBe(4)

    const result2 = await limiter.check(mockRequest)
    expect(result2.remaining).toBe(3)
  })
})
