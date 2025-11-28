/**
 * Stratégie de retry avec backoff exponentiel
 */

import { logger } from '../logger'

export interface RetryOptions {
  maxRetries?: number
  initialDelayMs?: number
  maxDelayMs?: number
  backoffMultiplier?: number
  jitterFactor?: number
  retryableErrors?: (error: Error) => boolean
  onRetry?: (attempt: number, error: Error, delay: number) => void
}

export interface RetryResult<T> {
  success: boolean
  data?: T
  error?: Error
  attempts: number
  totalDuration: number
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'onRetry'>> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
  retryableErrors: () => true
}

export class ExponentialBackoff {
  private options: Required<Omit<RetryOptions, 'onRetry'>> & Pick<RetryOptions, 'onRetry'>

  constructor(options: RetryOptions = {}) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options
    }
  }

  private calculateDelay(attempt: number): number {
    const exponentialDelay = this.options.initialDelayMs * Math.pow(this.options.backoffMultiplier, attempt)
    const cappedDelay = Math.min(exponentialDelay, this.options.maxDelayMs)

    const jitter = cappedDelay * this.options.jitterFactor * (Math.random() - 0.5) * 2

    return Math.max(0, Math.floor(cappedDelay + jitter))
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async execute<T>(fn: () => Promise<T>, operationName = 'operation'): Promise<RetryResult<T>> {
    const startTime = Date.now()
    let lastError: Error | undefined

    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      try {
        const data = await fn()
        const duration = Date.now() - startTime

        if (attempt > 0) {
          logger.info(`✅ ${operationName} succeeded after ${attempt} retry(ies) (${duration}ms)`)
        }

        return {
          success: true,
          data,
          attempts: attempt + 1,
          totalDuration: duration
        }
      } catch (error) {
        lastError = error as Error

        const isLastAttempt = attempt === this.options.maxRetries
        const isRetryable = this.options.retryableErrors(lastError)

        if (isLastAttempt || !isRetryable) {
          const duration = Date.now() - startTime
          logger.error(`❌ ${operationName} failed after ${attempt + 1} attempt(s) (${duration}ms)`, lastError)

          return {
            success: false,
            error: lastError,
            attempts: attempt + 1,
            totalDuration: duration
          }
        }

        const delay = this.calculateDelay(attempt)
        logger.warn(`⚠️ ${operationName} failed (attempt ${attempt + 1}/${this.options.maxRetries + 1}), retrying in ${delay}ms: ${lastError.message}`)

        if (this.options.onRetry) {
          this.options.onRetry(attempt, lastError, delay)
        }

        await this.sleep(delay)
      }
    }

    const duration = Date.now() - startTime
    return {
      success: false,
      error: lastError || new Error('Unknown error'),
      attempts: this.options.maxRetries + 1,
      totalDuration: duration
    }
  }
}

export function isNetworkError(error: Error): boolean {
  const message = error.message.toLowerCase()
  return (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('etimedout') ||
    message.includes('fetch failed')
  )
}

export function isRetryableHttpError(error: Error): boolean {
  const message = error.message
  return (
    message.includes('429') || // Too Many Requests
    message.includes('500') || // Internal Server Error
    message.includes('502') || // Bad Gateway
    message.includes('503') || // Service Unavailable
    message.includes('504')    // Gateway Timeout
  )
}

export function isRetryableError(error: Error): boolean {
  return isNetworkError(error) || isRetryableHttpError(error)
}

export const globalRetryStrategy = new ExponentialBackoff({
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  jitterFactor: 0.2,
  retryableErrors: isRetryableError
})

export const aggressiveRetryStrategy = new ExponentialBackoff({
  maxRetries: 5,
  initialDelayMs: 500,
  maxDelayMs: 30000,
  backoffMultiplier: 2.5,
  jitterFactor: 0.3,
  retryableErrors: isRetryableError
})

export const conservativeRetryStrategy = new ExponentialBackoff({
  maxRetries: 2,
  initialDelayMs: 2000,
  maxDelayMs: 5000,
  backoffMultiplier: 1.5,
  jitterFactor: 0.1,
  retryableErrors: isRetryableError
})
