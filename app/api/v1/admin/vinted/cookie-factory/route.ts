import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { exec } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import { createFullSessionFromCookies } from '@/lib/scrape/fullSessionManager'
import { buildVintedApiHeaders } from '@/lib/scrape/fullSessionManager'

const execAsync = promisify(exec)

// Marquer la route comme dynamique
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/v1/admin/vinted/cookie-factory
 * "Cookie Factory" - Génère automatiquement des cookies/tokens valides pour Vinted
 * 
 * Inspiré de l'article The Web Scraping Club #82
 * Cette route génère des cookies frais et les teste automatiquement
 * 
 * @returns {Object} Cookies générés, tokens extraits, et résultats des tests
 */
export async function POST(request: NextRequest) {
  try {
    // Vérifier l'API key
    const apiKey = request.headers.get('x-api-key')
    if (!apiKey || apiKey !== process.env.API_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    logger.info('🏭 Cookie Factory: Génération de cookies frais...')

    // Exécuter le script de génération de cookies
    const scriptPath = join(process.cwd(), 'scripts', 'generateCookiesStandalone.js')
    const env = {
      ...process.env,
      PUPPETEER_EXECUTABLE_PATH: process.env.PUPPETEER_EXECUTABLE_PATH,
    }

    const { stdout, stderr } = await execAsync(`node "${scriptPath}"`, {
      env,
      maxBuffer: 10 * 1024 * 1024,
      timeout: 300000, // 5 minutes (augmenté pour gérer les challenges et délais)
    })

    // Parser le résultat JSON
    const lines = stdout.trim().split('\n')
    const jsonLine = lines[lines.length - 1]
    
    let result
    try {
      result = JSON.parse(jsonLine)
    } catch (error) {
      const jsonMatch = stdout.match(/\{[\s\S]*"success"[\s\S]*\}/)
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0])
      } else {
        throw new Error(`Failed to parse script output: ${stdout}`)
      }
    }

    if (stderr && stderr.trim()) {
      logger.warn('⚠️ Script stderr:', stderr)
    }

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.error || 'Failed to generate cookies',
        details: result.details
      }, { status: 500 })
    }

    logger.info('✅ Cookies générés avec succès')

    // Extraire les tokens importants
    const cookies = result.cookies
    const accessTokenMatch = cookies.match(/access_token_web=([^;]+)/)
    const refreshTokenMatch = cookies.match(/refresh_token_web=([^;]+)/)
    const datadomeMatch = cookies.match(/datadome=([^;]+)/)
    const cfClearanceMatch = cookies.match(/cf_clearance=([^;]+)/)

    const extractedTokens = {
      access_token_web: accessTokenMatch ? accessTokenMatch[1] : null,
      refresh_token_web: refreshTokenMatch ? refreshTokenMatch[1] : null,
      datadome: datadomeMatch ? datadomeMatch[1] : null,
      cf_clearance: cfClearanceMatch ? cfClearanceMatch[1] : null,
    }

    // Tester les cookies avec les endpoints mobiles (non protégés par Datadome selon l'article)
    const testResults = {
      mobileEndpoint: {
        success: false,
        statusCode: null as number | null,
        message: ''
      },
      webEndpoint: {
        success: false,
        statusCode: null as number | null,
        message: ''
      }
    }

    if (cookies) {
      try {
        const session = createFullSessionFromCookies(cookies)
        const headers = buildVintedApiHeaders(session)

        // Test 1: Endpoint mobile (selon l'article, non protégé par Datadome)
        try {
          logger.info('🧪 Test endpoint mobile: /api/v2/catalog/items')
          const mobileUrl = 'https://www.vinted.fr/api/v2/catalog/items?search_text=test&per_page=1&page=1'
          const mobileResponse = await fetch(mobileUrl, {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(10000)
          })

          testResults.mobileEndpoint.statusCode = mobileResponse.status
          testResults.mobileEndpoint.success = mobileResponse.ok || mobileResponse.status === 429

          if (testResults.mobileEndpoint.success) {
            testResults.mobileEndpoint.message = '✅ Endpoint mobile fonctionne (non protégé par Datadome)'
          } else if (mobileResponse.status === 403) {
            testResults.mobileEndpoint.message = extractedTokens.access_token_web
              ? '⚠️ 403 - access_token_web présent mais peut être invalide'
              : '⚠️ 403 - access_token_web manquant'
          } else {
            testResults.mobileEndpoint.message = `❌ Erreur ${mobileResponse.status}`
          }
        } catch (error) {
          testResults.mobileEndpoint.message = `❌ Erreur: ${error instanceof Error ? error.message : 'Unknown'}`
        }

        // Test 2: Endpoint web (protégé par Datadome)
        try {
          logger.info('🧪 Test endpoint web: /web/api/core/catalog/items')
          const webUrl = 'https://www.vinted.fr/web/api/core/catalog/items?page=1&per_page=1&search_text=test'
          const webResponse = await fetch(webUrl, {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(10000)
          })

          testResults.webEndpoint.statusCode = webResponse.status
          testResults.webEndpoint.success = webResponse.ok || webResponse.status === 429

          if (testResults.webEndpoint.success) {
            testResults.webEndpoint.message = '✅ Endpoint web fonctionne (Datadome bypass réussi)'
          } else if (webResponse.status === 403) {
            testResults.webEndpoint.message = extractedTokens.datadome
              ? '⚠️ 403 - Datadome présent mais peut être invalide'
              : '⚠️ 403 - Datadome manquant (protection active)'
          } else {
            testResults.webEndpoint.message = `❌ Erreur ${webResponse.status}`
          }
        } catch (error) {
          testResults.webEndpoint.message = `❌ Erreur: ${error instanceof Error ? error.message : 'Unknown'}`
        }
      } catch (error) {
        logger.warn('⚠️ Erreur lors des tests:', error as Error)
      }
    }

    // Note: Les cookies ne sont plus sauvegardés en base de données
    // Ils sont stockés côté client dans le localStorage via TokenStore
    // La table vinted_credentials était utilisée pour GitHub Actions (solution non retenue)

    return NextResponse.json({
      success: true,
      message: 'Cookie Factory: Cookies générés avec succès',
      cookies: cookies,
      tokens: extractedTokens,
      tests: testResults,
      details: result.details,
      recommendations: {
        useMobileEndpoints: testResults.mobileEndpoint.success,
        useWebEndpoints: testResults.webEndpoint.success,
        hasAccessToken: !!extractedTokens.access_token_web,
        hasRefreshToken: !!extractedTokens.refresh_token_web,
        hasDatadome: !!extractedTokens.datadome,
        note: 'Selon l\'article The Web Scraping Club #82, les endpoints mobiles (/api/v2/...) ne sont pas protégés par Datadome et sont plus stables pour le scraping.'
      }
    })

  } catch (error) {
    logger.error('Error in Cookie Factory', error as Error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

