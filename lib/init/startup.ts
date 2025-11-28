/**
 * Script d'initialisation au démarrage de l'application
 * Appelé par instrumentation.ts au démarrage du serveur Next.js
 */

import { initializeCookies } from './autoCookieSetup'
import { logger } from '@/lib/logger'

let initialized = false

/**
 * Exécute un cycle complet : favoris → alertes → vérification → notifications
 */
async function runFullCycle(cookies: string): Promise<void> {
  try {
    logger.info('🔄 Démarrage du cycle complet automatique...')
    
    // Importer les fonctions nécessaires
    const { autoGenerateAlertsFromFavorites } = await import('@/lib/alerts/autoGenerateFromFavorites')
    const { checkAlertsStandalone } = await import('@/lib/alerts/checkAlertsStandalone')

    // Étape 1: Générer automatiquement les alertes depuis les favoris
    logger.info('📋 Étape 1: Génération automatique des alertes depuis les favoris...')
    const alertsResult = await autoGenerateAlertsFromFavorites()
    
    if (!alertsResult.success) {
      logger.error(`❌ Erreur lors de la génération des alertes: ${alertsResult.errors.join(', ')}`)
      // Continuer quand même pour vérifier les alertes existantes
    } else {
      logger.info(`✅ ${alertsResult.alertsCreated} alerte(s) créée(s), ${alertsResult.alertsUpdated} mise(s) à jour`)
    }

    // Étape 2: Vérifier les alertes
    logger.info('🔔 Étape 2: Vérification des alertes...')
    const checkResult = await checkAlertsStandalone(cookies)

    if (!checkResult.success) {
      logger.error(`❌ Erreur lors de la vérification des alertes: ${checkResult.error}`)
      return
    }

    logger.info(`✅ Vérification terminée: ${checkResult.matches.length} match(s) trouvé(s)`)
    
    if (checkResult.matches.length > 0) {
      logger.info(`🎯 Matches trouvés:`)
      checkResult.matches.forEach(match => {
        const price = match.item.price?.amount || 'N/A'
        logger.info(`   - ${match.alertTitle}: ${match.item.title} (${price}€)`)
      })
    }

  } catch (error) {
    logger.error('❌ Erreur lors du cycle complet', error as Error)
  }
}

/**
 * Initialise l'application au démarrage
 * Ne s'exécute qu'une seule fois
 */
export async function startup(): Promise<void> {
  if (initialized) {
    logger.debug('ℹ️ Initialisation déjà effectuée, skip')
    return
  }

  // Vérifier si on est en mode serveur (pas pendant le build)
  if (typeof window !== 'undefined') {
    logger.debug('ℹ️ Mode client détecté, skip initialisation')
    return // Ne pas exécuter côté client
  }

  // Vérifier si l'initialisation automatique est activée
  const autoInit = process.env.AUTO_INIT_COOKIES !== 'false'
  
  if (!autoInit) {
    logger.info('ℹ️ AUTO_INIT_COOKIES=false, initialisation automatique désactivée')
    initialized = true // Marquer comme initialisé pour éviter les tentatives répétées
    return
  }

  initialized = true
  logger.info('🚀 [STARTUP] Démarrage de l\'initialisation automatique des cookies...')

  // Vérifier si on doit exécuter le cycle complet automatiquement
  // ⚠️ DÉSACTIVÉ PAR DÉFAUT : Les cycles doivent être orchestrés via /api/v1/alerts/run-once
  // Pour éviter les exécutions multiples et les conflits entre workers
  const autoRunCycle = process.env.AUTO_RUN_CYCLE === 'true'

  // Exécuter l'initialisation (en arrière-plan pour ne pas bloquer)
  // Utiliser un délai pour laisser Next.js finir son démarrage
  setTimeout(async () => {
    try {
      logger.info('🔧 [STARTUP] Début de la vérification/génération des cookies...')
      
      const result = await initializeCookies(process.env.AUTO_GENERATE_COOKIES !== 'false')
      
      if (result.success) {
        if (result.cookiesGenerated) {
          logger.info('✅ [STARTUP] Cookies générés automatiquement au démarrage')
          if (!result.cookiesValid) {
            logger.warn('⚠️ Les cookies ont été générés mais le token n\'est pas valide')
            logger.info('💡 Configurez VINTED_EMAIL et VINTED_PASSWORD pour obtenir un token valide')
            return // Ne pas continuer si les cookies ne sont pas valides
          }
        } else {
          logger.info('✅ [STARTUP] Cookies valides déjà disponibles')
        }

        // Si autoRunCycle est activé, exécuter le cycle complet
        if (autoRunCycle) {
          logger.info('🔄 AUTO_RUN_CYCLE=true, démarrage du cycle complet automatique...')

          // Récupérer les cookies pour le cycle
          // PRIORITÉ : Base de données (cookies Cloudflare générés automatiquement)
          // FALLBACK : Variables d'environnement (si pas de cookies en DB)
          const { getCookiesForScraping } = await import('@/lib/utils/getCookiesFromDb')
          let cookies: string | null = await getCookiesForScraping()
          let cookieSource = 'unknown'
          let isFullAccess = false

          if (cookies) {
            // Vérifier si ce sont des cookies authentifiés (avec access_token_web)
            if (cookies.includes('access_token_web')) {
              cookieSource = 'base de données ou variables d\'environnement (AUTHENTIFIÉS - ACCÈS COMPLET)'
              isFullAccess = true
              logger.info('🎯 Cookies AUTHENTIFIÉS détectés - ACCÈS COMPLET aux favoris et recherche')
            } else if (cookies.includes('cf_clearance') || cookies.includes('datadome')) {
              cookieSource = 'base de données (CLOUDFLARE - Recherche seulement)'
              isFullAccess = false
              logger.info('✅ Cookies Cloudflare détectés - Recherche publique uniquement')
            } else {
              cookieSource = 'base de données ou variables d\'environnement'
              isFullAccess = false
            }
          }

          if (cookies) {
            logger.info(`✅ Cookies utilisés: ${cookieSource}`)
            if (isFullAccess) {
              logger.info('🚀 Démarrage du cycle COMPLET (favoris + recherche + alertes)')
            } else {
              logger.warn('🚀 Démarrage du cycle LIMITÉ (recherche seulement - pas de favoris)')
              logger.info('💡 Les favoris seront ignorés sans cookies manuels')
            }
            // Attendre un peu avant de démarrer le cycle
            setTimeout(async () => {
              await runFullCycle(cookies!)
            }, 2000)
          } else {
            logger.warn('⚠️ Impossible de récupérer les cookies pour le cycle automatique')
          }
        } else {
          logger.info('ℹ️ AUTO_RUN_CYCLE désactivé (par défaut)')
          logger.info('💡 Les cycles doivent être orchestrés via POST /api/v1/alerts/run-once')
          logger.info('💡 Pour activer le cycle automatique (non recommandé): définir AUTO_RUN_CYCLE=true')
        }
      } else {
        logger.warn(`⚠️ [STARTUP] Échec de l'initialisation automatique: ${result.error}`)
        logger.info('💡 Vous pouvez initialiser manuellement via: npm run init:cookies')
        logger.info('💡 Ou via l\'API: POST /api/v1/init/cookies')
      }
    } catch (error) {
      logger.error('❌ [STARTUP] Erreur lors de l\'initialisation automatique', error as Error)
    }
  }, 5000) // Attendre 5 secondes après le démarrage pour laisser Next.js s'initialiser complètement
}

