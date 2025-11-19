import { fetchWithRetry, DEFAULT_API_HEADERS } from './fetchHtml'
import type { ApiItem, VintedPhoto } from '../types'
import { createSimpleSession, buildFullVintedHeaders, type FullVintedSession } from './fullSessionManager'
import { filterAndSortByRelevance } from './relevanceScorer'
// Enrichissement retiré : trop de risques de ban/429 et peu de plus-value
import { filterAndSortSmart, calculateSmartRelevanceScore, extractSmartKeywords } from './smartRelevanceScorer'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { logger } from '../logger'

// Fonctions utilitaires pour l'enrichissement (dupliquées depuis searchCatalog.ts)
function normalizeGameTitle(title: string): { baseTitle: string; platform: string; condition: string; region: string } {
  const titleLower = title.toLowerCase().trim()
  
  // Extraire la plateforme
  let platform = 'unknown'
  if (titleLower.includes('nes') || titleLower.includes('nintendo')) platform = 'nes'
  else if (titleLower.includes('gameboy') || titleLower.includes('gb')) platform = 'gameboy'
  else if (titleLower.includes('snes') || titleLower.includes('super nintendo')) platform = 'snes'
  else if (titleLower.includes('n64')) platform = 'n64'
  else if (titleLower.includes('gamecube')) platform = 'gamecube'
  else if (titleLower.includes('wii')) platform = 'wii'
  else if (titleLower.includes('switch')) platform = 'switch'
  else if (titleLower.includes('3ds')) platform = '3ds'
  else if (titleLower.includes('ds')) platform = 'ds'

  // Extraire la région
  let region = 'unknown'
  if (titleLower.includes('jap') || titleLower.includes('japonais') || titleLower.includes('japan')) region = 'JAP'
  else if (titleLower.includes('us') || titleLower.includes('usa') || titleLower.includes('ntsc')) region = 'US'
  else region = 'FR' // Par défaut pour les annonces françaises

  // Extraire la condition
  let condition = 'loose'
  if (titleLower.includes('complet') || titleLower.includes('cib') || titleLower.includes('complete')) {
    condition = 'complet'
  } else if (titleLower.includes('boite') || titleLower.includes('box') || titleLower.includes('boîte')) {
    condition = 'boite'
  } else if (titleLower.includes('neuf') || titleLower.includes('new') || titleLower.includes('sealed')) {
    condition = 'neuf'
  }

  // Nettoyer le titre pour extraire le jeu de base
  let baseTitle = titleLower
    .replace(/\b(complet|cib|complete|boite|boîte|box|neuf|new|sealed|loose)\b/g, '')
    .replace(/\b(nes|nintendo|gameboy|gb|snes|super nintendo|n64|gamecube|wii|switch|3ds|ds)\b/g, '')
    .replace(/\b(jap|japonais|japan|us|usa|ntsc|pal|fr|français)\b/g, '')
    .replace(/\b(jeu|game|video|retro|vintage|rare|occasion|bon état|très bon état|parfait état)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  // Amélioration pour les jeux Zelda
  if (baseTitle.includes('oracle')) {
    if (baseTitle.includes('seasons')) {
      baseTitle = 'zelda oracle of seasons'
    } else if (baseTitle.includes('ages')) {
      baseTitle = 'zelda oracle of ages'
    } else {
      baseTitle = 'zelda oracle'
    }
  } else if (baseTitle.includes('link') && baseTitle.includes('awakening')) {
    baseTitle = 'zelda links awakening'
  }

  return { baseTitle, platform, condition, region }
}

function bucketCondition(condition: string | null | undefined): 'loose' | 'complet' | 'neuf' | 'boite' | 'unknown' {
  const c = (condition || '').toLowerCase()
  if (c.includes('neuf')) return 'neuf'
  if (c.includes('complet') || c.includes('cib')) return 'complet'
  if (c.includes('boite') || c.includes('boîte') || c.includes('box')) return 'boite'
  return c ? 'loose' : 'unknown'
}

export interface VintedSearchParams {
  searchText: string
  priceFrom?: number
  priceTo?: number
  page?: number
  perPage?: number
}

export interface VintedApiResponse {
  items: any[]
  pagination?: {
    current_page: number
    total_pages: number
    per_page: number
    total_entries: number
  }
}

function buildSearchUrl(params: VintedSearchParams): string {
  // STRATÉGIE ANTI-DÉTECTION: construire l'URL progressivement
  const searchParams = new URLSearchParams({
    search_text: params.searchText,
    per_page: Math.min(params.perPage || 30, 20).toString(), // Limite à 20 max
    page: (params.page || 1).toString(),
  })

  // Ajouter les filtres de prix maintenant qu'on a les bons headers
  if (params.priceFrom && params.priceFrom > 0) {
    searchParams.append('price_from', params.priceFrom.toString())
  }
  if (params.priceTo && params.priceTo < 1000) {
    searchParams.append('price_to', params.priceTo.toString())
  }

  const url = `https://www.vinted.fr/api/v2/catalog/items?${searchParams.toString()}`
  // logger.debug(`🔗 URL construite: ${url}`)
  return url
}

export function normalizeApiItem(apiItem: any): ApiItem {
  const price = apiItem.price || {}
  const amount = typeof price.amount === 'string' ? parseFloat(price.amount) : (price.amount || 0)
  const currency = price.currency_code || 'EUR'
  
  // Item box (informations formatées) - doit être défini avant condition
  const itemBox = apiItem.item_box || null
  const accessibilityLabel = itemBox?.accessibility_label || null
  
  // Condition: utiliser item_box.second_line si disponible (plus précis pour homepage)
  const condition = itemBox?.second_line || apiItem.status || apiItem.condition || 'unknown'
  
  // Extraction de données supplémentaires disponibles dans l'API
  const canBuy = apiItem.can_buy !== undefined ? apiItem.can_buy : apiItem.is_available
  const canInstantBuy = apiItem.can_instant_buy !== undefined ? apiItem.can_instant_buy : null
  const isReserved = apiItem.is_reserved !== undefined ? apiItem.is_reserved : apiItem.reserved || false
  const isHidden = apiItem.is_hidden !== undefined ? apiItem.is_hidden : false
  
  // Protection fee
  const protectionFee = apiItem.protection_fee || apiItem.buyer_protection_fee || null
  const protectionFeeAmount = protectionFee?.amount 
    ? (typeof protectionFee.amount === 'string' ? parseFloat(protectionFee.amount) : protectionFee.amount)
    : null
  const protectionFeeNote = protectionFee?.note || protectionFee?.description || null
  
  // Shipping fee
  const shippingFee = apiItem.shipping_fee || apiItem.shipping?.price || null
  const shippingFeeAmount = shippingFee 
    ? (typeof shippingFee === 'number' ? shippingFee : (typeof shippingFee === 'object' && shippingFee.amount ? (typeof shippingFee.amount === 'string' ? parseFloat(shippingFee.amount) : shippingFee.amount) : null))
    : null
  
  // Added since (date d'ajout)
  const addedSince = apiItem.added_since || apiItem.created_at || apiItem.created_at_ts ? new Date(apiItem.created_at_ts * 1000).toISOString() : null
  
  // Description complète si disponible
  const description = apiItem.description || apiItem.description_text || apiItem.full_description || null
  
  // Conversion (devises)
  const conversion = apiItem.conversion || null
  
  // Is favourite (si l'utilisateur a déjà cet item en favoris)
  const isFavourite = apiItem.is_favourite !== undefined ? apiItem.is_favourite : false
  
  // Extract photos with full metadata
  const photos: VintedPhoto[] = []
  const images: string[] = [] // Pour compatibilité
  
  // Photo principale de l'item
  if (apiItem.photo) {
    const photo: VintedPhoto = {
      id: apiItem.photo.id,
      image_no: apiItem.photo.image_no,
      width: apiItem.photo.width,
      height: apiItem.photo.height,
      dominant_color: apiItem.photo.dominant_color,
      dominant_color_opaque: apiItem.photo.dominant_color_opaque,
      url: apiItem.photo.url,
      is_main: apiItem.photo.is_main !== undefined ? apiItem.photo.is_main : true,
      thumbnails: (apiItem.photo.thumbnails || []).map((thumb: any) => ({
        type: thumb.type,
        url: thumb.url,
        width: thumb.width,
        height: thumb.height,
        original_size: thumb.original_size !== undefined ? thumb.original_size : null
      })),
      high_resolution: apiItem.photo.high_resolution ? {
        id: apiItem.photo.high_resolution.id,
        timestamp: apiItem.photo.high_resolution.timestamp,
        orientation: apiItem.photo.high_resolution.orientation !== undefined 
          ? apiItem.photo.high_resolution.orientation 
          : (apiItem.photo.orientation !== undefined ? apiItem.photo.orientation : null)
      } : undefined,
      is_suspicious: apiItem.photo.is_suspicious !== undefined ? apiItem.photo.is_suspicious : false,
      full_size_url: apiItem.photo.full_size_url,
      is_hidden: apiItem.photo.is_hidden !== undefined ? apiItem.photo.is_hidden : false,
      extra: apiItem.photo.extra || {}
    }
    photos.push(photo)
    images.push(photo.url) // Ajouter l'URL principale pour compatibilité
  }
  
  // Photos additionnelles si disponibles dans apiItem.photos
  if (Array.isArray(apiItem.photos)) {
    for (const photoData of apiItem.photos) {
      // Éviter les doublons si photo principale déjà ajoutée
      if (!photos.some(p => p.id === photoData.id)) {
        const photo: VintedPhoto = {
          id: photoData.id,
          image_no: photoData.image_no,
          width: photoData.width,
          height: photoData.height,
          dominant_color: photoData.dominant_color,
          dominant_color_opaque: photoData.dominant_color_opaque,
          url: photoData.url,
          is_main: photoData.is_main !== undefined ? photoData.is_main : false,
          thumbnails: (photoData.thumbnails || []).map((thumb: any) => ({
            type: thumb.type,
            url: thumb.url,
            width: thumb.width,
            height: thumb.height,
            original_size: thumb.original_size !== undefined ? thumb.original_size : null
          })),
          high_resolution: photoData.high_resolution ? {
            id: photoData.high_resolution.id,
            timestamp: photoData.high_resolution.timestamp,
            orientation: photoData.high_resolution.orientation !== undefined 
              ? photoData.high_resolution.orientation 
              : (photoData.orientation !== undefined ? photoData.orientation : null)
          } : undefined,
          orientation: photoData.orientation !== undefined ? photoData.orientation : null,
          is_suspicious: photoData.is_suspicious !== undefined ? photoData.is_suspicious : false,
          full_size_url: photoData.full_size_url,
          is_hidden: photoData.is_hidden !== undefined ? photoData.is_hidden : false,
          extra: photoData.extra || {}
        }
        photos.push(photo)
        images.push(photo.url) // Ajouter pour compatibilité
      }
    }
  }

  // Enrichissement : analyser le titre pour extraire les métadonnées
  // SUPPRIMÉ: Plus d'analyse heuristique approximative
  // L'IA Vision se chargera de l'identification précise
  
  // Enrichissement : extraire les données vendeur avec photo complète
  // Support pour user (recherche) et user_id/business_user (homepage)
  const seller = apiItem.user ? {
    id: apiItem.user.id,
    login: apiItem.user.login,
    profile_url: apiItem.user.profile_url,
    photo: apiItem.user.photo ? {
      id: apiItem.user.photo.id,
      width: apiItem.user.photo.width,
      height: apiItem.user.photo.height,
      temp_uuid: apiItem.user.photo.temp_uuid || null,
      url: apiItem.user.photo.url,
      dominant_color: apiItem.user.photo.dominant_color,
      dominant_color_opaque: apiItem.user.photo.dominant_color_opaque,
      thumbnails: apiItem.user.photo.thumbnails || [],
      is_suspicious: apiItem.user.photo.is_suspicious !== undefined ? apiItem.user.photo.is_suspicious : false,
      orientation: apiItem.user.photo.orientation !== undefined ? apiItem.user.photo.orientation : null,
      high_resolution: apiItem.user.photo.high_resolution,
      full_size_url: apiItem.user.photo.full_size_url,
      is_hidden: apiItem.user.photo.is_hidden !== undefined ? apiItem.user.photo.is_hidden : false,
      extra: apiItem.user.photo.extra || {}
    } : undefined,
    business: apiItem.user.business || apiItem.business_user || false
  } : (apiItem.user_id ? {
    // Cas homepage: seulement user_id et business_user disponibles
    id: apiItem.user_id,
    login: `user_${apiItem.user_id}`, // Fallback si pas de login
    profile_url: `https://www.vinted.fr/member/${apiItem.user_id}`,
    photo: undefined,
    business: apiItem.business_user || false
  } : undefined)

  // Construire l'URL correctement
  let itemUrl: string
  if (apiItem.url) {
    // Si l'URL commence par /, c'est un path relatif
    if (apiItem.url.startsWith('/')) {
      itemUrl = `https://www.vinted.fr${apiItem.url}`
    } else if (apiItem.url.startsWith('http')) {
      // URL complète
      itemUrl = apiItem.url
    } else {
      // Path sans slash initial
      itemUrl = `https://www.vinted.fr/${apiItem.url}`
    }
  } else if (apiItem.path) {
    itemUrl = `https://www.vinted.fr${apiItem.path.startsWith('/') ? apiItem.path : '/' + apiItem.path}`
  } else {
    itemUrl = `https://www.vinted.fr/items/${apiItem.id}`
  }

  return {
    id: typeof apiItem.id === 'number' ? apiItem.id : parseInt(apiItem.id?.toString() || '0'),
    url: itemUrl,
    path: apiItem.path || (apiItem.url && apiItem.url.startsWith('/') ? apiItem.url : null), // Stocker le path séparément
    title: apiItem.title || null,
    description: description, // Description complète extraite
    price: {
      amount: isFinite(amount) ? amount : null,
      currency_code: currency
    },
    can_buy: canBuy,
    can_instant_buy: canInstantBuy,
    is_reserved: isReserved,
    is_hidden: isHidden,
    protection_fee: protectionFeeAmount !== null ? {
      amount: protectionFeeAmount,
      note: protectionFeeNote
    } : null,
    shipping_fee: shippingFeeAmount,
    condition,
    added_since: addedSince,
    images, // Array simple pour compatibilité
    photos, // Données enrichies
    view_count: apiItem.view_count || apiItem.views_count || 0,
    favourite_count: apiItem.favourite_count || apiItem.favorites_count || apiItem.likes_count || 0,
    
    // Nouvelles données d'enrichissement
    seller,
    service_fee: apiItem.service_fee ? {
      amount: typeof apiItem.service_fee.amount === 'string' ? parseFloat(apiItem.service_fee.amount) : apiItem.service_fee.amount,
      currency_code: apiItem.service_fee.currency_code || currency
    } : undefined,
    total_item_price: apiItem.total_item_price ? {
      amount: typeof apiItem.total_item_price.amount === 'string' ? parseFloat(apiItem.total_item_price.amount) : apiItem.total_item_price.amount,
      currency_code: apiItem.total_item_price.currency_code || currency
    } : undefined,
    
    is_visible: apiItem.is_visible !== undefined ? apiItem.is_visible : true,
    is_promoted: apiItem.promoted !== undefined ? apiItem.promoted : apiItem.is_promoted || false,
    brand_title: apiItem.brand_title || apiItem.brand?.title || null,
    size_title: apiItem.size_title || apiItem.size?.title || null,
    content_source: apiItem.content_source || null,
    
    // Métadonnées supplémentaires disponibles dans l'API
    category_id: apiItem.catalog_id || apiItem.category_id || null,
    catalog_id: apiItem.catalog_id || null,
    
    // Localisation si disponible
    location: apiItem.location ? {
      city: apiItem.location.city || null,
      country: apiItem.location.country || null,
      country_code: apiItem.location.country_code || null
    } : (apiItem.city || apiItem.country ? {
      city: apiItem.city || null,
      country: apiItem.country || null,
      country_code: apiItem.country_code || null
    } : null),
    
    // Métadonnées de recherche
    search_tracking_params: apiItem.search_tracking_params || null,
    
    // Données supplémentaires de l'API
    is_favourite: isFavourite,
    item_box: itemBox ? {
      first_line: itemBox.first_line || null,
      second_line: itemBox.second_line || null,
      accessibility_label: accessibilityLabel,
      item_id: itemBox.item_id || null,
      exposures: itemBox.exposures || [], // Exposures si disponibles
      badge: itemBox.badge ? {
        title: itemBox.badge.title || null
      } : null
    } : null,
    conversion: conversion,
    
    // Données brutes pour analyse future (limité pour éviter les problèmes de taille)
    raw: apiItem ? (() => {
      try {
        const serialized = JSON.stringify(apiItem)
        // Limiter à 10KB si trop grand
        if (serialized.length > 10000) {
          return JSON.parse(serialized.substring(0, 10000) + '...')
        }
        return apiItem
      } catch {
        return null
      }
    })() : null,
    
    scraped_at: new Date().toISOString()
  }
}

export async function searchCatalogWithFullSession(
  params: VintedSearchParams,
  session?: FullVintedSession
): Promise<{ items: ApiItem[], hasMore: boolean, totalPages?: number }> {
  const url = buildSearchUrl(params)
  
  // IMPORTANT: Headers EXACTS du navigateur qui fonctionne
  // Même si l'API retourne du JSON, le navigateur envoie accept: text/html
  const { buildVintedApiHeaders } = await import('./fullSessionManager')
  const headers = session ? buildVintedApiHeaders(session) : {
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'accept-encoding': 'gzip, deflate, br, zstd',
    'accept-language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    'cache-control': 'no-cache',
    'connection': 'keep-alive',
    'host': 'www.vinted.fr',
    'pragma': 'no-cache',
    'sec-ch-ua': '"Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
    'sec-ch-ua-arch': '"x86"',
    'sec-ch-ua-bitness': '"64"',
    'sec-ch-ua-full-version': '"141.0.7390.123"',
    'sec-ch-ua-full-version-list': '"Google Chrome";v="141.0.7390.123", "Not?A_Brand";v="8.0.0.0", "Chromium";v="141.0.7390.123"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-model': '""',
    'sec-ch-ua-platform': '"Windows"',
    'sec-ch-ua-platform-version': '"15.0.0"',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'none',
    'sec-fetch-user': '?1',
    'upgrade-insecure-requests': '1',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
  }

      // logger.debug(`🌐 Recherche API: ${url}`)
      // logger.debug(`🔥 Headers complets pour Cloudflare (${Object.keys(headers).length} headers)`)

  try {
    const html = await fetchWithRetry(url, { headers })
    const data: VintedApiResponse = JSON.parse(html)

    if (!data.items || !Array.isArray(data.items)) {
      throw new Error('Invalid API response format')
    }

    // Log de la structure complète pour analyse (désactivé)
    // if (data.items && data.items.length > 0) {
    //   const sampleItem = JSON.stringify(data.items[0], null, 2)
    //   logger.debug(`📊 Structure API complète (premier item, ${sampleItem.length} chars):`, sampleItem.substring(0, 2000))
    //   
    //   // Log des clés disponibles pour analyse
    //   const availableKeys = Object.keys(data.items[0])
    //   logger.info(`🔑 Clés disponibles dans l'API (${availableKeys.length} clés): ${availableKeys.join(', ')}`)
    //   
    //   // Sauvegarder la réponse complète dans un fichier de debug
    //   try {
    //     const debugDir = join(process.cwd(), 'search-results', 'debug')
    //     await mkdir(debugDir, { recursive: true })
    //     
    //     const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    //     const debugFile = join(debugDir, `api-response-${timestamp}.json`)
    //     
    //     const debugData = {
    //       search_params: params,
    //       timestamp: new Date().toISOString(),
    //       total_items: data.items.length,
    //       pagination: data.pagination,
    //       sample_item_keys: availableKeys,
    //       sample_item_full: data.items[0],
    //       all_items_keys_analysis: (() => {
    //         // Analyser toutes les clés présentes dans tous les items
    //         const allKeys = new Set<string>()
    //         data.items.forEach(item => {
    //           Object.keys(item).forEach(key => allKeys.add(key))
    //         })
    //         return Array.from(allKeys).sort()
    //       })(),
    //       // Sauvegarder les 3 premiers items complets pour analyse
    //       first_3_items: data.items.slice(0, 3)
    //     }
    //     
    //     await writeFile(debugFile, JSON.stringify(debugData, null, 2), 'utf-8')
    //     logger.info(`💾 Données API complètes sauvegardées: ${debugFile}`)
    //   } catch (error) {
    //     logger.warn('Failed to save debug file', error as Error)
    //   }
    // }
    
    const items = data.items.map(normalizeApiItem)
    const hasMore = data.pagination ? 
      data.pagination.current_page < data.pagination.total_pages : 
      false
    const totalPages = data.pagination?.total_pages

    // logger.info(`✅ ${items.length} items trouvés, hasMore: ${hasMore}${totalPages ? `, total pages: ${totalPages}` : ''}`)

    return { items, hasMore, totalPages }

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`❌ Erreur recherche API: ${errorMessage}`, error as Error)
    
    if (errorMessage.includes('HTTP 403') || errorMessage.includes('HTTP 401')) {
      throw new Error(`HTTP 403/401 - Token expired or invalid!`)
    }
    
    throw error
  }
}

export async function searchAllPagesWithFullSession(
  searchText: string,
  options: {
    priceFrom?: number
    priceTo?: number
    limit?: number
    session?: FullVintedSession
    minRelevanceScore?: number
  } = {}
): Promise<ApiItem[]> {
  const { priceFrom, priceTo, limit = 100, session, minRelevanceScore = 50 } = options
  
  let allItems: ApiItem[] = []
  let currentPage = 1
  let hasMore = true
  const maxPagesToSearch = 15 // Augmenté à 15 pages pour trouver plus de résultats pertinents
  let totalPages = maxPagesToSearch // Valeur par défaut, sera mise à jour après la première requête

  while (hasMore && allItems.length < limit && currentPage <= maxPagesToSearch) {
    const remainingItems = limit - allItems.length
    const perPage = Math.min(20, remainingItems) // Réduire à 20 max

    logger.scrape.page(currentPage, totalPages, perPage)

    // DÉLAI ANTI-DÉTECTION avant chaque requête (augmenté pour éviter les rate limits)
    if (currentPage > 1) {
      const delay = 7500 // 7,5 secondes entre chaque page pour éviter les 429
      logger.info(`⏳ Délai de ${delay / 1000}s avant la page ${currentPage}/${totalPages} (pour éviter les rate limits)`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }

    const result = await searchCatalogWithFullSession({
      searchText,
      priceFrom,
      priceTo,
      page: currentPage,
      perPage
    }, session)

    // Mettre à jour totalPages après la première requête si disponible
    if (currentPage === 1 && result.totalPages) {
      totalPages = Math.min(result.totalPages, maxPagesToSearch)
      // logger.info(`📄 Total pages détecté: ${result.totalPages} (limité à ${maxPagesToSearch})`)
    }

    // Dédupliquer par ID avant d'ajouter (éviter les doublons)
    const existingIds = new Set(allItems.map(item => item.id))
    const newItems = result.items.filter(item => !existingIds.has(item.id))
    allItems.push(...newItems)
    
    if (newItems.length < result.items.length) {
      // logger.debug(`🔄 ${result.items.length - newItems.length} doublons ignorés`)
    }
    
    hasMore = result.hasMore && allItems.length < limit
    currentPage++

    // logger.info(`📊 Total accumulé: ${allItems.length}/${limit}`)
    
    // Note: Le délai de 5 secondes est déjà appliqué au début de la boucle (avant currentPage > 1)
    // Pas besoin de délai supplémentaire ici
  }

  // STRATÉGIE SIMPLIFIÉE : Filtrage intelligent SANS enrichissement
  // L'enrichissement est retiré car il cause trop de risques de ban/429
  // et n'apporte pas assez de plus-value pour la recherche
  
  // Résumé de la recherche (logs réduits)
  // logger.info(`\n${'='.repeat(80)}`)
  // logger.info(`🔍 RECHERCHE: "${searchText}"`)
  // logger.info(`📊 Items bruts récupérés: ${allItems.length}`)
  // logger.info(`🎯 Seuil de pertinence: ${minRelevanceScore || 50}`)
  // logger.info(`📈 Limite de résultats: ${limit}`)
  // logger.info(`${'='.repeat(80)}\n`)
  
  // Filtrage et scoring intelligent (sans enrichissement)
  // logger.info(`🔍 Filtrage intelligent (${allItems.length} items bruts)...`)
  const finalItems = filterAndSortSmart(allItems, searchText, {
    minScore: minRelevanceScore || 50,
    maxResults: limit,
    requireHighConfidence: false
  })
  
  // Sauvegarder les résultats dans un fichier pour analyse (désactivé)
  // try {
  //   await saveSearchResultsToFile(searchText, allItems, finalItems, {
  //       minRelevanceScore: minRelevanceScore || 50,
  //     limit
  //   })
  // } catch (error) {
  //   logger.warn('⚠️ Erreur lors de la sauvegarde des résultats', error as Error)
  // }
  
  // logger.info(`\n${'='.repeat(80)}`)
  // logger.info(`✅ RÉSULTATS FINAUX: ${finalItems.length} items pertinents trouvés`)
  // logger.info(`${'='.repeat(80)}\n`)

  // Si aucun résultat mais qu'on a des items, retourner quand même les meilleurs
  if (finalItems.length === 0 && allItems.length > 0) {
    logger.warn(`⚠️ Aucun item ne passe le filtre strict, retour des meilleurs résultats...`)
    const fallbackItems = filterAndSortSmart(allItems, searchText, {
      minScore: 10, // Seuil réduit
      maxResults: Math.min(limit, 30)
    })
    
    // Si toujours rien, retourner les top items même avec score bas
    if (fallbackItems.length === 0) {
      logger.warn(`⚠️ Aucun item même avec seuil bas, retour des top items par score...`)
      const { calculateSmartRelevanceScore } = await import('./smartRelevanceScorer')
      const allScored = allItems.map(item => {
        const { score } = calculateSmartRelevanceScore(item, searchText)
        return { item, score }
      })
      allScored.sort((a, b) => b.score - a.score)
      return allScored.slice(0, Math.min(limit, 20)).map(s => s.item)
    }
    
    return fallbackItems
  }

  return finalItems
}

/**
 * Sauvegarde les résultats de recherche dans un fichier JSON pour analyse
 */
async function saveSearchResultsToFile(
  searchText: string,
  allItems: ApiItem[],
  finalItems: ApiItem[],
  options: { minRelevanceScore: number; limit: number }
): Promise<void> {
  try {
    // Créer le dossier de sauvegarde si nécessaire
    const outputDir = join(process.cwd(), 'search-results')
    await mkdir(outputDir, { recursive: true })
    
    // Nom de fichier avec timestamp et recherche normalisée
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const searchNormalized = searchText.toLowerCase().replace(/[^a-z0-9]+/g, '_').substring(0, 50)
    const filename = `search_${searchNormalized}_${timestamp}.json`
    const filepath = join(outputDir, filename)
    
    // Calculer les scores détaillés pour tous les items
    const keywords = extractSmartKeywords(searchText)
    const allItemsWithScores = allItems.map(item => {
      const { score, reasons, confidence } = calculateSmartRelevanceScore(item, searchText)
      return {
        id: item.id,
        title: item.title,
        price: item.price,
        url: item.url,
        description: item.description?.substring(0, 500) || null,
        condition: item.condition,
        detected_platform: item.detected_platform,
        score,
        confidence,
        reasons,
        isInFinalResults: finalItems.some(fi => fi.id === item.id),
        // Correspondances détaillées
        matches: {
          exact: keywords.exact.filter(kw => 
            (item.title || '').toLowerCase().includes(kw.toLowerCase()) ||
            (item.description || '').toLowerCase().includes(kw.toLowerCase())
          ),
          platform: keywords.platform.filter(p => 
            (item.title || '').toLowerCase().includes(p.toLowerCase()) ||
            (item.description || '').toLowerCase().includes(p.toLowerCase())
          ),
          gameTitle: keywords.gameTitle ? {
            inTitle: (item.title || '').toLowerCase().includes(keywords.gameTitle.toLowerCase()),
            inDescription: (item.description || '').toLowerCase().includes(keywords.gameTitle.toLowerCase())
          } : null
        },
        vintedScore: item.search_tracking_params?.score,
        viewCount: item.view_count,
        favouriteCount: item.favourite_count
      }
    })
    
    // Trier par score décroissant
    allItemsWithScores.sort((a, b) => b.score - a.score)
    
    // Structure complète à sauvegarder
    const searchResults = {
      metadata: {
        searchText,
        timestamp: new Date().toISOString(),
        totalItemsFound: allItems.length,
        finalItemsCount: finalItems.length,
        minRelevanceScore: options.minRelevanceScore,
        limit: options.limit,
        keywords: {
          exact: keywords.exact,
          platform: keywords.platform,
          gameTitle: keywords.gameTitle,
          allWords: keywords.allWords
        }
      },
      items: allItemsWithScores,
      summary: {
        itemsPassingFilter: allItemsWithScores.filter(item => item.isInFinalResults).length,
        topScores: allItemsWithScores.slice(0, 10).map(item => ({
          id: item.id,
          title: item.title,
          score: item.score,
          confidence: item.confidence
        })),
        scoreDistribution: {
          high: allItemsWithScores.filter(item => item.confidence === 'high').length,
          medium: allItemsWithScores.filter(item => item.confidence === 'medium').length,
          low: allItemsWithScores.filter(item => item.confidence === 'low').length
        }
      }
    }
    
    // Sauvegarder le fichier
    await writeFile(filepath, JSON.stringify(searchResults, null, 2), 'utf-8')
    
    logger.info(`\n💾 Résultats sauvegardés dans: ${filepath}`)
    logger.info(`   - ${allItems.length} items analysés`)
    logger.info(`   - ${finalItems.length} items passent le filtre`)
    logger.info(`   - Fichier: ${filename}\n`)
  } catch (error: unknown) {
    // Ne pas faire échouer la recherche si la sauvegarde échoue
    logger.error('❌ Erreur lors de la sauvegarde des résultats', error as Error)
  }
} 