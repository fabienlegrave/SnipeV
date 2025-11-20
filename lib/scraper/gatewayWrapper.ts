/**
 * Wrapper pour utiliser le gateway dans le code existant
 * Permet de remplacer facilement les appels directs à l'API Vinted
 */

import { routeRequest } from './gateway'
import { logger } from '@/lib/logger'

/**
 * Fait une requête à l'API Vinted via le gateway (si activé)
 * Sinon, fait la requête directement
 */
export async function fetchViaGateway(
  url: string,
  options: {
    method?: string
    headers?: Record<string, string>
    body?: any
    useGateway?: boolean // Force l'utilisation du gateway (défaut: auto-détect)
  } = {}
): Promise<Response> {
  const { method = 'GET', headers = {}, body, useGateway } = options
  
  // Vérifier si le gateway est activé
  const gatewayEnabled = process.env.ENABLE_GATEWAY === 'true' || useGateway === true
  
  if (!gatewayEnabled) {
    // Mode direct (comportement par défaut)
    return fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
  }
  
  // Mode gateway : router via le cluster
  try {
    logger.info(`🌐 Utilisation du gateway pour: ${url}`)
    
    const result = await routeRequest({
      url,
      method,
      headers,
      body,
    })
    
    if (result.success && result.data) {
      // Le scraper node retourne déjà le format attendu
      // Si c'est du JSON stringifié, le garder tel quel
      // Si c'est un objet, le stringifier
      let responseBody: string
      
      if (typeof result.data === 'string') {
        // Déjà une string (HTML ou JSON stringifié)
        responseBody = result.data
      } else if (result.data.data && typeof result.data.data === 'string') {
        // Le scraper node retourne { success: true, data: "..." }
        responseBody = result.data.data
      } else {
        // Objet, le stringifier
        responseBody = JSON.stringify(result.data)
      }
      
      // Créer une Response compatible avec fetch
      return new Response(responseBody, {
        status: 200,
        statusText: 'OK',
        headers: {
          'Content-Type': result.data.headers?.['content-type'] || 'application/json',
        },
      })
    } else {
      throw new Error(result.error || 'Gateway request failed')
    }
  } catch (error: any) {
    logger.error('Erreur lors de l\'utilisation du gateway, fallback direct', error)
    
    // Fallback vers le mode direct en cas d'erreur
    return fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
  }
}

