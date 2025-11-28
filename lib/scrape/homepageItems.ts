/**
 * Module pour récupérer les items recommandés depuis la page d'accueil Vinted
 * 
 * L'endpoint /api/v2/homepage/all retourne des items personnalisés basés sur
 * l'historique de recherche/navigation de l'utilisateur
 */

import { buildVintedApiHeaders, FullVintedSession } from './fullSessionManager'
import { logger } from '@/lib/logger'
import { VintedItem, ApiItem } from '@/lib/types/core'
import { normalizeApiItem } from './unifiedSearch'

export interface HomepageRequest {
  nextPageToken?: string
  homepageSessionId?: string
  columnCount?: number
  version?: number
}

export interface HomepageResponse {
  items: VintedItem[]
  nextPageToken?: string
  homepageSessionId: string
  hasMore: boolean
  totalItems: number
}

/**
 * Récupère les items recommandés depuis la page d'accueil Vinted
 * 
 * @param session - Session Vinted complète
 * @param options - Options pour la requête (pagination, session ID, etc.)
 * @returns Les items recommandés avec pagination
 */
export async function getHomepageItems(
  session: FullVintedSession,
  options: HomepageRequest = {}
): Promise<HomepageResponse> {
  const {
    nextPageToken,
    homepageSessionId,
    columnCount = 5,
    version = 4
  } = options

  // Construire l'URL avec les paramètres
  const params = new URLSearchParams()
  if (nextPageToken) {
    params.append('next_page_token', nextPageToken)
  }
  if (homepageSessionId) {
    params.append('homepage_session_id', homepageSessionId)
  }
  params.append('column_count', columnCount.toString())
  params.append('version', version.toString())

  const url = `https://www.vinted.fr/api/v2/homepage/all?${params.toString()}`
  
  logger.info(`🏠 Récupération des items homepage: ${url}`)

  try {
    // Construire les headers pour l'API Vinted
    const headers = buildVintedApiHeaders(session)

    const response = await fetch(url, {
      method: 'GET',
      headers,
      cache: 'no-store'
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error(`❌ Erreur homepage API: HTTP ${response.status} - ${errorText.substring(0, 200)}`)
      
      // Message d'erreur plus explicite pour 403
      if (response.status === 403) {
        const hasAccessToken = session.accessToken && session.accessToken.length > 0
        if (!hasAccessToken) {
          throw new Error(`Homepage API error: HTTP 403 - Cet endpoint nécessite un access_token_web (authentification complète). Les cookies Cloudflare/Datadome seuls ne suffisent pas.`)
        } else {
          throw new Error(`Homepage API error: HTTP 403 - Les cookies peuvent être expirés ou invalides. Veuillez régénérer vos cookies.`)
        }
      }
      
      throw new Error(`Homepage API error: HTTP ${response.status}`)
    }

    const data = await response.json()

    // Log de la structure pour debug
    logger.debug(`🏠 Structure de la réponse homepage:`, {
      isArray: Array.isArray(data),
      keys: Object.keys(data || {}),
      hasItems: !!(data?.items),
      hasData: !!(data?.data),
      hasDataItems: !!(data?.data?.items),
      firstLevelType: typeof data,
      sample: JSON.stringify(data).substring(0, 500)
    })

    // Extraire les items depuis la réponse
    // La structure de l'endpoint homepage est: { blocks: [{ type: "item", entity: {...} }] }
    let rawItems: any[] = []
    
    if (Array.isArray(data)) {
      rawItems = data
    } else if (data.blocks && Array.isArray(data.blocks)) {
      // Structure homepage: extraire les entities des blocks de type "item"
      rawItems = data.blocks
        .filter((block: any) => block.type === 'item' && block.entity)
        .map((block: any) => block.entity)
    } else if (data.items && Array.isArray(data.items)) {
      rawItems = data.items
    } else if (data.data && Array.isArray(data.data)) {
      rawItems = data.data
    } else if (data.data?.items && Array.isArray(data.data.items)) {
      rawItems = data.data.items
    } else if (data.catalog && Array.isArray(data.catalog)) {
      rawItems = data.catalog
    } else if (data.results && Array.isArray(data.results)) {
      rawItems = data.results
    } else if (data.content && Array.isArray(data.content)) {
      rawItems = data.content
    } else if (data.feed && Array.isArray(data.feed)) {
      rawItems = data.feed
    } else if (data.products && Array.isArray(data.products)) {
      rawItems = data.products
    }

    logger.info(`📦 ${rawItems.length} items trouvés dans la homepage`)
    
    // Si aucun item trouvé, logger la structure complète pour debug
    if (rawItems.length === 0) {
      logger.warn(`⚠️ Aucun item trouvé dans la réponse. Structure complète:`, JSON.stringify(data, null, 2).substring(0, 2000))
    }

    // Normaliser les items (utiliser la même fonction que pour la recherche)
    const normalizedItems: VintedItem[] = rawItems
      .map((item: any) => {
        try {
          return normalizeApiItem(item)
        } catch (error) {
          logger.warn(`⚠️ Erreur normalisation item ${item.id}: ${error}`)
          return null
        }
      })
      .filter((item: VintedItem | null): item is VintedItem => item !== null)

    // Extraire les infos de pagination
    // La pagination peut être dans data.pagination ou dans data.load_more_button
    const nextToken = data.next_page_token || data.pagination?.next_page_token || 
                     (data.load_more_button?.url ? extractNextPageToken(data.load_more_button.url) : undefined)
    const sessionId = data.homepage_session_id || homepageSessionId || generateSessionId()
    const hasMore = !!nextToken || !!data.load_more_button || (data.pagination?.has_more ?? false)

    return {
      items: normalizedItems,
      nextPageToken: nextToken,
      homepageSessionId: sessionId,
      hasMore,
      totalItems: normalizedItems.length
    }

  } catch (error) {
    logger.error('Erreur lors de la récupération homepage', error as Error)
    throw error
  }
}

/**
 * Génère un nouveau session ID pour la homepage
 */
function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
}

/**
 * Extrait le next_page_token depuis l'URL du bouton "load more"
 */
function extractNextPageToken(url: string): string | undefined {
  try {
    const urlObj = new URL(url, 'https://www.vinted.fr')
    return urlObj.searchParams.get('next_page_token') || undefined
  } catch {
    return undefined
  }
}

/**
 * Récupère plusieurs pages d'items homepage
 * 
 * @param session - Session Vinted complète
 * @param maxPages - Nombre maximum de pages à récupérer
 * @param initialSessionId - Session ID initial (optionnel)
 * @returns Tous les items récupérés
 */
export async function getAllHomepageItems(
  session: FullVintedSession,
  maxPages: number = 20,
  initialSessionId?: string
): Promise<VintedItem[]> {
  const allItems: VintedItem[] = []
  let nextPageToken: string | undefined
  let sessionId = initialSessionId || generateSessionId()
  let pageCount = 0

  logger.info(`🏠 Début du chargement de toutes les pages homepage (max ${maxPages} pages)...`)

  while (pageCount < maxPages) {
    logger.info(`📄 Page ${pageCount + 1}/${maxPages} de la homepage... (${allItems.length} items accumulés)`)

    const result = await getHomepageItems(session, {
      nextPageToken,
      homepageSessionId: sessionId,
      columnCount: 5,
      version: 4
    })

    allItems.push(...result.items)
    sessionId = result.homepageSessionId

    if (!result.hasMore || !result.nextPageToken) {
      logger.info(`✅ Fin de la pagination homepage (${allItems.length} items au total après ${pageCount + 1} pages)`)
      break
    }

    nextPageToken = result.nextPageToken
    pageCount++

    // Petit délai entre les pages pour éviter le rate limiting
    if (pageCount < maxPages && result.hasMore) {
      await new Promise(resolve => setTimeout(resolve, 300)) // Réduit à 300ms pour aller plus vite
    }
  }

  logger.info(`🎉 Chargement terminé: ${allItems.length} items récupérés sur ${pageCount} pages`)
  return allItems
}

