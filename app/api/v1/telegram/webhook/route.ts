/**
 * Webhook Telegram pour gérer les callbacks des boutons inline
 * POST /api/v1/telegram/webhook
 */

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabase'
import { createFullSessionFromCookies } from '@/lib/scrape/fullSessionManager'
import { sendMessageToSeller, generateNegotiationMessage } from '@/lib/messaging/vintedMessaging'
import { vintedItemToApiItem } from '@/lib/utils/vintedItemToApiItem'
import type { ApiItem } from '@/lib/types/core'

/**
 * Gère les callbacks Telegram (boutons inline)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Vérifier que c'est un callback query
    if (!body.callback_query) {
      return NextResponse.json({ ok: true, message: 'Not a callback query' })
    }

    const callbackQuery = body.callback_query
    const callbackData = callbackQuery.data
    const chatId = callbackQuery.message?.chat?.id
    const messageId = callbackQuery.message?.message_id

    // Vérifier le token du bot
    const botToken = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT
    if (!botToken) {
      logger.error('❌ TELEGRAM_BOT_TOKEN non configuré')
      return NextResponse.json({ ok: false, error: 'Bot token not configured' }, { status: 500 })
    }

    // Vérifier que le callback vient du bon chat
    const expectedChatId = process.env.TELEGRAM_CHAT_ID
    if (expectedChatId && String(chatId) !== String(expectedChatId)) {
      logger.warn(`⚠️ Callback reçu d'un chat non autorisé: ${chatId} (attendu: ${expectedChatId})`)
      return NextResponse.json({ ok: true, message: 'Unauthorized chat' })
    }

    // Parser le callback_data
    // Format: send_message_<item_id>_<target_price>
    if (callbackData?.startsWith('send_message_')) {
      const parts = callbackData.split('_')
      if (parts.length >= 4) {
        const itemId = parseInt(parts[2], 10)
        const targetPrice = parseInt(parts[3], 10)

        if (isNaN(itemId) || isNaN(targetPrice)) {
          await answerCallbackQuery(botToken, callbackQuery.id, '❌ Erreur: données invalides')
          return NextResponse.json({ ok: false, error: 'Invalid callback data' })
        }

        // Récupérer l'item depuis la base de données
        if (!supabase) {
          await answerCallbackQuery(botToken, callbackQuery.id, '❌ Erreur: base de données non disponible')
          return NextResponse.json({ ok: false, error: 'Database not available' }, { status: 500 })
        }

        const { data: item, error: itemError } = await supabase
          .from('vinted_items')
          .select('*')
          .eq('id', itemId)
          .single()

        if (itemError || !item) {
          await answerCallbackQuery(botToken, callbackQuery.id, '❌ Item non trouvé')
          logger.error(`❌ Item ${itemId} non trouvé:`, itemError)
          return NextResponse.json({ ok: false, error: 'Item not found' })
        }

        // Convertir en ApiItem
        const apiItem: ApiItem = vintedItemToApiItem(item)

        // Récupérer les cookies depuis la base de données
        const { getCookiesForScraping } = await import('@/lib/utils/getCookiesFromDb')
        const cookies = await getCookiesForScraping()
        if (!cookies) {
          await answerCallbackQuery(botToken, callbackQuery.id, '❌ Cookies Vinted non disponibles')
          return NextResponse.json({ ok: false, error: 'Cookies not available' }, { status: 500 })
        }

        // Générer le message
        const message = generateNegotiationMessage({
          itemTitle: apiItem.title || 'Cet item',
          itemPrice: apiItem.price?.amount || 0,
          targetPrice,
          sellerName: (apiItem as any).seller?.login
        })

        // Envoyer le message au vendeur
        const session = createFullSessionFromCookies(cookies)
        const result = await sendMessageToSeller(session, apiItem, message)

        if (result.success) {
          // Répondre au callback avec succès
          await answerCallbackQuery(botToken, callbackQuery.id, '✅ Message envoyé au vendeur !')
          
          // Mettre à jour le message pour indiquer que le message a été envoyé
          await editMessageReplyMarkup(botToken, chatId, messageId, [
            [{
              text: '✅ Message envoyé',
              callback_data: `sent_${itemId}`
            }]
          ])

          // Marquer comme envoyé dans la base de données
          await supabase
            .from('alert_matches')
            .update({ 
              auto_message_sent: true, 
              auto_message_sent_at: new Date().toISOString() 
            })
            .eq('item_id', itemId)
            .catch(() => {}) // Ignorer les erreurs si la colonne n'existe pas

          logger.info(`✅ Message envoyé au vendeur pour l'item ${itemId} via callback Telegram`)
          return NextResponse.json({ ok: true })
        } else {
          await answerCallbackQuery(botToken, callbackQuery.id, `❌ Erreur: ${result.error || 'Échec envoi message'}`)
          logger.error(`❌ Échec envoi message pour item ${itemId}: ${result.error}`)
          return NextResponse.json({ ok: false, error: result.error })
        }
      }
    }

    // Callback non reconnu
    await answerCallbackQuery(botToken, callbackQuery.id, '❌ Action non reconnue')
    return NextResponse.json({ ok: true, message: 'Unknown callback' })

  } catch (error: any) {
    logger.error('❌ Erreur webhook Telegram:', error)
    return NextResponse.json({ 
      ok: false, 
      error: error.message || 'Internal server error' 
    }, { status: 500 })
  }
}

/**
 * Répond à un callback query Telegram
 */
async function answerCallbackQuery(
  botToken: string,
  callbackQueryId: string,
  text: string
): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text,
        show_alert: false
      })
    })
  } catch (error) {
    logger.error('Erreur answerCallbackQuery:', error)
  }
}

/**
 * Modifie le clavier inline d'un message
 */
async function editMessageReplyMarkup(
  botToken: string,
  chatId: number,
  messageId: number,
  inlineKeyboard: any[][]
): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/editMessageReplyMarkup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: inlineKeyboard
        }
      })
    })
  } catch (error) {
    logger.error('Erreur editMessageReplyMarkup:', error)
  }
}

// Utilise getCookiesForScraping() importé dynamiquement dans la fonction POST

