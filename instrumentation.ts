/**
 * Next.js Instrumentation Hook
 * S'exécute automatiquement au démarrage du serveur Next.js
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('🔧 [INSTRUMENTATION] Hook appelé - Démarrage de l\'initialisation...')
    
    // FLY_APP_NAME est défini automatiquement par Fly.io
    const appName = process.env.FLY_APP_NAME || ''
    console.log(`🔧 [INSTRUMENTATION] FLY_APP_NAME: ${appName}`)
    
    // Si c'est le main worker, initialiser le load balancer
    // Détecter si le nom commence par "main-worker"
    if (appName.startsWith('main-worker')) {
      try {
        const { initializeMainWorker } = await import('./scripts/main-worker')
        console.log('🔧 [INSTRUMENTATION] Initialisation du Main Worker...')
        await initializeMainWorker()
        console.log('✅ [INSTRUMENTATION] Main Worker initialisé avec succès')
      } catch (error) {
        console.error('❌ [INSTRUMENTATION] Erreur lors de l\'initialisation du Main Worker:', error)
      }
    } else {
      // Pour les autres apps, exécuter l'initialisation normale
      try {
        const { startup } = await import('./lib/init/startup')
        console.log('🔧 [INSTRUMENTATION] Fonction startup importée, appel en cours...')
        await startup()
        console.log('✅ [INSTRUMENTATION] Initialisation démarrée avec succès')
      } catch (error) {
        console.error('❌ [INSTRUMENTATION] Erreur lors de l\'initialisation:', error)
      }
    }
  } else {
    console.log('ℹ️ [INSTRUMENTATION] NEXT_RUNTIME !== nodejs, skip')
  }
}
