/**
 * Worker principal pour le nouveau système basé sur les favoris
 * 1. Récupère les favoris Vinted
 * 2. Génère automatiquement des alertes pour chaque favori
 * 3. Vérifie les alertes et envoie des notifications Telegram
 * 4. Optionnel: Envoie des messages automatiques aux vendeurs
 */

// Charger les variables d'environnement depuis .env.local AVANT tous les autres imports
// (important pour que Supabase et autres modules puissent lire les variables)
import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

// Maintenant on peut importer les modules qui dépendent des variables d'environnement
import { autoGenerateAlertsFromFavorites } from '@/lib/alerts/autoGenerateFromFavorites'
import { checkAlertsStandalone } from '@/lib/alerts/checkAlertsStandalone'
import { generateCookiesViaFactory } from '@/lib/alerts/cookieFactory'
import { initializeCookies } from '@/lib/init/autoCookieSetup'
import { getCookiesForScraping } from '@/lib/utils/getCookiesFromDb'
import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabase'

// Intervalle entre chaque cycle complet (en millisecondes)
// Par défaut : 2 heures (7200000 ms)
const CYCLE_INTERVAL_MS = parseInt(process.env.FAVORITES_ALERTS_INTERVAL_MS || '7200000', 10)

// Intervalle de renouvellement des cookies (1 heure)
const COOKIE_REFRESH_INTERVAL_MS = 60 * 60 * 1000

// Pourcentage de réduction pour les messages de négociation (défaut: 10%)
const NEGOTIATION_DISCOUNT_PERCENT = parseFloat(process.env.NEGOTIATION_DISCOUNT_PERCENT || '10')

let isProcessing = false
let currentCookies: string | null = null
let lastCookieRefresh = 0

// Récupérer les cookies depuis la base de données (utilise getCookiesForScraping)
async function getCookies(): Promise<string | null> {
  // Utilise la fonction centralisée qui récupère depuis la DB puis fallback sur env
  const cookies = await getCookiesForScraping()
  
  if (!cookies) {
    logger.warn('⚠️ Aucun cookie Cloudflare trouvé pour le scraping')
    logger.info('💡 Les cookies sont générés automatiquement au démarrage et stockés en base')
  }
  
  return cookies
}

// Générer de nouveaux cookies
async function refreshCookies(): Promise<string | null> {
  try {
    logger.info('🔄 Renouvellement des cookies via Cookie Factory...')
    const result = await generateCookiesViaFactory()
    
    if (result.success && result.cookies) {
      logger.info('✅ Cookies renouvelés avec succès')
      currentCookies = result.cookies
      lastCookieRefresh = Date.now()
      return result.cookies
    } else {
      logger.error(`❌ Échec du renouvellement des cookies: ${result.error}`)
      return null
    }
  } catch (error) {
    logger.error('❌ Erreur lors du renouvellement des cookies', error as Error)
    return null
  }
}

// Note: Les messages sont maintenant envoyés via les boutons Telegram dans les notifications
// Cette fonction n'est plus utilisée

// Exécuter un cycle complet
async function runCycle(): Promise<boolean> {
  try {
    if (isProcessing) {
      logger.warn('⚠️ Un cycle est déjà en cours, attente...')
      return false
    }
    
    isProcessing = true
    logger.info('🚀 Démarrage d\'un nouveau cycle...')
    
    // Vérifier si on doit renouveler les cookies
    const timeSinceLastRefresh = Date.now() - lastCookieRefresh
    if (timeSinceLastRefresh >= COOKIE_REFRESH_INTERVAL_MS) {
      logger.info('⏰ Renouvellement automatique des cookies...')
      const newCookies = await refreshCookies()
      if (newCookies) {
        currentCookies = newCookies
      }
    }
    
    // Récupérer les cookies
    let cookies = currentCookies || await getCookies()
    
    if (!cookies) {
      logger.error('❌ Impossible de récupérer les cookies. Tentative de génération...')
      cookies = await refreshCookies()
      
      if (!cookies) {
        logger.error('❌ Impossible de générer des cookies. Le worker ne peut pas fonctionner.')
        isProcessing = false
        return false
      }
    }

    // Étape 1: Générer automatiquement les alertes depuis les favoris
    logger.info('📋 Étape 1: Génération automatique des alertes depuis les favoris...')
    logger.info('💡 Lecture des favoris depuis data/favorites.json (mise à jour manuelle)')
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
      isProcessing = false
      return false
    }

    logger.info(`✅ Vérification terminée: ${checkResult.matches.length} match(s) trouvé(s)`)

    // Note: Les messages aux vendeurs sont maintenant envoyés via les boutons Telegram
    // Plus besoin d'envoyer automatiquement

    isProcessing = false
    return true
  } catch (error) {
    logger.error('❌ Erreur fatale dans le cycle', error as Error)
    isProcessing = false
    return false
  }
}

async function main() {
  logger.info('🚀 Démarrage du worker favoris/alertes...')
  logger.info(`⏱️ Intervalle entre chaque cycle: ${CYCLE_INTERVAL_MS / 1000 / 60} minutes`)
  logger.info(`💰 Pourcentage de réduction pour négociation: ${NEGOTIATION_DISCOUNT_PERCENT}%`)
  
  logger.info(`📋 Le worker va:`)
  logger.info(`   1. Initialiser les cookies automatiquement si nécessaire`)
  logger.info(`   2. Lire les favoris depuis data/favorites.json (mise à jour manuelle)`)
  logger.info(`   3. Générer automatiquement des alertes pour chaque favori (prix < favori)`)
  logger.info(`   4. Vérifier les alertes et trouver des items à meilleur prix`)
  logger.info(`   5. Envoyer des notifications Telegram avec boutons pour envoyer des messages aux vendeurs`)
  logger.info(`   6. Répéter ce cycle toutes les ${CYCLE_INTERVAL_MS / 1000 / 60} minutes`)
  
  // Initialiser les cookies automatiquement au démarrage
  logger.info('🔐 Initialisation automatique des cookies...')
  const autoGenerate = process.env.AUTO_GENERATE_COOKIES !== 'false'
  const initResult = await initializeCookies(autoGenerate)
  
  if (initResult.success) {
    if (initResult.cookiesGenerated) {
      logger.info('✅ Cookies générés automatiquement au démarrage')
      if (!initResult.cookiesValid) {
        logger.warn('⚠️ Les cookies ont été générés mais le token n\'est pas valide')
        logger.info('💡 Configurez VINTED_EMAIL et VINTED_PASSWORD pour obtenir un token valide')
      }
    } else {
      logger.info('✅ Cookies valides déjà disponibles')
    }
  } else {
    logger.warn(`⚠️ Échec de l'initialisation automatique: ${initResult.error}`)
    logger.info('💡 Tentative de récupération depuis la base de données...')
  }
  
  // Récupérer les cookies (depuis la DB ou variables d'environnement)
  currentCookies = await getCookies()
  if (currentCookies) {
    lastCookieRefresh = Date.now()
    logger.info('✅ Cookies récupérés au démarrage')
  } else {
    logger.warn('⚠️ Aucun cookie disponible après initialisation')
    logger.info('💡 Le worker ne pourra pas fonctionner sans cookies valides')
    logger.info('💡 Solutions:')
    logger.info('   1. Configurer VINTED_FULL_COOKIES dans les variables d\'environnement')
    logger.info('   2. Configurer VINTED_EMAIL et VINTED_PASSWORD pour génération automatique')
    logger.info('   3. Sauvegarder les cookies manuellement via l\'API /api/v1/admin/vinted/save-cookies')
  }
  
  // Exécuter immédiatement au démarrage
  await runCycle()
  
  // Puis exécuter périodiquement
  setInterval(async () => {
    await runCycle()
  }, CYCLE_INTERVAL_MS)
  
  logger.info('✅ Worker démarré et en cours d\'exécution...')
}

// Gérer l'arrêt propre
process.on('SIGTERM', () => {
  logger.info('🛑 Signal SIGTERM reçu, arrêt du worker...')
  process.exit(0)
})

process.on('SIGINT', () => {
  logger.info('🛑 Signal SIGINT reçu, arrêt du worker...')
  process.exit(0)
})

// Démarrer le worker
main().catch((error) => {
  logger.error('❌ Erreur fatale au démarrage du worker', error as Error)
  process.exit(1)
})

