import { describe, it, expect, vi } from 'vitest'
import { ExponentialBackoff, isRetryableError } from './exponentialBackoff'

describe('ExponentialBackoff', () => {
  it('should succeed on first attempt', async () => {
    const backoff = new ExponentialBackoff({ maxRetries: 3 })
    const fn = vi.fn().mockResolvedValue('success')

    const result = await backoff.execute(fn)

    expect(result.success).toBe(true)
    expect(result.data).toBe('success')
    expect(result.attempts).toBe(1)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('should retry on failure', async () => {
    const backoff = new ExponentialBackoff({
      maxRetries: 2,
      initialDelayMs: 10
    })

    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockRejectedValueOnce(new Error('Fail 2'))
      .mockResolvedValue('success')

    const result = await backoff.execute(fn)

    expect(result.success).toBe(true)
    expect(result.attempts).toBe(3)
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('should fail after max retries', async () => {
    const backoff = new ExponentialBackoff({
      maxRetries: 2,
      initialDelayMs: 10
    })

    const fn = vi.fn().mockRejectedValue(new Error('Always fails'))

    const result = await backoff.execute(fn)

    expect(result.success).toBe(false)
    expect(result.error?.message).toBe('Always fails')
    expect(result.attempts).toBe(3)
  })

  it('should not retry non-retryable errors', async () => {
    const backoff = new ExponentialBackoff({
      maxRetries: 3,
      initialDelayMs: 10,
      retryableErrors: (error) => !error.message.includes('fatal')
    })

    const fn = vi.fn().mockRejectedValue(new Error('fatal error'))

    const result = await backoff.execute(fn)

    expect(result.success).toBe(false)
    expect(result.attempts).toBe(1)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('isRetryableError', () => {
  it('should identify network errors', () => {
    expect(isRetryableError(new Error('network timeout'))).toBe(true)
    expect(isRetryableError(new Error('ECONNREFUSED'))).toBe(true)
    expect(isRetryableError(new Error('fetch failed'))).toBe(true)
  })

  it('should identify retryable HTTP errors', () => {
    expect(isRetryableError(new Error('429 Too Many Requests'))).toBe(true)
    expect(isRetryableError(new Error('500 Internal Server Error'))).toBe(true)
    expect(isRetryableError(new Error('503 Service Unavailable'))).toBe(true)
  })

  it('should not retry client errors', () => {
    expect(isRetryableError(new Error('400 Bad Request'))).toBe(false)
    expect(isRetryableError(new Error('401 Unauthorized'))).toBe(false)
    expect(isRetryableError(new Error('404 Not Found'))).toBe(false)
  })
})
