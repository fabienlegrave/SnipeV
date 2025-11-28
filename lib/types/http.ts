/**
 * Types HTTP pour les réponses API et les erreurs
 */

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> extends ApiResponse<T> {
  page?: number
  limit?: number
  total?: number
  hasMore?: boolean
}

export interface ErrorResponse {
  success: false
  error: string
  statusCode?: number
  details?: Record<string, unknown>
}

export interface SuccessResponse<T = unknown> {
  success: true
  data: T
  message?: string
}

export type ApiResult<T> = SuccessResponse<T> | ErrorResponse

export interface HttpError extends Error {
  statusCode: number
  response?: Response
  body?: unknown
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  headers?: Record<string, string>
  body?: string | FormData
  timeout?: number
  retries?: number
}

export interface RateLimitInfo {
  limit: number
  remaining: number
  reset: number
  retryAfter?: number
}
