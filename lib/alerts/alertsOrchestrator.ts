import { supabase } from '../supabase'
import { logger } from '../logger'
import { searchWithFailover } from '../scrape/searchWithFailover'
import { globalSearchCache } from '../cache/searchCache'
import type { ApiItem } from '../types/core'

interface PriceAlert {
  id: number
  game_title: string
  platform: string | null
  max_price: number
  condition: string | null
  is_active: boolean
}

interface AlertMatch {
  alertId: number
  alertTitle: string
  item: ApiItem
  matchReason: string
}

interface OrchestrationResult {
  success: boolean
  checkedAt: string
  alertsChecked: number
  totalItemsChecked: number
  matches: AlertMatch[]
  updatedAlerts: number[]
  cacheStats: {
    hits: number
    misses: number
    hitRate: number
  }
  error?: string
}

export class AlertsOrchestrator {
  private cacheHits = 0
  private cacheMisses = 0

  async checkAllAlerts(sessionOptions: { fullCookies?: string } = {}): Promise<OrchestrationResult> {
    const startTime = Date.now()

    try {
      if (!supabase) {
        throw new Error('Supabase non disponible')
      }

      const { data: alerts, error: alertsError } = await supabase
        .from('price_alerts')
        .select('*')
        .eq('is_active', true)

      if (alertsError) {
        throw new Error(`Erreur récupération alertes: ${alertsError.message}`)
      }

      if (!alerts || alerts.length === 0) {
        logger.info('Aucune alerte active à vérifier')
        return {
          success: true,
          checkedAt: new Date().toISOString(),
          alertsChecked: 0,
          totalItemsChecked: 0,
          matches: [],
          updatedAlerts: [],
          cacheStats: {
            hits: this.cacheHits,
            misses: this.cacheMisses,
            hitRate: 0
          }
        }
      }

      logger.info(`🔔 Vérification de ${alerts.length} alerte(s) active(s)`)

      const matches: AlertMatch[] = []
      const updatedAlerts: number[] = []
      let totalItemsChecked = 0

      for (const alert of alerts) {
        try {
          const cacheKey = `alert_${alert.id}_${alert.game_title}`
          const cached = await globalSearchCache.get(cacheKey, {
            priceTo: alert.max_price,
            limit: 40
          })

          let items: ApiItem[]
          if (cached) {
            this.cacheHits++
            logger.info(`✅ Cache hit pour: ${alert.game_title}`)
            items = cached.items
          } else {
            this.cacheMisses++
            logger.info(`🔍 Recherche pour: ${alert.game_title}`)

            const result = await searchWithFailover(alert.game_title, {
              priceFrom: 0,
              priceTo: alert.max_price,
              limit: 40,
              maxPages: 2,
              minRelevanceScore: 40,
              sessionOptions,
              maxRetries: 3,
              enableFailover: true
            })

            items = result.items

            if (items.length > 0) {
              await globalSearchCache.set(cacheKey, {
                priceTo: alert.max_price,
                limit: 40
              }, result)
            }
          }

          totalItemsChecked += items.length
          logger.info(`📦 ${items.length} items trouvés pour "${alert.game_title}"`)

          for (const item of items) {
            const itemPrice = item.price?.amount || 0
            if (itemPrice > 0 && itemPrice <= alert.max_price) {
              matches.push({
                alertId: alert.id,
                alertTitle: alert.game_title,
                item,
                matchReason: `Prix ${itemPrice}€ <= ${alert.max_price}€`
              })
            }
          }

          if (matches.length > 0) {
            const { error: updateError } = await supabase
              .from('price_alerts')
              .update({
                triggered_count: (alert.triggered_count || 0) + matches.length,
                triggered_at: new Date().toISOString()
              })
              .eq('id', alert.id)

            if (!updateError) {
              updatedAlerts.push(alert.id)
            }
          }

          await new Promise(resolve => setTimeout(resolve, 1000))

        } catch (error) {
          logger.error(`Erreur vérification alerte ${alert.id}`, error as Error)
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2)
      const hitRate = this.cacheHits + this.cacheMisses > 0
        ? (this.cacheHits / (this.cacheHits + this.cacheMisses)) * 100
        : 0

      logger.info(`✅ Vérification terminée en ${duration}s: ${matches.length} match(s), cache hit rate: ${hitRate.toFixed(1)}%`)

      return {
        success: true,
        checkedAt: new Date().toISOString(),
        alertsChecked: alerts.length,
        totalItemsChecked,
        matches,
        updatedAlerts,
        cacheStats: {
          hits: this.cacheHits,
          misses: this.cacheMisses,
          hitRate
        }
      }

    } catch (error) {
      logger.error('Erreur orchestration alertes', error as Error)
      return {
        success: false,
        checkedAt: new Date().toISOString(),
        alertsChecked: 0,
        totalItemsChecked: 0,
        matches: [],
        updatedAlerts: [],
        cacheStats: {
          hits: this.cacheHits,
          misses: this.cacheMisses,
          hitRate: 0
        },
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  resetCacheStats(): void {
    this.cacheHits = 0
    this.cacheMisses = 0
  }
}

export const globalAlertsOrchestrator = new AlertsOrchestrator()
