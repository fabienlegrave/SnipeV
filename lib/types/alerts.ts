/**
 * Types pour le système d'alertes
 */

import type { ApiItem } from './core'

export interface PriceAlert {
  id: number
  game_title: string
  platform: string | null
  max_price: number
  condition: string | null
  is_active: boolean
  triggered_count: number
  triggered_at: string | null
  created_at?: string
  updated_at?: string
}

export interface AlertMatch {
  alertId: number
  alertTitle: string
  item: ApiItem
  matchReason: string
  matchedAt: string
}

export interface AlertCheckResult {
  success: boolean
  checkedAt: string
  alertsChecked: number
  itemsChecked: number
  totalItemsChecked?: number
  matches: AlertMatch[]
  updatedAlerts: number[]
  stats?: AlertCheckStats
  debugInfo?: AlertDebugInfo[]
  error?: string
  httpStatus?: number
  needsCookieRefresh?: boolean
}

export interface AlertCheckStats {
  skippedUnavailable: number
  skippedPrice: number
  skippedPlatform: number
  skippedTitle: number
}

export interface AlertDebugInfo {
  alert: string
  item: string
  reason: string
}

export interface AlertMatchingOptions {
  minSimilarity?: number
  strictTitleMatch?: boolean
  checkPlatform?: boolean
  checkCondition?: boolean
}

export interface AlertNotification {
  id: string
  alertId: number
  itemId: number
  sentAt: string
  channel: 'telegram' | 'webhook' | 'email'
  status: 'pending' | 'sent' | 'failed'
  error?: string
}
