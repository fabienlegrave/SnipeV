import { createSimpleSession, createFullSessionFromCookies, type FullVintedSession } from '../scrape/fullSessionManager'
import { getCookiesForScraping } from '../utils/getCookiesFromDb'
import { logger } from '../logger'

export interface SessionOptions {
  fullCookies?: string
  accessToken?: string
  preferCookies?: boolean
}

export interface SessionResult {
  session: FullVintedSession | null
  type: 'full_cookies' | 'db_cookies' | 'access_token' | 'none'
  source: 'request' | 'database' | 'env' | 'none'
}

export class SessionManager {
  private static cachedDbCookies: string | null = null
  private static lastDbCookiesFetch: number = 0
  private static DB_CACHE_TTL = 60000

  static async getSession(options: SessionOptions = {}): Promise<SessionResult> {
    const { fullCookies, accessToken, preferCookies = true } = options

    if (fullCookies && fullCookies.trim().length > 0) {
      try {
        const session = createFullSessionFromCookies(fullCookies)
        logger.auth.cookies('Session créée depuis cookies fournis')
        return {
          session,
          type: 'full_cookies',
          source: 'request'
        }
      } catch (error) {
        logger.auth.error('Erreur parsing cookies fournis', error as Error)
      }
    }

    if (preferCookies) {
      const dbCookies = await this.getDbCookies()

      if (dbCookies) {
        try {
          const session = createFullSessionFromCookies(dbCookies)
          logger.auth.cookies('Session créée depuis DB')
          return {
            session,
            type: 'db_cookies',
            source: 'database'
          }
        } catch (error) {
          logger.auth.error('Erreur parsing cookies DB', error as Error)
        }
      }
    }

    const tokenToUse = accessToken || process.env.VINTED_ACCESS_TOKEN

    if (tokenToUse) {
      try {
        const session = createSimpleSession(tokenToUse)
        logger.auth.token('Session créée depuis access token')
        return {
          session,
          type: 'access_token',
          source: accessToken ? 'request' : 'env'
        }
      } catch (error) {
        logger.auth.error('Erreur création session token', error as Error)
      }
    }

    logger.auth.error('Aucune méthode d\'authentification disponible')
    return {
      session: null,
      type: 'none',
      source: 'none'
    }
  }

  private static async getDbCookies(): Promise<string | null> {
    const now = Date.now()

    if (this.cachedDbCookies && (now - this.lastDbCookiesFetch) < this.DB_CACHE_TTL) {
      return this.cachedDbCookies
    }

    try {
      const cookies = await getCookiesForScraping()
      this.cachedDbCookies = cookies
      this.lastDbCookiesFetch = now
      return cookies
    } catch (error) {
      logger.auth.error('Erreur récupération cookies DB', error as Error)
      return null
    }
  }

  static clearCache(): void {
    this.cachedDbCookies = null
    this.lastDbCookiesFetch = 0
    logger.info('Cache de session nettoyé')
  }

  static async refreshDbCookies(): Promise<string | null> {
    this.clearCache()
    return this.getDbCookies()
  }

  static async validateSession(session: FullVintedSession | null): Promise<boolean> {
    if (!session) return false

    try {
      const testUrl = 'https://www.vinted.fr/api/v2/users/current'
      const { buildFullVintedHeaders } = await import('../scrape/fullSessionManager')
      const headers = buildFullVintedHeaders(session)

      const response = await fetch(testUrl, {
        method: 'GET',
        headers,
      })

      if (response.ok) {
        logger.info('✅ Session valide')
        return true
      } else {
        logger.warn(`⚠️ Session invalide: ${response.status}`)
        return false
      }
    } catch (error) {
      logger.error('Erreur validation session', error as Error)
      return false
    }
  }
}

export async function getSessionWithFallback(options: SessionOptions = {}): Promise<FullVintedSession> {
  const result = await SessionManager.getSession(options)

  if (!result.session) {
    throw new Error('NO_AUTHENTICATION_AVAILABLE: Aucune méthode d\'authentification disponible')
  }

  return result.session
}

export async function getSessionOrNull(options: SessionOptions = {}): Promise<FullVintedSession | null> {
  const result = await SessionManager.getSession(options)
  return result.session
}
