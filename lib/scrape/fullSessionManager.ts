/**
 * Full Session Manager - Utilise la chaîne de cookies complète du navigateur
 */

export interface FullVintedSession {
  accessToken: string
  fullCookieString: string
  userAgent?: string
  referer?: string
}

/**
 * Extrait le token et construit une session complète
 */
export function createFullSessionFromCookies(cookieString: string): FullVintedSession {
  // Extraire access_token_web de la chaîne de cookies
  const tokenMatch = cookieString.match(/access_token_web=([^;]+)/)
  
  if (!tokenMatch) {
    throw new Error('Token access_token_web non trouvé dans les cookies')
  }
  
  return {
    accessToken: tokenMatch[1],
    fullCookieString: cookieString,
    // User-Agent mis à jour pour correspondre au navigateur qui fonctionne (Chrome 141)
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    referer: 'https://www.vinted.fr/'
  }
}

/**
 * Construit les headers pour l'API Vinted (JSON)
 * IMPORTANT: Headers copiés EXACTEMENT depuis le navigateur qui fonctionne
 * Note: Même si l'API retourne du JSON, le navigateur envoie accept: text/html
 */
export function buildVintedApiHeaders(session: FullVintedSession): Record<string, string> {
  return {
    // Headers EXACTS du navigateur qui fonctionne
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'accept-encoding': 'gzip, deflate, br, zstd',
    'accept-language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    'cache-control': 'no-cache',
    'connection': 'keep-alive',
    'cookie': session.fullCookieString,
    // ⚠️ NE PAS définir 'host' - Node.js le gère automatiquement
    // Définir 'host' manuellement cause des erreurs 403 sur Vercel/Cloudflare
    'pragma': 'no-cache',
    'sec-ch-ua': '"Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
    'sec-ch-ua-arch': '"x86"',
    'sec-ch-ua-bitness': '"64"',
    'sec-ch-ua-full-version': '"141.0.7390.123"',
    'sec-ch-ua-full-version-list': '"Google Chrome";v="141.0.7390.123", "Not?A_Brand";v="8.0.0.0", "Chromium";v="141.0.7390.123"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-model': '""',
    'sec-ch-ua-platform': '"Windows"',
    'sec-ch-ua-platform-version': '"15.0.0"',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'none',
    'sec-fetch-user': '?1',
    'upgrade-insecure-requests': '1',
    'user-agent': session.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
  }
}

/**
 * Construit les headers pour les pages HTML (scraping)
 */
export function buildFullVintedHeaders(session: FullVintedSession): Record<string, string> {
  return {
    // COPIÉ EXACTEMENT du navigateur qui FONCTIONNE
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'accept-encoding': 'gzip, deflate, br, zstd',
    'accept-language': 'fr,fr-FR;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6', // Exact du navigateur
    'cache-control': 'no-cache', // EXACT du navigateur
    'pragma': 'no-cache', // AJOUTÉ du navigateur
    'connection': 'keep-alive',
    // ⚠️ NE PAS définir 'host' - Node.js le gère automatiquement
    // Définir 'host' manuellement cause des erreurs 403 sur Vercel/Cloudflare
    // Headers sec-ch-ua EXACTS du navigateur qui fonctionne
    'sec-ch-ua': '"Not A(Brand";v="8", "Chromium";v="132", "Microsoft Edge";v="132"',
    'sec-ch-ua-arch': '"x86"',
    'sec-ch-ua-bitness': '"64"',
    'sec-ch-ua-full-version': '"132.0.2957.115"',
    'sec-ch-ua-full-version-list': '"Not A(Brand";v="8.0.0.0", "Chromium";v="132.0.6834.84", "Microsoft Edge";v="132.0.2957.115"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-model': '""',
    'sec-ch-ua-platform': '"Windows"',
    'sec-ch-ua-platform-version': '"15.0.0"',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'none',
    'sec-fetch-user': '?1',
    'upgrade-insecure-requests': '1',
    // User-Agent EXACT du navigateur
    'user-agent': session.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 Edg/132.0.0.0',
    'cookie': session.fullCookieString
  }
}

/**
 * Construit une session à partir du token seul (mode simple)
 * ATTENTION: Cette méthode ne fonctionne pas toujours car elle n'inclut pas
 * les cookies Cloudflare (cf_clearance, datadome) qui sont nécessaires.
 * Utilisez createFullSessionFromCookies avec les cookies complets du navigateur.
 */
export function createSimpleSession(token: string): FullVintedSession {
  // Pour la compatibilité, on créé une session minimale
  // Mais cela peut échouer avec Cloudflare car il manque cf_clearance et datadome
  const baseCookies = [
    `access_token_web=${token}`,
    `domain_selected=true`,
    `anonymous-locale=fr`,
    `anon_id=6d320b9c-c539-4a57-80d1-c7aa87cc075f`,
    // Ajouter quelques cookies de base pour améliorer la compatibilité
    `viewport_size=1920`,
    `banners_ui_state=FAILURE`
  ]
  
  return {
    accessToken: token,
    fullCookieString: baseCookies.join('; '),
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    referer: 'https://www.vinted.fr/'
  }
} 