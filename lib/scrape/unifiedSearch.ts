import { fetchWithRetry } from './fetchHtml'
import type { ApiItem, VintedPhoto } from '../types'
import { createSimpleSession, buildFullVintedHeaders, type FullVintedSession } from './fullSessionManager'
import { filterAndSortByRelevance } from './relevanceScorer'
import { getRequestDelayWithJitter } from '../config/delays'
import { logger } from '../logger'

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

export interface SearchOptions {
  priceFrom?: number
  priceTo?: number
  limit?: number
  session?: FullVintedSession
  minRelevanceScore?: number
  maxPages?: number
  maxItemAgeDays?: number
}

export interface SearchResult {
  items: ApiItem[]
  hasMore: boolean
  totalPages?: number
  pagination?: {
    total_entries?: number
  }
  metadata?: {
    pagesSearched: number
    totalItemsFound: number
    filterMetrics?: {
      beforeFilter: number
      afterFilter: number
      removedDuplicates: number
    }
  }
}

function buildSearchUrl(params: VintedSearchParams): string {
  const searchParams = new URLSearchParams({
    search_text: params.searchText,
    per_page: Math.min(params.perPage || 30, 20).toString(),
    page: (params.page || 1).toString(),
  })

  if (params.priceFrom && params.priceFrom > 0) {
    searchParams.append('price_from', params.priceFrom.toString())
  }
  if (params.priceTo && params.priceTo < 1000) {
    searchParams.append('price_to', params.priceTo.toString())
  }

  return `https://www.vinted.fr/api/v2/catalog/items?${searchParams.toString()}`
}

function buildHeaders(session?: FullVintedSession): Record<string, string> {
  if (session) {
    return buildFullVintedHeaders(session)
  }

  return {
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
}

export function normalizeApiItem(apiItem: any): ApiItem {
  const price = apiItem.price || {}
  const amount = typeof price.amount === 'string' ? parseFloat(price.amount) : (price.amount || 0)
  const currency = price.currency_code || 'EUR'

  const itemBox = apiItem.item_box || null
  const accessibilityLabel = itemBox?.accessibility_label || null
  const condition = itemBox?.second_line || apiItem.status || apiItem.condition || 'unknown'

  const canBuy = apiItem.can_buy !== undefined ? apiItem.can_buy : apiItem.is_available
  const canInstantBuy = apiItem.can_instant_buy !== undefined ? apiItem.can_instant_buy : null
  const isReserved = apiItem.is_reserved !== undefined ? apiItem.is_reserved : apiItem.reserved || false
  const isHidden = apiItem.is_hidden !== undefined ? apiItem.is_hidden : false

  const protectionFee = apiItem.protection_fee || apiItem.buyer_protection_fee || null
  const protectionFeeAmount = protectionFee?.amount
    ? (typeof protectionFee.amount === 'string' ? parseFloat(protectionFee.amount) : protectionFee.amount)
    : null
  const protectionFeeNote = protectionFee?.note || protectionFee?.description || null

  const shippingFee = apiItem.shipping_fee || apiItem.shipping?.price || null
  const shippingFeeAmount = shippingFee
    ? (typeof shippingFee === 'number' ? shippingFee : (typeof shippingFee === 'object' && shippingFee.amount ? (typeof shippingFee.amount === 'string' ? parseFloat(shippingFee.amount) : shippingFee.amount) : null))
    : null

  const addedSince = apiItem.added_since || apiItem.created_at || apiItem.created_at_ts ? new Date(apiItem.created_at_ts * 1000).toISOString() : null
  const description = apiItem.description || apiItem.description_text || apiItem.full_description || null
  const conversion = apiItem.conversion || null
  const isFavourite = apiItem.is_favourite !== undefined ? apiItem.is_favourite : false

  const photos: VintedPhoto[] = []
  const images: string[] = []

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
    images.push(photo.url)
  }

  if (Array.isArray(apiItem.photos)) {
    for (const photoData of apiItem.photos) {
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
        images.push(photo.url)
      }
    }
  }

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
    id: apiItem.user_id,
    login: `user_${apiItem.user_id}`,
    profile_url: `https://www.vinted.fr/member/${apiItem.user_id}`,
    photo: undefined,
    business: apiItem.business_user || false
  } : undefined)

  let itemUrl: string
  if (apiItem.url) {
    if (apiItem.url.startsWith('/')) {
      itemUrl = `https://www.vinted.fr${apiItem.url}`
    } else if (apiItem.url.startsWith('http')) {
      itemUrl = apiItem.url
    } else {
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
    path: apiItem.path || (apiItem.url && apiItem.url.startsWith('/') ? apiItem.url : null),
    title: apiItem.title || null,
    description: description,
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
    images,
    photos,
    view_count: apiItem.view_count || apiItem.views_count || 0,
    favourite_count: apiItem.favourite_count || apiItem.favorites_count || apiItem.likes_count || 0,
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
    category_id: apiItem.catalog_id || apiItem.category_id || null,
    catalog_id: apiItem.catalog_id || null,
    location: apiItem.location ? {
      city: apiItem.location.city || null,
      country: apiItem.location.country || null,
      country_code: apiItem.location.country_code || null
    } : (apiItem.city || apiItem.country ? {
      city: apiItem.city || null,
      country: apiItem.country || null,
      country_code: apiItem.country_code || null
    } : null),
    search_tracking_params: apiItem.search_tracking_params || null,
    is_favourite: isFavourite,
    item_box: itemBox ? {
      first_line: itemBox.first_line || null,
      second_line: itemBox.second_line || null,
      accessibility_label: accessibilityLabel,
      item_id: itemBox.item_id || null,
      exposures: itemBox.exposures || [],
      badge: itemBox.badge ? {
        title: itemBox.badge.title || null
      } : null
    } : null,
    conversion: conversion,
    raw: apiItem ? (() => {
      try {
        const serialized = JSON.stringify(apiItem)
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

export async function searchSinglePage(
  params: VintedSearchParams,
  session?: FullVintedSession
): Promise<SearchResult> {
  const url = buildSearchUrl(params)
  const headers = buildHeaders(session)

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
    const totalPages = data.pagination?.total_pages

    return {
      items,
      hasMore,
      totalPages,
      pagination: data.pagination ? {
        total_entries: data.pagination.total_entries
      } : undefined,
      metadata: {
        pagesSearched: 1,
        totalItemsFound: items.length
      }
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`Erreur recherche API: ${errorMessage}`, error as Error)

    if (errorMessage.includes('HTTP 403') || errorMessage.includes('HTTP 401')) {
      throw new Error(`HTTP 403/401 - Token expired or invalid!`)
    }

    throw error
  }
}

export async function searchMultiplePages(
  searchText: string,
  options: SearchOptions = {}
): Promise<SearchResult> {
  const {
    priceFrom,
    priceTo,
    limit = 100,
    session,
    minRelevanceScore = 50,
    maxPages = 2,
    maxItemAgeDays = 7
  } = options

  let allItems: ApiItem[] = []
  let currentPage = 1
  let hasMore = true
  let totalPages = maxPages
  let totalItemsFromApi: number | null = null

  const MIN_TOTAL_ITEMS_THRESHOLD = 20
  const maxItemAgeMs = maxItemAgeDays * 24 * 60 * 60 * 1000

  while (hasMore && allItems.length < limit && currentPage <= maxPages) {
    const remainingItems = limit - allItems.length
    const perPage = Math.min(20, remainingItems)

    logger.scrape.page(currentPage, totalPages, perPage)

    if (currentPage > 1) {
      const delay = await getRequestDelayWithJitter()
      logger.info(`⏳ Délai de ${(delay / 1000).toFixed(1)}s avant la page ${currentPage}/${totalPages}...`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }

    const result = await searchSinglePage({
      searchText,
      priceFrom,
      priceTo,
      page: currentPage,
      perPage
    }, session)

    if (currentPage === 1) {
      if (result.totalPages) {
        totalPages = Math.min(result.totalPages, maxPages)
      }
      if (result.pagination?.total_entries) {
        totalItemsFromApi = result.pagination.total_entries
        logger.info(`📊 Total items disponibles: ${totalItemsFromApi}`)

        if (totalItemsFromApi < MIN_TOTAL_ITEMS_THRESHOLD) {
          logger.info(`⏹️ Arrêt de la pagination: seulement ${totalItemsFromApi} items disponibles (< ${MIN_TOTAL_ITEMS_THRESHOLD})`)
          hasMore = false
        }
      }
    }

    if (result.items.length === 0) {
      logger.info(`⏹️ Arrêt de la pagination: page ${currentPage} vide`)
      hasMore = false
      break
    }

    const now = Date.now()
    let allItemsTooOld = true
    let itemsChecked = 0

    for (const item of result.items) {
      if (item.added_since) {
        itemsChecked++
        let itemAgeMs: number | null = null

        try {
          const itemDate = new Date(item.added_since)
          if (!isNaN(itemDate.getTime())) {
            itemAgeMs = now - itemDate.getTime()
          }
        } catch (e) {
          const daysMatch = item.added_since.match(/(\d+)\s*jour/i)
          if (daysMatch) {
            itemAgeMs = parseInt(daysMatch[1], 10) * 24 * 60 * 60 * 1000
          }
        }

        if (itemAgeMs !== null && itemAgeMs < maxItemAgeMs) {
          allItemsTooOld = false
          break
        }
      }
    }

    if (itemsChecked > 0 && allItemsTooOld) {
      logger.info(`⏹️ Arrêt de la pagination: tous les items de la page ${currentPage} sont trop vieux (> ${maxItemAgeDays} jours)`)
      hasMore = false
      break
    }

    const existingIds = new Set(allItems.map(item => item.id))
    const newItems = result.items.filter(item => !existingIds.has(item.id))
    allItems.push(...newItems)

    hasMore = result.hasMore && allItems.length < limit
    currentPage++
  }

  const beforeFilter = allItems.length
  const finalItems = filterAndSortByRelevance(allItems, searchText, {
    minScore: minRelevanceScore || 0,
    maxResults: limit
  })

  if (finalItems.length === 0 && allItems.length > 0) {
    logger.warn(`⚠️ Aucun item ne passe le filtre strict, retour des meilleurs résultats...`)
    const fallbackItems = filterAndSortByRelevance(allItems, searchText, {
      minScore: 0,
      maxResults: Math.min(limit, 30)
    })

    if (fallbackItems.length === 0) {
      logger.warn(`⚠️ Retour des top items sans filtre...`)
      return {
        items: allItems.slice(0, Math.min(limit, 20)),
        hasMore: false,
        metadata: {
          pagesSearched: currentPage - 1,
          totalItemsFound: allItems.length,
          filterMetrics: {
            beforeFilter,
            afterFilter: allItems.slice(0, Math.min(limit, 20)).length,
            removedDuplicates: 0
          }
        }
      }
    }

    return {
      items: fallbackItems,
      hasMore: false,
      metadata: {
        pagesSearched: currentPage - 1,
        totalItemsFound: allItems.length,
        filterMetrics: {
          beforeFilter,
          afterFilter: fallbackItems.length,
          removedDuplicates: beforeFilter - allItems.length
        }
      }
    }
  }

  return {
    items: finalItems,
    hasMore: false,
    metadata: {
      pagesSearched: currentPage - 1,
      totalItemsFound: allItems.length,
      filterMetrics: {
        beforeFilter,
        afterFilter: finalItems.length,
        removedDuplicates: beforeFilter - allItems.length
      }
    }
  }
}
