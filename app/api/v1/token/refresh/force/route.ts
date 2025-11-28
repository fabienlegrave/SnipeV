/**
 * Endpoint pour forcer la régénération des cookies Cloudflare
 * POST /api/v1/token/refresh/force
 * 
 * Force la génération de nouveaux cookies Cloudflare via Puppeteer
 * et les stocke en base de données pour que tous les workers puissent les utiliser
 */

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    // Vérifier l'API key (optionnel pour le main worker)
    const apiKey = request.headers.get('x-api-key')
    const expectedKey = process.env.API_SECRET || process.env.NEXT_PUBLIC_API_SECRET
    
    // Si une API key est fournie, la vérifier
    if (apiKey && expectedKey && apiKey !== expectedKey) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    
    logger.info('🔄 Forçage de la régénération des cookies Cloudflare...')
    
    // Importer et appeler la fonction de refresh
    const { refreshTokens } = await import('@/scripts/token-refresh-worker')
    
    const success = await refreshTokens()
    
    if (success) {
      return NextResponse.json({
        success: true,
        message: 'Cookies Cloudflare régénérés et stockés en base de données avec succès',
      })
    } else {
      return NextResponse.json(
        {
          success: false,
          error: 'Échec de la régénération des cookies',
          message: 'Vérifiez les logs du main worker pour plus de détails. Causes possibles: Puppeteer non disponible, erreur de génération, problème Supabase, ou table vinted_credentials inexistante.',
          suggestion: 'Vérifiez les logs: fly logs --app main-worker-small-silence-2788',
        },
        { status: 500 }
      )
    }
  } catch (error: any) {
    logger.error('Erreur lors de la régénération forcée des cookies', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    )
  }
}

export async function GET() {
  // Permettre l'appel sans API key pour le démarrage automatique
  try {
    logger.info('🔄 Forçage de la régénération des cookies Cloudflare (GET)...')
    
    const { refreshTokens } = await import('@/scripts/token-refresh-worker')
    
    const success = await refreshTokens()
    
    if (success) {
      return NextResponse.json({
        success: true,
        message: 'Cookies Cloudflare régénérés et stockés en base de données avec succès',
      })
    } else {
      return NextResponse.json(
        {
          success: false,
          error: 'Échec de la régénération des cookies',
        },
        { status: 500 }
      )
    }
  } catch (error: any) {
    logger.error('Erreur lors de la régénération forcée des cookies', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    )
  }
}

