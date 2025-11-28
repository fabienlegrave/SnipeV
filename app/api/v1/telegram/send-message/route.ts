/**
 * Endpoint pour envoyer un message au vendeur manuellement
 * POST /api/v1/telegram/send-message
 */

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabase'
import { createFullSessionFromCookies } from '@/lib/scrape/fullSessionManager'
import { sendMessageToSeller, generateNegotiationMessage } from '@/lib/messaging/vintedMessaging'
import { vintedItemToApiItem } from '@/lib/utils/vintedItemToApiItem'
import type { ApiItem } from '@/lib/types/core'

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key')
    if (!apiKey || apiKey !== process.env.API_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { itemId, targetPrice } = await request.json()

    if (!itemId || typeof itemId !== 'number') {
      return NextResponse.json({ 
        error: 'Invalid request',
        details: 'itemId (number) is required'
      }, { status: 400 })
    }

    if (!supabase) {
      return NextResponse.json({ 
        error: 'Database not available',
        details: 'Supabase client not initialized'
      }, { status: 500 })
    }

    // Récupérer l'item
    const { data: item, error: itemError } = await supabase
      .from('vinted_items')
      .select('*')
      .eq('id', itemId)
      .single()

    if (itemError || !item) {
      return NextResponse.json({ 
        error: 'Item not found',
        details: itemError?.message || 'Item not found in database'
      }, { status: 404 })
    }

    // Convertir en ApiItem
    const apiItem: ApiItem = vintedItemToApiItem(item)

    // Calculer le prix cible si non fourni
    const itemPrice = apiItem.price?.amount || 0
    const finalTargetPrice = targetPrice || Math.floor(itemPrice * 0.9)

    // Récupérer les cookies depuis la base de données
    const { getCookiesForScraping } = await import('@/lib/utils/getCookiesFromDb')
    const cookies = await getCookiesForScraping()
    if (!cookies) {
      return NextResponse.json({ 
        error: 'Cookies not available',
        details: 'Cookies Cloudflare requis. Ils sont générés automatiquement au démarrage.'
      }, { status: 500 })
    }

    // Générer le message
    const message = generateNegotiationMessage({
      itemTitle: apiItem.title || 'Cet item',
      itemPrice,
      targetPrice: finalTargetPrice,
      sellerName: (apiItem as any).seller?.login
    })

    // Envoyer le message
    const session = createFullSessionFromCookies(cookies)
    const result = await sendMessageToSeller(session, apiItem, message)

    if (result.success) {
      // Marquer comme envoyé dans la base de données
      await supabase
        .from('alert_matches')
        .update({ 
          auto_message_sent: true, 
          auto_message_sent_at: new Date().toISOString() 
        })
        .eq('item_id', itemId)
        .catch(() => {}) // Ignorer les erreurs si la colonne n'existe pas

      return NextResponse.json({ 
        success: true,
        message: 'Message sent successfully',
        conversationId: result.conversationId
      })
    } else {
      return NextResponse.json({ 
        success: false,
        error: result.error || 'Failed to send message'
      }, { status: 500 })
    }

  } catch (error: any) {
    logger.error('❌ Erreur envoi message:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      message: error?.message || 'Unknown error'
    }, { status: 500 })
  }
}

// Utilise getCookiesForScraping() importé dynamiquement dans la fonction POST

