/**
 * Endpoint d'orchestration pour exécuter un cycle de vérification des alertes
 * POST /api/v1/alerts/run-once
 * 
 * Orchestre la vérification des alertes via le load balancer
 * Distribue le travail sur les workers régionaux de façon aléatoire
 * 
 * Remplace les cycles automatiques (AUTO_RUN_CYCLE) des workers
 */

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { sendCommandToWorker, WORKER_NODES } from '@/scripts/main-worker'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface RunOnceResult {
  success: boolean
  alertsChecked: number
  matchesFound: number
  workersUsed: string[]
  errors: string[]
  duration: number
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
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

    logger.info('🚀 Démarrage du cycle de vérification des alertes (orchestré)...')
    
    // Récupérer les alertes actives depuis la base de données
    const { supabase } = await import('@/lib/supabase')
    if (!supabase) {
      return NextResponse.json(
        {
          success: false,
          error: 'Supabase non disponible',
        },
        { status: 500 }
      )
    }

    const { data: alerts, error: alertsError } = await supabase
      .from('price_alerts')
      .select('id, game_title, platform, max_price, condition')
      .eq('is_active', true)

    if (alertsError) {
      logger.error('❌ Erreur lors de la récupération des alertes:', alertsError)
      return NextResponse.json(
        {
          success: false,
          error: `Erreur base de données: ${alertsError.message}`,
        },
        { status: 500 }
      )
    }

    if (!alerts || alerts.length === 0) {
      logger.info('ℹ️ Aucune alerte active à vérifier')
      return NextResponse.json({
        success: true,
        alertsChecked: 0,
        matchesFound: 0,
        workersUsed: [],
        errors: [],
        duration: Date.now() - startTime,
      })
    }

    logger.info(`📋 ${alerts.length} alerte(s) active(s) à vérifier`)

    // Sélectionner un worker disponible (stratégie random)
    const availableWorkers = WORKER_NODES.filter(w => 
      w.isHealthy && !w.isBanned
    )

    if (availableWorkers.length === 0) {
      logger.error('❌ Aucun worker disponible')
      return NextResponse.json(
        {
          success: false,
          error: 'Aucun worker disponible (tous bannis ou unhealthy)',
          workersStatus: WORKER_NODES.map(w => ({
            id: w.id,
            healthy: w.isHealthy,
            banned: w.isBanned,
            bannedUntil: w.bannedUntil,
          })),
        },
        { status: 503 }
      )
    }

    // Sélectionner un worker aléatoire
    const selectedWorker = availableWorkers[Math.floor(Math.random() * availableWorkers.length)]
    logger.info(`🎯 Worker sélectionné: ${selectedWorker.name} (${selectedWorker.region})`)

    // Envoyer la commande de vérification des alertes
    // Les cookies seront récupérés par le worker depuis la DB
    const command = {
      type: 'check-alerts' as const,
      payload: {
        alerts: alerts.map(a => ({
          id: a.id,
          game_title: a.game_title,
          platform: a.platform,
          max_price: a.max_price,
          condition: a.condition,
        })),
      },
    }

    logger.info(`📤 Envoi de la commande au worker ${selectedWorker.name}...`)
    const response = await sendCommandToWorker(selectedWorker, command)

    const duration = Date.now() - startTime

    if (response.success) {
      const result = response.data as any
      logger.info(`✅ Cycle terminé avec succès en ${duration}ms`)
      logger.info(`📊 Résultats: ${result.matches?.length || 0} match(s) trouvé(s)`)

      return NextResponse.json({
        success: true,
        alertsChecked: alerts.length,
        matchesFound: result.matches?.length || 0,
        matches: result.matches || [],
        workersUsed: [selectedWorker.id],
        errors: [],
        duration,
      })
    } else {
      // Si erreur NO_SCRAPING_COOKIES, déclencher un refresh des cookies
      if (response.error?.includes('NO_SCRAPING_COOKIES')) {
        logger.error(`❌ Échec du cycle: ${response.error}`)
        logger.info('🔄 Tentative de régénération des cookies...')
        
        try {
          const { refreshTokens } = await import('@/scripts/token-refresh-worker')
          const refreshSuccess = await refreshTokens()
          
          if (refreshSuccess) {
            logger.info('✅ Cookies régénérés avec succès, réessayez dans quelques secondes')
          } else {
            logger.error('❌ Échec de la régénération des cookies')
          }
        } catch (refreshError: any) {
          logger.error('❌ Erreur lors de la régénération des cookies:', refreshError)
        }
      }
      
      logger.error(`❌ Échec du cycle: ${response.error}`)
      return NextResponse.json(
        {
          success: false,
          alertsChecked: 0,
          matchesFound: 0,
          workersUsed: [selectedWorker.id],
          errors: [response.error || 'Unknown error'],
          duration,
          recommendation: response.error?.includes('NO_SCRAPING_COOKIES')
            ? 'Cookies régénérés automatiquement, réessayez dans quelques secondes'
            : undefined,
        },
        { status: 500 }
      )
    }
  } catch (error: any) {
    logger.error('❌ Erreur lors de l\'orchestration du cycle', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error',
        duration: Date.now() - startTime,
      },
      { status: 500 }
    )
  }
}

export async function GET() {
  // Permettre l'appel sans API key pour les schedulers externes
  return POST(new NextRequest('http://localhost/api/v1/alerts/run-once', { method: 'POST' }))
}

