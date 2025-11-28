/**
 * Module pour envoyer des messages automatiques aux vendeurs Vinted
 */

// Note: On utilise fetch directement pour les requêtes JSON
import { buildVintedApiHeaders, type FullVintedSession } from '../scrape/fullSessionManager'
import { logger } from '../logger'
import type { ApiItem } from '../types/core'

export interface MessageTemplate {
  itemTitle: string
  itemPrice: number
  targetPrice: number
  sellerName?: string
}

/**
 * Génère un message de négociation personnalisé
 */
export function generateNegotiationMessage(template: MessageTemplate): string {
  const { itemTitle, itemPrice, targetPrice, sellerName } = template
  
  const discount = itemPrice - targetPrice
  const discountPercent = Math.round((discount / itemPrice) * 100)
  
  // Messages possibles (variation pour éviter le spam)
  const messages = [
    `Bonjour${sellerName ? ` ${sellerName}` : ''} ! 👋\n\nJe suis intéressé(e) par votre "${itemTitle}" à ${itemPrice}€. Seriez-vous ouvert(e) à une négociation autour de ${targetPrice}€ (soit -${discountPercent}%) ?\n\nMerci d'avance !`,
    
    `Bonjour${sellerName ? ` ${sellerName}` : ''} !\n\nVotre "${itemTitle}" m'intéresse beaucoup. Le prix actuel est de ${itemPrice}€. Accepteriez-vous ${targetPrice}€ ?\n\nCordialement.`,
    
    `Salut${sellerName ? ` ${sellerName}` : ''} ! 😊\n\nJe cherche "${itemTitle}" et j'ai vu votre annonce à ${itemPrice}€. Serait-il possible de discuter d'un prix autour de ${targetPrice}€ ?\n\nMerci !`,
  ]
  
  // Choisir un message aléatoire
  const randomIndex = Math.floor(Math.random() * messages.length)
  return messages[randomIndex]
}

/**
 * Envoie un message à un vendeur Vinted
 */
export async function sendMessageToSeller(
  session: FullVintedSession,
  item: ApiItem,
  message: string
): Promise<{ success: boolean; error?: string; conversationId?: number }> {
  try {
    // Extraire l'ID du vendeur depuis l'item
    // L'item devrait avoir seller_id ou on peut l'extraire de l'URL
    const sellerId = (item as any).seller?.id || (item as any).seller_id
    
    if (!sellerId) {
      return {
        success: false,
        error: 'Impossible de trouver l\'ID du vendeur'
      }
    }

    // Essayer plusieurs endpoints possibles pour envoyer un message
    const possibleEndpoints = [
      // Endpoint 1: Créer une conversation et envoyer un message
      `https://www.vinted.fr/api/v2/conversations`,
      // Endpoint 2: Messages directs
      `https://www.vinted.fr/api/v2/messages`,
      // Endpoint 3: Conversations avec item_id
      `https://www.vinted.fr/api/v2/conversations?item_id=${item.id}`,
    ]

    const headers = buildVintedApiHeaders(session)
    
    // Ajouter les headers nécessaires pour POST
    const postHeaders = {
      ...headers,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }

    for (const endpoint of possibleEndpoints) {
      try {
        // Essayer de créer une conversation d'abord
        const conversationPayload = {
          user_id: sellerId,
          item_id: item.id,
          message: message,
        }

        logger.info(`📨 Envoi message au vendeur ${sellerId} pour item ${item.id}...`)
        
        // Utiliser fetch directement pour les requêtes POST JSON
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 12000)
        
        const response = await fetch(endpoint, {
          headers: postHeaders,
          method: 'POST',
          body: JSON.stringify(conversationPayload),
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (response.ok || response.status === 201) {
          const data = await response.json()
          logger.info(`✅ Message envoyé avec succès`)
          return {
            success: true,
            conversationId: data.conversation_id || data.id
          }
        } else if (response.status === 404) {
          // Endpoint n'existe pas, essayer le suivant
          continue
        } else {
          logger.debug(`❌ Endpoint ${endpoint} retourne ${response.status}`)
          continue
        }
      } catch (error: any) {
        logger.debug(`❌ Erreur avec endpoint ${endpoint}: ${error.message}`)
        continue
      }
    }

    // Si aucun endpoint API ne fonctionne, essayer via le formulaire HTML
    logger.warn('⚠️ Aucun endpoint API ne fonctionne, tentative via formulaire HTML...')
    return await sendMessageViaHtml(session, item, message, sellerId)
  } catch (error: any) {
    logger.error(`❌ Erreur envoi message: ${error.message}`)
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * Envoie un message via le formulaire HTML (fallback)
 */
async function sendMessageViaHtml(
  session: FullVintedSession,
  item: ApiItem,
  message: string,
  sellerId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    // URL de la page de conversation avec le vendeur
    const conversationUrl = `https://www.vinted.fr/member/${sellerId}`
    
    logger.info(`🌐 Tentative envoi message via HTML: ${conversationUrl}`)
    
    // Cette méthode nécessiterait de scraper le formulaire et de soumettre le message
    // C'est plus complexe et moins fiable, donc on retourne une erreur pour l'instant
    logger.warn('⚠️ Envoi via HTML non implémenté (nécessite scraping de formulaire)')
    return {
      success: false,
      error: 'Envoi via HTML non implémenté. Veuillez vérifier l\'endpoint API Vinted.'
    }
  } catch (error: any) {
    logger.error(`❌ Erreur envoi message HTML: ${error.message}`)
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * Envoie automatiquement un message de négociation pour un item trouvé
 */
export async function autoSendNegotiationMessage(
  session: FullVintedSession,
  item: ApiItem,
  targetPrice: number
): Promise<{ success: boolean; error?: string }> {
  const itemPrice = item.price?.amount || 0
  
  if (itemPrice <= 0) {
    return {
      success: false,
      error: 'Prix de l\'item invalide'
    }
  }

  // Générer le message
  const message = generateNegotiationMessage({
    itemTitle: item.title || 'Cet item',
    itemPrice,
    targetPrice,
    sellerName: (item as any).seller?.login
  })

  // Envoyer le message
  return await sendMessageToSeller(session, item, message)
}

