/**
 * API endpoint pour les Workers Régionaux
 * Reçoit les commandes du Main Worker et les exécute
 */

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { checkAlertsStandalone } from '@/lib/alerts/checkAlertsStandalone'
import { generateCookiesViaFactory } from '@/lib/alerts/cookieFactory'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    // Vérifier l'API key
    const apiKey = request.headers.get('x-api-key')
    const expectedKey = process.env.API_SECRET || process.env.NEXT_PUBLIC_API_SECRET
    
    if (!apiKey || apiKey !== expectedKey) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    
    const body = await request.json()
    const { type, payload } = body
    
    if (!type) {
      return NextResponse.json(
        { error: 'Command type is required' },
        { status: 400 }
      )
    }
    
    const region = process.env.FLY_REGION || 'unknown'
    const workerId = process.env.FLY_APP_NAME || 'unknown'
    
    logger.info(`🔧 Worker ${workerId} (${region}): Exécution d'une commande de type "${type}"`)
    
    let result: any
    
    switch (type) {
      case 'scrape': {
        // Exécuter un scraping
        const { url, method = 'GET', headers, body: requestBody } = payload
        
        if (!url) {
          return NextResponse.json(
            { error: 'URL is required for scrape command' },
            { status: 400 }
          )
        }
        
        logger.info(`🌐 Worker ${workerId} (${region}): Scraping ${url}`)
        
        // Headers par défaut
        const defaultHeaders: Record<string, string> = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        }
        
        const finalHeaders = {
          ...defaultHeaders,
          ...headers,
        }
        
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 30000)
        
        try {
          const response = await fetch(url, {
            method,
            headers: finalHeaders,
            body: requestBody ? JSON.stringify(requestBody) : undefined,
            signal: controller.signal,
          })
          
          clearTimeout(timeoutId)
          
          const contentType = response.headers.get('content-type') || ''
          let data: any
          
          if (contentType.includes('application/json')) {
            data = await response.json()
          } else if (contentType.includes('text/html') || contentType.includes('text/plain')) {
            data = await response.text()
          } else {
            data = await response.arrayBuffer()
          }
          
          if (response.ok) {
            result = {
              success: true,
              data,
              statusCode: response.status,
            }
          } else {
            result = {
              success: false,
              error: `HTTP ${response.status}`,
              statusCode: response.status,
              data,
            }
          }
        } catch (fetchError: any) {
          clearTimeout(timeoutId)
          
          if (fetchError.name === 'AbortError') {
            result = {
              success: false,
              error: 'Request timeout',
            }
          } else {
            throw fetchError
          }
        }
        break
      }
      
      case 'check-alerts': {
        // Vérifier les alertes
        // Les cookies sont récupérés depuis la base de données (pas depuis le payload)
        logger.info(`🔔 Worker ${workerId} (${region}): Vérification des alertes`)
        
        // Récupérer les cookies depuis la DB
        const { getCookiesForScraping } = await import('@/lib/utils/getCookiesFromDb')
        const cookies = await getCookiesForScraping()
        
        if (!cookies) {
          logger.error(`❌ Worker ${workerId} (${region}): NO_SCRAPING_COOKIES - Impossible de récupérer les cookies depuis la DB`)
          result = {
            success: false,
            error: 'NO_SCRAPING_COOKIES: Aucun cookie Cloudflare disponible en base de données',
            httpStatus: 503,
          }
          break
        }
        
        logger.info(`✅ Worker ${workerId} (${region}): Cookies récupérés depuis la DB`)
        
        const alertResult = await checkAlertsStandalone(cookies)
        
        result = {
          success: alertResult.success,
          data: alertResult,
          error: alertResult.error,
          httpStatus: alertResult.httpStatus,
        }
        break
      }
      
      case 'generate-cookies': {
        // Générer des cookies
        logger.info(`🍪 Worker ${workerId} (${region}): Génération de cookies`)
        
        const cookieResult = await generateCookiesViaFactory()
        
        result = {
          success: cookieResult.success,
          data: cookieResult,
          error: cookieResult.error,
        }
        break
      }
      
      case 'custom': {
        // Commande personnalisée
        const { handler, ...customPayload } = payload
        
        logger.info(`⚙️ Worker ${workerId} (${region}): Exécution d'une commande personnalisée`)
        
        // Ici vous pouvez ajouter des handlers personnalisés
        result = {
          success: false,
          error: 'Custom command handler not implemented',
        }
        break
      }
      
      default:
        return NextResponse.json(
          { error: `Unknown command type: ${type}` },
          { status: 400 }
        )
    }
    
    if (result.success) {
      logger.info(`✅ Worker ${workerId} (${region}): Commande exécutée avec succès`)
      return NextResponse.json({
        success: true,
        data: result.data,
        workerId,
        region,
      })
    } else {
      logger.warn(`⚠️ Worker ${workerId} (${region}): Erreur lors de l'exécution: ${result.error}`)
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          httpStatus: result.httpStatus,
          workerId,
          region,
        },
        { status: result.httpStatus || 500 }
      )
    }
  } catch (error: any) {
    const region = process.env.FLY_REGION || 'unknown'
    const workerId = process.env.FLY_APP_NAME || 'unknown'
    
    logger.error(`❌ Worker ${workerId} (${region}): Erreur`, error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error',
        workerId,
        region,
      },
      { status: 500 }
    )
  }
}

