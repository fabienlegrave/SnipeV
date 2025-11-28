/**
 * Script d'initialisation des cookies au démarrage
 * Peut être exécuté manuellement ou automatiquement
 */

import { initializeCookies } from '@/lib/init/autoCookieSetup'
import { logger } from '@/lib/logger'

async function main() {
  logger.info('🚀 Démarrage de l\'initialisation des cookies...')
  
  // Vérifier si la génération automatique est activée
  const autoGenerate = process.env.AUTO_GENERATE_COOKIES !== 'false'
  
  if (!autoGenerate) {
    logger.info('ℹ️ AUTO_GENERATE_COOKIES=false, génération automatique désactivée')
    logger.info('💡 Pour activer: définir AUTO_GENERATE_COOKIES=true dans les variables d\'environnement')
    process.exit(0)
  }

  const result = await initializeCookies(autoGenerate)

  if (result.success) {
    if (result.cookiesGenerated) {
      logger.info('✅ Initialisation terminée: cookies générés et sauvegardés')
      if (!result.cookiesValid) {
        logger.warn('⚠️ Les cookies ont été générés mais le token n\'est pas valide')
        logger.info('💡 Configurez VINTED_EMAIL et VINTED_PASSWORD pour obtenir un token valide')
      }
    } else {
      logger.info('✅ Initialisation terminée: cookies valides déjà disponibles')
    }
    process.exit(0)
  } else {
    logger.error(`❌ Échec de l'initialisation: ${result.error}`)
    process.exit(1)
  }
}

main().catch((error) => {
  logger.error('❌ Erreur fatale lors de l\'initialisation', error as Error)
  process.exit(1)
})

