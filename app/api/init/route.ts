/**
 * Endpoint simple pour déclencher l'initialisation
 * GET /api/init - Déclenche l'initialisation automatique
 * 
 * Cet endpoint peut être appelé manuellement ou via un cron job
 */

import { NextResponse } from 'next/server'
import { initializeCookies } from '@/lib/init/autoCookieSetup'
import { logger } from '@/lib/logger'

export async function GET() {
  try {
    logger.info('🔐 Initialisation déclenchée via endpoint /api/init')
    
    const autoGenerate = process.env.AUTO_GENERATE_COOKIES !== 'false'
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

