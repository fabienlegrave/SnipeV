/**
 * API endpoint pour récupérer les statistiques du Main Worker
 */

import { NextRequest, NextResponse } from 'next/server'
import { getWorkersStats } from '@/scripts/main-worker'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
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
    
    const stats = getWorkersStats()
    
    return NextResponse.json({
      success: true,
      stats,
    })
  } catch (error: any) {
    logger.error('Erreur lors de la récupération des stats', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    )
  }
}

