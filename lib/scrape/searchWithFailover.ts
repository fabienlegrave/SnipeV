import { searchSinglePage, searchMultiplePages, type SearchOptions, type SearchResult } from './unifiedSearch'
import { SessionManager, type SessionOptions } from '../auth/sessionManager'
import { handle403Failover, reset403Counter } from '../failover/failover-manager'
import { logger } from '../logger'

export interface SearchWithFailoverOptions extends SearchOptions {
  sessionOptions?: SessionOptions
  maxRetries?: number
  enableFailover?: boolean
}

export class SearchFailoverManager {
  private static consecutive403 = 0
  private static lastSuccessTime = 0
  private static readonly MAX_403_BEFORE_FAILOVER = 3
  private static readonly SUCCESS_RESET_TIMEOUT = 300000

  static async searchWithAutoFailover(
    searchText: string,
    options: SearchWithFailoverOptions = {}
  ): Promise<SearchResult> {
    const {
      sessionOptions = {},
      maxRetries = 3,
      enableFailover = true,
      ...searchOptions
    } = options

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const sessionResult = await SessionManager.getSession(sessionOptions)

        if (!sessionResult.session) {
          throw new Error('NO_AUTHENTICATION_AVAILABLE')
        }

        logger.info(`🔍 Tentative de recherche ${attempt}/${maxRetries} pour "${searchText}"`)

        const result = await searchMultiplePages(searchText, {
          ...searchOptions,
          session: sessionResult.session
        })

        this.onSearchSuccess()
        return result

      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)

        if (errorMessage.includes('HTTP 403') || errorMessage.includes('HTTP 401')) {
          logger.warn(`⚠️ Erreur 403/401 détectée (tentative ${attempt}/${maxRetries})`)
          this.consecutive403++

          if (enableFailover && this.consecutive403 >= this.MAX_403_BEFORE_FAILOVER) {
            logger.warn(`🚨 ${this.consecutive403} erreurs 403 consécutives détectées`)

            if (attempt < maxRetries) {
              logger.info('🔄 Tentative de régénération de session...')
              await SessionManager.refreshDbCookies()

              const failoverSuccess = await handle403Failover({
                region: process.env.FLY_REGION,
                machineId: process.env.FLY_MACHINE_ID,
                appName: process.env.FLY_APP_NAME
              })

              if (failoverSuccess) {
                logger.info('✅ Failover réussi, nouvelle tentative...')
                this.consecutive403 = 0
                await new Promise(resolve => setTimeout(resolve, 5000))
                continue
              } else {
                logger.error('❌ Failover échoué')
              }
            }
          }

          if (attempt < maxRetries) {
            const delay = Math.min(5000 * Math.pow(2, attempt - 1), 30000)
            logger.info(`⏳ Attente de ${delay / 1000}s avant nouvelle tentative...`)
            await new Promise(resolve => setTimeout(resolve, delay))
            continue
          }

          throw new Error(`AUTHENTICATION_FAILED: ${errorMessage}`)
        }

        if (attempt < maxRetries) {
          logger.warn(`⚠️ Erreur lors de la recherche: ${errorMessage}`)
          const delay = 2000 * attempt
          logger.info(`⏳ Attente de ${delay / 1000}s avant nouvelle tentative...`)
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }

        throw error
      }
    }

    throw new Error(`SEARCH_FAILED: Échec après ${maxRetries} tentatives`)
  }

  static async searchSinglePageWithFailover(
    params: { searchText: string; priceFrom?: number; priceTo?: number; page?: number; perPage?: number },
    options: SearchWithFailoverOptions = {}
  ): Promise<SearchResult> {
    const {
      sessionOptions = {},
      maxRetries = 3,
      enableFailover = true
    } = options

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const sessionResult = await SessionManager.getSession(sessionOptions)

        if (!sessionResult.session) {
          throw new Error('NO_AUTHENTICATION_AVAILABLE')
        }

        const result = await searchSinglePage(params, sessionResult.session)

        this.onSearchSuccess()
        return result

      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)

        if (errorMessage.includes('HTTP 403') || errorMessage.includes('HTTP 401')) {
          logger.warn(`⚠️ Erreur 403/401 détectée (tentative ${attempt}/${maxRetries})`)
          this.consecutive403++

          if (enableFailover && this.consecutive403 >= this.MAX_403_BEFORE_FAILOVER) {
            if (attempt < maxRetries) {
              await SessionManager.refreshDbCookies()
              await handle403Failover({
                region: process.env.FLY_REGION,
                machineId: process.env.FLY_MACHINE_ID,
                appName: process.env.FLY_APP_NAME
              })
              this.consecutive403 = 0
              continue
            }
          }

          if (attempt < maxRetries) {
            const delay = Math.min(5000 * Math.pow(2, attempt - 1), 30000)
            await new Promise(resolve => setTimeout(resolve, delay))
            continue
          }

          throw new Error(`AUTHENTICATION_FAILED: ${errorMessage}`)
        }

        if (attempt < maxRetries) {
          const delay = 2000 * attempt
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }

        throw error
      }
    }

    throw new Error(`SEARCH_FAILED: Échec après ${maxRetries} tentatives`)
  }

  private static onSearchSuccess(): void {
    const now = Date.now()

    if (this.consecutive403 > 0) {
      logger.info(`✅ Recherche réussie après ${this.consecutive403} erreurs 403`)
      this.consecutive403 = 0
    }

    if (now - this.lastSuccessTime > this.SUCCESS_RESET_TIMEOUT) {
      reset403Counter()
    }

    this.lastSuccessTime = now
  }

  static getStats(): {
    consecutive403: number
    lastSuccessTime: number
    timeSinceLastSuccess: number
  } {
    return {
      consecutive403: this.consecutive403,
      lastSuccessTime: this.lastSuccessTime,
      timeSinceLastSuccess: Date.now() - this.lastSuccessTime
    }
  }

  static reset(): void {
    this.consecutive403 = 0
    this.lastSuccessTime = 0
    logger.info('SearchFailoverManager réinitialisé')
  }
}

export async function searchWithFailover(
  searchText: string,
  options: SearchWithFailoverOptions = {}
): Promise<SearchResult> {
  return SearchFailoverManager.searchWithAutoFailover(searchText, options)
}
