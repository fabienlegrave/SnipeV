/**
 * Module pour récupérer les items depuis l'API promoted_closets de Vinted
 * Cette API permet de filtrer directement par recherche, plateforme, prix, etc.
 */

import { buildVintedApiHeaders, FullVintedSession } from './fullSessionManager'
import { logger } from '@/lib/logger'
import { VintedItem, ApiItem } from '@/lib/types/core'
import { normalizeApiItem } from './unifiedSearch'

/**
 * Mapping des noms de plateformes vers les IDs Vinted
 * Basé sur l'exemple fourni : video_game_platform_ids=1273 pour Switch
 */
const PLATFORM_IDS: Record<string, number> = {
  'switch': 1273,
  'nintendo switch': 1273,
  'ps5': 1274, // À vérifier
  'playstation 5': 1274,
  'ps4': 1275, // À vérifier
  'playstation 4': 1275,
  'ps3': 1276, // À vérifier
  'playstation 3': 1276,
  'xbox series': 1277, // À vérifier
  'xbox one': 1278, // À vérifier
  'xbox 360': 1279, // À vérifier
  'wii u': 1280, // À vérifier
  'wii': 1281, // À vérifier
  '3ds': 1282, // À vérifier
  'nintendo 3ds': 1282,
  'ds': 1283, // À vérifier
  'nintendo ds': 1283
}

/**
 * Obtient l'ID de plateforme Vinted depuis un nom de plateforme
 */
function getPlatformId(platform: string | null | undefined): number | null {
  if (!platform) return null
  
  const platformLower = platform.toLowerCase().trim()
  
  // Chercher une correspondance exacte
  if (PLATFORM_IDS[platformLower]) {
    return PLATFORM_IDS[platformLower]
  }
  
  // Chercher une correspondance partielle
  for (const [key, id] of Object.entries(PLATFORM_IDS)) {
    if (platformLower.includes(key) || key.includes(platformLower)) {
      return id
    }
  }
  
  return null
}

/**
 * Génère un search_session_id unique
 */
function generateSearchSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
}

export interface PromotedClosetsParams {
  search_text?: string
  platform?: string | null
  max_price?: number
  per_page?: number
  order?: 'newest_first' | 'price_low_to_high' | 'price_high_to_low'
  status_ids?: string // Ex: "2,1,6" pour disponible, etc.
}

export interface PromotedClosetsResponse {
  items: ApiItem[]
  totalItems: number
}

/**
 * Récupère les items depuis l'API promoted_closets avec filtres
 * 
 * @param session - Session Vinted complète
 * @param params - Paramètres de recherche (titre, plateforme, prix max, etc.)
 * @returns Les items correspondant aux critères
 */
export async function getPromotedClosetsItems(
  session: FullVintedSession,
  params: PromotedClosetsParams = {}
): Promise<PromotedClosetsResponse> {
  const {
    search_text = '',
    platform,
    max_price,
    per_page = 50, // Augmenté à 50 pour récupérer plus d'items par page
    order = 'newest_first',
    status_ids = '2,1,6' // Disponible par défaut
  } = params

  // Utiliser une Map pour dédupliquer par ID (le même item peut apparaître dans plusieurs closets/pages)
  const itemsMap = new Map<number, ApiItem>()
  let currentPage = 1
  let hasMore = true
  const maxPages = 20 // Limite de sécurité pour éviter les boucles infinies

  try {
    while (hasMore && currentPage <= maxPages) {
      // Construire l'URL avec les paramètres
      const urlParams = new URLSearchParams()
      urlParams.append('per_page', per_page.toString())
      urlParams.append('page', currentPage.toString())
      urlParams.append('screen_name', 'catalog')
      urlParams.append('exclude_member_ids', '')
      urlParams.append('search_session_id', generateSearchSessionId())
      urlParams.append('catalog_ids', '3026') // 3026 = jeux vidéo
      urlParams.append('order', order)
      
      // Ajouter le texte de recherche si fourni
      if (search_text.trim()) {
        urlParams.append('search_text', search_text.trim())
      }
      
      // Ajouter le filtre de plateforme si fourni
      const platformId = getPlatformId(platform)
      if (platformId) {
        urlParams.append('video_game_platform_ids', platformId.toString())
      }
      
      // Ajouter les statuts (disponible, etc.)
      if (status_ids) {
        urlParams.append('status_ids', status_ids)
      }
      
      // Ajouter le filtre de prix max si fourni
      if (max_price && max_price > 0) {
        urlParams.append('price_to', max_price.toString())
      }

      const url = `https://www.vinted.fr/api/v2/promoted_closets?${urlParams.toString()}`
      
      if (currentPage === 1) {
        logger.info(`🔍 Promoted closets API: ${url}`)
      } else {
        logger.info(`📄 Promoted closets API - Page ${currentPage}: ${url}`)
      }

      const headers = buildVintedApiHeaders(session)
      
      const response = await fetch(url, {
        method: 'GET',
        headers,
        cache: 'no-store'
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error(`❌ Promoted closets API error: ${response.status} ${response.statusText}`, new Error(errorText))
        throw new Error(`API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      
      // La réponse contient promoted_closets avec des items
      if (data.promoted_closets && Array.isArray(data.promoted_closets)) {
        for (const closet of data.promoted_closets) {
          if (closet.items && Array.isArray(closet.items)) {
            for (const item of closet.items) {
              try {
                // Normaliser l'item au format ApiItem
                const apiItem = normalizePromotedClosetItem(item)
                const normalizedItem = normalizeApiItem(apiItem)
                
                // Dédupliquer par ID (garder le premier trouvé)
                if (!itemsMap.has(normalizedItem.id)) {
                  itemsMap.set(normalizedItem.id, normalizedItem)
                } else {
                  logger.debug(`🔄 Item ${normalizedItem.id} déjà présent, ignoré (doublon dans promoted_closets)`)
                }
              } catch (error) {
                logger.warn(`⚠️ Failed to normalize item ${item.id}`, error as Error)
              }
            }
          }
        }
      }

      // Vérifier s'il y a d'autres pages
      if (data.page_info?.has_more === false) {
        hasMore = false
      } else if (data.pagination) {
        // Alternative : utiliser pagination si page_info n'est pas disponible
        hasMore = data.pagination.current_page < data.pagination.total_pages
      } else {
        // Si aucune info de pagination, arrêter après la première page
        hasMore = false
      }

      if (hasMore) {
        logger.info(`📄 Page ${currentPage} récupérée: ${itemsMap.size} items uniques (has_more: ${data.page_info?.has_more ?? 'N/A'})`)
        currentPage++
        
        // Rate limiting entre les pages
        await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 300))
      } else {
        logger.info(`✅ Dernière page récupérée (page ${currentPage}): ${itemsMap.size} items uniques au total`)
      }
    }

    let allItems = Array.from(itemsMap.values())
    const totalPages = currentPage
    
    // Filtrer par status_ids si spécifié (l'API peut retourner des items avec d'autres statuts)
    if (status_ids) {
      const statusIdsArray = status_ids.split(',').map(id => id.trim())
      
      // Mapping du texte de statut vers les status_ids
      const statusTextToIds: Record<string, string[]> = {
        'neuf': ['6', '1'],
        'neuf sans étiquette': ['6', '1'],
        'très bon état': ['2'],
        'bon état': ['3']
      }
      
      // Fonction pour obtenir les status_ids d'un item à partir de son statut textuel
      const getItemStatusIds = (itemStatus: string | null | undefined): string[] => {
        if (!itemStatus) return []
        const statusLower = itemStatus.toLowerCase()
        
        // Chercher dans le mapping
        for (const [text, ids] of Object.entries(statusTextToIds)) {
          if (statusLower.includes(text.toLowerCase())) {
            return ids
          }
        }
        
        // Fallback : essayer de détecter depuis le texte
        if (statusLower.includes('neuf') || statusLower.includes('new') || statusLower.includes('sealed')) {
          return ['6', '1']
        }
        if (statusLower.includes('très bon') || statusLower.includes('excellent')) {
          return ['2']
        }
        if (statusLower.includes('bon état') || statusLower.includes('good')) {
          return ['3']
        }
        
        return []
      }
      
      // Filtrer les items pour ne garder que ceux dont le status_id correspond
      const filteredItems = allItems.filter(item => {
        // Le champ condition contient le texte du statut (ex: "Très bon état")
        const itemStatusIds = getItemStatusIds(item.condition)
        // Vérifier si au moins un status_id de l'item est dans la liste demandée
        return itemStatusIds.length > 0 && itemStatusIds.some(id => statusIdsArray.includes(id))
      })
      
      if (filteredItems.length < allItems.length) {
        logger.info(`🔍 Filtrage status_ids: ${allItems.length} items → ${filteredItems.length} items (filtrés par status_ids: ${status_ids})`)
      }
      
      allItems = filteredItems
    }
    
    logger.info(`✅ Promoted closets: ${allItems.length} items uniques récupérés (${totalPages} page(s) parcourue(s))`)

    return {
      items: allItems,
      totalItems: allItems.length
    }
  } catch (error) {
    logger.error('❌ Error fetching promoted closets', error as Error)
    throw error
  }
}

/**
 * Normalise un item de promoted_closets vers le format ApiItem
 * Basé sur le format réel de l'API promoted_closets
 */
function normalizePromotedClosetItem(item: any): any {
  // Le format de l'item dans promoted_closets selon l'exemple fourni :
  // - price est une string (ex: "27.0")
  // - service_fee est une string (ex: "2.05")
  // - total_item_price est une string (ex: "29.05")
  // - currency est "EUR"
  // - status est la condition (ex: "Très bon état")
  // - photos est un array d'objets photo
  // - photo est l'image principale
  
  const price = parseFloat(item.price || '0')
  const serviceFee = parseFloat(item.service_fee || '0')
  const totalPrice = parseFloat(item.total_item_price || '0')
  
  // Convertir les photos au format attendu
  const photos: any[] = []
  if (item.photos && Array.isArray(item.photos)) {
    photos.push(...item.photos)
  }
  if (item.photo && !photos.find(p => p.id === item.photo.id)) {
    photos.unshift(item.photo) // Ajouter la photo principale en premier
  }
  
  return {
    id: item.id,
    title: item.title,
    url: item.url || `https://www.vinted.fr${item.path || ''}`,
    path: item.path || null,
    price: {
      amount: price,
      currency_code: item.currency || 'EUR'
    },
    service_fee: serviceFee > 0 ? {
      amount: serviceFee,
      currency_code: item.currency || 'EUR'
    } : undefined,
    total_item_price: totalPrice > 0 ? {
      amount: totalPrice,
      currency_code: item.currency || 'EUR'
    } : undefined,
    condition: item.status || null,
    photos: photos,
    photo: item.photo || (photos.length > 0 ? photos[0] : null),
    favourite_count: item.favourite_count || 0,
    is_favourite: item.is_favourite || false,
    view_count: 0, // Pas disponible dans promoted_closets
    user: {
      id: item.user_id,
      login: null, // Pas disponible dans promoted_closets
      profile_url: null,
      business: item.business_user || false,
      photo: null
    },
    can_buy: true, // On assume disponible si dans les résultats filtrés
    can_instant_buy: false,
    is_reserved: false,
    is_hidden: false,
    is_visible: true,
    is_promoted: false,
    brand_title: item.brand_title || null,
    size_title: item.size_title || null,
    item_box: item.item_box || null,
    description: null, // Pas disponible dans promoted_closets
    added_since: null, // Pas disponible dans promoted_closets
    protection_fee: null,
    shipping_fee: null
  }
}

