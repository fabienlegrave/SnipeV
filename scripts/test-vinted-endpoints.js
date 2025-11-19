#!/usr/bin/env node

/**
 * Script de test pour tous les endpoints Vinted connus
 * 
 * Ce script teste chaque endpoint avec différents types de cookies pour identifier
 * quels cookies sont nécessaires pour chaque endpoint.
 * 
 * Usage:
 *   node scripts/test-vinted-endpoints.js [--cookies "cookie_string"]
 * 
 * Si --cookies n'est pas fourni, le script utilisera les cookies depuis:
 *   - Variable d'environnement VINTED_COOKIES
 *   - Ou testera sans cookies
 */

// Liste de tous les endpoints Vinted connus
const ENDPOINTS = [
  {
    name: 'Catalog Search',
    url: 'https://www.vinted.fr/api/v2/catalog/items?search_text=test&per_page=1&page=1',
    method: 'GET',
    description: 'Recherche d\'items dans le catalogue'
  },
  {
    name: 'Homepage Feed',
    url: 'https://www.vinted.fr/api/v2/homepage/all?column_count=5&version=4',
    method: 'GET',
    description: 'Feed personnalisé de la page d\'accueil'
  },
  {
    name: 'Web API Catalog (Alternative)',
    url: 'https://www.vinted.fr/web/api/core/catalog/items?page=1&per_page=1&search_text=test',
    method: 'GET',
    description: 'Endpoint alternatif pour le catalogue'
  },
  {
    name: 'Auth Refresh (OAuth2)',
    url: 'https://www.vinted.fr/api/v2/auth/refresh',
    method: 'POST',
    body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: 'test' }),
    description: 'Renouvellement du token OAuth2'
  },
  {
    name: 'Auth Token Refresh',
    url: 'https://www.vinted.fr/api/v2/auth/token/refresh',
    method: 'POST',
    body: JSON.stringify({ refresh_token: 'test' }),
    description: 'Renouvellement du token (format alternatif)'
  },
  {
    name: 'OAuth Token',
    url: 'https://www.vinted.fr/api/v2/oauth/token',
    method: 'POST',
    body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: 'test' }),
    description: 'Endpoint OAuth standard'
  },
  {
    name: 'Session Refresh',
    url: 'https://www.vinted.fr/api/v2/session/refresh',
    method: 'POST',
    body: JSON.stringify({ refresh_token: 'test' }),
    description: 'Rafraîchissement de session'
  },
  {
    name: 'Item Page (HTML)',
    url: 'https://www.vinted.fr/items/123456789',
    method: 'GET',
    description: 'Page HTML d\'un item (scraping)'
  }
]

// Types de cookies à tester
const COOKIE_CONFIGS = [
  {
    name: 'Aucun cookie',
    description: 'Aucune authentification',
    buildCookies: () => '',
    extractCookies: () => []
  },
  {
    name: 'Access Token seulement',
    description: 'Seulement access_token_web (sans Cloudflare)',
    buildCookies: (fullCookies) => {
      if (!fullCookies) return ''
      const match = fullCookies.match(/access_token_web=([^;]+)/)
      if (!match) return ''
      return `access_token_web=${match[1]}; domain_selected=true; anonymous-locale=fr`
    },
    extractCookies: (cookieString) => {
      const cookies = []
      if (cookieString.includes('access_token_web')) cookies.push('access_token_web')
      return cookies
    }
  },
  {
    name: 'Cloudflare seulement',
    description: 'Seulement cookies Cloudflare/Datadome (cf_clearance, datadome, __cf_bm)',
    buildCookies: (fullCookies) => {
      if (!fullCookies) return ''
      const parts = fullCookies.split(';').map(p => p.trim())
      const cloudflareCookies = parts.filter(p => 
        p.startsWith('cf_clearance=') ||
        p.startsWith('datadome=') ||
        p.startsWith('__cf_bm=') ||
        p.startsWith('__cfduid=')
      )
      return cloudflareCookies.join('; ')
    },
    extractCookies: (cookieString) => {
      const cookies = []
      if (cookieString.includes('cf_clearance')) cookies.push('cf_clearance')
      if (cookieString.includes('datadome')) cookies.push('datadome')
      if (cookieString.includes('__cf_bm')) cookies.push('__cf_bm')
      if (cookieString.includes('__cfduid')) cookies.push('__cfduid')
      return cookies
    }
  },
  {
    name: 'Cookies complets',
    description: 'Tous les cookies (access_token_web + Cloudflare + autres)',
    buildCookies: (fullCookies) => fullCookies || '',
    extractCookies: (cookieString) => {
      const parts = cookieString.split(';').map(p => p.trim().split('=')[0])
      return parts.filter(p => p.length > 0)
    }
  }
]

/**
 * Teste un endpoint avec un type de cookies spécifique
 */
async function testEndpoint(endpoint, cookieConfig, fullCookies) {
  const startTime = Date.now()
  const cookieString = cookieConfig.buildCookies(fullCookies)
  const cookiesUsed = cookieConfig.extractCookies(cookieString)

  // Construire les headers
  const headers = {
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'accept-encoding': 'gzip, deflate, br, zstd',
    'accept-language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    'cache-control': 'no-cache',
    'connection': 'keep-alive',
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
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
  }

  // Ajouter les cookies si disponibles
  if (cookieString) {
    headers['cookie'] = cookieString
  }

  // Pour les requêtes POST, ajouter content-type
  if (endpoint.method === 'POST') {
    headers['content-type'] = 'application/json'
    headers['origin'] = 'https://www.vinted.fr'
    headers['referer'] = 'https://www.vinted.fr/'
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10s timeout

    const response = await fetch(endpoint.url, {
      method: endpoint.method,
      headers,
      body: endpoint.body,
      signal: controller.signal
    })

    clearTimeout(timeoutId)
    const responseTime = Date.now() - startTime

    const status = response.status
    const success = response.ok || status === 429 // 429 = rate limit mais endpoint accessible

    // Lire le début de la réponse pour détecter les erreurs
    let error
    if (!success && status !== 429) {
      try {
        const text = await response.text()
        error = text.substring(0, 200)
      } catch {
        error = response.statusText
      }
    }

    // Déterminer les exigences
    const requiresAuth = cookieString.includes('access_token_web')
    const requiresCloudflare = cookieString.includes('cf_clearance') || cookieString.includes('datadome')

    return {
      endpoint: endpoint.name,
      cookieType: cookieConfig.name,
      status,
      success,
      error,
      responseTime,
      cookiesUsed,
      requiresAuth,
      requiresCloudflare
    }
  } catch (error) {
    const responseTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    return {
      endpoint: endpoint.name,
      cookieType: cookieConfig.name,
      status: 0,
      success: false,
      error: errorMessage,
      responseTime,
      cookiesUsed,
      requiresAuth: cookieString.includes('access_token_web'),
      requiresCloudflare: cookieString.includes('cf_clearance') || cookieString.includes('datadome')
    }
  }
}

/**
 * Analyse les résultats et détermine les exigences de cookies pour chaque endpoint
 */
function analyzeResults(results) {
  const analysis = new Map()

  // Grouper par endpoint
  const byEndpoint = new Map()
  for (const result of results) {
    if (!byEndpoint.has(result.endpoint)) {
      byEndpoint.set(result.endpoint, [])
    }
    byEndpoint.get(result.endpoint).push(result)
  }

  // Analyser chaque endpoint
  for (const [endpoint, endpointResults] of byEndpoint) {
    const successful = endpointResults.filter(r => r.success)
    const worksWith = successful.map(r => r.cookieType)
    
    // Déterminer les exigences minimales
    let requiresAuth = false
    let requiresCloudflare = false
    let bestCookieType = 'Aucun cookie'

    if (successful.length > 0) {
      // Si ça marche sans cookies, c'est le meilleur
      if (worksWith.includes('Aucun cookie')) {
        bestCookieType = 'Aucun cookie'
      }
      // Sinon, trouver le type minimal qui fonctionne
      else if (worksWith.includes('Access Token seulement')) {
        bestCookieType = 'Access Token seulement'
        requiresAuth = true
      }
      else if (worksWith.includes('Cloudflare seulement')) {
        bestCookieType = 'Cloudflare seulement'
        requiresCloudflare = true
      }
      else if (worksWith.includes('Cookies complets')) {
        bestCookieType = 'Cookies complets'
        requiresAuth = worksWith.some(t => t.includes('Access Token'))
        requiresCloudflare = worksWith.some(t => t.includes('Cloudflare'))
      }

      // Vérifier si l'auth est toujours requise
      if (!worksWith.includes('Aucun cookie') && !worksWith.includes('Cloudflare seulement')) {
        requiresAuth = true
      }

      // Vérifier si Cloudflare est toujours requis
      if (!worksWith.includes('Aucun cookie') && !worksWith.includes('Access Token seulement')) {
        requiresCloudflare = true
      }
    }

    analysis.set(endpoint, {
      worksWith,
      requiresAuth,
      requiresCloudflare,
      bestCookieType
    })
  }

  return analysis
}

/**
 * Affiche un rapport formaté
 */
function printReport(results, analysis) {
  console.log('\n' + '='.repeat(100))
  console.log('📊 RAPPORT DE TEST DES ENDPOINTS VINTED')
  console.log('='.repeat(100) + '\n')

  // Tableau récapitulatif
  console.log('📋 RÉSUMÉ PAR ENDPOINT:\n')
  console.log('Endpoint'.padEnd(35) + ' | Status | Cookies nécessaires | Auth | Cloudflare')
  console.log('-'.repeat(100))

  for (const endpoint of ENDPOINTS) {
    const endpointAnalysis = analysis.get(endpoint.name)
    if (!endpointAnalysis) continue

    const status = endpointAnalysis.worksWith.length > 0 ? '✅ OK' : '❌ FAIL'
    const cookies = endpointAnalysis.bestCookieType.padEnd(25)
    const auth = endpointAnalysis.requiresAuth ? '✅' : '❌'
    const cf = endpointAnalysis.requiresCloudflare ? '✅' : '❌'

    console.log(
      endpoint.name.padEnd(35) + ' | ' +
      status.padEnd(6) + ' | ' +
      cookies + ' | ' +
      auth + '    | ' +
      cf
    )
  }

  // Détails par endpoint
  console.log('\n\n📝 DÉTAILS PAR ENDPOINT:\n')
  
  for (const endpoint of ENDPOINTS) {
    console.log('─'.repeat(100))
    console.log(`\n🔹 ${endpoint.name}`)
    console.log(`   ${endpoint.description}`)
    console.log(`   URL: ${endpoint.url}`)
    
    const endpointResults = results.filter(r => r.endpoint === endpoint.name)
    const endpointAnalysis = analysis.get(endpoint.name)

    if (endpointAnalysis) {
      console.log(`\n   ✅ Fonctionne avec: ${endpointAnalysis.worksWith.join(', ') || 'Aucun'}`)
      console.log(`   🎯 Type de cookies recommandé: ${endpointAnalysis.bestCookieType}`)
      console.log(`   🔐 Nécessite authentification: ${endpointAnalysis.requiresAuth ? 'Oui' : 'Non'}`)
      console.log(`   🛡️ Nécessite Cloudflare: ${endpointAnalysis.requiresCloudflare ? 'Oui' : 'Non'}`)
    }

    console.log('\n   Résultats détaillés:')
    for (const result of endpointResults) {
      const icon = result.success ? '✅' : '❌'
      const statusText = result.status === 0 ? 'ERROR' : `HTTP ${result.status}`
      const time = `${result.responseTime}ms`
      const cookies = result.cookiesUsed.length > 0 
        ? result.cookiesUsed.join(', ') 
        : 'Aucun'
      
      console.log(`   ${icon} ${result.cookieType.padEnd(25)} → ${statusText.padEnd(10)} (${time.padEnd(6)}) [${cookies}]`)
      
      if (result.error && !result.success) {
        console.log(`      ⚠️  ${result.error.substring(0, 150)}`)
      }
    }
  }

  // Recommandations
  console.log('\n\n💡 RECOMMANDATIONS:\n')
  console.log('─'.repeat(100))
  
  const endpointsRequiringAuth = Array.from(analysis.entries())
    .filter(([_, a]) => a.requiresAuth)
    .map(([name, _]) => name)
  
  const endpointsRequiringCloudflare = Array.from(analysis.entries())
    .filter(([_, a]) => a.requiresCloudflare)
    .map(([name, _]) => name)

  if (endpointsRequiringAuth.length > 0) {
    console.log(`\n🔐 Endpoints nécessitant access_token_web:`)
    endpointsRequiringAuth.forEach(name => console.log(`   - ${name}`))
  }

  if (endpointsRequiringCloudflare.length > 0) {
    console.log(`\n🛡️ Endpoints nécessitant cookies Cloudflare (cf_clearance, datadome):`)
    endpointsRequiringCloudflare.forEach(name => console.log(`   - ${name}`))
  }

  const endpointsNoAuth = Array.from(analysis.entries())
    .filter(([_, a]) => !a.requiresAuth && !a.requiresCloudflare)
    .map(([name, _]) => name)

  if (endpointsNoAuth.length > 0) {
    console.log(`\n🌐 Endpoints accessibles sans authentification:`)
    endpointsNoAuth.forEach(name => console.log(`   - ${name}`))
  }

  console.log('\n' + '='.repeat(100) + '\n')
}

/**
 * Fonction principale
 */
async function main() {
  // Récupérer les cookies depuis les arguments ou l'environnement
  let fullCookies

  const args = process.argv.slice(2)
  const cookiesIndex = args.indexOf('--cookies')
  if (cookiesIndex !== -1 && args[cookiesIndex + 1]) {
    fullCookies = args[cookiesIndex + 1]
  } else {
    fullCookies = process.env.VINTED_COOKIES
  }

  if (!fullCookies) {
    console.log('⚠️  Aucun cookie fourni.')
    console.log('   Utilisez: node scripts/test-vinted-endpoints.js --cookies "cookie_string"')
    console.log('   Ou définissez la variable d\'environnement VINTED_COOKIES\n')
    console.log('   Le script va tester les endpoints sans cookies pour voir lesquels sont accessibles.\n')
  } else {
    console.log('✅ Cookies fournis (longueur: ' + fullCookies.length + ' caractères)')
    
    // Vérifier quels cookies sont présents
    const hasAccessToken = fullCookies.includes('access_token_web')
    const hasCloudflare = fullCookies.includes('cf_clearance') || fullCookies.includes('datadome')
    
    console.log(`   - access_token_web: ${hasAccessToken ? '✅' : '❌'}`)
    console.log(`   - Cloudflare cookies: ${hasCloudflare ? '✅' : '❌'}\n`)
  }

  console.log(`🧪 Test de ${ENDPOINTS.length} endpoints avec ${COOKIE_CONFIGS.length} types de cookies...\n`)
  console.log('⏳ Cela peut prendre quelques minutes...\n')

  const results = []

  // Tester chaque combinaison endpoint × type de cookies
  for (const endpoint of ENDPOINTS) {
    for (const cookieConfig of COOKIE_CONFIGS) {
      // Skip si on n'a pas de cookies complets et qu'on essaie de construire des cookies partiels
      if (cookieConfig.name !== 'Aucun cookie' && !fullCookies) {
        continue
      }

      process.stdout.write(`   Testing ${endpoint.name} with ${cookieConfig.name}... `)
      
      const result = await testEndpoint(endpoint, cookieConfig, fullCookies)
      results.push(result)
      
      const icon = result.success ? '✅' : '❌'
      console.log(`${icon} ${result.status === 0 ? 'ERROR' : 'HTTP ' + result.status}`)
      
      // Petit délai pour éviter le rate limiting
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  // Analyser les résultats
  const analysis = analyzeResults(results)

  // Afficher le rapport
  printReport(results, analysis)

  // Sauvegarder dans un fichier JSON
  const fs = await import('fs/promises')
  const report = {
    timestamp: new Date().toISOString(),
    endpoints: ENDPOINTS.map(e => ({
      name: e.name,
      url: e.url,
      method: e.method,
      description: e.description
    })),
    results,
    analysis: Object.fromEntries(analysis)
  }

  const reportPath = `test-endpoints-report-${Date.now()}.json`
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2))
  console.log(`💾 Rapport sauvegardé dans: ${reportPath}\n`)
}

// Exécuter le script
main().catch(error => {
  console.error('❌ Erreur:', error)
  process.exit(1)
})

