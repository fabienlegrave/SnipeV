import { supabase } from '../supabase'
import { logger } from '../logger'
import type { ApiItem } from '../types'
import type { SearchResult } from '../scrape/unifiedSearch'
import { createHash } from 'crypto'

export interface CacheOptions {
  ttlMinutes?: number
  enabled?: boolean
}

export interface CacheStats {
  hits: number
  misses: number
  hitRate: number
  totalEntries: number
  oldestEntry?: string
  newestEntry?: string
}

const DEFAULT_TTL_MINUTES = 15
const MAX_CACHE_SIZE = 1000

export class SearchCache {
  private enabled: boolean
  private ttlMinutes: number
  private stats = {
    hits: 0,
    misses: 0
  }

  constructor(options: CacheOptions = {}) {
    this.enabled = options.enabled !== false
    this.ttlMinutes = options.ttlMinutes || DEFAULT_TTL_MINUTES
  }

  private generateHash(searchQuery: string, filters: any): string {
    const normalized = {
      query: searchQuery.toLowerCase().trim(),
      ...filters
    }
    const hashInput = JSON.stringify(normalized)
    return createHash('md5').update(hashInput).digest('hex')
  }

  async get(searchQuery: string, filters: any = {}): Promise<SearchResult | null> {
    if (!this.enabled || !supabase) {
      return null
    }

    try {
      const hash = this.generateHash(searchQuery, filters)

      const { data, error } = await supabase
        .from('search_cache')
        .select('*')
        .eq('search_hash', hash)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle()

      if (error) {
        logger.error('Erreur récupération cache', error)
        return null
      }

      if (!data) {
        this.stats.misses++
        logger.debug(`❌ Cache miss pour: ${searchQuery}`)
        return null
      }

      await supabase
        .from('search_cache')
        .update({
          hit_count: (data.hit_count || 0) + 1,
          last_hit_at: new Date().toISOString()
        })
        .eq('id', data.id)

      this.stats.hits++
      logger.info(`✅ Cache hit pour: ${searchQuery} (hit count: ${data.hit_count + 1})`)

      return {
        items: data.results as ApiItem[],
        hasMore: false,
        metadata: data.metadata as any
      }
    } catch (error) {
      logger.error('Erreur cache get', error as Error)
      return null
    }
  }

  async set(
    searchQuery: string,
    filters: any,
    result: SearchResult
  ): Promise<boolean> {
    if (!this.enabled || !supabase) {
      return false
    }

    try {
      const hash = this.generateHash(searchQuery, filters)
      const expiresAt = new Date(Date.now() + this.ttlMinutes * 60 * 1000)

      await this.cleanupOldEntries()

      const { error } = await supabase
        .from('search_cache')
        .upsert({
          search_query: searchQuery,
          search_hash: hash,
          filters: filters || {},
          results: result.items,
          item_count: result.items.length,
          expires_at: expiresAt.toISOString(),
          metadata: result.metadata || {},
          hit_count: 0
        }, {
          onConflict: 'search_hash'
        })

      if (error) {
        logger.error('Erreur sauvegarde cache', error)
        return false
      }

      logger.info(`💾 Cache sauvegardé pour: ${searchQuery} (${result.items.length} items, TTL: ${this.ttlMinutes}min)`)
      return true
    } catch (error) {
      logger.error('Erreur cache set', error as Error)
      return false
    }
  }

  async invalidate(searchQuery: string, filters: any = {}): Promise<boolean> {
    if (!this.enabled || !supabase) {
      return false
    }

    try {
      const hash = this.generateHash(searchQuery, filters)

      const { error } = await supabase
        .from('search_cache')
        .delete()
        .eq('search_hash', hash)

      if (error) {
        logger.error('Erreur invalidation cache', error)
        return false
      }

      logger.info(`🗑️ Cache invalidé pour: ${searchQuery}`)
      return true
    } catch (error) {
      logger.error('Erreur cache invalidate', error as Error)
      return false
    }
  }

  async invalidateAll(): Promise<boolean> {
    if (!this.enabled || !supabase) {
      return false
    }

    try {
      const { error } = await supabase
        .from('search_cache')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000')

      if (error) {
        logger.error('Erreur invalidation totale cache', error)
        return false
      }

      logger.info('🗑️ Tout le cache invalidé')
      return true
    } catch (error) {
      logger.error('Erreur cache invalidateAll', error as Error)
      return false
    }
  }

  async cleanup(): Promise<number> {
    if (!this.enabled || !supabase) {
      return 0
    }

    try {
      const { data: expiredEntries, error: selectError } = await supabase
        .from('search_cache')
        .select('id')
        .lt('expires_at', new Date().toISOString())

      if (selectError) {
        logger.error('Erreur sélection entrées expirées', selectError)
        return 0
      }

      if (!expiredEntries || expiredEntries.length === 0) {
        return 0
      }

      const { error: deleteError } = await supabase
        .from('search_cache')
        .delete()
        .lt('expires_at', new Date().toISOString())

      if (deleteError) {
        logger.error('Erreur nettoyage cache', deleteError)
        return 0
      }

      logger.info(`🧹 ${expiredEntries.length} entrées de cache nettoyées`)
      return expiredEntries.length
    } catch (error) {
      logger.error('Erreur cache cleanup', error as Error)
      return 0
    }
  }

  private async cleanupOldEntries(): Promise<void> {
    if (!supabase) return

    try {
      const { data: entries, error: countError } = await supabase
        .from('search_cache')
        .select('id')

      if (countError || !entries) return

      if (entries.length >= MAX_CACHE_SIZE) {
        const { error: deleteError } = await supabase
          .from('search_cache')
          .delete()
          .in('id', (await supabase
            .from('search_cache')
            .select('id')
            .order('created_at', { ascending: true })
            .limit(100)
          ).data?.map(e => e.id) || [])

        if (!deleteError) {
          logger.info(`🧹 Nettoyage préventif: 100 anciennes entrées supprimées`)
        }
      }
    } catch (error) {
      logger.debug('Erreur nettoyage préventif', error as Error)
    }
  }

  async getStats(): Promise<CacheStats> {
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? (this.stats.hits / (this.stats.hits + this.stats.misses)) * 100
      : 0

    if (!supabase) {
      return {
        hits: this.stats.hits,
        misses: this.stats.misses,
        hitRate,
        totalEntries: 0
      }
    }

    try {
      const { data: entries, error } = await supabase
        .from('search_cache')
        .select('created_at')
        .order('created_at', { ascending: true })

      if (error || !entries) {
        return {
          hits: this.stats.hits,
          misses: this.stats.misses,
          hitRate,
          totalEntries: 0
        }
      }

      return {
        hits: this.stats.hits,
        misses: this.stats.misses,
        hitRate,
        totalEntries: entries.length,
        oldestEntry: entries[0]?.created_at,
        newestEntry: entries[entries.length - 1]?.created_at
      }
    } catch (error) {
      logger.error('Erreur récupération stats cache', error as Error)
      return {
        hits: this.stats.hits,
        misses: this.stats.misses,
        hitRate,
        totalEntries: 0
      }
    }
  }

  resetStats(): void {
    this.stats = { hits: 0, misses: 0 }
    logger.info('📊 Stats du cache réinitialisées')
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    logger.info(`🔧 Cache ${enabled ? 'activé' : 'désactivé'}`)
  }

  setTTL(minutes: number): void {
    this.ttlMinutes = minutes
    logger.info(`🔧 TTL du cache défini à ${minutes} minutes`)
  }
}

export const globalSearchCache = new SearchCache({
  ttlMinutes: parseInt(process.env.SEARCH_CACHE_TTL_MINUTES || '15', 10),
  enabled: process.env.SEARCH_CACHE_ENABLED !== 'false'
})

export async function schedulePeriodicCleanup(intervalMinutes = 30): Promise<void> {
  setInterval(async () => {
    logger.info('🧹 Nettoyage périodique du cache...')
    const cleaned = await globalSearchCache.cleanup()
    if (cleaned > 0) {
      logger.info(`✅ ${cleaned} entrées nettoyées`)
    }
  }, intervalMinutes * 60 * 1000)

  logger.info(`✅ Nettoyage automatique programmé (toutes les ${intervalMinutes} minutes)`)
}
