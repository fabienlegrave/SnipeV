/**
 * Middleware Next.js pour le rate limiting
 */

import { NextRequest, NextResponse } from 'next/server'
import { RateLimiter } from './rateLimiter'

export function createRateLimitMiddleware(limiter: RateLimiter) {
  return async (request: NextRequest): Promise<NextResponse | null> => {
    const result = await limiter.check(request)

    const response = result.allowed
      ? null
      : NextResponse.json(
          {
            error: 'Too Many Requests',
            message: 'Rate limit exceeded. Please try again later.',
            retryAfter: result.retryAfter
          },
          { status: 429 }
        )

    if (response) {
      response.headers.set('X-RateLimit-Limit', result.limit.toString())
      response.headers.set('X-RateLimit-Remaining', result.remaining.toString())
      response.headers.set('X-RateLimit-Reset', result.reset.toString())
      if (result.retryAfter) {
        response.headers.set('Retry-After', result.retryAfter.toString())
      }
    }

    return response
  }
}

export function addRateLimitHeaders(response: NextResponse, result: { limit: number; remaining: number; reset: number }): NextResponse {
  response.headers.set('X-RateLimit-Limit', result.limit.toString())
  response.headers.set('X-RateLimit-Remaining', result.remaining.toString())
  response.headers.set('X-RateLimit-Reset', result.reset.toString())
  return response
}
