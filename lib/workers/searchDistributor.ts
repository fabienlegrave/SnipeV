import { logger } from '../logger'
import type { SearchResult } from '../scrape/unifiedSearch'

export interface WorkerNode {
  id: string
  name: string
  region: string
  url: string
  isHealthy: boolean
  isBanned: boolean
  bannedUntil?: number
  lastUsed?: number
  requestCount: number
  successCount: number
  errorCount: number
  lastError?: string
  currentLoad: number
}

export interface DistributorConfig {
  workers: WorkerNode[]
  strategy: 'round-robin' | 'random' | 'least-loaded' | 'health-based'
  maxConcurrentRequests: number
  banDuration: number
  timeout: number
}

export interface SearchTask {
  searchText: string
  options: {
    priceFrom?: number
    priceTo?: number
    limit?: number
    minRelevanceScore?: number
  }
}

const DEFAULT_CONFIG: DistributorConfig = {
  workers: [
    {
      id: 'worker-fr',
      name: 'Worker FR',
      region: 'cdg',
      url: process.env.WORKER_FR_URL || 'http://worker-fr.internal:3000',
      isHealthy: true,
      isBanned: false,
      requestCount: 0,
      successCount: 0,
      errorCount: 0,
      currentLoad: 0
    },
    {
      id: 'worker-us',
      name: 'Worker US',
      region: 'iad',
      url: process.env.WORKER_US_URL || 'http://worker-us.internal:3000',
      isHealthy: true,
      isBanned: false,
      requestCount: 0,
      successCount: 0,
      errorCount: 0,
      currentLoad: 0
    },
    {
      id: 'worker-nl',
      name: 'Worker NL',
      region: 'ams',
      url: process.env.WORKER_NL_URL || 'http://worker-nl.internal:3000',
      isHealthy: true,
      isBanned: false,
      requestCount: 0,
      successCount: 0,
      errorCount: 0,
      currentLoad: 0
    },
    {
      id: 'worker-uk',
      name: 'Worker UK',
      region: 'lhr',
      url: process.env.WORKER_UK_URL || 'http://worker-uk.internal:3000',
      isHealthy: true,
      isBanned: false,
      requestCount: 0,
      successCount: 0,
      errorCount: 0,
      currentLoad: 0
    }
  ],
  strategy: (process.env.DISTRIBUTOR_STRATEGY as any) || 'least-loaded',
  maxConcurrentRequests: parseInt(process.env.MAX_CONCURRENT_REQUESTS || '4', 10),
  banDuration: parseInt(process.env.WORKER_BAN_DURATION_MS || '1800000', 10),
  timeout: parseInt(process.env.WORKER_TIMEOUT_MS || '60000', 10)
}

export class SearchDistributor {
  private config: DistributorConfig
  private currentWorkerIndex = 0
  private activeRequests = new Map<string, number>()

  constructor(config?: Partial<DistributorConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config
    }
  }

  private isWorkerAvailable(worker: WorkerNode): boolean {
    if (!worker.isHealthy) return false

    if (worker.isBanned) {
      const now = Date.now()
      if (worker.bannedUntil && now < worker.bannedUntil) {
        return false
      } else {
        worker.isBanned = false
        worker.bannedUntil = undefined
        logger.info(`✅ ${worker.name} réactivé après ban`)
        return true
      }
    }

    if (worker.currentLoad >= this.config.maxConcurrentRequests) {
      return false
    }

    return true
  }

  private banWorker(worker: WorkerNode): void {
    worker.isBanned = true
    worker.bannedUntil = Date.now() + this.config.banDuration
    logger.warn(`🚫 ${worker.name} banni pour ${this.config.banDuration / 1000}s`)
  }

  private selectWorker(): WorkerNode | null {
    const availableWorkers = this.config.workers.filter(w => this.isWorkerAvailable(w))

    if (availableWorkers.length === 0) {
      logger.error('❌ Aucun worker disponible')
      return null
    }

    switch (this.config.strategy) {
      case 'round-robin': {
        let attempts = 0
        while (attempts < this.config.workers.length) {
          const worker = this.config.workers[this.currentWorkerIndex % this.config.workers.length]
          this.currentWorkerIndex++

          if (this.isWorkerAvailable(worker)) {
            return worker
          }
          attempts++
        }
        return availableWorkers[0]
      }

      case 'random': {
        const randomIndex = Math.floor(Math.random() * availableWorkers.length)
        return availableWorkers[randomIndex]
      }

      case 'least-loaded': {
        return availableWorkers.reduce((prev, curr) =>
          curr.currentLoad < prev.currentLoad ? curr : prev
        )
      }

      case 'health-based': {
        return availableWorkers.reduce((prev, curr) => {
          const prevRatio = prev.successCount / Math.max(prev.requestCount, 1)
          const currRatio = curr.successCount / Math.max(curr.requestCount, 1)
          return currRatio > prevRatio ? curr : prev
        })
      }

      default:
        return availableWorkers[0]
    }
  }

  async distributeSearch(task: SearchTask, maxRetries = 3): Promise<SearchResult> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const worker = this.selectWorker()

      if (!worker) {
        throw new Error('NO_WORKER_AVAILABLE')
      }

      logger.info(`🔄 Distribution recherche à ${worker.name} (tentative ${attempt + 1}/${maxRetries})`)

      try {
        worker.requestCount++
        worker.currentLoad++
        worker.lastUsed = Date.now()

        const result = await this.sendSearchToWorker(worker, task)

        worker.successCount++
        worker.currentLoad--

        logger.info(`✅ Recherche réussie via ${worker.name}`)
        return result

      } catch (error: unknown) {
        worker.errorCount++
        worker.currentLoad = Math.max(0, worker.currentLoad - 1)
        worker.lastError = error instanceof Error ? error.message : String(error)

        const errorMessage = worker.lastError

        if (errorMessage.includes('HTTP 403') || errorMessage.includes('HTTP 401')) {
          this.banWorker(worker)

          if (attempt < maxRetries - 1) {
            logger.warn(`⚠️ Erreur 403/401, tentative avec un autre worker...`)
            continue
          }
        }

        if (worker.errorCount > 5 && worker.errorCount > worker.successCount) {
          worker.isHealthy = false
          logger.warn(`⚠️ ${worker.name} marqué comme unhealthy`)
        }

        if (attempt < maxRetries - 1) {
          const delay = Math.min(2000 * Math.pow(2, attempt), 10000)
          logger.info(`⏳ Attente de ${delay / 1000}s avant nouvelle tentative...`)
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }

        throw error
      }
    }

    throw new Error(`SEARCH_FAILED après ${maxRetries} tentatives`)
  }

  private async sendSearchToWorker(worker: WorkerNode, task: SearchTask): Promise<SearchResult> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout)

    try {
      const response = await fetch(`${worker.url}/api/v1/scrape/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.API_SECRET || ''
        },
        body: JSON.stringify({
          query: task.searchText,
          ...task.options
        }),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const items = await response.json()

      return {
        items: Array.isArray(items) ? items : [],
        hasMore: false,
        metadata: {
          pagesSearched: 1,
          totalItemsFound: Array.isArray(items) ? items.length : 0
        }
      }
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  }

  async distributeBatch(tasks: SearchTask[], concurrency?: number): Promise<SearchResult[]> {
    const maxConcurrency = concurrency || this.config.maxConcurrentRequests
    const results: SearchResult[] = []
    const queue = [...tasks]

    logger.info(`📦 Distribution batch de ${tasks.length} recherches (concurrence: ${maxConcurrency})`)

    while (queue.length > 0) {
      const batch = queue.splice(0, maxConcurrency)
      const batchResults = await Promise.allSettled(
        batch.map(task => this.distributeSearch(task))
      )

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value)
        } else {
          logger.error('Erreur batch search', result.reason)
        }
      }
    }

    logger.info(`✅ Batch terminé: ${results.length}/${tasks.length} réussies`)
    return results
  }

  getStats() {
    const availableWorkers = this.config.workers.filter(w => this.isWorkerAvailable(w))
    const bannedWorkers = this.config.workers.filter(w => w.isBanned)
    const unhealthyWorkers = this.config.workers.filter(w => !w.isHealthy)

    return {
      totalWorkers: this.config.workers.length,
      availableWorkers: availableWorkers.length,
      bannedWorkers: bannedWorkers.length,
      unhealthyWorkers: unhealthyWorkers.length,
      strategy: this.config.strategy,
      maxConcurrentRequests: this.config.maxConcurrentRequests,
      workers: this.config.workers.map(w => ({
        id: w.id,
        name: w.name,
        region: w.region,
        isHealthy: w.isHealthy,
        isBanned: w.isBanned,
        requestCount: w.requestCount,
        successCount: w.successCount,
        errorCount: w.errorCount,
        currentLoad: w.currentLoad,
        successRate: w.requestCount > 0 ? (w.successCount / w.requestCount) * 100 : 0,
        lastError: w.lastError
      }))
    }
  }

  resetWorker(workerId: string): boolean {
    const worker = this.config.workers.find(w => w.id === workerId)
    if (!worker) return false

    worker.isBanned = false
    worker.bannedUntil = undefined
    worker.isHealthy = true
    worker.lastError = undefined
    worker.currentLoad = 0

    logger.info(`✅ ${worker.name} réinitialisé`)
    return true
  }

  resetAllWorkers(): void {
    this.config.workers.forEach(w => {
      w.isBanned = false
      w.bannedUntil = undefined
      w.isHealthy = true
      w.lastError = undefined
      w.currentLoad = 0
    })
    logger.info('✅ Tous les workers réinitialisés')
  }
}

export const globalDistributor = new SearchDistributor()
