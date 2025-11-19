import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import { parseAlertList, validateParsedAlerts } from '@/lib/utils/parseAlertList'

/**
 * POST /api/v1/alerts/import
 * Importe plusieurs alertes depuis une liste parsée
 */
export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key')
    if (!apiKey || apiKey !== process.env.API_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { alerts, skipDuplicates = true } = await request.json()

    if (!Array.isArray(alerts) || alerts.length === 0) {
      return NextResponse.json({ error: 'alerts must be a non-empty array' }, { status: 400 })
    }

    if (!supabase) {
      return NextResponse.json({ error: 'Database not available' }, { status: 500 })
    }

    // Valider les alertes
    const validation = validateParsedAlerts(alerts)
    const alertsToCreate = skipDuplicates ? validation.valid : alerts

    // Vérifier les doublons existants en base
    const existingAlerts = await supabase
      .from('price_alerts')
      .select('game_title, platform')

    const existingKeys = new Set<string>()
    if (existingAlerts.data) {
      existingAlerts.data.forEach(alert => {
        const key = `${alert.game_title.toLowerCase()}_${alert.platform?.toLowerCase() || 'any'}`
        existingKeys.add(key)
      })
    }

    // Filtrer les alertes qui existent déjà
    const newAlerts = alertsToCreate.filter(alert => {
      const key = `${alert.gameTitle.toLowerCase()}_${alert.platform?.toLowerCase() || 'any'}`
      return !existingKeys.has(key)
    })

    if (newAlerts.length === 0) {
      return NextResponse.json({
        success: true,
        created: 0,
        skipped: alertsToCreate.length,
        duplicates: validation.duplicates.length,
        message: 'Toutes les alertes existent déjà en base',
      })
    }

    // Créer les alertes en batch
    const alertsToInsert = newAlerts.map(alert => ({
      game_title: alert.gameTitle.trim(),
      platform: alert.platform?.trim() || null,
      max_price: alert.maxPrice,
      condition: null, // Pas de condition par défaut
      is_active: true,
    }))

    const { data: createdAlerts, error } = await supabase
      .from('price_alerts')
      .insert(alertsToInsert)
      .select()

    if (error) {
      logger.db.error('Import price alerts', error)
      return NextResponse.json({ error: 'Database error', details: error.message }, { status: 500 })
    }

    logger.db.success(`Imported ${createdAlerts?.length || 0} price alerts`)

    return NextResponse.json({
      success: true,
      created: createdAlerts?.length || 0,
      skipped: alertsToCreate.length - newAlerts.length,
      duplicates: validation.duplicates.length,
      alerts: createdAlerts || [],
    })
  } catch (error: unknown) {
    logger.error('API error', error as Error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/v1/alerts/parse
 * Parse un texte et retourne les alertes détectées (sans les créer)
 */
export async function PUT(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key')
    if (!apiKey || apiKey !== process.env.API_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { text } = await request.json()

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'text is required' }, { status: 400 })
    }

    const result = parseAlertList(text)
    const validation = validateParsedAlerts(result.alerts)

    return NextResponse.json({
      success: true,
      parsed: result.alerts.length,
      valid: validation.valid.length,
      duplicates: validation.duplicates.length,
      errors: result.errors.length,
      skipped: result.skipped,
      alerts: validation.valid,
      duplicatesList: validation.duplicates,
      errorsList: result.errors,
    })
  } catch (error: unknown) {
    logger.error('API error', error as Error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

