/**
 * Queue simple en mémoire pour les tâches asynchrones
 * Alternative légère à BullMQ/Redis pour commencer
 */

import { logger } from '../logger'
import { globalRetryStrategy } from '../retry/exponentialBackoff'

export interface QueueJob<T = unknown> {
  id: string
  type: string
  data: T
  priority: number
  attempts: number
  maxAttempts: number
  createdAt: number
  startedAt?: number
  completedAt?: number
  failedAt?: number
  error?: string
  result?: unknown
}

export interface QueueOptions {
  concurrency?: number
  retryAttempts?: number
  retryDelay?: number
  timeout?: number
}

export type JobProcessor<T = unknown> = (job: QueueJob<T>) => Promise<unknown>

export class SimpleQueue<T = unknown> {
  private jobs = new Map<string, QueueJob<T>>()
  private processors = new Map<string, JobProcessor<T>>()
  private running = new Set<string>()
  private options: Required<QueueOptions>
  private isProcessing = false

  constructor(options: QueueOptions = {}) {
    this.options = {
      concurrency: options.concurrency || 5,
      retryAttempts: options.retryAttempts || 3,
      retryDelay: options.retryDelay || 5000,
      timeout: options.timeout || 60000
    }
  }

  registerProcessor(jobType: string, processor: JobProcessor<T>): void {
    this.processors.set(jobType, processor)
    logger.info(`📋 Queue processor registered: ${jobType}`)
  }

  async add(jobType: string, data: T, options: { priority?: number; maxAttempts?: number } = {}): Promise<string> {
    const jobId = `${jobType}_${Date.now()}_${Math.random().toString(36).slice(2)}`

    const job: QueueJob<T> = {
      id: jobId,
      type: jobType,
      data,
      priority: options.priority || 0,
      attempts: 0,
      maxAttempts: options.maxAttempts || this.options.retryAttempts,
      createdAt: Date.now()
    }

    this.jobs.set(jobId, job)
    logger.debug(`📋 Job added to queue: ${jobId} (type: ${jobType})`)

    this.process()

    return jobId
  }

  private async process(): Promise<void> {
    if (this.isProcessing) return
    this.isProcessing = true

    while (this.running.size < this.options.concurrency) {
      const job = this.getNextJob()
      if (!job) break

      this.running.add(job.id)
      this.processJob(job)
    }

    this.isProcessing = false
  }

  private getNextJob(): QueueJob<T> | undefined {
    const pendingJobs = Array.from(this.jobs.values()).filter(
      job => !this.running.has(job.id) && !job.completedAt && !job.failedAt
    )

    if (pendingJobs.length === 0) return undefined

    return pendingJobs.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority
      return a.createdAt - b.createdAt
    })[0]
  }

  private async processJob(job: QueueJob<T>): Promise<void> {
    const processor = this.processors.get(job.type)

    if (!processor) {
      logger.error(`❌ No processor registered for job type: ${job.type}`)
      job.failedAt = Date.now()
      job.error = 'No processor registered'
      this.running.delete(job.id)
      this.process()
      return
    }

    job.attempts++
    job.startedAt = Date.now()

    logger.info(`🔄 Processing job: ${job.id} (attempt ${job.attempts}/${job.maxAttempts})`)

    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Job timeout')), this.options.timeout)
      })

      const result = await Promise.race([
        processor(job),
        timeoutPromise
      ])

      job.completedAt = Date.now()
      job.result = result

      const duration = job.completedAt - job.startedAt
      logger.info(`✅ Job completed: ${job.id} (${duration}ms)`)

    } catch (error) {
      const err = error as Error
      logger.error(`❌ Job failed: ${job.id} (attempt ${job.attempts}/${job.maxAttempts})`, err)

      if (job.attempts >= job.maxAttempts) {
        job.failedAt = Date.now()
        job.error = err.message
        logger.error(`❌ Job permanently failed: ${job.id}`)
      } else {
        setTimeout(() => {
          this.running.delete(job.id)
          this.process()
        }, this.options.retryDelay)
        return
      }
    }

    this.running.delete(job.id)
    this.process()
  }

  getJob(jobId: string): QueueJob<T> | undefined {
    return this.jobs.get(jobId)
  }

  getStats(): {
    total: number
    pending: number
    running: number
    completed: number
    failed: number
  } {
    const jobs = Array.from(this.jobs.values())

    return {
      total: jobs.length,
      pending: jobs.filter(j => !j.startedAt && !j.failedAt).length,
      running: this.running.size,
      completed: jobs.filter(j => j.completedAt).length,
      failed: jobs.filter(j => j.failedAt).length
    }
  }

  async waitForJob(jobId: string, timeoutMs = 60000): Promise<QueueJob<T> | undefined> {
    const startTime = Date.now()

    while (Date.now() - startTime < timeoutMs) {
      const job = this.jobs.get(jobId)
      if (job && (job.completedAt || job.failedAt)) {
        return job
      }
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    return undefined
  }

  clear(): void {
    this.jobs.clear()
    this.running.clear()
    logger.info('📋 Queue cleared')
  }

  cleanup(olderThanMs = 24 * 60 * 60 * 1000): number {
    const now = Date.now()
    let removed = 0

    for (const [id, job] of this.jobs.entries()) {
      const isOld = now - job.createdAt > olderThanMs
      const isFinished = job.completedAt || job.failedAt

      if (isOld && isFinished) {
        this.jobs.delete(id)
        removed++
      }
    }

    if (removed > 0) {
      logger.info(`📋 Cleaned up ${removed} old jobs from queue`)
    }

    return removed
  }
}

export const globalQueue = new SimpleQueue({
  concurrency: 5,
  retryAttempts: 3,
  retryDelay: 5000,
  timeout: 120000
})

globalQueue.registerProcessor('check-alerts', async (job) => {
  const { checkAlertsStandalone } = await import('../alerts/checkAlertsStandalone')
  return await checkAlertsStandalone(job.data as string)
})

globalQueue.registerProcessor('scrape-search', async (job) => {
  const { searchWithFailover } = await import('../scrape/searchWithFailover')
  const { query, options } = job.data as { query: string; options: Record<string, unknown> }
  return await searchWithFailover(query, options)
})

setInterval(() => {
  globalQueue.cleanup()
}, 60 * 60 * 1000)
