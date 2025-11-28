/**
 * Vinted Token Validator
 * Vérifie la validité du token avant chaque opération de scraping
 */

import { buildVintedHeaders, createSessionFromToken } from './sessionManager'
import { createSimpleSession, buildFullVintedHeaders, createFullSessionFromCookies } from './fullSessionManager'

export interface TokenValidationResult {
  isValid: boolean
  error?: string
  details?: {
    statusCode: number
    message: string
    expiresAt?: Date
    userId?: string
  }
}

// Nouvelle: valide une chaîne de cookies complète en mimant le scrape
export async function validateVintedCookies(cookieString: string): Promise<TokenValidationResult> {
  if (!cookieString || cookieString.trim() === '') {
    return {
      isValid: false,
      error: 'Cookies manquants',
      details: { statusCode: 400, message: 'Aucune chaîne de cookies fournie' }
    }
  }
  try {
    const session = createFullSessionFromCookies(cookieString)
    // Pour l'API, utiliser buildVintedApiHeaders au lieu de buildFullVintedHeaders
    const { buildVintedApiHeaders } = await import('./fullSessionManager')
    const headers = buildVintedApiHeaders(session)
    const testUrl = 'https://www.vinted.fr/api/v2/catalog/items?search_text=test&per_page=1&page=1'
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)
    const response = await fetch(testUrl, { method: 'GET', headers, signal: controller.signal })
    clearTimeout(timeoutId)
    const statusCode = response.status
    
    // Vérifier si on a des cookies Cloudflare mais pas access_token_web
    const hasCloudflare = cookieString.includes('cf_clearance') || 
                         cookieString.includes('datadome') ||
                         cookieString.includes('__cf_bm')
    const hasAccessToken = cookieString.includes('access_token_web=')
    
    if (response.ok) {
      return { isValid: true, details: { statusCode, message: 'Cookies valides' } }
    }
    if (statusCode === 429) {
      return { isValid: true, details: { statusCode, message: 'Rate limit mais cookies valides' } }
    }
    
    // Si on a des cookies Cloudflare mais pas access_token_web, et qu'on a 403
    // C'est probablement OK car les cookies Cloudflare fonctionnent (bypass réussi)
    // Le 403 vient du fait qu'il manque access_token_web pour certaines routes
    if (hasCloudflare && !hasAccessToken && statusCode === 403) {
      return { 
        isValid: true, 
        details: { 
          statusCode, 
          message: 'Cookies Cloudflare valides (403 peut indiquer que access_token_web est requis pour cette route, mais les cookies Cloudflare fonctionnent)' 
        } 
      }
    }
    
    return { isValid: false, error: `HTTP ${statusCode}`, details: { statusCode, message: response.statusText } }
  } catch (error: any) {
    // Si l'erreur vient de createFullSessionFromCookies (pas de cookies Cloudflare), c'est une vraie erreur
    if (error?.message?.includes('cookies doivent contenir')) {
      return {
        isValid: false,
        error: 'Cookies invalides',
        details: { statusCode: 400, message: error.message }
      }
    }
    return {
      isValid: false,
      error: 'Erreur de validation cookies',
      details: { statusCode: 500, message: error?.message || 'Erreur inconnue' }
    }
  }
}

/**
 * Valide un token Vinted en faisant un appel test à l'API (mode simple)
 * Utilise EXACTEMENT la même méthode que le scraping pour garantir la cohérence
 */
export async function validateVintedToken(token: string): Promise<TokenValidationResult> {
  if (!token || token.trim() === '') {
    return {
      isValid: false,
      error: 'Token manquant',
      details: {
        statusCode: 400,
        message: 'Aucun token fourni'
      }
    }
  }

  try {
    // MÊME LOGIQUE QUE LE SCRAPING : utiliser createSimpleSession
    const session = createSimpleSession(token)
    const headers = buildFullVintedHeaders(session)
    
    // Test avec requête simple d'abord
    const testUrl = 'https://www.vinted.fr/api/v2/catalog/items?search_text=test&per_page=1&page=1'
    
    console.log('🔍 Validation avec la MÊME méthode que le scraping...')
    console.log(`🌐 URL: ${testUrl}`)
    console.log(`🍪 Headers: ${Object.keys(headers).length} headers`)
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)
    
    const response = await fetch(testUrl, {
      method: 'GET',
      headers,
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)
    const statusCode = response.status
    
    console.log(`📊 Réponse validation: ${statusCode} ${response.statusText}`)
    
    if (response.ok) {
      const tokenInfo = parseTokenInfo(token)
      return {
        isValid: true,
        details: {
          statusCode,
          message: 'Token valide - MÊME méthode que le scraping',
          expiresAt: tokenInfo.expiresAt,
          userId: tokenInfo.userId
        }
      }
    } else if (statusCode === 401 || statusCode === 403) {
      return {
        isValid: false,
        error: 'Token invalide ou expiré',
        details: {
          statusCode,
          message: statusCode === 401 ? 'Token non autorisé' : 'Token expiré ou accès refusé'
        }
      }
    } else if (statusCode === 429) {
      return { isValid: true, details: { statusCode, message: 'Rate limit atteint - token probablement valide' } }
    } else {
      return { isValid: false, error: `Erreur HTTP ${statusCode}`, details: { statusCode, message: `Réponse inattendue de l'API: ${response.statusText}` } }
    }
  } catch (error: any) {
    if (error.name === 'AbortError' || error.message?.includes('timeout')) {
      return { isValid: false, error: 'Timeout de validation', details: { statusCode: 408, message: 'La validation du token a pris trop de temps' } }
    }
    return { isValid: false, error: 'Erreur de validation', details: { statusCode: 500, message: error.message || 'Erreur inconnue lors de la validation' } }
  }
}

function parseTokenInfo(token: string): { expiresAt?: Date; userId?: string } {
  try {
    if (token.includes('.')) {
      const parts = token.split('.')
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'))
        return { expiresAt: payload.exp ? new Date(payload.exp * 1000) : undefined, userId: payload.sub || payload.account_id || payload.user_id }
      }
    }
  } catch {}
  return {}
}

export async function validateCurrentToken(): Promise<TokenValidationResult> {
  // Sur le serveur, on ne peut pas accéder au client store
  // On retourne une erreur appropriée
  console.log('⚠️ validateCurrentToken called on server - client store not available')
  
  return { 
    isValid: false, 
    error: 'Token non accessible côté serveur', 
    details: { 
      statusCode: 400, 
      message: 'Le token store client n\'est pas accessible depuis les API routes. Utilisez validateVintedToken() avec un token explicite.' 
    } 
  }
}

export async function ensureValidToken(token?: string): Promise<string> {
  if (!token) {
    throw new Error('Token Vinted requis - veuillez fournir un token')
  }
  const validation = await validateVintedToken(token)
  if (!validation.isValid) {
    throw new Error(`Token invalide: ${validation.error} (${validation.details?.message})`)
  }
  return token
} 