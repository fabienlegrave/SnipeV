import { NextRequest, NextResponse } from 'next/server'
import { validateVintedToken, validateCurrentToken, validateVintedCookies } from '@/lib/scrape/tokenValidator'

export async function GET(request: NextRequest) {
  try {
    // Check API key
    const apiKey = request.headers.get('x-api-key')
    if (!apiKey || apiKey !== process.env.API_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('🔐 Validation du token depuis l\'application...')
    
    // Valider le token actuel du store
    const validation = await validateCurrentToken()
    
    return NextResponse.json({
      ...validation,
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('Token validation API error:', error)
    return NextResponse.json({ 
      error: 'Validation failed',
      details: error.message 
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check API key
    const apiKey = request.headers.get('x-api-key')
    console.log('🔐 Token validation POST - API key check:', { 
      provided: apiKey ? 'Present' : 'Missing',
      expected: process.env.API_SECRET ? 'Set' : 'Missing'
    })
    
    if (!apiKey || apiKey !== process.env.API_SECRET) {
      console.log('❌ API key validation failed in POST')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { token, cookies } = body
    
    // Priorité : utiliser les cookies complets si fournis (recommandé)
    if (cookies && cookies.trim().length > 0) {
      console.log('🔐 Validation avec cookies complets...')
      const validation = await validateVintedCookies(cookies)
      
      return NextResponse.json({
        ...validation,
        timestamp: new Date().toISOString()
      })
    }
    
    // Fallback : validation avec token seul (moins fiable)
    if (!token) {
      return NextResponse.json({ 
        error: 'Token or cookies required in request body',
        details: 'Provide either "token" or "cookies" field'
      }, { status: 400 })
    }

    console.log('🔐 Validation du token fourni (mode simple, moins fiable)...')
    
    const validation = await validateVintedToken(token)
    
    return NextResponse.json({
      ...validation,
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('Token validation API error:', error)
    return NextResponse.json({ 
      error: 'Validation failed',
      details: error.message 
    }, { status: 500 })
  }
} 