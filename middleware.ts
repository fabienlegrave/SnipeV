import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Middleware pour sécuriser les routes API
 * 
 * Remplace la vérification de l'API secret côté client
 * par une vérification côté serveur via middleware
 */
export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  
  // Routes publiques qui ne nécessitent pas d'API key
  const publicRoutes = [
    '/api/v1/token/refresh/force', // Force cookie generation (accessible sans API key)
    '/api/v1/worker/main/init', // Main worker initialization
    '/api/v1/worker/health', // Worker health check (pour le main worker)
    '/api/health', // Health check
  ]
  
  // Si c'est une route publique, autoriser sans vérification
  if (publicRoutes.some(route => pathname.startsWith(route))) {
    return NextResponse.next()
  }
  
  // Vérifier uniquement les routes API
  if (pathname.startsWith('/api/v1/')) {
    const apiKey = request.headers.get('x-api-key')
    const expectedApiKey = process.env.API_SECRET

    // Si pas de clé API configurée, autoriser (pour le développement)
    if (!expectedApiKey) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('⚠️ API_SECRET not configured - allowing all requests in development')
        return NextResponse.next()
      }
      // En production, bloquer si pas de clé configurée
      return NextResponse.json(
        { error: 'API not configured' },
        { status: 500 }
      )
    }

    // Vérifier la clé API
    if (!apiKey || apiKey !== expectedApiKey) {
      return NextResponse.json(
        { 
          error: 'Unauthorized',
          message: 'Invalid or missing API key'
        },
        { status: 401 }
      )
    }
  }

  return NextResponse.next()
}

/**
 * Configuration du middleware
 * Applique le middleware uniquement aux routes API
 */
export const config = {
  matcher: '/api/v1/:path*',
}

