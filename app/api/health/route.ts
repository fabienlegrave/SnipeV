/**
 * Endpoint de santé pour vérifier que l'API fonctionne
 * GET /api/health
 * 
 * Initialise automatiquement le main worker ou les workers régionaux au premier appel
 */

import { NextResponse } from 'next/server'

let initializationAttempted = false

export async function GET() {
  // Initialisation automatique au premier appel (une seule fois)
  if (!initializationAttempted) {
    initializationAttempted = true
    
    // Exécuter l'initialisation en arrière-plan (ne pas bloquer la réponse)
    setImmediate(async () => {
      try {
        const appName = process.env.FLY_APP_NAME || ''
        console.log(`🔧 [HEALTH] Initialisation automatique pour: ${appName}`)
        
        if (appName.startsWith('main-worker')) {
          console.log('🔧 [HEALTH] Initialisation du Main Worker...')
          const { initializeMainWorker } = await import('@/scripts/main-worker')
          await initializeMainWorker()
          console.log('✅ [HEALTH] Main Worker initialisé avec succès')
        } else if (appName.includes('worker-')) {
          console.log('🔧 [HEALTH] Initialisation du Worker Régional...')
          const { startup } = await import('@/lib/init/startup')
          await startup()
          console.log('✅ [HEALTH] Worker initialisé avec succès')
        }
      } catch (error) {
        console.error('❌ [HEALTH] Erreur lors de l\'initialisation automatique:', error)
      }
    })
  }
  
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Vinted Alerts API',
    version: '2.0.0',
    app: process.env.FLY_APP_NAME || 'unknown'
  })
}

