/**
 * Générateur de cookies Cloudflare/Datadome via Puppeteer
 * Génère automatiquement les cookies depuis le serveur avec l'IP du serveur
 * 
 * ⚠️ IMPORTANT : Cette solution nécessite :
 * - Puppeteer installé (npm install puppeteer)
 * - Chrome/Chromium disponible sur le serveur
 * - Plus de ressources (CPU, RAM) que les requêtes HTTP simples
 * - Peut être lent (10-30 secondes pour générer les cookies)
 */

import { logger } from '@/lib/logger'

export interface CookieGenerationResult {
  success: boolean
  cookies?: string
  error?: string
  details?: {
    cf_clearance?: string
    datadome?: string
    access_token_web?: string
  }
}

/**
 * Génère les cookies Vinted via Puppeteer (navigateur headless)
 * Cette fonction simule un vrai navigateur pour obtenir les cookies Cloudflare
 * 
 * ⚠️ Nécessite Puppeteer installé : npm install puppeteer
 * ⚠️ Nécessite Chrome/Chromium sur le serveur
 */
export async function generateVintedCookiesWithPuppeteer(): Promise<CookieGenerationResult> {
  try {
    // Vérifier si Puppeteer est disponible
    // Essayer d'abord puppeteer-extra (meilleur pour contourner les détections)
    // Utiliser dynamic import pour éviter les problèmes de compilation Next.js
    let puppeteer: any
    let useStealth = false
    
    try {
      // Dynamic import pour éviter les problèmes de compilation Next.js
      const puppeteerExtraModule = await import('puppeteer-extra')
      const StealthPluginModule = await import('puppeteer-extra-plugin-stealth')
      const puppeteerExtra = puppeteerExtraModule.default || puppeteerExtraModule
      const StealthPlugin = StealthPluginModule.default || StealthPluginModule
      puppeteerExtra.use(StealthPlugin())
      puppeteer = puppeteerExtra
      useStealth = true
      logger.info('✅ Utilisation de puppeteer-extra avec plugin stealth')
    } catch (error) {
      // Fallback sur puppeteer standard
      try {
        const puppeteerModule = await import('puppeteer')
        puppeteer = puppeteerModule.default || puppeteerModule
        logger.info('✅ Utilisation de puppeteer standard')
      } catch (error2) {
        return {
          success: false,
          error: 'Puppeteer not installed',
          details: {
            message: 'Install puppeteer: npm install puppeteer puppeteer-extra puppeteer-extra-plugin-stealth'
          }
        }
      }
    }

    logger.info('🌐 Démarrage du navigateur headless pour générer les cookies...')

    // Lancer le navigateur avec des options anti-détection
    // Puppeteer trouve automatiquement Chrome s'il est installé via `npx puppeteer browsers install chrome`
    // Sinon, utiliser l'exécutable Chromium du système si disponible (pour Vercel/GitHub Actions)
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined
    
    if (executablePath) {
      logger.info(`🔧 Utilisation de l'exécutable Chrome: ${executablePath}`)
    } else {
      logger.info('🔧 Utilisation de Chrome installé par Puppeteer (cache automatique)')
    }
    
    const browser = await puppeteer.launch({
      headless: true,
      executablePath, // Utiliser Chromium système si disponible
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-dev-shm-usage',
        '--window-size=1920,1080',
        '--disable-gpu', // Important pour les serveurs sans GPU
      ],
    })

    try {
      const page = await browser.newPage()

      // Masquer les signaux d'automatisation
      await page.evaluateOnNewDocument(() => {
        // Masquer webdriver
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
        })

        // Masquer chrome
        (window as any).chrome = {
          runtime: {},
        }

        // Permissions
        const originalQuery = (window.navigator as any).permissions.query
        ;(window.navigator as any).permissions.query = (parameters: any) =>
          parameters.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
            : originalQuery(parameters)

        // Plugins
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5],
        })

        // Languages
        Object.defineProperty(navigator, 'languages', {
          get: () => ['fr-FR', 'fr', 'en-US', 'en'],
        })
      })

      // Définir un User-Agent réaliste
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
      )

      // Définir la viewport
      await page.setViewport({ width: 1920, height: 1080 })

      logger.info('🌐 Navigation vers Vinted...')

      // Naviguer vers Vinted et attendre que Cloudflare passe
      await page.goto('https://www.vinted.fr', {
        waitUntil: 'networkidle2',
        timeout: 30000,
      })

      // Attendre un peu pour que Cloudflare génère les cookies
      await page.waitForTimeout(3000)

      // Vérifier si on est bloqué par Cloudflare
      const title = await page.title()
      if (title.includes('Just a moment') || title.includes('Checking your browser')) {
        logger.info('⏳ Cloudflare challenge détecté, attente...')
        
        // Attendre que le challenge soit résolu (max 30 secondes)
        try {
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 })
        } catch (error) {
          logger.warn('⚠️ Timeout lors de l\'attente du challenge Cloudflare')
        }
      }

      // Essayer de se connecter si des credentials sont fournis (optionnel)
      // Cela permettra d'obtenir access_token_web
      const vintedEmail = process.env.VINTED_EMAIL
      const vintedPassword = process.env.VINTED_PASSWORD
      
      if (vintedEmail && vintedPassword) {
        try {
          logger.info('🔐 Tentative de connexion pour obtenir access_token_web...')
          
          // Cliquer sur le bouton de connexion
          await page.waitForSelector('a[href*="login"], button:has-text("Se connecter"), button:has-text("Log in")', { timeout: 5000 }).catch(() => null)
          const loginButton = await page.$('a[href*="login"], button:has-text("Se connecter"), button:has-text("Log in")')
          if (loginButton) {
            await loginButton.click()
            await page.waitForTimeout(2000)
          }
          
          // Remplir le formulaire de connexion
          await page.waitForSelector('input[type="email"], input[name="email"], input[id*="email"]', { timeout: 5000 })
          await page.type('input[type="email"], input[name="email"], input[id*="email"]', vintedEmail, { delay: 100 })
          await page.waitForTimeout(500)
          
          await page.waitForSelector('input[type="password"], input[name="password"], input[id*="password"]', { timeout: 5000 })
          await page.type('input[type="password"], input[name="password"], input[id*="password"]', vintedPassword, { delay: 100 })
          await page.waitForTimeout(500)
          
          // Soumettre le formulaire
          const submitButton = await page.$('button[type="submit"], button:has-text("Se connecter"), button:has-text("Log in")')
          if (submitButton) {
            await submitButton.click()
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 })
            await page.waitForTimeout(3000) // Attendre que les cookies soient générés
            logger.info('✅ Connexion réussie, access_token_web devrait être disponible')
          }
        } catch (error) {
          logger.warn('⚠️ Échec de la connexion automatique (non bloquant):', error instanceof Error ? error.message : 'Unknown error')
          logger.warn('💡 Les cookies Cloudflare sont toujours générés, mais access_token_web sera manquant')
        }
      } else {
        logger.info('ℹ️ VINTED_EMAIL et VINTED_PASSWORD non configurés - connexion automatique désactivée')
        logger.info('💡 Pour obtenir access_token_web, configurez VINTED_EMAIL et VINTED_PASSWORD dans .env.local')
      }

      // Récupérer tous les cookies
      const cookies = await page.cookies('https://www.vinted.fr')
      
      logger.info(`🍪 ${cookies.length} cookies récupérés`)

      // Construire la chaîne de cookies
      const cookieString = cookies
        .map(cookie => `${cookie.name}=${cookie.value}`)
        .join('; ')

      // Vérifier qu'on a les cookies essentiels
      const hasCfClearance = cookies.some(c => c.name === 'cf_clearance')
      const hasDatadome = cookies.some(c => c.name.includes('datadome'))
      const hasAccessToken = cookies.some(c => c.name === 'access_token_web')

      if (!hasAccessToken) {
        logger.warn('⚠️ access_token_web non trouvé dans les cookies générés')
        logger.warn('💡 Les cookies Cloudflare sont générés, mais vous devrez vous connecter manuellement')
        logger.warn('💡 Solution: Utiliser les cookies depuis votre navigateur pour obtenir access_token_web')
      } else {
        logger.info('✅ access_token_web trouvé dans les cookies générés')
      }
      
      if (!hasCfClearance && !hasDatadome) {
        logger.warn('⚠️ Aucun cookie Cloudflare trouvé (cf_clearance, datadome)')
        logger.warn('💡 Cloudflare peut ne pas avoir généré de challenge, ou les cookies ne sont pas nécessaires')
      } else {
        logger.info(`✅ Cookies Cloudflare trouvés: ${hasCfClearance ? 'cf_clearance' : ''} ${hasDatadome ? 'datadome' : ''}`)
      }

      await browser.close()

      logger.info('✅ Cookies générés avec succès')

      return {
        success: true,
        cookies: cookieString,
        details: {
          cf_clearance: cookies.find(c => c.name === 'cf_clearance')?.value,
          datadome: cookies.find(c => c.name.includes('datadome'))?.value,
          access_token_web: cookies.find(c => c.name === 'access_token_web')?.value,
        }
      }

    } catch (error) {
      await browser.close()
      throw error
    }

  } catch (error) {
    logger.error('❌ Erreur lors de la génération des cookies', error as Error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: {
        message: 'Failed to generate cookies with Puppeteer'
      }
    }
  }
}

/**
 * Génère les cookies et les sauvegarde automatiquement en DB
 * Utile pour GitHub Actions ou Vercel
 */
export async function generateAndSaveCookies(): Promise<CookieGenerationResult> {
  const result = await generateVintedCookiesWithPuppeteer()

  if (result.success && result.cookies) {
    try {
      // Sauvegarder en DB via l'API
      const API_SECRET = process.env.API_SECRET || 'vinted_scraper_secure_2024'
      const API_BASE_URL = process.env.API_BASE_URL || process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}` 
        : 'http://localhost:3000'

      const response = await fetch(`${API_BASE_URL}/api/v1/admin/vinted/save-cookies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_SECRET
        },
        body: JSON.stringify({
          fullCookies: result.cookies,
          notes: 'Auto-generated via Puppeteer'
        })
      })

      if (response.ok) {
        logger.info('✅ Cookies sauvegardés en base de données')
      } else {
        logger.warn('⚠️ Erreur lors de la sauvegarde des cookies en DB')
      }
    } catch (error) {
      logger.warn('⚠️ Erreur lors de la sauvegarde des cookies', error as Error)
      // Ne pas faire échouer la génération si la sauvegarde échoue
    }
  }

  return result
}

