/**
 * Initialisation automatique des cookies au démarrage
 * Génère les cookies Vinted si aucun n'est disponible
 */

import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabase'
import { generateVintedCookiesWithPuppeteer } from '@/lib/scrape/cookieGenerator'

interface InitResult {
  success: boolean
  cookiesGenerated: boolean
  cookiesValid: boolean
  error?: string
}

/**
 * Vérifie si des cookies valides existent
 * Accepte les cookies Cloudflare (cf_clearance, datadome) même sans access_token_web
 */
export async function hasValidCookies(): Promise<boolean> {
  // 1. Vérifier les variables d'environnement
  const envCookies = process.env.VINTED_FULL_COOKIES
  if (envCookies && envCookies.trim().length > 0) {
    // Vérifier la présence de cookies Cloudflare (cf_clearance ou datadome)
    const hasCloudflare = envCookies.includes('cf_clearance') || envCookies.includes('datadome')
    if (hasCloudflare) {
      logger.info('✅ Cookies Cloudflare trouvés dans les variables d\'environnement')
      return true
    }
    // Si pas de Cloudflare mais access_token_web présent, accepter quand même
    const hasToken = envCookies.includes('access_token_web')
    if (hasToken) {
      logger.info('✅ Cookies avec token trouvés dans les variables d\'environnement')
      return true
    }
  }

  // 2. Vérifier la base de données
  if (supabase) {
    try {
      const tables = ['vinted_credentials', 'app_settings', 'user_preferences']
      
      for (const tableName of tables) {
        try {
          let query = supabase.from(tableName)
          
          if (tableName === 'app_settings') {
            const { data } = await query
              .select('value')
              .eq('key', 'vinted_cookies')
              .single()
              .catch(() => ({ data: null }))
            
            if (data?.value && typeof data.value === 'string') {
              // Accepter les cookies Cloudflare même sans access_token_web
              const hasCloudflare = data.value.includes('cf_clearance') || data.value.includes('datadome')
              if (hasCloudflare) {
                logger.info(`✅ Cookies Cloudflare trouvés dans ${tableName}`)
                return true
              }
            }
          } else if (tableName === 'vinted_credentials') {
            const { data } = await query
              .select('full_cookies, access_token, is_active')
              .eq('is_active', true)
              .order('updated_at', { ascending: false })
              .limit(1)
              .single()
              .catch(() => ({ data: null }))
            
            if (data?.full_cookies || data?.access_token) {
              const cookies = data.full_cookies || ''
              // Accepter les cookies Cloudflare même sans access_token_web
              const hasCloudflare = cookies.includes('cf_clearance') || cookies.includes('datadome')
              if (hasCloudflare) {
                logger.info(`✅ Cookies Cloudflare trouvés dans ${tableName}`)
                return true
              }
            }
          } else {
            const { data } = await query
              .select('vinted_cookies, full_cookies, cookies')
              .order('updated_at', { ascending: false })
              .limit(1)
              .single()
              .catch(() => ({ data: null }))
            
            const cookies = data?.vinted_cookies || data?.full_cookies || data?.cookies
            if (cookies && typeof cookies === 'string') {
              // Accepter les cookies Cloudflare même sans access_token_web
              const hasCloudflare = cookies.includes('cf_clearance') || cookies.includes('datadome')
              if (hasCloudflare) {
                logger.info(`✅ Cookies Cloudflare trouvés dans ${tableName}`)
                return true
              }
            }
          }
        } catch (error) {
          // Table n'existe pas, continuer
          continue
        }
      }
    } catch (error) {
      // Ignorer les erreurs
    }
  }

  return false
}

/**
 * Sauvegarde les cookies dans la base de données
 */
async function saveCookiesToDb(cookies: string): Promise<boolean> {
  if (!supabase) {
    logger.warn('⚠️ Supabase non disponible, impossible de sauvegarder les cookies')
    return false
  }

  try {
    // Extraire les infos des cookies
    const tokenMatch = cookies.match(/access_token_web=([^;]+)/)
    const refreshTokenMatch = cookies.match(/refresh_token_web=([^;]+)/)
    const userIdMatch = cookies.match(/user_id=([^;]+)/)

    const accessToken = tokenMatch ? tokenMatch[1] : null
    const refreshToken = refreshTokenMatch ? refreshTokenMatch[1] : null
    const userId = userIdMatch ? userIdMatch[1] : null

    // Désactiver les anciens credentials actifs
    try {
      await supabase
        .from('vinted_credentials')
        .update({ is_active: false })
        .eq('is_active', true)
    } catch (error) {
      // Ignorer les erreurs (table peut ne pas exister)
    }

    // Sauvegarder les nouveaux credentials
    const { error: insertError } = await supabase
      .from('vinted_credentials')
      .insert({
        full_cookies: cookies.trim(),
        access_token: accessToken,
        refresh_token: refreshToken,
        user_id: userId,
        is_active: true,
        notes: 'Auto-generated au démarrage',
        last_used_at: new Date().toISOString()
      })

    if (insertError) {
      logger.error('❌ Erreur lors de la sauvegarde des cookies:', insertError)
      return false
    }

    logger.info('✅ Cookies sauvegardés dans la base de données')
    return true
  } catch (error) {
    logger.error('❌ Erreur lors de la sauvegarde des cookies:', error as Error)
    return false
  }
}

/**
 * Initialise automatiquement les cookies au démarrage
 * Génère les cookies si aucun n'est disponible ou valide
 */
export async function initializeCookies(autoGenerate: boolean = true): Promise<InitResult> {
  logger.info('🔐 Initialisation automatique des cookies...')

  // 1. Vérifier si des cookies valides existent déjà
  const hasValid = await hasValidCookies()
  if (hasValid) {
    logger.info('✅ Cookies valides déjà disponibles, pas besoin de génération')
    return {
      success: true,
      cookiesGenerated: false,
      cookiesValid: true
    }
  }

  logger.warn('⚠️ Aucun cookie valide trouvé')

  // 2. Si autoGenerate est désactivé, retourner une erreur
  if (!autoGenerate) {
    logger.warn('⚠️ Génération automatique désactivée (AUTO_GENERATE_COOKIES=false)')
    return {
      success: false,
      cookiesGenerated: false,
      cookiesValid: false,
      error: 'No valid cookies found and auto-generation is disabled'
    }
  }

  // 3. Générer uniquement les cookies Cloudflare (sans login)
  logger.info('🔄 Génération des cookies Cloudflare via Puppeteer (sans login)...')
  logger.info('💡 Les cookies Cloudflare sont suffisants pour le scraping')
  logger.info('💡 Les favoris sont gérés via le fichier JSON local (data/favorites.json)')
  
  const result = await generateVintedCookiesWithPuppeteer()

  if (!result.success || !result.cookies) {
    logger.error(`❌ Échec de la génération des cookies: ${result.error}`)
    return {
      success: false,
      cookiesGenerated: false,
      cookiesValid: false,
      error: result.error || 'Failed to generate cookies'
    }
  }

  logger.info('✅ Cookies Cloudflare générés avec succès')

  // 4. Vérifier la présence de cookies Cloudflare (pas besoin d'access_token_web)
  const hasCloudflare = result.cookies.includes('cf_clearance') || result.cookies.includes('datadome')
  const cookiesValid = hasCloudflare

  if (!cookiesValid) {
    logger.warn('⚠️ Cookies générés mais pas de cookies Cloudflare détectés')
  } else {
    logger.info('✅ Cookies Cloudflare valides (cf_clearance ou datadome présents)')
  }

  // 5. Sauvegarder les cookies dans la base de données (optionnel)
  const saved = await saveCookiesToDb(result.cookies)

  if (!saved) {
    logger.warn('⚠️ Cookies générés mais non sauvegardés en base de données')
    logger.info('💡 Les cookies sont disponibles mais ne seront pas persistés entre redémarrages')
  }

  return {
    success: true,
    cookiesGenerated: true,
    cookiesValid,
    error: cookiesValid ? undefined : 'Cookies generated but no Cloudflare cookies found'
  }
}

