import { logger } from '../logger'
import { fetchViaGateway } from '../scraper/gatewayWrapper'

export interface FetchOptions {
  headers?: Record<string, string>
  retries?: number
  backoffMs?: number
  timeout?: number
}

export const DEFAULT_HTML_HEADERS = {
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'accept-encoding': 'gzip, deflate, br, zstd',
  'accept-language': 'fr,fr-FR;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
  'cache-control': 'no-cache',
  'connection': 'keep-alive',
  'sec-ch-ua': '"Chromium";v="126", "Not.A/Brand";v="24", "Google Chrome";v="126"',
  'sec-ch-ua-arch': '"x86"',
  'sec-ch-ua-bitness': '"64"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'same-origin',
  'sec-fetch-user': '?1',
  'upgrade-insecure-requests': '1',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'referer': 'https://www.vinted.fr/'
}

export const DEFAULT_API_HEADERS = {
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'accept-encoding': 'gzip, deflate, br, zstd',
  'accept-language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
  'cache-control': 'max-age=0',
  'connection': 'keep-alive',
  'sec-ch-ua': '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
  'sec-ch-ua-arch': '"x86"',
  'sec-ch-ua-bitness': '"64"',
  'sec-ch-ua-full-version': '"140.0.7339.128"',
  'sec-ch-ua-full-version-list': '"Chromium";v="140.0.7339.128", "Not=A?Brand";v="24.0.0.0", "Google Chrome";v="140.0.7339.128"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-model': '""',
  'sec-ch-ua-platform': '"Windows"',
  'sec-ch-ua-platform-version': '"15.0.0"',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'upgrade-insecure-requests': '1',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function fetchWithRetry(
  url: string, 
  options: FetchOptions = {}
): Promise<string> {
  const {
    headers = DEFAULT_HTML_HEADERS,
    retries = 3,
    backoffMs = 1000, // Increased default backoff
    timeout = 12000 // Increased timeout
  } = options

  let lastError: Error

  // Vérifier si le gateway est activé et si l'URL est une URL Vinted
  const useGateway = process.env.ENABLE_GATEWAY === 'true' && url.includes('vinted.fr')
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      let response: Response
      
      if (useGateway) {
        // Utiliser le gateway pour router via les scraper nodes
        logger.debug(`🌐 Utilisation du gateway pour: ${url}`)
        response = await fetchViaGateway(url, {
          method: 'GET',
          headers,
        })
      } else {
        // Mode direct (comportement par défaut)
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeout)

        response = await fetch(url, {
          headers,
          signal: controller.signal,
          // Disable SSL verification in development if needed
          ...(process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0' && {
            agent: false
          })
        })

        clearTimeout(timeoutId)
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const body = await response.text()
      return body

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      lastError = error instanceof Error ? error : new Error(String(error))
      
      if (attempt < retries) {
        let waitTime: number
        
        // Special handling for rate limiting errors
        if (error.message?.includes('HTTP 429')) {
          // Exponential backoff with jitter for rate limiting
          waitTime = Math.min(
            backoffMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 1000),
            10000 // Cap at 10 seconds
          )
          logger.warn(`⚠️ Rate limit hit - Attempt ${attempt}/${retries} failed: ${errorMessage} → retry in ${waitTime}ms`)
        } else {
          // Standard backoff for other errors
          waitTime = backoffMs * attempt + Math.floor(Math.random() * 500)
          logger.warn(`⚠️ Attempt ${attempt}/${retries} failed: ${errorMessage} → retry in ${waitTime}ms`)
        }
        
        await delay(waitTime)
      } else {
        // Final attempt failed
        if (errorMessage.includes('HTTP 429')) {
          logger.error(`🚫 Rate limit exceeded after ${retries} attempts. Consider reducing concurrency.`)
        }
      }
    }
  }

  throw lastError!
}