/**
 * API endpoint pour initialiser le Main Worker
 */

import { NextRequest, NextResponse } from 'next/server'
import { initializeMainWorker } from '@/scripts/main-worker'
import { logger } from '@/lib/logger'

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
    
    logger.info('🚀 Initialisation du Main Worker...')
    
    await initializeMainWorker()
    
    return NextResponse.json({
      success: true,
      message: 'Main Worker initialisé avec succès',
    })
  } catch (error: any) {
    logger.error('Erreur lors de l\'initialisation du Main Worker', error)
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
  // Permettre l'initialisation sans API key pour le démarrage automatique
  try {
    logger.info('🚀 Initialisation automatique du Main Worker...')
    
    await initializeMainWorker()
    
    return NextResponse.json({
      success: true,
      message: 'Main Worker initialisé avec succès',
    })
  } catch (error: any) {
    logger.error('Erreur lors de l\'initialisation du Main Worker', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    )
  }
}

