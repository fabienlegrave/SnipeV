/**
 * Module pour récupérer les favoris Vinted de l'utilisateur
 */

import { buildVintedApiHeaders, type FullVintedSession } from './fullSessionManager'
import { normalizeApiItem } from './searchCatalogWithFullSession'
import { logger } from '../logger'
import type { ApiItem } from '../types/core'

export interface FavoritesResponse {
  items: ApiItem[]
  total: number
  hasMore: boolean
}

/**
 * Extrait l'user_id depuis les cookies ou le token
 * Peut aussi essayer de le récupérer depuis la base de données si disponible
 * Priorité: Variable d'environnement > Cookies > Token JWT > Base de données
 */
async function extractUserId(session: FullVintedSession): Promise<string | null> {
  // 0. Vérifier d'abord la variable d'environnement (priorité la plus haute)
  const envUserId = process.env.VINTED_USER_ID
  if (envUserId) {
    const userId = envUserId.trim()
    if (/^\d+$/.test(userId)) {
      logger.info(`✅ User ID récupéré depuis la variable d'environnement VINTED_USER_ID: ${userId}`)
      return userId
    } else {
      logger.warn(`⚠️ VINTED_USER_ID configuré mais invalide: "${userId}" (doit être un nombre)`)
    }
  }

  // 1. Essayer depuis les cookies (user_id=...)
  const userIdMatch = session.fullCookieString.match(/user_id=([^;,\s]+)/)
  if (userIdMatch && userIdMatch[1] && userIdMatch[1] !== 'null' && userIdMatch[1] !== 'undefined') {
    const userId = userIdMatch[1].trim()
    if (userId && /^\d+$/.test(userId)) {
      logger.info(`✅ User ID extrait depuis les cookies: ${userId}`)
      return userId
    } else {
      logger.debug(`⚠️ user_id trouvé mais invalide: "${userId}"`)
    }
  } else {
    logger.debug('⚠️ Aucun user_id trouvé dans les cookies')
  }

  // 2. Essayer depuis le token JWT (access_token_web)
  if (session.accessToken && session.accessToken.includes('.')) {
    try {
      const parts = session.accessToken.split('.')
      if (parts.length === 3) {
        // Décoder le payload JWT (base64url)
        const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
        const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'))
        const userId = payload.sub || payload.account_id || payload.user_id || payload.id
        if (userId) {
          const userIdStr = String(userId)
          if (/^\d+$/.test(userIdStr)) {
            logger.debug(`✅ User ID extrait depuis le token JWT: ${userIdStr}`)
            return userIdStr
          }
        }
      }
    } catch (error) {
      // Ignorer les erreurs de parsing
      logger.debug('Erreur parsing JWT:', error)
    }
  }

  // 3. Essayer depuis les cookies access_token_web (extraire depuis le cookie directement)
  const accessTokenCookieMatch = session.fullCookieString.match(/access_token_web=([^;]+)/)
  if (accessTokenCookieMatch) {
    try {
      const token = accessTokenCookieMatch[1]
      if (token.includes('.')) {
        const parts = token.split('.')
        if (parts.length === 3) {
          const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
          const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'))
          const userId = payload.sub || payload.account_id || payload.user_id || payload.id
          if (userId) {
            const userIdStr = String(userId)
            if (/^\d+$/.test(userIdStr)) {
              logger.debug(`✅ User ID extrait depuis access_token_web cookie: ${userIdStr}`)
              return userIdStr
            }
          }
        }
      }
    } catch (error) {
      // Ignorer les erreurs
    }
  }

  // 4. Essayer depuis la base de données (si Supabase est disponible)
  try {
    const { supabase } = await import('../supabase')
    if (supabase) {
      // Chercher dans vinted_credentials avec les cookies correspondants
      const { data: credentials } = await supabase
        .from('vinted_credentials')
        .select('user_id')
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single()
        .catch(() => ({ data: null }))
      
      if (credentials?.user_id) {
        const userIdStr = String(credentials.user_id)
        if (/^\d+$/.test(userIdStr)) {
          logger.debug(`✅ User ID récupéré depuis la base de données: ${userIdStr}`)
          return userIdStr
        }
      }
    }
  } catch (error) {
    // Ignorer les erreurs
  }

  return null
}

/**
 * Récupère les favoris de l'utilisateur depuis Vinted
 * Utilise l'endpoint officiel: /api/v2/users/{user_id}/items/favourites
 */
export async function getUserFavorites(
  session: FullVintedSession,
  options: { page?: number; perPage?: number } = {}
): Promise<FavoritesResponse> {
  const { page = 1, perPage = 50 } = options

  // Extraire l'user_id
  const userId = await extractUserId(session)
  
  if (!userId) {
    logger.warn('⚠️ Impossible d\'extraire l\'user_id depuis les cookies/token')
    logger.info('💡 Tentative avec endpoints alternatifs...')
    
    // Fallback vers les anciens endpoints si on ne peut pas extraire l'user_id
    return await getUserFavoritesFallback(session, options)
  }

  // Utiliser l'endpoint officiel avec l'user_id
  const url = `https://www.vinted.fr/api/v2/users/${userId}/items/favourites?per_page=${perPage}&page=${page}`

  logger.info(`🔍 Récupération des favoris depuis l'endpoint officiel: ${url}`)

  const headers = buildVintedApiHeaders(session)

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 12000)

    const response = await fetch(url, {
      headers,
      method: 'GET',
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      if (response.status === 403) {
        logger.warn(`❌ Endpoint officiel retourne 403 - Session non authentifiée`)
        logger.warn(`💡 Les cookies utilisés ne permettent pas l'accès aux favoris`)
        logger.warn(`💡 Solution: Utiliser VINTED_FULL_COOKIES avec une vraie session utilisateur`)
        logger.warn(`💡 Guide: docs/COOKIES_MANUELS.md`)
      } else {
        logger.warn(`❌ Endpoint officiel retourne ${response.status}, tentative avec endpoints alternatifs...`)
      }
      return await getUserFavoritesFallback(session, options)
    }

    const data = await response.json()

    // Vérifier si la réponse contient des items
    let items: any[] = []
    let pagination: any = null

    if (Array.isArray(data)) {
      items = data
    } else if (data.items && Array.isArray(data.items)) {
      items = data.items
      pagination = data.pagination
    } else if (data.data && Array.isArray(data.data)) {
      items = data.data
      pagination = data.pagination || data.meta
    } else if (data.favourites && Array.isArray(data.favourites)) {
      items = data.favourites
      pagination = data.pagination
    }

    if (items.length > 0) {
      logger.info(`✅ ${items.length} favoris récupérés depuis l'endpoint officiel`)
      
      // Normaliser les items
      const normalizedItems = items.map(normalizeApiItem).filter(Boolean) as ApiItem[]

      return {
        items: normalizedItems,
        total: pagination?.total_entries || pagination?.total || normalizedItems.length,
        hasMore: pagination ? (pagination.current_page < pagination.total_pages) : false
      }
    } else {
      logger.warn('⚠️ Aucun favori trouvé dans la réponse, tentative avec endpoints alternatifs...')
      return await getUserFavoritesFallback(session, options)
    }
  } catch (error: any) {
    logger.warn(`❌ Erreur avec endpoint officiel: ${error.message}, tentative avec endpoints alternatifs...`)
    return await getUserFavoritesFallback(session, options)
  }
}

/**
 * Fallback: Essaie plusieurs endpoints alternatifs si l'endpoint officiel ne fonctionne pas
 */
async function getUserFavoritesFallback(
  session: FullVintedSession,
  options: { page?: number; perPage?: number } = {}
): Promise<FavoritesResponse> {
  const { page = 1, perPage = 50 } = options

  // Essayer plusieurs endpoints possibles pour les favoris
  const possibleEndpoints = [
    // Endpoint 1: Favoris via catalog avec filtre
    `https://www.vinted.fr/api/v2/catalog/items?favorites=true&per_page=${perPage}&page=${page}`,
    // Endpoint 2: Favoris via users
    `https://www.vinted.fr/api/v2/users/favorites?per_page=${perPage}&page=${page}`,
    // Endpoint 3: Favoris via items
    `https://www.vinted.fr/api/v2/items/favorites?per_page=${perPage}&page=${page}`,
    // Endpoint 4: Wishlist
    `https://www.vinted.fr/api/v2/wishlist?per_page=${perPage}&page=${page}`,
  ]

  const headers = buildVintedApiHeaders(session)

  for (const url of possibleEndpoints) {
    try {
      logger.info(`🔍 Tentative de récupération des favoris (fallback): ${url}`)
      
      // Utiliser fetch directement pour les requêtes JSON
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 12000)
      
      const response = await fetch(url, {
        headers,
        method: 'GET',
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        logger.debug(`❌ Endpoint ${url} retourne ${response.status}`)
        continue
      }

      const data = await response.json()

      // Vérifier si la réponse contient des items
      let items: any[] = []
      let pagination: any = null

      if (Array.isArray(data)) {
        items = data
      } else if (data.items && Array.isArray(data.items)) {
        items = data.items
        pagination = data.pagination
      } else if (data.data && Array.isArray(data.data)) {
        items = data.data
        pagination = data.pagination || data.meta
      } else if (data.favorites && Array.isArray(data.favorites)) {
        items = data.favorites
        pagination = data.pagination
      } else if (data.favourites && Array.isArray(data.favourites)) {
        items = data.favourites
        pagination = data.pagination
      }

      if (items.length > 0) {
        logger.info(`✅ ${items.length} favoris récupérés depuis ${url}`)
        
        // Normaliser les items
        const normalizedItems = items.map(normalizeApiItem).filter(Boolean) as ApiItem[]

        return {
          items: normalizedItems,
          total: pagination?.total_entries || pagination?.total || normalizedItems.length,
          hasMore: pagination ? (pagination.current_page < pagination.total_pages) : false
        }
      }
    } catch (error: any) {
      logger.debug(`❌ Erreur avec endpoint ${url}: ${error.message}`)
      continue
    }
  }

  // Si aucun endpoint ne fonctionne, essayer de scraper la page HTML des favoris
  logger.warn('⚠️ Aucun endpoint API ne fonctionne, tentative de scraping HTML...')
  return await scrapeFavoritesFromHtml(session, options)
}

/**
 * Scrape les favoris depuis la page HTML (fallback)
 */
async function scrapeFavoritesFromHtml(
  session: FullVintedSession,
  options: { page?: number; perPage?: number } = {}
): Promise<FavoritesResponse> {
  try {
    const { page = 1 } = options
    const url = `https://www.vinted.fr/member/favorites?page=${page}`
    
    logger.info(`🌐 Scraping HTML des favoris: ${url}`)
    
    const headers = buildVintedApiHeaders(session)
    
    // Utiliser fetch directement pour avoir accès à response.ok
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 12000)
    
    const response = await fetch(url, {
      headers,
      method: 'GET',
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const html = await response.text()
    
    // Chercher les données JSON dans le HTML (Vinted utilise souvent des scripts avec des données JSON)
    const jsonMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({.+?});/s) || 
                     html.match(/window\.__APOLLO_STATE__\s*=\s*({.+?});/s) ||
                     html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>(.+?)<\/script>/s)

    if (jsonMatch) {
      try {
        const data = JSON.parse(jsonMatch[1])
        // Extraire les items depuis la structure de données
        // Cette structure peut varier, donc on essaie plusieurs chemins
        const items = data?.items || data?.favorites || data?.catalog?.items || []
        
        if (items.length > 0) {
          const normalizedItems = items.map(normalizeApiItem).filter(Boolean) as ApiItem[]
          return {
            items: normalizedItems,
            total: normalizedItems.length,
            hasMore: false // On ne peut pas déterminer facilement depuis HTML
          }
        }
      } catch (parseError) {
        logger.debug('Erreur parsing JSON depuis HTML:', parseError)
      }
    }

    // Si pas de JSON, essayer de parser le HTML directement avec des sélecteurs
    // (nécessiterait cheerio ou similaire, mais on évite pour l'instant)
    logger.warn('⚠️ Impossible de parser les favoris depuis HTML')
    return { items: [], total: 0, hasMore: false }
  } catch (error: any) {
    logger.error(`❌ Erreur scraping HTML favoris: ${error.message}`)
    return { items: [], total: 0, hasMore: false }
  }
}

/**
 * Récupère tous les favoris (avec pagination automatique)
 * Optimisé pour éviter les appels répétés inutiles
 */
export async function getAllUserFavorites(
  session: FullVintedSession
): Promise<ApiItem[]> {
  const allItems: ApiItem[] = []
  let page = 1
  let hasMore = true
  
  // Extraire l'user_id une seule fois au début pour éviter les appels répétés
  logger.info('🔍 Extraction de l\'user_id...')
  const userId = await extractUserId(session)
  
  // Déterminer l'endpoint à utiliser une seule fois
  let useOfficialEndpoint = false
  let workingEndpoint: string | null = null
  
  if (userId) {
    useOfficialEndpoint = true
    logger.info(`✅ User ID trouvé: ${userId}, utilisation de l'endpoint officiel`)
  } else {
    logger.warn('⚠️ User ID non trouvé, utilisation de l\'endpoint fallback')
    // Tester le premier endpoint fallback pour trouver celui qui fonctionne
    workingEndpoint = `https://www.vinted.fr/api/v2/catalog/items?favorites=true&per_page=50&page=1`
  }

  // Utiliser un délai configurable entre les pages (par défaut 2-3 secondes pour éviter rate limiting)
  const getRequestDelay = () => {
    const baseDelay = parseInt(process.env.FAVORITES_REQUEST_DELAY_MS || '2500')
    const jitter = Math.random() * 500 // Jitter de 0-500ms
    return baseDelay + jitter
  }

  while (hasMore) {
    let result: FavoritesResponse
    
    if (useOfficialEndpoint && userId) {
      // Utiliser l'endpoint officiel directement
      const url = `https://www.vinted.fr/api/v2/users/${userId}/items/favourites?per_page=50&page=${page}`
      const headers = buildVintedApiHeaders(session)
      
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 12000)
        
        const response = await fetch(url, {
          headers,
          method: 'GET',
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          logger.warn(`❌ Endpoint officiel retourne ${response.status} pour la page ${page}, arrêt de la pagination`)
          break
        }

        const data = await response.json()
        
        let items: any[] = []
        let pagination: any = null

        if (Array.isArray(data)) {
          items = data
        } else if (data.items && Array.isArray(data.items)) {
          items = data.items
          pagination = data.pagination
        } else if (data.data && Array.isArray(data.data)) {
          items = data.data
          pagination = data.pagination || data.meta
        } else if (data.favourites && Array.isArray(data.favourites)) {
          items = data.favourites
          pagination = data.pagination
        }

        const normalizedItems = items.map(normalizeApiItem).filter(Boolean) as ApiItem[]
        
        result = {
          items: normalizedItems,
          total: pagination?.total_entries || pagination?.total || normalizedItems.length,
          hasMore: pagination ? (pagination.current_page < pagination.total_pages) : false
        }
        
        if (page === 1) {
          logger.info(`✅ ${result.items.length} favoris récupérés depuis l'endpoint officiel (page ${page}/${pagination?.total_pages || '?'})`)
        } else {
          logger.debug(`📄 Page ${page}: ${result.items.length} favoris`)
        }
      } catch (error: any) {
        logger.warn(`❌ Erreur avec endpoint officiel page ${page}: ${error.message}`)
        break
      }
    } else {
      // Utiliser l'endpoint fallback (sans réessayer plusieurs endpoints à chaque page)
      if (workingEndpoint) {
        const url = workingEndpoint.replace(/page=\d+/, `page=${page}`)
        const headers = buildVintedApiHeaders(session)
        
        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 12000)
          
          const response = await fetch(url, {
            headers,
            method: 'GET',
            signal: controller.signal,
          })

          clearTimeout(timeoutId)

          if (!response.ok) {
            logger.warn(`❌ Endpoint fallback retourne ${response.status} pour la page ${page}, arrêt de la pagination`)
            break
          }

          const data = await response.json()
          
          let items: any[] = []
          let pagination: any = null

          if (Array.isArray(data)) {
            items = data
          } else if (data.items && Array.isArray(data.items)) {
            items = data.items
            pagination = data.pagination
          } else if (data.data && Array.isArray(data.data)) {
            items = data.data
            pagination = data.pagination || data.meta
          }

          const normalizedItems = items.map(normalizeApiItem).filter(Boolean) as ApiItem[]
          
          // Détecter correctement si on a plus de pages
          let hasMore = false
          if (pagination && pagination.total_pages) {
            // Utiliser la pagination si disponible
            const currentPage = pagination.current_page || page
            const totalPages = pagination.total_pages
            
            // Vérifier que total_pages est raisonnable (max 100 pages)
            if (totalPages > 100) {
              logger.warn(`⚠️ total_pages semble incorrect (${totalPages}), utilisation de la logique de fallback`)
              // Utiliser la logique de fallback
              hasMore = items.length >= 50 && normalizedItems.length > 0
            } else {
              hasMore = currentPage < totalPages
            }
            
            if (page === 1) {
              logger.info(`✅ ${normalizedItems.length} favoris récupérés depuis l'endpoint fallback (page ${currentPage}/${totalPages}, total: ${pagination.total_entries || pagination.total || '?'})`)
            } else {
              logger.debug(`📄 Page ${currentPage}/${totalPages}: ${normalizedItems.length} favoris`)
            }
          } else {
            // Si pas de pagination, arrêter si on a moins d'items que per_page
            hasMore = items.length >= 50 && normalizedItems.length > 0 // Continue seulement si on a exactement 50 items (probablement plus de pages)
            
            if (page === 1) {
              logger.info(`✅ ${normalizedItems.length} favoris récupérés depuis l'endpoint fallback (page ${page}, pas de pagination)`)
            } else {
              logger.debug(`📄 Page ${page}: ${normalizedItems.length} favoris`)
            }
          }
          
          result = {
            items: normalizedItems,
            total: pagination?.total_entries || pagination?.total || normalizedItems.length,
            hasMore: hasMore
          }
          
          // Arrêter si on n'a plus d'items
          if (result.items.length === 0) {
            logger.info(`ℹ️ Aucun item sur la page ${page}, arrêt de la pagination`)
            result.hasMore = false
          }
        } catch (error: any) {
          logger.warn(`❌ Erreur avec endpoint fallback page ${page}: ${error.message}`)
          break
        }
      } else {
        // Si aucun endpoint ne fonctionne, utiliser la fonction fallback originale (mais seulement une fois)
        result = await getUserFavoritesFallback(session, { page, perPage: 50 })
        if (result.items.length > 0 && !workingEndpoint) {
          // Mémoriser l'endpoint qui fonctionne
          workingEndpoint = `https://www.vinted.fr/api/v2/catalog/items?favorites=true&per_page=50&page=${page}`
        }
      }
    }
    
    allItems.push(...result.items)
    hasMore = result.hasMore
    page++

    // Limite de sécurité
    if (page > 100) {
      logger.warn('⚠️ Limite de pagination atteinte (100 pages)')
      break
    }

    // Délai entre les pages (augmenté pour éviter rate limiting)
    if (hasMore) {
      const delay = getRequestDelay()
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  logger.info(`✅ Total de ${allItems.length} favoris récupérés en ${page - 1} page(s)`)
  return allItems
}

