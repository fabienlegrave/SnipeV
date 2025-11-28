/**
 * Worker de régénération automatique des tokens Cloudflare
 * Tourne toutes les heures pour régénérer les cookies et les stocker en base
 * Tous les workers récupèrent ensuite ces cookies depuis la DB
 */

import { generateVintedCookiesWithPuppeteer } from '@/lib/scrape/cookieGenerator'
import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'

// Intervalle de régénération (1 heure)
const REFRESH_INTERVAL_MS = 60 * 60 * 1000 // 1 heure

let isRefreshing = false

/**
 * Régénère les cookies Cloudflare et les stocke en base de données
 */
async function refreshTokens(): Promise<boolean> {
  if (isRefreshing) {
    logger.warn('⚠️ Régénération déjà en cours, attente...')
    return false
  }

  isRefreshing = true

  try {
    logger.info('🔄 Démarrage de la régénération automatique des tokens Cloudflare...')
    logger.info('🔧 Vérification de la disponibilité de Puppeteer...')
    
    // Vérifier que Puppeteer est disponible
    try {
      const puppeteer = await import('puppeteer')
      logger.info('✅ Puppeteer disponible')
    } catch (error) {
      logger.error('❌ Puppeteer non disponible sur ce worker')
      logger.error('❌ Puppeteer doit être disponible uniquement sur le main worker')
      return false
    }
    
    // Générer les nouveaux cookies Cloudflare (sans login)
    logger.info('🔧 Appel de generateVintedCookiesWithPuppeteer()...')
    const result = await generateVintedCookiesWithPuppeteer()

    logger.info(`📊 Résultat de la génération: success=${result.success}, hasCookies=${!!result.cookies}, error=${result.error || 'none'}`)

    if (!result.success || !result.cookies) {
      logger.error(`❌ Échec de la régénération: ${result.error || 'Unknown error'}`)
      if (result.error) {
        logger.error(`❌ Détails de l'erreur:`, result.error as any)
      }
      logger.error('💡 Vérifiez:')
      logger.error('   - Que Puppeteer fonctionne correctement')
      logger.error('   - Que Chromium est installé (Dockerfile)')
      logger.error('   - Que les variables d\'environnement sont correctes')
      return false
    }

    logger.info('✅ Tokens Cloudflare générés avec succès')

    // Vérifier la présence de cookies Cloudflare
    const hasCloudflare = result.cookies.includes('cf_clearance') || result.cookies.includes('datadome')
    if (!hasCloudflare) {
      logger.warn('⚠️ Tokens générés mais pas de cookies Cloudflare détectés')
      return false
    }

    // Stocker en base de données
    if (!supabase) {
      logger.error('❌ Supabase non disponible, impossible de stocker les tokens')
      logger.error('💡 Vérifiez que SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont configurés')
      return false
    }

    // Désactiver les anciens credentials actifs
    try {
      const { data: oldCredentials, error: updateError } = await supabase
        .from('vinted_credentials')
        .update({ is_active: false })
        .eq('is_active', true)
        .select('id')
      
      if (updateError) {
        logger.warn(`⚠️ Erreur lors de la désactivation des anciens credentials: ${updateError.message}`)
        logger.warn('💡 La table vinted_credentials existe-t-elle ?')
      } else {
        const count = oldCredentials?.length || 0
        logger.info(`✅ ${count} ancien(s) credential(s) désactivé(s)`)
      }
    } catch (error: any) {
      logger.error(`❌ Erreur lors de la désactivation des anciens credentials: ${error.message}`)
      logger.error('💡 Vérifiez que la table vinted_credentials existe dans Supabase')
      // Continuer quand même pour essayer d'insérer
    }

    // Extraire les tokens si présents
    const tokenMatch = result.cookies.match(/access_token_web=([^;]+)/)
    const refreshTokenMatch = result.cookies.match(/refresh_token_web=([^;]+)/)
    const accessToken = tokenMatch ? tokenMatch[1] : null
    const refreshToken = refreshTokenMatch ? refreshTokenMatch[1] : null

    // Sauvegarder les nouveaux credentials
    logger.info('💾 Sauvegarde des nouveaux cookies en base de données...')
    const { data: insertedData, error: insertError } = await supabase
      .from('vinted_credentials')
      .insert({
        full_cookies: result.cookies.trim(),
        access_token: accessToken,
        refresh_token: refreshToken,
        is_active: true,
        notes: 'Auto-régénéré toutes les heures',
        last_used_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select('id, updated_at')
      .single()

    if (insertError) {
      logger.error('❌ Erreur lors de la sauvegarde des tokens:', insertError)
      logger.error(`❌ Code: ${insertError.code}, Message: ${insertError.message}`)
      logger.error('💡 Vérifiez:')
      logger.error('   - Que la table vinted_credentials existe')
      logger.error('   - Que les colonnes sont correctes (full_cookies, is_active, etc.)')
      logger.error('   - Que SUPABASE_SERVICE_ROLE_KEY a les permissions d\'écriture')
      return false
    }

    if (insertedData) {
      logger.info(`✅ Cookies sauvegardés avec succès (ID: ${insertedData.id})`)
      logger.info(`✅ Date de mise à jour: ${insertedData.updated_at}`)
    }

    logger.info('✅ Tokens Cloudflare régénérés et stockés en base de données')
    logger.info('💡 Tous les workers récupéreront automatiquement ces nouveaux tokens')

    return true
  } catch (error) {
    logger.error('❌ Erreur lors de la régénération des tokens', error as Error)
    return false
  } finally {
    isRefreshing = false
  }
}

/**
 * Initialise le worker de régénération automatique
 */
async function initializeTokenRefreshWorker(): Promise<void> {
  logger.info('🚀 Initialisation du worker de régénération automatique des tokens...')
  logger.info(`⏱️ Intervalle de régénération: ${REFRESH_INTERVAL_MS / 1000 / 60} minutes (1h)`)
  logger.info('💡 Les tokens seront régénérés automatiquement et stockés en base')
  logger.info('💡 Tous les workers récupéreront les nouveaux tokens depuis la DB')

  // Régénérer immédiatement au démarrage
  await refreshTokens()

  // Puis régénérer périodiquement
  setInterval(async () => {
    await refreshTokens()
  }, REFRESH_INTERVAL_MS)

  logger.info('✅ Worker de régénération automatique démarré')
}

// Gérer l'arrêt propre
process.on('SIGTERM', () => {
  logger.info('🛑 Signal SIGTERM reçu, arrêt du worker de régénération...')
  process.exit(0)
})

process.on('SIGINT', () => {
  logger.info('🛑 Signal SIGINT reçu, arrêt du worker de régénération...')
  process.exit(0)
})

// Démarrer le worker
if (require.main === module) {
  initializeTokenRefreshWorker().catch((error) => {
    logger.error('❌ Erreur fatale au démarrage du worker de régénération', error as Error)
    process.exit(1)
  })
}

export { initializeTokenRefreshWorker, refreshTokens }

