import { fetchWithRetry, DEFAULT_API_HEADERS } from './fetchHtml'
import type { ApiItem, VintedPhoto } from '../types'
import { createSessionFromToken, buildVintedHeaders } from './sessionManager'
import { createSimpleSession, buildFullVintedHeaders } from './fullSessionManager'

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
    total_entries: number
  }
}

function buildSearchUrl(params: VintedSearchParams): string {
  const { searchText, priceFrom, priceTo, page = 1, perPage = 96 } = params
  const encoded = encodeURIComponent(searchText)
  let url = `https://www.vinted.fr/api/v2/catalog/items?search_text=${encoded}&per_page=${perPage}&page=${page}`
  
  if (priceFrom) url += `&price_from=${priceFrom}`
  if (priceTo) url += `&price_to=${priceTo}`
  
  return url
}

function buildHeaders(accessToken?: string): Record<string, string> {
  if (accessToken) {
    const session = createSimpleSession(accessToken)
    return buildFullVintedHeaders(session)
  }
  
  // Headers par défaut sans authentification
  return {
    'accept': 'application/json, text/plain, */*',
    'accept-encoding': 'gzip, deflate, br, zstd',
    'accept-language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    'referer': 'https://www.vinted.fr/'
  }
}

// Fonctions utilitaires pour l'enrichissement
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

function normalizeApiItem(apiItem: any): ApiItem {
  // Parse price from API response
  let amount: number | null = null
  
  if (apiItem.price) {
    if (typeof apiItem.price === 'number') {
      amount = apiItem.price
    } else if (apiItem.price.amount !== undefined) {
      // Handle string or number amount
      const priceAmount = typeof apiItem.price.amount === 'string' 
        ? parseFloat(apiItem.price.amount) 
        : apiItem.price.amount
      amount = isFinite(priceAmount) ? priceAmount : null
    }
  }
  
  const currency = apiItem.price?.currency_code || apiItem.currency || "EUR"
  
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
      is_main: apiItem.photo.is_main,
      thumbnails: apiItem.photo.thumbnails || [],
      high_resolution: apiItem.photo.high_resolution,
      is_suspicious: apiItem.photo.is_suspicious,
      full_size_url: apiItem.photo.full_size_url,
      is_hidden: apiItem.photo.is_hidden,
      extra: apiItem.photo.extra
    }
    photos.push(photo)
    images.push(photo.url) // Ajouter l'URL principale pour compatibilité
  }
  
  // Photos additionnelles si disponibles
  if (Array.isArray(apiItem.photos)) {
    for (const photoData of apiItem.photos) {
      const photo: VintedPhoto = {
        id: photoData.id,
        image_no: photoData.image_no,
        width: photoData.width,
        height: photoData.height,
        dominant_color: photoData.dominant_color,
        dominant_color_opaque: photoData.dominant_color_opaque,
        url: photoData.url,
        is_main: photoData.is_main,
        thumbnails: photoData.thumbnails || [],
        high_resolution: photoData.high_resolution,
        is_suspicious: photoData.is_suspicious,
        full_size_url: photoData.full_size_url,
        is_hidden: photoData.is_hidden,
        extra: photoData.extra
      }
      photos.push(photo)
      images.push(photo.url) // Ajouter pour compatibilité
    }
  }
  
  // Extract condition from status
  const condition = apiItem.status || null
  
  // Enrichissement : analyser le titre pour extraire les métadonnées
  // SUPPRIMÉ: Plus d'analyse heuristique approximative
  // L'IA Vision se chargera de l'identification précise
  
  // Enrichissement : extraire les données vendeur
  const seller = apiItem.user ? {
    id: apiItem.user.id,
    login: apiItem.user.login,
    profile_url: apiItem.user.profile_url,
    photo: apiItem.user.photo,
    business: apiItem.user.business || false
  } : undefined

  return {
    id: apiItem.id,
    url: `https://www.vinted.fr/items/${apiItem.id}`,
    title: apiItem.title || null,
    price: {
      amount,
      currency_code: currency
    },
    condition,
    images, // Array simple pour compatibilité
    photos, // Données enrichies
    view_count: apiItem.view_count || 0,
    favourite_count: apiItem.favourite_count || 0,
    
    // Nouvelles données d'enrichissement
    seller,
    service_fee: apiItem.service_fee ? {
      amount: apiItem.service_fee.amount,
      currency_code: apiItem.service_fee.currency_code
    } : undefined,
    total_item_price: apiItem.total_item_price ? {
      amount: apiItem.total_item_price.amount,
      currency_code: apiItem.total_item_price.currency_code
    } : undefined,
    
    is_visible: apiItem.is_visible,
    is_promoted: apiItem.promoted,
    brand_title: apiItem.brand_title,
    size_title: apiItem.size_title,
    content_source: apiItem.content_source,
    
    // SUPPRIMÉ: Champs heuristiques approximatifs
    // L'IA Vision fournira des données précises
    normalized_game_title: null, // Sera rempli par l'IA
    detected_platform: null,     // Sera rempli par l'IA
    condition_bucket: null,      // Sera rempli par l'IA
    detected_region: null,       // Sera rempli par l'IA
    
    // Métadonnées de recherche
    search_tracking_params: apiItem.search_tracking_params,
    
    scraped_at: new Date().toISOString()
  }
}

export async function searchCatalog(
  params: VintedSearchParams,
  accessToken?: string
): Promise<{ items: ApiItem[], hasMore: boolean }> {
  const url = buildSearchUrl(params)
  const headers = buildHeaders(accessToken)

  try {
    const html = await fetchWithRetry(url, { headers })
    const data: VintedApiResponse = JSON.parse(html)

    if (!data.items || !Array.isArray(data.items)) {
      throw new Error('Invalid API response format')
    }

    const items = data.items.map(normalizeApiItem)
    const hasMore = data.pagination ? 
      data.pagination.current_page < data.pagination.total_pages : 
      false

    return { items, hasMore }

  } catch (error: any) {
    if (error.message?.includes('HTTP 403') || error.message?.includes('HTTP 401')) {
      const authType = accessToken ? 'Token' : 'No auth'
      throw new Error(`HTTP 403/401 - ${authType} expired or invalid!`)
    }
    throw error
  }
}

export async function searchAllPages(
  searchText: string,
  options: {
    priceFrom?: number
    priceTo?: number
    limit?: number
    accessToken?: string
  } = {}
): Promise<ApiItem[]> {
  const { priceFrom, priceTo, limit = Infinity, accessToken } = options
  const allItems: ApiItem[] = []
  let page = 1

  while (allItems.length < limit) {
    console.log(`📄 Fetching page ${page}...`)
    
    try {
      const { items, hasMore } = await searchCatalog({
        searchText,
        priceFrom,
        priceTo,
        page
      }, accessToken)

      if (items.length === 0) {
        console.log(`📄 No more results at page ${page}`)
        break
      }

      allItems.push(...items)

      if (allItems.length >= limit && limit !== Infinity) {
        allItems.splice(limit)
        console.log(`🔒 Limit reached: ${limit} items`)
        break
      }

      if (!hasMore) {
        console.log(`📄 No more pages available`)
        break
      }

      page++
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 700 + Math.random() * 500))

    } catch (error: any) {
      if (error.message?.includes('HTTP 400')) {
        console.log(`🚫 Vinted pagination limit reached at page ${page} (this is normal)`)
        console.log(`📊 Vinted typically limits to ~${page-1} pages maximum`)
        break
      }
      throw error
    }
  }

  return allItems
}

/**
 * Recherche simplifiée sans enrichissement IA
 * Version basique qui ne fait que récupérer les données de l'API Vinted
 */
export async function searchVintedCatalogSimple(
  query: string,
  options: {
    priceFrom?: number
    priceTo?: number
    limit?: number
    session?: any
  } = {}
): Promise<any[]> {
  const { priceFrom, priceTo, limit = 100, session } = options

  const allItems: any[] = []
  let page = 1
  const maxPages = Math.ceil(limit / 96) // 96 items par page max

  while (page <= maxPages) {
    try {
      const searchParams: VintedSearchParams = {
        searchText: query,
        priceFrom,
        priceTo,
        page,
        perPage: 96
      }

      const url = buildSearchUrl(searchParams)
      const headers = session ? buildFullVintedHeaders(session) : buildHeaders()

      const response = await fetchWithRetry(url, {
        headers,
        timeout: 10000
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data: VintedApiResponse = await response.json()

      if (!data.items || data.items.length === 0) {
        console.log(`📄 No more results at page ${page}`)
        break
      }

      // Conversion simple des items Vinted vers ApiItem
      const convertedItems = data.items.map(item => ({
        id: item.id,
        title: item.title,
        description: item.description || '',
        price: {
          amount: item.price_numeric || item.price,
          currency_code: item.currency || 'EUR'
        },
        url: item.url || `https://www.vinted.fr/items/${item.id}`,
        photos: (item.photos || []).map((photo: any) => ({
          url: photo.url || '',
          url_thumbnail: photo.url_thumbnail || photo.url || ''
        })),
        brand: item.brand_title || '',
        size: item.size_title || '',
        condition: item.status || '',
        // Métadonnées de base
        scraped_at: new Date().toISOString(),
        source: 'vinted_api'
      }))

      allItems.push(...convertedItems)

      if (allItems.length >= limit) {
        allItems.splice(limit)
        console.log(`🔒 Limit reached: ${limit} items`)
        break
      }

      // Vérifier s'il y a plus de pages
      const totalPages = data.pagination?.total_pages || 1
      if (page >= totalPages) {
        console.log(`📄 No more pages available`)
        break
      }

      page++

      // Rate limiting simple
      await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500))

    } catch (error: any) {
      if (error.message?.includes('HTTP 400') || error.message?.includes('HTTP 403')) {
        console.log(`🚫 Vinted limit reached at page ${page}`)
        break
      }
      throw error
    }
  }

  return allItems
}