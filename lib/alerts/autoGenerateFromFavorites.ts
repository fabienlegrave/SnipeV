/**
 * Module pour générer automatiquement des alertes basées sur les favoris Vinted
 * Pour chaque favori, crée une alerte pour trouver des items similaires à un prix inférieur
 * 
 * Utilise maintenant un fichier JSON simple (data/favorites.json) au lieu de l'authentification Vinted
 */

import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import { getFavoritesFromJson } from '@/lib/utils/favoritesJson'
import type { ApiItem } from '@/lib/types/core'
// Removed smart relevance scorer import - simplified approach

interface FavoriteAlert {
  favoriteItemId: number
  favoriteTitle: string
  favoritePrice: number
  alertId: number | null
  created: boolean
}

/**
 * Normalise un titre pour comparaison (supprime accents, ponctuation, etc.)
 */
function normalizeTitleForComparison(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Supprimer les accents
    .replace(/[^\w\s]/g, '') // Supprimer la ponctuation
    .replace(/\s+/g, ' ') // Normaliser les espaces
    .trim()
}

/**
 * Vérifie si deux titres sont similaires (au moins 80% de similarité)
 */
function areTitlesSimilar(title1: string, title2: string): boolean {
  const words1 = new Set(title1.split(/\s+/).filter(w => w.length > 2))
  const words2 = new Set(title2.split(/\s+/).filter(w => w.length > 2))
  
  if (words1.size === 0 || words2.size === 0) return false
  
  const words1Array = Array.from(words1)
  const words2Array = Array.from(words2)
  const intersection = new Set(words1Array.filter(w => words2.has(w)))
  const union = new Set([...words1Array, ...words2Array])
  
  const similarity = union.size > 0 ? intersection.size / union.size : 0
  return similarity >= 0.8 // 80% de similarité minimum
}

/**
 * Extrait le titre du jeu depuis le titre de l'item
 * Ex: "Megaman 2 NES" -> "Megaman 2"
 * Ex: "jeu vampire hunter" -> "vampire hunter"
 * Ex: "vampire hunter -" -> "vampire hunter"
 */
function extractGameTitle(title: string): string {
  // Nettoyer le titre
  let cleanTitle = title
    .toLowerCase()
    .trim()
  
  // Supprimer les préfixes/suffixes communs
  const prefixPatterns = [
    /^(jeu|game|video|retro|vintage|rare|occasion)\s+/i,
    /^vendo\s+/i,
    /^vends?\s+/i,
  ]
  
  const suffixPatterns = [
    /\s*-\s*$/,
    /\s*\(\d+\)\s*$/,
    /\s*\[.*?\]\s*$/,
  ]
  
  prefixPatterns.forEach(pattern => {
    cleanTitle = cleanTitle.replace(pattern, '')
  })
  
  suffixPatterns.forEach(pattern => {
    cleanTitle = cleanTitle.replace(pattern, '')
  })
  
  // Supprimer les mentions de plateforme communes
  const platformPatterns = [
    /\b(nes|snes|n64|gamecube|wii\s*u|wii|switch|3ds|ds|gameboy|gb|gba)\b/gi,
    /\b(playstation|ps1|ps2|ps3|ps4|ps5|psp|vita|psone)\b/gi,
    /\b(xbox|xbox\s*360|xbox\s*one|xbox\s*series)\b/gi,
    /\b(megadrive|genesis|sega\s*saturn|dreamcast|saturn)\b/gi,
  ]
  
  platformPatterns.forEach(pattern => {
    cleanTitle = cleanTitle.replace(pattern, '')
  })
  
  // Supprimer les mentions de condition
  const conditionPatterns = [
    /\b(complet|cib|complete|loose|boite|boîte|box|neuf|new|sealed)\b/gi,
    /\b(jap|japonais|japan|us|usa|ntsc|pal|fr|français)\b/gi,
  ]
  
  conditionPatterns.forEach(pattern => {
    cleanTitle = cleanTitle.replace(pattern, '')
  })
  
  // Supprimer les caractères spéciaux en fin de titre
  cleanTitle = cleanTitle.replace(/[^\w\s]+$/g, '')
  
  // Nettoyer les espaces multiples
  cleanTitle = cleanTitle.replace(/\s+/g, ' ').trim()
  
  // Si le titre est trop court après nettoyage, utiliser le titre original
  if (cleanTitle.length < 3) {
    return title.trim()
  }
  
  return cleanTitle
}

/**
 * Extrait la plateforme depuis le titre
 */
function extractPlatform(title: string): string | null {
  const titleLower = title.toLowerCase()
  
  const platformMap: Record<string, string> = {
    'nes': 'NES',
    'snes': 'SNES',
    'n64': 'Nintendo 64',
    'gamecube': 'GameCube',
    'wii u': 'Wii U',
    'wii': 'Wii',
    'switch': 'Nintendo Switch',
    '3ds': 'Nintendo 3DS',
    'ds': 'Nintendo DS',
    'gameboy': 'Game Boy',
    'gb': 'Game Boy',
    'gba': 'Game Boy Advance',
    'playstation 5': 'PlayStation 5',
    'ps5': 'PlayStation 5',
    'playstation 4': 'PlayStation 4',
    'ps4': 'PlayStation 4',
    'playstation 3': 'PlayStation 3',
    'ps3': 'PlayStation 3',
    'xbox series': 'Xbox Series',
    'xbox one': 'Xbox One',
    'xbox 360': 'Xbox 360',
  }
  
  for (const [key, value] of Object.entries(platformMap)) {
    if (titleLower.includes(key)) {
      return value
    }
  }
  
  return null
}

/**
 * Génère automatiquement des alertes basées sur les favoris
 * Pour chaque favori, crée une alerte pour trouver des items similaires à un prix inférieur
 * 
 * Lit les favoris depuis data/favorites.json (mise à jour manuelle)
 */
export async function autoGenerateAlertsFromFavorites(): Promise<{
  success: boolean
  favoritesProcessed: number
  alertsCreated: number
  alertsUpdated: number
  errors: string[]
}> {
  const errors: string[] = []
  let favoritesProcessed = 0
  let alertsCreated = 0
  let alertsUpdated = 0

  try {
    if (!supabase) {
      throw new Error('Supabase client not available')
    }

    // Récupérer tous les favoris depuis le fichier JSON
    logger.info('📋 Lecture des favoris depuis data/favorites.json...')
    const favorites = getFavoritesFromJson()
    logger.info(`✅ ${favorites.length} favoris chargés`)

    if (favorites.length === 0) {
      logger.warn('⚠️ Aucun favori trouvé')
      return {
        success: true,
        favoritesProcessed: 0,
        alertsCreated: 0,
        alertsUpdated: 0,
        errors: []
      }
    }

    // Pour chaque favori, créer ou mettre à jour une alerte
    for (const favorite of favorites) {
      try {
        favoritesProcessed++

        const favoritePrice = favorite.price?.amount
        if (!favoritePrice || favoritePrice <= 0) {
          logger.debug(`⏭️ Favori ${favorite.id} ignoré: pas de prix valide`)
          continue
        }

        const favoriteTitle = favorite.title || 'Sans titre'
        const gameTitle = extractGameTitle(favoriteTitle)
        const platform = extractPlatform(favoriteTitle)
        
        // Prix maximum pour l'alerte: 90% du prix du favori (pour avoir une marge)
        const maxPrice = Math.floor(favoritePrice * 0.9)

        if (maxPrice <= 0) {
          logger.debug(`⏭️ Favori ${favorite.id} ignoré: prix trop bas (${favoritePrice}€)`)
          continue
        }

        // Vérifier si une alerte existe déjà pour ce favori
        // 1. Recherche exacte d'abord (game_title + platform)
        let { data: existingAlerts, error: queryError } = await supabase
          .from('price_alerts')
          .select('id, game_title, max_price, is_active, platform')
          .eq('game_title', gameTitle)
          .eq('platform', platform || null)
          .order('created_at', { ascending: false })
          .limit(1)
        
        let existingAlert = existingAlerts && existingAlerts.length > 0 ? existingAlerts[0] : null
        
        // 2. Si pas trouvé, rechercher avec similarité de titre (pour éviter les doublons)
        if (!existingAlert) {
          // Récupérer toutes les alertes actives pour comparer les titres
          const { data: allActiveAlerts } = await supabase
            .from('price_alerts')
            .select('id, game_title, max_price, is_active, platform')
            .eq('is_active', true)
            .order('created_at', { ascending: false })
          
          if (allActiveAlerts && allActiveAlerts.length > 0) {
            // Normaliser les titres pour comparaison
            const normalizedGameTitle = normalizeTitleForComparison(gameTitle)
            
            // Chercher une alerte avec un titre similaire
            for (const alert of allActiveAlerts) {
              const normalizedAlertTitle = normalizeTitleForComparison(alert.game_title || '')
              
              // Si les titres normalisés sont identiques ou très similaires
              if (normalizedAlertTitle === normalizedGameTitle || 
                  areTitlesSimilar(normalizedGameTitle, normalizedAlertTitle)) {
                // Vérifier aussi la plateforme (doit correspondre ou être null/any)
                const alertPlatform = alert.platform || null
                const favoritePlatform = platform || null
                
                if (alertPlatform === favoritePlatform || 
                    (!alertPlatform && !favoritePlatform) ||
                    (alertPlatform === 'any' && !favoritePlatform) ||
                    (!alertPlatform && favoritePlatform === 'any')) {
                  existingAlert = alert
                  logger.debug(`🔍 Alerte similaire trouvée: "${alert.game_title}" ≈ "${gameTitle}"`)
                  break
                }
              }
            }
          }
        }
        
        if (queryError && !queryError.message.includes('No rows')) {
          logger.warn(`⚠️ Erreur lors de la recherche d'alerte existante pour ${gameTitle}: ${queryError.message}`)
        }

        if (existingAlert) {
          // Mettre à jour l'alerte existante si le prix du favori a changé
          if (existingAlert.max_price !== maxPrice) {
            const { error: updateError } = await supabase
              .from('price_alerts')
              .update({
                max_price: maxPrice,
                is_active: true, // Réactiver si désactivée
                updated_at: new Date().toISOString()
              })
              .eq('id', existingAlert.id)

            if (updateError) {
              logger.error(`❌ Erreur mise à jour alerte ${existingAlert.id}:`, updateError)
              errors.push(`Erreur mise à jour alerte ${existingAlert.id}: ${updateError.message}`)
            } else {
              alertsUpdated++
              logger.info(`🔄 Alerte mise à jour: ${gameTitle} (${platform || 'any'}) <= ${maxPrice}€ (favori: ${favoritePrice}€)`)
            }
          } else {
            // Réactiver l'alerte si elle était désactivée
            if (!existingAlert.is_active) {
              const { error: updateError } = await supabase
                .from('price_alerts')
                .update({ is_active: true })
                .eq('id', existingAlert.id)

              if (!updateError) {
                alertsUpdated++
                logger.info(`✅ Alerte réactivée: ${gameTitle} (${platform || 'any'})`)
              }
            }
          }
        } else {
          // Vérifier une dernière fois s'il n'y a pas d'alerte très similaire (double vérification)
          const normalizedTitle = normalizeTitleForComparison(gameTitle)
          const { data: similarAlerts } = await supabase
            .from('price_alerts')
            .select('id, game_title, max_price, is_active, platform')
            .eq('is_active', true)
          
          let foundSimilar = false
          if (similarAlerts && similarAlerts.length > 0) {
            for (const alert of similarAlerts) {
              const normalizedAlertTitle = normalizeTitleForComparison(alert.game_title || '')
              if (normalizedTitle === normalizedAlertTitle || 
                  areTitlesSimilar(normalizedTitle, normalizedAlertTitle)) {
                const alertPlatform = alert.platform || null
                const favoritePlatform = platform || null
                
                if (alertPlatform === favoritePlatform || 
                    (!alertPlatform && !favoritePlatform) ||
                    (alertPlatform === 'any' && !favoritePlatform) ||
                    (!alertPlatform && favoritePlatform === 'any')) {
                  // Mettre à jour l'alerte existante au lieu d'en créer une nouvelle
                  const { error: updateError } = await supabase
                    .from('price_alerts')
                    .update({
                      max_price: Math.max(alert.max_price || 0, maxPrice), // Garder le prix max le plus élevé
                      is_active: true,
                      updated_at: new Date().toISOString()
                    })
                    .eq('id', alert.id)

                  if (updateError) {
                    logger.error(`❌ Erreur mise à jour alerte similaire ${alert.id}:`, updateError)
                  } else {
                    alertsUpdated++
                    logger.info(`🔄 Alerte similaire mise à jour: "${alert.game_title}" (${alertPlatform || 'any'}) <= ${Math.max(alert.max_price || 0, maxPrice)}€`)
                    foundSimilar = true
                    break
                  }
                }
              }
            }
          }
          
          // Créer une nouvelle alerte seulement si aucune similaire n'a été trouvée
          if (!foundSimilar) {
            const { data: newAlert, error: insertError } = await supabase
              .from('price_alerts')
              .insert({
                game_title: gameTitle,
                platform: platform,
                max_price: maxPrice,
                condition: null, // Pas de filtre de condition par défaut
                is_active: true,
                // Métadonnées pour tracer l'origine
                triggered_count: 0,
                created_at: new Date().toISOString()
              })
              .select()
              .single()

            if (insertError) {
              // Si erreur de contrainte unique, c'est qu'une alerte existe déjà
              if (insertError.message.includes('duplicate') || insertError.message.includes('unique')) {
                logger.debug(`⏭️ Alerte déjà existante (contrainte unique): ${gameTitle}`)
                // Essayer de la récupérer et la mettre à jour
                const { data: existing } = await supabase
                  .from('price_alerts')
                  .select('id, max_price')
                  .eq('game_title', gameTitle)
                  .eq('platform', platform || null)
                  .single()
                
                if (existing) {
                  const { error: updateError } = await supabase
                    .from('price_alerts')
                    .update({
                      max_price: Math.max(existing.max_price || 0, maxPrice),
                      is_active: true,
                      updated_at: new Date().toISOString()
                    })
                    .eq('id', existing.id)
                  
                  if (!updateError) {
                    alertsUpdated++
                    logger.info(`🔄 Alerte existante mise à jour: ${gameTitle} (${platform || 'any'})`)
                  }
                }
              } else {
                logger.error(`❌ Erreur création alerte pour ${gameTitle}:`, insertError)
                errors.push(`Erreur création alerte pour ${gameTitle}: ${insertError.message}`)
              }
            } else {
              alertsCreated++
              logger.info(`✅ Alerte créée: ${gameTitle} (${platform || 'any'}) <= ${maxPrice}€ (favori: ${favoritePrice}€)`)
            }
          }
        }

        // Délai entre les favoris pour éviter de surcharger la DB
        await new Promise(resolve => setTimeout(resolve, 100))
      } catch (error: any) {
        logger.error(`❌ Erreur traitement favori ${favorite.id}:`, error)
        errors.push(`Erreur traitement favori ${favorite.id}: ${error.message}`)
      }
    }

    logger.info(`✅ Génération automatique terminée: ${alertsCreated} créées, ${alertsUpdated} mises à jour`)

    return {
      success: errors.length === 0,
      favoritesProcessed,
      alertsCreated,
      alertsUpdated,
      errors
    }
  } catch (error: any) {
    logger.error('❌ Erreur génération automatique d\'alertes:', error)
    return {
      success: false,
      favoritesProcessed,
      alertsCreated,
      alertsUpdated,
      errors: [...errors, error.message]
    }
  }
}

