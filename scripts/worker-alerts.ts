/**
 * Worker backend pour vérifier les alertes en continu
 * Tourne indépendamment du frontend
 */

import { checkAlertsStandalone } from '@/lib/alerts/checkAlertsStandalone'
import { generateCookiesViaFactory } from '@/lib/alerts/cookieFactory'
import { handle403Failover, reset403Counter, initializeFailover } from '@/lib/failover/failover-manager'
import { getCookiesForScraping } from '@/lib/utils/getCookiesFromDb'
import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabase'

// Intervalle entre chaque vérification (en millisecondes)
// Par défaut : 30 minutes (1800000 ms)
const CHECK_INTERVAL_MS = parseInt(process.env.ALERTS_CHECK_INTERVAL_MS || '1800000', 10)

// Intervalle de renouvellement des cookies (1 heure)
const COOKIE_REFRESH_INTERVAL_MS = 60 * 60 * 1000 // 1 heure

// Délai d'attente après une erreur 403 (30 minutes)
const WAIT_AFTER_403_MS = 30 * 60 * 1000 // 30 minutes

// Variable pour suivre l'état
let isProcessing = false
let isRefreshingCookies = false // Verrou pour éviter les appels parallèles au Cookie Factory
let lastCookieRefresh = 0
let currentCookies: string | null = null

// Sauvegarder les cookies dans la base de données
async function saveCookies(cookies: string): Promise<void> {
  if (!supabase) {
    logger.warn('⚠️ Supabase non disponible, impossible de sauvegarder les cookies')
    return
  }

  try {
    // Essayer d'abord avec app_settings (structure key/value)
    try {
      const { error: error1 } = await supabase
        .from('app_settings')
        .upsert({
          key: 'vinted_cookies',
          value: cookies,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'key'
        })

      if (!error1) {
        logger.info('✅ Cookies sauvegardés dans app_settings')
        currentCookies = cookies
        lastCookieRefresh = Date.now()
        return
      } else {
        logger.debug(`Erreur app_settings: ${error1.message}`)
      }
    } catch (e: any) {
      logger.debug(`Exception app_settings: ${e?.message || String(e)}`)
    }

    // Essayer avec user_preferences (structure key/value)
    try {
      const { error: error2 } = await supabase
        .from('user_preferences')
        .upsert({
          key: 'vinted_cookies',
          value: cookies,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'key'
        })

      if (!error2) {
        logger.info('✅ Cookies sauvegardés dans user_preferences')
        currentCookies = cookies
        lastCookieRefresh = Date.now()
        return
      } else {
        logger.debug(`Erreur user_preferences: ${error2.message}`)
      }
    } catch (e: any) {
      logger.debug(`Exception user_preferences: ${e?.message || String(e)}`)
    }

    // Essayer avec vinted_credentials (structure directe)
    try {
      const { error: error3 } = await supabase
        .from('vinted_credentials')
        .upsert({
          id: 1, // ID fixe pour un seul enregistrement
          vinted_cookies: cookies,
          full_cookies: cookies,
          cookies: cookies,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'id'
        })

      if (!error3) {
        logger.info('✅ Cookies sauvegardés dans vinted_credentials')
        currentCookies = cookies
        lastCookieRefresh = Date.now()
        return
      } else {
        logger.debug(`Erreur vinted_credentials: ${error3.message}`)
      }
    } catch (e) {
      logger.debug(`Exception vinted_credentials: ${e}`)
    }
    
    // Si aucune table n'a fonctionné, logger l'erreur mais continuer
    logger.warn('⚠️ Impossible de sauvegarder les cookies dans la base de données (toutes les tentatives ont échoué)')
    logger.info('💡 Les cookies sont toujours utilisés en mémoire pour cette session, mais ne seront pas persistés entre redémarrages')
    logger.info('💡 Solution: Créer la table app_settings avec les colonnes: key (text, primary key), value (text), updated_at (timestamp)')
  } catch (error) {
    logger.warn('⚠️ Erreur lors de la sauvegarde des cookies:', error as Error)
  }
}

// Récupérer les cookies depuis la base de données (utilise getCookiesForScraping)
async function getCookies(): Promise<string | null> {
  // Utilise la fonction centralisée qui récupère depuis la DB puis fallback sur env
  const cookies = await getCookiesForScraping()
  
  if (!cookies) {
    logger.warn('⚠️ Aucun cookie trouvé. Le worker nécessite des cookies Cloudflare pour fonctionner.')
    logger.info('💡 Pour résoudre ce problème:')
    logger.info('   1. Les cookies sont générés automatiquement au démarrage et stockés en base')
    logger.info('   2. Ou configurez VINTED_FULL_COOKIES dans les secrets Fly.io (cookies Cloudflare)')
  }
  
  return cookies
}

// Générer de nouveaux cookies via Cookie Factory
async function refreshCookies(): Promise<string | null> {
  // Éviter les appels parallèles au Cookie Factory
  if (isRefreshingCookies) {
    logger.warn('⚠️ Renouvellement des cookies déjà en cours, attente...')
    // Attendre que le refresh en cours se termine (max 2 minutes)
    const startWait = Date.now()
    while (isRefreshingCookies && (Date.now() - startWait) < 120000) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    if (isRefreshingCookies) {
      logger.error('❌ Timeout lors de l\'attente du renouvellement des cookies')
      return null
    }
    // Retourner les cookies mis à jour
    return currentCookies
  }
  
  isRefreshingCookies = true
  try {
    logger.info('🔄 Renouvellement des cookies via Cookie Factory...')
    const result = await generateCookiesViaFactory()
    
    if (result.success && result.cookies) {
      await saveCookies(result.cookies)
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
  } finally {
    isRefreshingCookies = false
  }
}

async function runAlertCheck(): Promise<boolean> {
  try {
    if (isProcessing) {
      logger.warn('⚠️ Une vérification est déjà en cours, attente...')
      return false
    }
    
    isProcessing = true
    logger.info('🔔 Démarrage de la vérification des alertes (worker backend)...')
    
    // Vérifier si on doit renouveler les cookies (toutes les 1h)
    const timeSinceLastRefresh = Date.now() - lastCookieRefresh
    if (timeSinceLastRefresh >= COOKIE_REFRESH_INTERVAL_MS) {
      logger.info('⏰ Renouvellement automatique des cookies (1h écoulée)...')
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
        logger.info('💡 Pour résoudre ce problème:')
        logger.info('   1. Utilisez le Cookie Factory depuis l\'interface web pour générer des cookies')
        logger.info('   2. Les cookies seront automatiquement sauvegardés dans la base de données')
        logger.info('   3. Ou configurez VINTED_EMAIL et VINTED_PASSWORD pour génération automatique')
        isProcessing = false
        return false
      }
    }

    const result = await checkAlertsStandalone(cookies)

    if (result.success) {
      // Réinitialiser le compteur 403 après un succès
      reset403Counter()
      
      logger.info(`✅ Vérification terminée: ${result.matches.length} match(s) trouvé(s) pour ${result.alertsChecked} alerte(s)`)
      if (result.matches.length > 0) {
        logger.info(`📦 Items vérifiés: ${result.itemsChecked}`)
        logger.info(`🎯 Matches: ${result.matches.map(m => `${m.alertTitle} → ${m.item.title}`).join(', ')}`)
      }
      isProcessing = false
      return true
    } else {
      // Vérifier si c'est une erreur 403
      if (result.httpStatus === 403 || result.needsCookieRefresh) {
        logger.error(`❌ Erreur 403 détectée: ${result.error}`)
        
        // Essayer le failover automatique (si activé)
        const failoverEnabled = process.env.ENABLE_FAILOVER === 'true'
        if (failoverEnabled) {
          logger.info('🔄 Tentative de failover automatique...')
          const failoverSuccess = await handle403Failover({
            region: process.env.FLY_REGION,
            machineId: process.env.FLY_MACHINE_ID,
            appName: process.env.FLY_APP_NAME,
          })
          
          if (failoverSuccess) {
            logger.info('✅ Failover réussi, nouvelle tentative dans 1 minute...')
            await new Promise(resolve => setTimeout(resolve, 60000))
            // Relancer immédiatement après failover
            return await runAlertCheck()
          } else {
            logger.warn('⚠️ Failover non disponible ou échoué, utilisation de la stratégie standard')
          }
        }
        
        logger.info('⏸️ Arrêt du cycle d\'alertes')
        logger.info(`⏳ Attente de ${WAIT_AFTER_403_MS / 1000 / 60} minutes avant de relancer...`)
        
        isProcessing = false
        
        // Attendre 30 minutes
        await new Promise(resolve => setTimeout(resolve, WAIT_AFTER_403_MS))
        
        logger.info('🔄 Relance du Cookie Factory après attente...')
        const newCookies = await refreshCookies()
        
        if (newCookies) {
          logger.info('✅ Nouveaux cookies générés, relance du cycle d\'alertes...')
          currentCookies = newCookies
          // Relancer immédiatement la vérification
          return await runAlertCheck()
        } else {
          logger.error('❌ Impossible de générer de nouveaux cookies après 403')
          return false
        }
      } else {
        logger.error(`❌ Erreur lors de la vérification: ${result.error}`)
        isProcessing = false
        return false
      }
    }
  } catch (error) {
    logger.error('❌ Erreur fatale dans le worker d\'alertes', error as Error)
    isProcessing = false
    return false
  }
}

async function main() {
  logger.info('🚀 Démarrage du worker d\'alertes backend...')
  logger.info(`⏱️ Intervalle entre chaque cycle de vérification: ${CHECK_INTERVAL_MS / 1000 / 60} minutes`)
  logger.info(`⏱️ Délai entre chaque requête: 12-25s (jitter)`)
  logger.info(`🔄 Renouvellement automatique des cookies: toutes les ${COOKIE_REFRESH_INTERVAL_MS / 1000 / 60} minutes (1h)`)
  logger.info(`⏸️ Délai après erreur 403: ${WAIT_AFTER_403_MS / 1000 / 60} minutes`)
  
  // Initialiser le système de failover si activé
  const failoverEnabled = process.env.ENABLE_FAILOVER === 'true'
  if (failoverEnabled) {
    logger.info('🔄 Système de failover automatique: ACTIVÉ')
    await initializeFailover()
  } else {
    logger.info('🔄 Système de failover automatique: DÉSACTIVÉ (définir ENABLE_FAILOVER=true pour activer)')
  }
  
  logger.info(`📋 Le worker va:`)
  logger.info(`   1. Récupérer toutes les alertes actives`)
  logger.info(`   2. Traiter chaque alerte avec un délai de 12-25s (jitter) entre chaque requête`)
  logger.info(`   3. Renouveler automatiquement les cookies toutes les heures`)
  if (failoverEnabled) {
    logger.info(`   4. Si erreur 403: failover automatique (changement région/machine/app)`)
  } else {
    logger.info(`   4. Si erreur 403: arrêter, attendre 30min, générer nouveaux cookies, relancer`)
  }
  logger.info(`   5. Répéter ce cycle toutes les ${CHECK_INTERVAL_MS / 1000 / 60} minutes`)
  
  // Initialiser les cookies au démarrage
  currentCookies = await getCookies()
  if (currentCookies) {
    // Si on a des cookies, on considère qu'ils viennent d'être rafraîchis
    // pour éviter un renouvellement immédiat
    lastCookieRefresh = Date.now()
    logger.info('✅ Cookies récupérés au démarrage')
  } else {
    logger.info('🔄 Génération initiale des cookies...')
    currentCookies = await refreshCookies()
    if (currentCookies) {
      lastCookieRefresh = Date.now()
    }
  }
  
  // Vérifier immédiatement au démarrage
  await runAlertCheck()
  
  // Puis vérifier périodiquement
  setInterval(async () => {
    await runAlertCheck()
  }, CHECK_INTERVAL_MS)
  
  // Garder le processus actif
  logger.info('✅ Worker d\'alertes démarré et en cours d\'exécution...')
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

