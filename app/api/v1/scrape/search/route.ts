import { NextRequest, NextResponse } from 'next/server'
import { searchWithFailover } from '@/lib/scrape/searchWithFailover'
import { globalSearchCache } from '@/lib/cache/searchCache'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key')
    if (!apiKey || apiKey !== process.env.API_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const {
      query,
      priceFrom,
      priceTo,
      limit = 100,
      fullCookies,
      accessToken,
      minRelevanceScore,
      useCache = true,
      maxPages = 2
    } = await request.json()

    if (!query?.trim()) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    logger.scrape.search(query, { limit })

    const filters = { priceFrom, priceTo, limit, minRelevanceScore }

    if (useCache) {
      const cached = await globalSearchCache.get(query, filters)
      if (cached) {
        logger.info(`✅ Résultat servi depuis le cache`)
        return NextResponse.json({
          items: cached.items,
          metadata: {
            ...cached.metadata,
            cached: true,
            cacheHit: true
          }
        })
      }
    }

    const result = await searchWithFailover(query, {
      priceFrom,
      priceTo,
      limit,
      minRelevanceScore,
      maxPages,
      sessionOptions: {
        fullCookies,
        accessToken,
        preferCookies: true
      },
      maxRetries: 3,
      enableFailover: true
    })

    if (useCache && result.items.length > 0) {
      await globalSearchCache.set(query, filters, result)
    }

    logger.scrape.success(result.items.length)

    return NextResponse.json({
      items: result.items,
      metadata: {
        ...result.metadata,
        cached: false,
        cacheHit: false
      }
    })

  } catch (error: unknown) {
    logger.scrape.error('Search API error', error as Error)

    const errorMessage = error instanceof Error ? error.message : String(error)

    if (errorMessage.includes('NO_AUTHENTICATION_AVAILABLE')) {
      return NextResponse.json({
        error: 'Authentication required',
        details: 'Aucune méthode d\'authentification disponible',
        suggestion: 'Configurez VINTED_FULL_COOKIES ou VINTED_ACCESS_TOKEN'
      }, { status: 401 })
    }

    if (errorMessage.includes('AUTHENTICATION_FAILED')) {
      return NextResponse.json({
        error: 'Authentication failed',
        details: errorMessage,
        suggestion: 'Les cookies/tokens sont invalides ou expirés'
      }, { status: 403 })
    }

    return NextResponse.json({
      error: 'Search failed',
      details: errorMessage
    }, { status: 500 })
  }
}