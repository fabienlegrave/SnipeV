/**
 * Module standalone pour vérifier les alertes
 * Peut être utilisé par le worker GitHub Actions sans dépendre de l'API HTTP
 */

import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import { searchAllPagesWithFullSession } from '@/lib/scrape/searchCatalogWithFullSession'
import { createFullSessionFromCookies } from '@/lib/scrape/fullSessionManager'
import { vintedItemToApiItem } from '@/lib/utils/vintedItemToApiItem'
import { upsertItemsToDb } from '@/lib/utils/upsertItems'
import { getRequestDelayWithJitter } from '@/lib/config/delays'
import type { VintedItem, ApiItem } from '@/lib/types/core'

interface PriceAlert {
  id: number
  game_title: string
  platform: string | null
  max_price: number
  condition: string | null
  is_active: boolean
  triggered_count: number
  triggered_at: string | null
}

interface AlertMatch {
  alertId: number
  alertTitle: string
  item: ApiItem | VintedItem
  matchReason: string
}

interface CheckAlertsResult {
  success: boolean
  checkedAt: string
  alertsChecked: number
  itemsChecked: number
  totalItemsChecked?: number
  matches: Array<{
    alertId: number
    alertTitle: string
    matchReason: string
    item: ApiItem
  }>
  updatedAlerts: number[]
  stats?: {
    skippedUnavailable: number
    skippedPrice: number
    skippedPlatform: number
    skippedTitle: number
  }
  debugInfo?: Array<{
    alert: string
    item: string
    reason: string
  }>
  error?: string
  httpStatus?: number // Code HTTP si erreur (403, 429, etc.)
  needsCookieRefresh?: boolean // Indique si les cookies doivent être renouvelés
}

/**
 * Normalise un texte pour le matching (supprime accents, ponctuation, etc.)
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Supprime les accents
    .replace(/[^\w\s]/g, ' ') // Remplace la ponctuation par des espaces
    .replace(/\s+/g, ' ') // Normalise les espaces
    .trim()
}

/**
 * Calcule la similarité entre deux textes (0-1)
 */
function calculateSimilarity(text1: string, text2: string): number {
  const words1 = new Set(normalizeText(text1).split(/\s+/))
  const words2 = new Set(normalizeText(text2).split(/\s+/))
  
  const words1Array = Array.from(words1)
  const words2Array = Array.from(words2)
  const intersection = new Set(words1Array.filter(x => words2.has(x)))
  const union = new Set([...words1Array, ...words2Array])
  
  return union.size > 0 ? intersection.size / union.size : 0
}

/**
 * Vérifie si un item correspond à une alerte
 * Accepte ApiItem ou VintedItem
 */
function matchesAlert(item: ApiItem | VintedItem, alert: PriceAlert): { matches: boolean; reason: string } {
  // Normaliser le prix selon le type d'item
  let itemPrice = 0
  if ('price_amount' in item) {
    // VintedItem
    itemPrice = item.price_amount || 0
  } else if ('price' in item && item.price) {
    // ApiItem
    itemPrice = typeof item.price === 'object' && 'amount' in item.price 
      ? (item.price.amount || 0)
      : 0
  }
  if (itemPrice > alert.max_price) {
    return { matches: false, reason: `Price too high: ${itemPrice}€ > ${alert.max_price}€` }
  }

  // Vérifier si l'item est disponible
  const isReserved = 'is_reserved' in item ? item.is_reserved : item.is_reserved
  const canBuy = 'can_buy' in item ? item.can_buy : item.can_buy
  if (isReserved === true || canBuy === false) {
    return { matches: false, reason: `Item not available (reserved: ${isReserved}, can_buy: ${canBuy})` }
  }

  const itemTitle = (item.title || '').toLowerCase()
  const itemDescription = ('description' in item && item.description ? item.description : '').toLowerCase()
  const itemText = `${itemTitle} ${itemDescription}`.toLowerCase()
  const normalizedItemText = normalizeText(itemText)

  // Extraction simplifiée des mots-clés de l'alerte
  const alertTitleLower = alert.game_title.toLowerCase()
  const normalizedAlertTitle = normalizeText(alert.game_title)
  const alertKeywords = alertTitleLower.split(' ').filter(word => word.length > 2)

  // Détecter la plateforme depuis l'alerte (soit depuis alert.platform, soit depuis le titre)
  const platformVariants: Record<string, string[]> = {
    'switch': ['switch', 'swicth', 'swich', 'nintendo switch'],
    'playstation 5': ['ps5', 'playstation 5', 'playstation5'],
    'playstation 4': ['ps4', 'playstation 4', 'playstation4'],
    'playstation 3': ['ps3', 'playstation 3', 'playstation3'],
    'xbox series': ['xbox series', 'xbox series x', 'xbox series s'],
    'xbox one': ['xbox one'],
    'xbox 360': ['xbox 360'],
    'wii u': ['wii u', 'wiiu'],
    'wii': ['wii'],
    '3ds': ['3ds', 'nintendo 3ds'],
    'ds': ['ds', 'nintendo ds']
  }

  // Si une plateforme est spécifiée dans l'alerte, la vérifier
  const platformToCheck = alert.platform || null
  if (platformToCheck) {
    const platformLower = platformToCheck.toLowerCase()
    
    const normalizedPlatform = Object.keys(platformVariants).find(
      key => key.toLowerCase() === platformLower || platformVariants[key].includes(platformLower)
    ) || platformLower

    const variants = platformVariants[normalizedPlatform] || [platformLower]
    const platformMatch = variants.some(variant => normalizedItemText.includes(variant))

    if (!platformMatch) {
      return { matches: false, reason: `Platform doesn't match: expected "${platformToCheck}"` }
    }
  }

  // Vérifier le titre du jeu - Approche plus stricte pour éviter les faux positifs
  let titleMatch = false
  let matchReason = ''

  // Exclure les mots communs et trop courts
  const commonWords = ['jeu', 'game', 'pour', 'sur', 'the', 'le', 'la', 'de', 'du', 'et', 'ou', 'a', 'an', 'in', 'on', 'at', 'to', 'of', 'for', 'with', 'by', '[]', 'para']
  const shortWords = ['2', '3', '4', '5', 'ii', 'iii', 'iv', 'v'] // Mots courts qui peuvent être ambigus

  // Extraire les mots significatifs de l'alerte (hors du bloc conditionnel pour pouvoir les utiliser dans le message d'erreur)
  const alertWords = normalizedAlertTitle.split(/\s+/).filter(w => {
    const word = w.toLowerCase().trim()
    // Exclure les mots communs, trop courts (sauf numéros significatifs), et caractères spéciaux
    if (word.length < 2) return false
    if (commonWords.includes(word)) return false
    if (/^[\[\]()\-_]+$/.test(word)) return false // Caractères spéciaux uniquement
    return true
  })

  // 1. Vérifier d'abord si le titre complet (ou une grande partie) est présent dans l'item
  // Nettoyer le titre de l'alerte en enlevant les plateformes et mots communs
  const cleanedAlertTitle = normalizedAlertTitle
    .replace(/\s*\[\s*\]\s*/g, ' ') // Enlever [ ]
    .replace(/\b(para|pour|sur|jeu|game)\b/gi, ' ') // Enlever mots communs
    .replace(/\s+/g, ' ')
    .trim()
  
  // Vérifier si le titre nettoyé (ou une grande partie) est présent
  if (cleanedAlertTitle.length > 5 && normalizedItemText.includes(cleanedAlertTitle)) {
    titleMatch = true
    matchReason = `Title match: exact phrase found`
  }

  // 2. Vérifier si les mots significatifs de l'alerte sont présents dans l'item
  if (!titleMatch && alertWords.length > 0) {
      // Vérifier si les mots significatifs sont présents dans l'item
      const matchingWords = alertWords.filter(word => {
        const wordLower = word.toLowerCase()
        // Vérifier que le mot est présent (pas juste une partie d'un autre mot)
        // Utiliser des word boundaries pour éviter les matches partiels
        const wordRegex = new RegExp(`\\b${wordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
        return wordRegex.test(normalizedItemText)
      })

      // Calculer le ratio de matching
      const matchRatio = matchingWords.length / alertWords.length

      // Pour les titres courts (2-3 mots), exiger 100% des mots
      if (alertWords.length <= 3) {
        if (matchRatio === 1.0) {
          titleMatch = true
          matchReason = `Title match: ${matchingWords.length}/${alertWords.length} words found (exact)`
        }
      } 
      // Pour les titres moyens (4-5 mots), exiger au moins 80%
      else if (alertWords.length <= 5) {
        if (matchRatio >= 0.8) {
          titleMatch = true
          matchReason = `Title match: ${matchingWords.length}/${alertWords.length} words found (${Math.round(matchRatio * 100)}%)`
        }
      }
      // Pour les titres longs (6+ mots), exiger au moins 70% MAIS au moins 4 mots
      else {
        if (matchRatio >= 0.7 && matchingWords.length >= 4) {
          titleMatch = true
          matchReason = `Title match: ${matchingWords.length}/${alertWords.length} words found (${Math.round(matchRatio * 100)}%)`
        }
      }

      // Vérifier aussi l'ordre des mots importants (pour éviter "street" + "fighter" séparés)
      if (!titleMatch && matchingWords.length >= 2 && alertWords.length >= 2) {
        // Extraire les 2-3 premiers mots significatifs de l'alerte
        const importantWords = alertWords.slice(0, Math.min(3, alertWords.length))
        // Vérifier si ces mots apparaissent dans l'ordre dans l'item
        const itemWords = normalizedItemText.split(/\s+/)
        let consecutiveMatches = 0
        let lastIndex = -1
        
        for (const word of importantWords) {
          const wordLower = word.toLowerCase()
          const index = itemWords.findIndex(w => w.toLowerCase().includes(wordLower))
          if (index !== -1 && index > lastIndex) {
            consecutiveMatches++
            lastIndex = index
          }
        }
        
        // Si au moins 2 mots consécutifs sont trouvés dans l'ordre, c'est un match
        if (consecutiveMatches >= 2 && consecutiveMatches === importantWords.length) {
          titleMatch = true
          matchReason = `Title match: ${consecutiveMatches} consecutive words found in order`
        }
      }
  }

  // 3. Fallback: vérifier la similarité globale (seuil plus élevé)
  if (!titleMatch) {
    const similarity = calculateSimilarity(alertTitleLower, itemText)
    // Augmenter le seuil à 50% pour éviter les faux positifs
    if (similarity >= 0.5) {
      titleMatch = true
      matchReason = `Title match (similarity): ${Math.round(similarity * 100)}%`
    }
  }

  if (!titleMatch) {
    return { 
      matches: false, 
      reason: `Title doesn't match: "${item.title}" vs "${alert.game_title}" (alert words: ${alertWords.join(', ')})` 
    }
  }

  // Note: La condition est maintenant filtrée directement par status_ids dans l'API
  // Donc si un item est retourné, il correspond déjà aux status_ids de l'alerte
  // On peut donc supprimer cette vérification car elle est redondante

  return { 
    matches: true, 
    reason: `Match found: ${item.title} at ${itemPrice}€ (max: ${alert.max_price}€) - ${matchReason}` 
  }
}

/**
 * Vérifie les alertes actives en utilisant les cookies fournis
 * Version standalone qui peut être utilisée par le worker GitHub Actions
 */
export async function checkAlertsStandalone(fullCookies: string): Promise<CheckAlertsResult> {
  try {
    if (!fullCookies) {
      return {
        success: false,
        checkedAt: new Date().toISOString(),
        alertsChecked: 0,
        itemsChecked: 0,
        matches: [],
        updatedAlerts: [],
        error: 'Missing cookies: fullCookies is required'
      }
    }

    if (!supabase) {
      return {
        success: false,
        checkedAt: new Date().toISOString(),
        alertsChecked: 0,
        itemsChecked: 0,
        matches: [],
        updatedAlerts: [],
        error: 'Database not available'
      }
    }

    logger.info('🔔 Début de la vérification des alertes (standalone)...')

    // 1. Récupérer les alertes actives
    const { data: alerts, error: alertsError } = await supabase
      .from('price_alerts')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (alertsError) {
      logger.db.error('Get active alerts', alertsError)
      return {
        success: false,
        checkedAt: new Date().toISOString(),
        alertsChecked: 0,
        itemsChecked: 0,
        matches: [],
        updatedAlerts: [],
        error: 'Database error: ' + alertsError.message
      }
    }

    if (!alerts || alerts.length === 0) {
      logger.info('ℹ️ Aucune alerte active trouvée')
      return {
        success: true,
        checkedAt: new Date().toISOString(),
        alertsChecked: 0,
        itemsChecked: 0,
        matches: [],
        updatedAlerts: []
      }
    }

    logger.info(`📋 ${alerts.length} alertes actives à vérifier`)
    
    // Le délai avec jitter sera calculé à chaque fois (12-25s)
    // Calculer le temps estimé (moyenne de 18.5s par alerte)
    const avgDelaySeconds = 18.5 // Moyenne entre 12 et 25 secondes
    const estimatedSeconds = alerts.length > 1 ? (alerts.length - 1) * avgDelaySeconds : 0
    if (estimatedSeconds > 0) {
      const minutes = Math.floor(estimatedSeconds / 60)
      const seconds = Math.round(estimatedSeconds % 60)
      logger.info(`⏱️ Temps estimé: ~${minutes > 0 ? `${minutes}m ` : ''}${seconds > 0 ? `${seconds}s` : ''} (délai avec jitter: 12-25s entre chaque requête)`)
    }

    // 2. Créer la session
    const session = createFullSessionFromCookies(fullCookies)

    // 3. Pour chaque alerte, requêter directement l'API promoted_closets avec les filtres appropriés
    const matches: AlertMatch[] = []
    const updatedAlerts: number[] = []
    const debugLogs: Array<{ alert: string; item: string; reason: string }> = []
    const itemsToUpsert: (ApiItem | VintedItem)[] = [] // Collecter tous les items à upsert

    let totalChecked = 0
    let skippedUnavailable = 0
    let skippedPrice = 0
    let skippedTitle = 0
    let skippedPlatform = 0

      // Traiter les alertes séquentiellement avec un délai de 7,5 secondes entre chaque requête
      for (let i = 0; i < alerts.length; i++) {
        const alert = alerts[i]
        
        // Ajouter un délai avec jitter entre chaque requête (sauf pour la première)
        if (i > 0) {
          const delay = await getRequestDelayWithJitter()
          logger.info(`⏳ Attente de ${(delay / 1000).toFixed(1)}s avant la prochaine requête (alerte ${i + 1}/${alerts.length})...`)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      
      logger.info(`🔍 Vérification alerte ${i + 1}/${alerts.length}: "${alert.game_title}" (platform: ${alert.platform || 'any'}, max: ${alert.max_price}€)`)
      
      // Collecter les matches pour cette alerte spécifique
      const alertMatches: AlertMatch[] = []
      const alertItemsToUpsert: (ApiItem | VintedItem)[] = []
      
      try {
        // Utiliser l'endpoint /api/v2/catalog/items comme la recherche normale
        // Limité à 40 items max (2 pages) pour un bon compromis entre couverture et agressivité
        const items = await searchAllPagesWithFullSession(alert.game_title, {
          priceTo: alert.max_price,
          limit: 40, // Limite de sécurité : 40 items max (2 pages × 20 items)
          session
        }).catch(async (error: Error) => {
          // Détecter les erreurs 403/401
          const errorMessage = error.message || String(error)
          if (errorMessage.includes('HTTP 403') || errorMessage.includes('403')) {
            logger.error(`❌ Erreur 403 détectée pour l'alerte "${alert.game_title}"`)
            throw { is403: true, originalError: error }
          }
          throw error
        })
        
        logger.info(`📦 ${items.length} items récupérés depuis /api/v2/catalog/items pour l'alerte "${alert.game_title}"`)
        
        // Filtrer par status_ids si spécifié (l'API catalog/items ne filtre pas directement par status_ids)
        let filteredItems = items
        if (alert.condition) {
          const statusIdsArray = alert.condition.split(',').map((id: string) => id.trim())
          
          // Mapping du texte de statut vers les status_ids
          const statusTextToIds: Record<string, string[]> = {
            'neuf': ['6', '1'],
            'neuf sans étiquette': ['6', '1'],
            'très bon état': ['2'],
            'bon état': ['3']
          }
          
          // Fonction pour obtenir les status_ids d'un item à partir de son statut textuel
          const getItemStatusIds = (itemStatus: string | null | undefined): string[] => {
            if (!itemStatus) return []
            const statusLower = itemStatus.toLowerCase()
            
            // Chercher dans le mapping
            for (const [text, ids] of Object.entries(statusTextToIds)) {
              if (statusLower.includes(text.toLowerCase())) {
                return ids
              }
            }
            
            // Fallback : essayer de détecter depuis le texte
            if (statusLower.includes('neuf') || statusLower.includes('new') || statusLower.includes('sealed')) {
              return ['6', '1']
            }
            if (statusLower.includes('très bon') || statusLower.includes('excellent')) {
              return ['2']
            }
            if (statusLower.includes('bon état') || statusLower.includes('good')) {
              return ['3']
            }
            
            return []
          }
          
          // Filtrer les items pour ne garder que ceux dont le status_id correspond
          filteredItems = items.filter(item => {
            const itemStatusIds = getItemStatusIds(item.condition)
            return itemStatusIds.length > 0 && itemStatusIds.some(id => statusIdsArray.includes(id))
          })
          
          if (filteredItems.length < items.length) {
            logger.info(`🔍 Filtrage status_ids: ${items.length} items → ${filteredItems.length} items (filtrés par status_ids: ${alert.condition})`)
          }
        }
        
        // Utiliser filteredItems si le filtre a été appliqué, sinon items
        const itemsToCheck = alert.condition ? filteredItems : items

        // Vérifier chaque item (le matching est déjà largement fait par l'API, mais on vérifie quand même)
        for (const item of itemsToCheck) {
          totalChecked++
          const matchResult = matchesAlert(item, alert)
          
          // Compter les raisons de non-match pour statistiques
          if (!matchResult.matches) {
            if (matchResult.reason.includes('not available')) {
              skippedUnavailable++
            } else if (matchResult.reason.includes('Price too high')) {
              skippedPrice++
            } else if (matchResult.reason.includes("Platform doesn't match")) {
              skippedPlatform++
            } else if (matchResult.reason.includes("Title doesn't match")) {
              skippedTitle++
            }
          }
          
          // Log pour debug (limité aux 20 premiers non-matches pour éviter trop de logs)
          if (!matchResult.matches && debugLogs.length < 20) {
            debugLogs.push({
              alert: alert.game_title,
              item: item.title || 'No title',
              reason: matchResult.reason
            })
          }
          
          if (matchResult.matches) {
            // Vérifier si cet item n'a pas déjà été ajouté (déduplication par ID)
            const existingMatch = alertMatches.find(m => m.item.id === item.id)
            if (!existingMatch) {
              const match: AlertMatch = {
                alertId: alert.id,
                alertTitle: alert.game_title,
                item,
                matchReason: matchResult.reason
              }
              alertMatches.push(match)
              matches.push(match) // Garder aussi dans la liste globale pour les stats

              // Ajouter l'item à la liste des items à upsert
              alertItemsToUpsert.push(item)
              itemsToUpsert.push(item)
            } else {
              logger.debug(`🔄 Item ${item.id} (${item.title}) déjà dans les matches, ignoré`)
            }

            // Mettre à jour l'alerte (incrémenter triggered_count et mettre à jour triggered_at)
            const { error: updateError } = await supabase
              .from('price_alerts')
              .update({
                triggered_count: (alert.triggered_count || 0) + 1,
                triggered_at: new Date().toISOString()
              })
              .eq('id', alert.id)

            if (updateError) {
              logger.db.error(`Failed to update alert ${alert.id}`, updateError)
            } else {
              updatedAlerts.push(alert.id)
              const itemPrice = 'price_amount' in item ? item.price_amount : item.price?.amount
              logger.info(`✅ Alerte "${alert.game_title}" déclenchée pour item: ${item.title} (${itemPrice || 'N/A'}€) - ${matchResult.reason}`)
            }
          }
        }

        // Upsert immédiatement les items de cette alerte
        if (alertItemsToUpsert.length > 0) {
          logger.info(`💾 Upsert de ${alertItemsToUpsert.length} item(s) pour l'alerte "${alert.game_title}"...`)
          const upsertResult = await upsertItemsToDb(alertItemsToUpsert)
          if (upsertResult.success) {
            logger.info(`✅ ${upsertResult.upserted} item(s) sauvegardé(s) pour l'alerte "${alert.game_title}"`)
          } else {
            logger.warn(`⚠️ Erreurs lors de l'upsert pour l'alerte "${alert.game_title}": ${upsertResult.errors.length} erreur(s)`)
          }
        }

        // Enregistrer les matches dans la base de données
        if (alertMatches.length > 0) {
          for (const match of alertMatches) {
            try {
              // Enregistrer le match dans la table de liaison
              const { error: matchError } = await supabase
                .from('alert_matches')
                .upsert({
                  alert_id: match.alertId,
                  item_id: match.item.id,
                  match_reason: match.matchReason
                }, {
                  onConflict: 'alert_id,item_id',
                  ignoreDuplicates: false
                })

              if (matchError) {
                logger.warn(`⚠️ Failed to save alert match for alert ${match.alertId} / item ${match.item.id}`, matchError)
              }
            } catch (error) {
              logger.warn(`⚠️ Error saving alert match for alert ${match.alertId} / item ${match.item.id}`, error as Error)
            }
          }
        }
      } catch (error: any) {
        // Vérifier si c'est une erreur 403
        if (error?.is403) {
          logger.error(`❌ Erreur 403 détectée pour l'alerte "${alert.game_title}" - Arrêt du cycle`)
          // Arrêter le cycle et retourner l'erreur 403
          return {
            success: false,
            checkedAt: new Date().toISOString(),
            alertsChecked: i + 1, // Nombre d'alertes vérifiées avant l'erreur
            itemsChecked: totalChecked,
            matches: matches.map(m => ({
              alertId: m.alertId,
              alertTitle: m.alertTitle,
              matchReason: m.matchReason,
              item: 'price_amount' in m.item 
                ? vintedItemToApiItem(m.item as VintedItem)
                : m.item as ApiItem
            })),
            updatedAlerts,
            error: 'HTTP 403 - Cookies invalides ou expirés',
            httpStatus: 403,
            needsCookieRefresh: true
          }
        }
        logger.error(`❌ Erreur lors de la vérification de l'alerte "${alert.game_title}"`, error as Error)
        // Continuer avec les autres alertes même si une échoue (sauf pour 403)
      }
    }

    logger.info(`📊 Statistiques de vérification: ${totalChecked} items vérifiés - ${skippedUnavailable} non-disponibles, ${skippedPrice} prix trop élevés, ${skippedPlatform} plateforme non-match, ${skippedTitle} titre non-match, ${matches.length} matches`)

    // Note: Les items sont maintenant upsertés et les notifications envoyées immédiatement après chaque alerte
    // dans la boucle principale ci-dessus. Cette section est conservée pour les stats finales uniquement.

    logger.info(`🎯 Vérification terminée: ${matches.length} match(s) trouvé(s) pour ${alerts.length} alerte(s)`)
    
    // Log quelques exemples de non-matches pour debug
    if (matches.length === 0 && debugLogs.length > 0) {
      logger.warn(`⚠️ Aucun match trouvé. Exemples de vérifications:`, debugLogs.slice(0, 5))
    }

    return {
      success: true,
      checkedAt: new Date().toISOString(),
      alertsChecked: alerts.length,
      itemsChecked: totalChecked,
      totalItemsChecked: totalChecked,
      matches: matches.map(m => ({
        alertId: m.alertId,
        alertTitle: m.alertTitle,
        matchReason: m.matchReason,
        item: 'price_amount' in m.item 
          ? vintedItemToApiItem(m.item as VintedItem) // Convertir VintedItem en ApiItem
          : m.item as ApiItem // Déjà un ApiItem
      })),
      updatedAlerts,
      stats: {
        skippedUnavailable,
        skippedPrice,
        skippedPlatform,
        skippedTitle
      },
      debugInfo: matches.length === 0 ? debugLogs.slice(0, 10) : undefined // Inclure des infos de debug si aucun match
    }

  } catch (error) {
    logger.error('Erreur lors de la vérification des alertes (standalone)', error as Error)
    return {
      success: false,
      checkedAt: new Date().toISOString(),
      alertsChecked: 0,
      itemsChecked: 0,
      matches: [],
      updatedAlerts: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

