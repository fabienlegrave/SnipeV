/**
 * Types pour le système de workers
 */

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
  lastHealthCheck?: number
}

export interface WorkerCommand<T = unknown> {
  type: 'scrape' | 'check-alerts' | 'generate-cookies' | 'custom'
  payload: T
  priority?: number
  retryCount?: number
}

export interface WorkerResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  workerId?: string
  duration?: number
}

export interface WorkerStats {
  totalWorkers: number
  availableWorkers: number
  bannedWorkers: number
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  averageResponseTime: number
}

export type LoadBalancingStrategy = 'round-robin' | 'least-loaded' | 'random' | 'priority'

export interface WorkerConfig {
  healthCheckInterval: number
  banDuration: number
  maxRetries: number
  timeout: number
  loadBalancingStrategy: LoadBalancingStrategy
}
