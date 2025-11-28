/**
 * API endpoint pour le Main Worker
 * Reçoit les commandes et les distribue vers les workers régionaux
 */

import { NextRequest, NextResponse } from 'next/server'
import { distributeCommand } from '@/scripts/main-worker'
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
    
    const body = await request.json()
    const { type, payload, priority } = body
    
    if (!type) {
      return NextResponse.json(
        { error: 'Command type is required' },
        { status: 400 }
      )
    }
    
    logger.info(`📨 Main Worker: Réception d'une commande de type "${type}"`)
    
    const command = {
      type,
      payload: payload || {},
      priority: priority || 0,
      retryCount: 0,
    }
    
    const result = await distributeCommand(command)
    
    if (result.success) {
      return NextResponse.json({
        success: true,
        data: result.data,
        workerId: result.workerId,
      })
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
        },
        { status: 500 }
      )
    }
  } catch (error: any) {
    logger.error('Erreur dans le Main Worker', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    )
  }
}

