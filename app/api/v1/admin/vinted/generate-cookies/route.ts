import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { exec } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'

const execAsync = promisify(exec)

// Marquer la route comme dynamique pour éviter l'analyse statique de Puppeteer
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/v1/admin/vinted/generate-cookies
 * Génère automatiquement les cookies Vinted via Puppeteer
 * 
 * Cette route utilise un script standalone exécuté via child_process pour éviter
 * les problèmes d'analyse statique Next.js avec Puppeteer.
 * 
 * ⚠️ Nécessite Puppeteer installé et Chrome/Chromium disponible
 */
export async function POST(request: NextRequest) {
  try {
    // Vérifier l'API key
    const apiKey = request.headers.get('x-api-key')
    if (!apiKey || apiKey !== process.env.API_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { autoSave = true } = await request.json().catch(() => ({ autoSave: true }))

    logger.info('🔄 Génération automatique des cookies via Puppeteer (script standalone)...')

    // Exécuter le script standalone via child_process
    const scriptPath = join(process.cwd(), 'scripts', 'generateCookiesStandalone.js')
    
    // Préparer les variables d'environnement
    const env = {
      ...process.env,
      PUPPETEER_EXECUTABLE_PATH: process.env.PUPPETEER_EXECUTABLE_PATH,
    }

    const { stdout, stderr } = await execAsync(`node "${scriptPath}"`, {
      env,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      timeout: 60000, // 60 secondes timeout
    })

    // Le script output du JSON à la fin
    const lines = stdout.trim().split('\n')
    const jsonLine = lines[lines.length - 1]
    
    let result
    try {
      result = JSON.parse(jsonLine)
    } catch (error) {
      // Si le parsing échoue, essayer de trouver le JSON dans toute la sortie
      const jsonMatch = stdout.match(/\{[\s\S]*"success"[\s\S]*\}/)
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0])
      } else {
        throw new Error(`Failed to parse script output: ${stdout}`)
      }
    }

    // Log les erreurs stderr si présentes
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

    // Test automatique des cookies générés
    let testResult = {
      hasAccessToken: false,
      accessTokenValue: null as string | null,
      apiTest: {
        success: false,
        statusCode: null as number | null,
        message: ''
      }
    }

    if (result.cookies) {
      // Vérifier si access_token_web est présent
      const hasAccessToken = result.cookies.includes('access_token_web=')
      testResult.hasAccessToken = hasAccessToken
      
      if (hasAccessToken) {
        // Extraire la valeur du token
        const tokenMatch = result.cookies.match(/access_token_web=([^;]+)/)
        if (tokenMatch) {
          testResult.accessTokenValue = tokenMatch[1]
          logger.info('✅ access_token_web trouvé dans les cookies générés')
        }
      } else {
        logger.warn('⚠️ access_token_web non trouvé dans les cookies générés')
      }

      // Tester les cookies avec une requête API simple
      try {
        logger.info('🧪 Test des cookies avec une requête API...')
        const { createFullSessionFromCookies } = await import('@/lib/scrape/fullSessionManager')
        const { buildVintedApiHeaders } = await import('@/lib/scrape/fullSessionManager')
        
        const session = createFullSessionFromCookies(result.cookies)
        const headers = buildVintedApiHeaders(session)
        
        // Faire une requête test simple
        const testUrl = 'https://www.vinted.fr/api/v2/catalog/items?search_text=test&per_page=1&page=1'
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000)
        
        const testResponse = await fetch(testUrl, {
          method: 'GET',
          headers,
          signal: controller.signal
        })
        
        clearTimeout(timeoutId)
        
        testResult.apiTest.statusCode = testResponse.status
        testResult.apiTest.success = testResponse.ok || testResponse.status === 429 // 429 = rate limit mais cookies valides
        
        if (testResult.apiTest.success) {
          testResult.apiTest.message = '✅ Les cookies fonctionnent correctement avec l\'API Vinted'
          logger.info('✅ Test API réussi:', testResponse.status)
        } else if (testResponse.status === 403) {
          if (hasAccessToken) {
            testResult.apiTest.message = '⚠️ 403 Forbidden - Les cookies Cloudflare fonctionnent mais access_token_web pourrait être invalide ou expiré'
          } else {
            testResult.apiTest.message = '⚠️ 403 Forbidden - Les cookies Cloudflare fonctionnent mais access_token_web est manquant (connexion requise)'
          }
          logger.warn('⚠️ Test API: 403 Forbidden')
        } else if (testResponse.status === 429) {
          testResult.apiTest.message = '✅ Rate limit détecté mais les cookies sont valides'
          logger.info('ℹ️ Test API: Rate limit (cookies valides)')
        } else {
          testResult.apiTest.message = `❌ Erreur ${testResponse.status}: ${testResponse.statusText}`
          logger.warn(`⚠️ Test API échoué: ${testResponse.status}`)
        }
      } catch (error) {
        testResult.apiTest.message = `❌ Erreur lors du test: ${error instanceof Error ? error.message : 'Unknown error'}`
        logger.warn('⚠️ Erreur lors du test API:', error as Error)
      }
    }

    // Sauvegarder en DB si demandé
    if (autoSave && result.cookies) {
      try {
        const { supabase } = await import('@/lib/supabase')
        if (supabase) {
          const { error: saveError } = await supabase
            .from('vinted_credentials')
            .upsert({
              full_cookies: result.cookies,
              notes: 'Auto-generated via Puppeteer',
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'id',
              ignoreDuplicates: false
            })

          if (saveError) {
            logger.warn('⚠️ Erreur lors de la sauvegarde des cookies en DB', saveError)
          } else {
            logger.info('✅ Cookies sauvegardés en base de données')
          }
        }
      } catch (error) {
        logger.warn('⚠️ Erreur lors de la sauvegarde des cookies', error as Error)
        // Ne pas faire échouer la génération si la sauvegarde échoue
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Cookies generated successfully',
      cookies: result.cookies,
      details: result.details,
      test: testResult,
      note: autoSave 
        ? 'Cookies have been automatically saved to database'
        : 'Cookies generated but not saved (use autoSave=true to save)'
    })

  } catch (error) {
    logger.error('Error generating cookies', error as Error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

