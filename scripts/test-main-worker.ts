/**
 * Script de test pour le Main Worker
 * Teste la distribution de commandes vers les workers régionaux
 */

import { distributeCommand, getWorkersStats, initializeMainWorker } from '@/scripts/main-worker'
import { logger } from '@/lib/logger'

async function testMainWorker() {
  try {
    logger.info('🧪 Test du Main Worker...')
    
    // Initialiser le Main Worker
    logger.info('📋 Étape 1: Initialisation du Main Worker...')
    await initializeMainWorker()
    logger.info('✅ Main Worker initialisé')
    
    // Attendre un peu pour que les health checks se fassent
    logger.info('⏳ Attente de 5 secondes pour les health checks...')
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    // Récupérer les statistiques
    logger.info('📊 Étape 2: Récupération des statistiques...')
    const stats = getWorkersStats()
    logger.info(`📊 Statistiques:`)
    logger.info(`   - Total workers: ${stats.totalWorkers}`)
    logger.info(`   - Workers disponibles: ${stats.availableWorkers}`)
    logger.info(`   - Workers bannis: ${stats.bannedWorkers}`)
    logger.info(`   - Workers unhealthy: ${stats.unhealthyWorkers}`)
    
    stats.workers.forEach(worker => {
      logger.info(`   - ${worker.name} (${worker.region}): ${worker.isHealthy ? '✅' : '❌'} - ${worker.requestCount} requêtes - ${worker.successRate.toFixed(1)}% succès`)
    })
    
    // Tester une commande de scraping
    logger.info('🌐 Étape 3: Test d\'une commande de scraping...')
    const scrapeResult = await distributeCommand({
      type: 'scrape',
      payload: {
        url: 'https://www.vinted.fr',
        method: 'GET',
      },
    })
    
    if (scrapeResult.success) {
      logger.info(`✅ Commande exécutée avec succès via ${scrapeResult.workerId}`)
      logger.info(`   Données reçues: ${JSON.stringify(scrapeResult.data).substring(0, 100)}...`)
    } else {
      logger.error(`❌ Échec de la commande: ${scrapeResult.error}`)
    }
    
    // Tester une commande de health check
    logger.info('🏥 Étape 4: Test d\'une commande de health check...')
    const healthResult = await distributeCommand({
      type: 'custom',
      payload: {
        handler: 'health',
      },
    })
    
    if (healthResult.success) {
      logger.info(`✅ Health check réussi via ${healthResult.workerId}`)
    } else {
      logger.warn(`⚠️ Health check échoué: ${healthResult.error}`)
    }
    
    // Afficher les statistiques finales
    logger.info('📊 Statistiques finales:')
    const finalStats = getWorkersStats()
    finalStats.workers.forEach(worker => {
      logger.info(`   - ${worker.name}: ${worker.requestCount} requêtes, ${worker.successCount} succès, ${worker.errorCount} erreurs`)
    })
    
    logger.info('✅ Tests terminés avec succès')
    
  } catch (error) {
    logger.error('❌ Erreur lors des tests', error as Error)
    process.exit(1)
  }
}

// Exécuter les tests
testMainWorker().catch((error) => {
  logger.error('❌ Erreur fatale', error as Error)
  process.exit(1)
})

