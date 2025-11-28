// Charger les variables d'environnement depuis .env.local si disponible
// (important pour les scripts standalone qui n'utilisent pas Next.js)
if (typeof window === 'undefined') {
  try {
    const { config } = require('dotenv')
    const { resolve } = require('path')
    config({ path: resolve(process.cwd(), '.env.local') })
  } catch (e) {
    // dotenv non disponible ou erreur, continuer avec process.env
  }
}

import { createClient } from '@supabase/supabase-js'

// Server-side Supabase client (for API routes)
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// Only create server client if we have the required variables (server-side only)
export const supabase = (() => {
  // Only run on server side
  if (typeof window !== 'undefined') {
    return null
  }

  // Ne pas afficher les warnings pendant le build Next.js (variables disponibles seulement au runtime)
  // Next.js définit NEXT_PHASE pendant le build
  const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build' || 
                      (process.env.NODE_ENV === 'production' && typeof process.env.SUPABASE_URL === 'undefined' && typeof process.env.NEXT_PUBLIC_SUPABASE_URL === 'undefined')

  if (!supabaseUrl) {
    if (!isBuildTime) {
      console.warn('❌ Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL environment variable')
    }
    return null
  }

  if (!supabaseServiceKey) {
    if (!isBuildTime) {
      console.warn('❌ Missing SUPABASE_SERVICE_ROLE_KEY environment variable (server-side only)')
    }
    return null
  }

  // Validate URL format
  try {
    const url = new URL(supabaseUrl)
    if (!url.hostname.includes('supabase')) {
      console.warn('⚠️ Supabase URL does not appear to be a valid Supabase URL:', url.hostname)
    }
  } catch (e) {
    console.error('❌ Invalid Supabase URL format:', supabaseUrl)
    return null
  }

  console.log('✅ Supabase server client initialized', {
    url: `${supabaseUrl.substring(0, 30)}...`,
    hasKey: !!supabaseServiceKey,
    keyPreview: supabaseServiceKey ? `${supabaseServiceKey.substring(0, 10)}...` : 'missing'
  })

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      schema: 'public',
    },
    global: {
      headers: {
        'x-client-info': 'vinted-scrap@1.0.0',
      },
    },
  })
})()

// Client-side Supabase client (for browser usage)
export const supabaseClient = (() => {
  // Only run this on the client side
  if (typeof window === 'undefined') {
    // Server-side: return a dummy client to avoid errors
    return {
      from: () => ({
        select: () => ({ 
          eq: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'Server-side client not available' } }) }),
          in: () => Promise.resolve({ data: [], error: null }),
          gte: () => ({ count: () => Promise.resolve({ count: 0, error: null }) }),
          not: () => ({ count: () => Promise.resolve({ count: 0, error: null }) }),
          limit: () => Promise.resolve({ data: [], error: null }),
          order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) })
        })
      })
    } as any
  }

  // Client-side: use public variables
  const clientUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const clientKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  // Ne pas afficher les logs pendant le build Next.js
  const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build' || 
                      (process.env.NODE_ENV === 'production' && typeof clientUrl === 'undefined' && typeof clientKey === 'undefined')
  
  if (!isBuildTime) {
    console.log('Client Supabase config:', { 
      url: clientUrl ? 'Set' : 'Missing', 
      key: clientKey ? 'Set' : 'Missing',
      keyPreview: clientKey ? `${clientKey.substring(0, 10)}...` : 'None'
    })
  }

  if (!clientUrl || !clientKey) {
    if (!isBuildTime) {
      console.warn('Missing client-side Supabase environment variables')
    }
    // Return a dummy client to prevent crashes
    return {
      from: () => ({
        select: () => ({ 
          eq: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'Client configuration missing' } }) }),
          in: () => Promise.resolve({ data: [], error: null }),
          gte: () => ({ count: () => Promise.resolve({ count: 0, error: null }) }),
          not: () => ({ count: () => Promise.resolve({ count: 0, error: null }) }),
          limit: () => Promise.resolve({ data: [], error: null }),
          order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) })
        })
      })
    } as any
  }
  
  return createClient(clientUrl, clientKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
})()