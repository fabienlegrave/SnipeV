/**
 * Récupère les cookies depuis la base de données
 * Utilisé par les workers pour le scraping
 */

import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'

/**
 * Récupère les cookies Cloudflare actifs depuis la base de données
 * Priorité : vinted_credentials > app_settings > user_preferences
 */
export async function getCookiesFromDb(): Promise<string | null> {
  if (!supabase) {
    logger.warn('⚠️ Supabase non disponible, impossible de récupérer les cookies')
    return null
  }

  try {
    // 1. Essayer vinted_credentials (priorité)
    try {
      // D'abord essayer avec is_active = true (si la colonne existe)
      let { data, error } = await supabase
        .from('vinted_credentials')
        .select('full_cookies, is_active, updated_at, created_at, id')
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1)

      // Si erreur (colonne is_active n'existe peut-être pas) ou pas de résultat, essayer sans filtre
      if (error || !data || data.length === 0) {
        if (error) {
          logger.debug(`⚠️ Erreur avec filtre is_active (colonne peut ne pas exister): ${error.message}`)
        }
        
        // Essayer sans le filtre is_active - prendre le plus récent par updated_at
        logger.debug('ℹ️ Tentative sans filtre is_active (récupération du credential le plus récent)')
        const result = await supabase
          .from('vinted_credentials')
          .select('full_cookies, id, updated_at, created_at')
          .order('updated_at', { ascending: false })
          .limit(1)
        
        if (result.error) {
          logger.warn(`⚠️ Erreur lors de la récupération depuis vinted_credentials: ${result.error.message}`)
          logger.debug(`Détails: ${JSON.stringify(result.error)}`)
        } else if (result.data && result.data.length > 0) {
          data = result.data
          error = null
        }
      }

      if (!error && data && data.length > 0) {
        const credential = data[0]
        if (credential?.full_cookies && typeof credential.full_cookies === 'string') {
          const cookies = credential.full_cookies.trim()
          // Vérifier que ce sont des cookies Cloudflare
          if (cookies.includes('cf_clearance') || cookies.includes('datadome')) {
            logger.info(`✅ Cookies Cloudflare récupérés depuis vinted_credentials (ID: ${credential.id})`)
            return cookies
          } else {
            logger.warn(`⚠️ Cookies trouvés dans vinted_credentials (ID: ${credential.id}) mais pas de cookies Cloudflare (cf_clearance/datadome)`)
            logger.debug(`Contenu des cookies: ${cookies.substring(0, 100)}...`)
          }
        }
      } else {
        logger.debug('ℹ️ Aucun credential trouvé dans vinted_credentials')
      }
    } catch (error) {
      logger.warn(`⚠️ Exception lors de la récupération depuis vinted_credentials: ${error instanceof Error ? error.message : String(error)}`)
      // Table peut ne pas exister
    }

    // 2. Essayer app_settings
    try {
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'vinted_cookies')
        .single()
        .catch(() => ({ data: null }))

      if (data?.value && typeof data.value === 'string') {
        const cookies = data.value.trim()
        if (cookies.includes('cf_clearance') || cookies.includes('datadome')) {
          logger.info('✅ Cookies Cloudflare récupérés depuis app_settings')
          return cookies
        }
      }
    } catch (error) {
      // Table peut ne pas exister
    }

    // 3. Essayer user_preferences
    try {
      const { data } = await supabase
        .from('user_preferences')
        .select('vinted_cookies, full_cookies, cookies')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single()
        .catch(() => ({ data: null }))

      const cookies = data?.vinted_cookies || data?.full_cookies || data?.cookies
      if (cookies && typeof cookies === 'string') {
        const cookiesStr = cookies.trim()
        if (cookiesStr.includes('cf_clearance') || cookiesStr.includes('datadome')) {
          logger.info('✅ Cookies Cloudflare récupérés depuis user_preferences')
          return cookiesStr
        }
      }
    } catch (error) {
      // Table peut ne pas exister
    }

    logger.warn('⚠️ Aucun cookie Cloudflare trouvé dans la base de données')
    return null
  } catch (error) {
    logger.error('❌ Erreur lors de la récupération des cookies depuis la DB', error as Error)
    return null
  }
}

/**
 * Récupère les cookies Cloudflare depuis la base de données UNIQUEMENT
 * Utilisé par les workers pour le scraping
 * 
 * ⚠️ PAS DE FALLBACK : Si pas de cookies en DB, retourne null explicitement
 * Cela évite d'utiliser des cookies expirés depuis les secrets
 * 
 * Pour le dev local uniquement, utilisez getCookiesForScrapingDev()
 */
export async function getCookiesForScraping(): Promise<string | null> {
  const dbCookies = await getCookiesFromDb()
  
  if (dbCookies) {
    return dbCookies
  }

  // Pas de fallback silencieux - erreur explicite
  logger.error('❌ NO_SCRAPING_COOKIES: Aucun cookie Cloudflare trouvé dans la base de données')
  logger.error('❌ Les cookies doivent être générés par le main worker et stockés en base')
  logger.error('💡 Action requise: Appeler POST /api/v1/token/refresh/force sur le main worker')
  
  return null
}

/**
 * Version DEV uniquement avec fallback sur env (pour développement local)
 * NE PAS UTILISER en production
 */
export async function getCookiesForScrapingDev(): Promise<string | null> {
  // 1. Essayer depuis la base de données
  const dbCookies = await getCookiesFromDb()
  if (dbCookies) {
    return dbCookies
  }

  // 2. Fallback DEV uniquement sur les variables d'environnement
  if (process.env.NODE_ENV === 'development') {
    const envCookies = process.env.VINTED_FULL_COOKIES
    if (envCookies && envCookies.trim().length > 0) {
      const cookies = envCookies.trim()
      if (cookies.includes('cf_clearance') || cookies.includes('datadome')) {
        logger.warn('⚠️ [DEV] Utilisation des cookies depuis VINTED_FULL_COOKIES (fallback dev uniquement)')
        return cookies
      }
    }
  }

  logger.error('❌ NO_SCRAPING_COOKIES: Aucun cookie Cloudflare disponible')
  return null
}

/**
 * Récupère les cookies authentifiés (avec access_token_web) pour les favoris
 * Utilisé uniquement pour fetch-all-favorites
 */
export function getAuthenticatedCookiesForFavorites(): string | null {
  const envCookies = process.env.VINTED_FULL_COOKIES
  if (envCookies && envCookies.trim().length > 0) {
    const cookies = envCookies.trim()
    // Vérifier que c'est un cookie authentifié (avec access_token_web)
    if (cookies.includes('access_token_web')) {
      logger.info('✅ Cookies authentifiés récupérés depuis .env.local pour les favoris')
      return cookies
    }
  }

  logger.warn('⚠️ Aucun cookie authentifié trouvé pour les favoris')
  logger.info('💡 Configurez VINTED_FULL_COOKIES dans .env.local avec access_token_web')
  return null
}

