/**
 * Module pour envoyer des notifications Telegram
 */

import { logger } from '@/lib/logger'
import type { ApiItem } from '@/lib/types/core'

interface TelegramConfig {
  botToken: string
  chatId: string
}

/**
 * Envoie une notification Telegram groupée pour une alerte avec plusieurs items
 */
export async function sendTelegramNotificationGrouped(
  alertTitle: string,
  items: Array<{ item: ApiItem; matchReason: string }>,
  config: TelegramConfig
): Promise<boolean> {
  try {
    const { botToken, chatId } = config

    if (!botToken || !chatId) {
      logger.warn('⚠️ Telegram config manquante: botToken ou chatId non défini')
      return false
    }

    if (items.length === 0) {
      return true // Rien à envoyer
    }

    // Construire le message groupé
    let message = `🎮 *Nouveaux items détectés\\!*\n\n`
    message += `📋 *Alerte:* ${escapeMarkdown(alertTitle)}\n`
    message += `📦 *${items.length} item${items.length > 1 ? 's' : ''} trouvé${items.length > 1 ? 's' : ''}*\n\n`
    message += `───\n\n`

    // Ajouter chaque item
    items.forEach(({ item, matchReason }, index) => {
      const price = item.price?.amount
      const currency = item.price?.currency_code || 'EUR'
      const priceText = price ? escapeMarkdown(`${price.toFixed(2)} ${currency}`) : 'Prix non disponible'
      const condition = item.condition || 'Non spécifié'

      message += `*${index + 1}\\.* ${escapeMarkdown(item.title || 'Sans titre')}\n`
      message += `💰 ${priceText}\n`
      message += `📦 ${escapeMarkdown(condition)}\n`
      message += `🔗 ${escapeMarkdown(item.url || 'Non disponible')}\n`
      if (matchReason) {
        message += `ℹ️ ${escapeMarkdown(matchReason)}\n`
      }
      if (index < items.length - 1) {
        message += `\n───\n\n`
      }
    })

    // Envoyer via l'API Telegram
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: false
      })
    })

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status} ${response.statusText}`
      try {
        const errorData = await response.json()
        errorMessage = errorData.description || errorData.error || errorMessage
      } catch {
        try {
          errorMessage = await response.text()
        } catch {
          // Utiliser le message par défaut
        }
      }
      
      if (errorMessage.includes('chat not found')) {
        logger.error(`❌ Erreur Telegram: Chat non trouvé. Vérifiez que TELEGRAM_CHAT_ID est correct et que le bot a accès au chat. Chat ID utilisé: ${chatId}`, new Error(errorMessage))
      } else if (errorMessage.includes('Unauthorized')) {
        logger.error(`❌ Erreur Telegram: Token invalide. Vérifiez que TELEGRAM_BOT_TOKEN est correct.`, new Error(errorMessage))
      } else {
        logger.error(`❌ Erreur Telegram API: ${response.status} ${response.statusText}`, new Error(errorMessage))
      }
      return false
    }

    logger.info(`✅ Notification Telegram groupée envoyée pour alerte "${alertTitle}" avec ${items.length} item(s)`)
    return true

  } catch (error) {
    logger.error('❌ Erreur lors de l\'envoi de la notification Telegram groupée', error as Error)
    return false
  }
}

/**
 * Envoie une notification Telegram pour un nouvel item détecté
 * @deprecated Utiliser sendTelegramNotificationGrouped pour grouper par alerte
 */
export async function sendTelegramNotification(
  item: ApiItem,
  alertTitle: string,
  matchReason: string,
  config: TelegramConfig
): Promise<boolean> {
  try {
    const { botToken, chatId } = config

    if (!botToken || !chatId) {
      logger.warn('⚠️ Telegram config manquante: botToken ou chatId non défini')
      return false
    }

    // Formater le prix (échapper pour MarkdownV2)
    const price = item.price?.amount
    const currency = item.price?.currency_code || 'EUR'
    const priceText = price ? escapeMarkdown(`${price.toFixed(2)} ${currency}`) : 'Prix non disponible'

    // Formater la condition
    const condition = item.condition || 'Non spécifié'

    // Construire le message (échapper tous les caractères spéciaux, y compris dans le template)
    const message = `🎮 *Nouvel item détecté\\!*

📋 *Alerte:* ${escapeMarkdown(alertTitle)}
🎯 *Item:* ${escapeMarkdown(item.title || 'Sans titre')}
💰 *Prix:* ${priceText}
📦 *Condition:* ${escapeMarkdown(condition)}
🔗 *Lien:* ${escapeMarkdown(item.url || 'Non disponible')}

${matchReason ? `ℹ️ ${escapeMarkdown(matchReason)}` : ''}`

    // Envoyer via l'API Telegram
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: false
      })
    })

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status} ${response.statusText}`
      try {
        const errorData = await response.json()
        errorMessage = errorData.description || errorData.error || errorMessage
      } catch {
        try {
          errorMessage = await response.text()
        } catch {
          // Utiliser le message par défaut
        }
      }
      
      // Messages d'erreur plus explicites
      if (errorMessage.includes('chat not found')) {
        logger.error(`❌ Erreur Telegram: Chat non trouvé. Vérifiez que TELEGRAM_CHAT_ID est correct et que le bot a accès au chat. Chat ID utilisé: ${chatId}`, new Error(errorMessage))
      } else if (errorMessage.includes('Unauthorized')) {
        logger.error(`❌ Erreur Telegram: Token invalide. Vérifiez que TELEGRAM_BOT_TOKEN est correct.`, new Error(errorMessage))
      } else {
        logger.error(`❌ Erreur Telegram API: ${response.status} ${response.statusText}`, new Error(errorMessage))
      }
      return false
    }

    logger.info(`✅ Notification Telegram envoyée pour item ${item.id} (${item.title})`)
    return true

  } catch (error) {
    logger.error('❌ Erreur lors de l\'envoi de la notification Telegram', error as Error)
    return false
  }
}

/**
 * Échappe les caractères spéciaux MarkdownV2 pour Telegram
 * IMPORTANT: L'ordre est crucial - échapper d'abord le backslash pour éviter les doubles échappements
 */
function escapeMarkdown(text: string): string {
  if (!text) return ''
  // Caractères à échapper pour MarkdownV2 (ordre important : backslash en premier)
  return String(text)
    .replace(/\\/g, '\\\\') // Échapper d'abord les backslashes
    .replace(/\_/g, '\\_')
    .replace(/\*/g, '\\*')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\~/g, '\\~')
    .replace(/\`/g, '\\`')
    .replace(/\>/g, '\\>')
    .replace(/\#/g, '\\#')
    .replace(/\+/g, '\\+')
    .replace(/\-/g, '\\-')
    .replace(/\=/g, '\\=')
    .replace(/\|/g, '\\|')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\./g, '\\.')
    .replace(/\!/g, '\\!')
}

/**
 * Récupère la configuration Telegram depuis les variables d'environnement
 * Supporte plusieurs formats :
 * - TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID (format recommandé)
 * - TELEGRAM_BOT (token) + TELEGRAM_CHAT_ID
 */
export function getTelegramConfig(): TelegramConfig | null {
  // Support pour TELEGRAM_BOT_TOKEN ou TELEGRAM_BOT
  const botToken = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!botToken || !chatId) {
    if (!botToken) {
      logger.debug('ℹ️ TELEGRAM_BOT_TOKEN ou TELEGRAM_BOT non défini')
    }
    if (!chatId) {
      logger.debug('ℹ️ TELEGRAM_CHAT_ID non défini')
    }
    return null
  }

  // Valider que chatId est un nombre (peut être une string de nombre)
  const chatIdNum = Number(chatId)
  if (isNaN(chatIdNum)) {
    logger.warn(`⚠️ TELEGRAM_CHAT_ID invalide: "${chatId}" n'est pas un nombre valide`)
    return null
  }

  // Normaliser le chatId (peut être une string de nombre)
  return { botToken, chatId: String(chatIdNum) }
}

