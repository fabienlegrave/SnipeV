/**
 * Endpoint pour initialiser les cookies manuellement
 * POST /api/v1/init/cookies
 */

import { NextRequest, NextResponse } from 'next/server'
import { initializeCookies } from '@/lib/init/autoCookieSetup'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key')
    if (!apiKey || apiKey !== process.env.API_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { autoGenerate = true } = await request.json().catch(() => ({ autoGenerate: true }))

    logger.info('🔐 Initialisation manuelle des cookies...')

    const result = await initializeCookies(autoGenerate)

    if (result.success) {
      return NextResponse.json({
        success: true,
        cookiesGenerated: result.cookiesGenerated,
        cookiesValid: result.cookiesValid,
        message: result.cookiesGenerated
          ? 'Cookies générés avec succès'
          : 'Cookies valides déjà disponibles'
      })
    } else {
      return NextResponse.json({
        success: false,
        error: result.error || 'Failed to initialize cookies'
      }, { status: 500 })
    }

  } catch (error: any) {
    logger.error('❌ Erreur initialisation cookies:', error)
    return NextResponse.json({
      error: 'Internal server error',
      message: error?.message || 'Unknown error'
    }, { status: 500 })
  }
}

/**
 * GET /api/v1/init/cookies
 * Vérifie l'état des cookies
 */
export async function GET(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key')
    if (!apiKey || apiKey !== process.env.API_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Importer la fonction de vérification
    const { hasValidCookies } = await import('@/lib/init/autoCookieSetup')
    const hasValid = await hasValidCookies()

    return NextResponse.json({
      hasValidCookies: hasValid,
      message: hasValid
        ? 'Cookies valides disponibles'
        : 'Aucun cookie valide trouvé'
    })

  } catch (error: any) {
    logger.error('❌ Erreur vérification cookies:', error)
    return NextResponse.json({
      error: 'Internal server error',
      message: error?.message || 'Unknown error'
    }, { status: 500 })
  }
}

