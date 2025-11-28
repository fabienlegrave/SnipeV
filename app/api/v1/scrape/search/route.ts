import { NextRequest, NextResponse } from 'next/server'
import { searchVintedCatalogSimple } from '@/lib/scrape/searchCatalog'
import { ScrapeSearchRequest } from '@/lib/types/core'
import { createFullSessionFromCookies, createSimpleSession } from '@/lib/scrape/fullSessionManager'
import { getCookiesForScraping } from '@/lib/utils/getCookiesFromDb'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    // Check API key
    const apiKey = request.headers.get('x-api-key')
    if (!apiKey || apiKey !== process.env.API_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { query, priceFrom, priceTo, limit = 100, fullCookies, accessToken, minRelevanceScore }: ScrapeSearchRequest & {fullCookies?: string; accessToken?: string; minRelevanceScore?: number} = await request.json()

    if (!query?.trim()) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    logger.scrape.search(query, { limit })
    
    let session = undefined
    
    // PRIORITÉ 1 : Cookies fournis dans la requête (pour override)
    if (fullCookies && fullCookies.trim().length > 0) {
      try {
        session = createFullSessionFromCookies(fullCookies)
        logger.auth.cookies('Utilisation des cookies fournis dans la requête')
      } catch (error) {
        logger.auth.error('Erreur parsing cookies', error as Error)
        return NextResponse.json({ error: 'Invalid cookies format' }, { status: 400 })
      }
    } else {
      // PRIORITÉ 2 : Récupérer les cookies depuis la base de données (pour les workers)
      const dbCookies = await getCookiesForScraping()
      
      if (dbCookies) {
        try {
          session = createFullSessionFromCookies(dbCookies)
          logger.auth.cookies('Utilisation des cookies Cloudflare depuis la base de données')
        } catch (error) {
          logger.auth.error('Erreur parsing cookies depuis DB', error as Error)
          // Continuer avec le fallback
        }
      }
      
      // PRIORITÉ 3 : Fallback sur accessToken (moins fiable)
      if (!session) {
        const tokenToUse = accessToken || process.env.VINTED_ACCESS_TOKEN
        
        if (tokenToUse) {
          session = createSimpleSession(tokenToUse)
          logger.auth.token('Utilisation du token d\'accès (mode simple - peut échouer avec Cloudflare)')
        } else {
          logger.auth.error('Aucun cookie/token disponible - authentification requise')
          return NextResponse.json({
            error: 'Authentication required',
            details: 'Cookies Cloudflare requis pour le scraping. Ils doivent être générés et stockés en base de données.',
            suggestion: 'Les cookies sont générés automatiquement au démarrage ou configurez VINTED_FULL_COOKIES dans .env.local'
          }, { status: 401 })
        }
      }
    }

    const items = await searchVintedCatalogSimple(query, {
      priceFrom,
      priceTo,
      limit,
      session
    })

    logger.scrape.success(items.length)

    return NextResponse.json(items)

  } catch (error: unknown) {
    logger.scrape.error('Search API error', error as Error)
    
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (errorMessage.includes('HTTP 403') || errorMessage.includes('HTTP 401')) {
      return NextResponse.json({
        error: 'Authentication failed',
        details: errorMessage,
        suggestion: 'Vérifiez votre token Vinted dans les paramètres.'
      }, { status: 403 })
    }

    return NextResponse.json({ 
      error: 'Search failed',
      details: errorMessage 
    }, { status: 500 })
  }
}