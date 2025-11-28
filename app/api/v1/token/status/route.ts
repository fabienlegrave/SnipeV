/**
 * Endpoint de debug pour vérifier l'état des cookies
 * GET /api/v1/token/status
 * 
 * Retourne l'état actuel des cookies Cloudflare en base de données
 */

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import { getCookiesFromDb } from '@/lib/utils/getCookiesFromDb'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  try {
    const status = {
      hasActiveCookies: false,
      cookiesSource: null as string | null,
      lastRefreshAt: null as string | null,
      cookiesPreview: null as string | null,
      error: null as string | null,
    }

    // Vérifier si Supabase est disponible
    if (!supabase) {
      status.error = 'Supabase non disponible'
      return NextResponse.json(status)
    }

    // Récupérer les cookies depuis la DB
    const cookies = await getCookiesFromDb()
    
    if (cookies) {
      status.hasActiveCookies = true
      status.cookiesSource = 'database'
      status.cookiesPreview = cookies.substring(0, 100) + '...'
      
      // Récupérer la date de dernière mise à jour
      try {
        const { data } = await supabase
          .from('vinted_credentials')
          .select('updated_at')
          .eq('is_active', true)
          .order('updated_at', { ascending: false })
          .limit(1)
          .single()
          .catch(() => ({ data: null }))
        
        if (data?.updated_at) {
          status.lastRefreshAt = data.updated_at
        }
      } catch (error) {
        // Ignorer
      }
    } else {
      status.hasActiveCookies = false
      status.error = 'Aucun cookie Cloudflare actif trouvé en base de données'
    }

    // Vérifier aussi les variables d'environnement (pour info)
    const envCookies = process.env.VINTED_FULL_COOKIES
    const hasEnvCookies = envCookies && envCookies.trim().length > 0
    const hasEnvCloudflare = hasEnvCookies && (
      envCookies.includes('cf_clearance') || envCookies.includes('datadome')
    )

    return NextResponse.json({
      ...status,
      env: {
        hasVINTED_FULL_COOKIES: hasEnvCookies,
        hasCloudflareCookies: hasEnvCloudflare,
        note: hasEnvCookies 
          ? 'VINTED_FULL_COOKIES présent mais non utilisé pour scraping (DB uniquement)'
          : 'VINTED_FULL_COOKIES non configuré',
      },
      recommendation: !status.hasActiveCookies
        ? 'Appeler POST /api/v1/token/refresh/force sur le main worker pour générer les cookies'
        : 'Cookies valides disponibles',
    })
  } catch (error: any) {
    logger.error('Erreur lors de la vérification du statut des cookies', error)
    return NextResponse.json(
      {
        hasActiveCookies: false,
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    )
  }
}

