import { NextRequest, NextResponse } from 'next/server'

// Marquer la route comme dynamique
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/v1/admin/config
 * Retourne la configuration de l'application (côté serveur uniquement)
 * Sécurisé avec API key
 */
export async function GET(request: NextRequest) {
  try {
    // Vérifier l'API key (accepter soit API_SECRET soit NEXT_PUBLIC_API_SECRET)
    const apiKey = request.headers.get('x-api-key')
    const validSecret = process.env.API_SECRET || process.env.NEXT_PUBLIC_API_SECRET
    if (!apiKey || !validSecret || apiKey !== validSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Retourner uniquement les informations de configuration (pas les valeurs sensibles)
    return NextResponse.json({
      database: {
        url: !!process.env.SUPABASE_URL || !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        publicKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        serviceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      },
      api: {
        secret: !!process.env.API_SECRET,
        publicSecret: !!process.env.NEXT_PUBLIC_API_SECRET,
      },
      puppeteer: {
        executablePath: !!process.env.PUPPETEER_EXECUTABLE_PATH,
      },
      telegram: {
        botToken: !!process.env.TELEGRAM_BOT_TOKEN,
        chatId: !!process.env.TELEGRAM_CHAT_ID,
      },
      vinted: {
        email: !!process.env.VINTED_EMAIL,
        password: !!process.env.VINTED_PASSWORD,
      },
      performance: {
        scrapeDelay: process.env.SCRAPE_DELAY_MS || '1200',
        enrichConcurrency: process.env.ENRICH_CONCURRENCY || '2',
      },
      security: {
        tlsRejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0',
      },
    })
  } catch (error) {
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

