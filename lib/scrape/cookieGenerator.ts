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

// Types pour les services de captcha
interface CaptchaSolver {
  solveTurnstile(page: Page, siteKey?: string): Promise<string>
}

// Service 2Captcha pour résoudre les captchas automatiquement
class CaptchaService implements CaptchaSolver {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async solveTurnstile(page: Page, siteKey?: string): Promise<string> {
    try {
      logger.info('🤖 Résolution automatique du captcha avec 2Captcha...')

      // Attendre que le captcha soit chargé
      await page.waitForSelector('[data-sitekey]', { timeout: 10000 })

      // Récupérer le sitekey
      const siteKeyElement = await page.$('[data-sitekey]')
      const actualSiteKey = siteKey || await page.evaluate(el => el.getAttribute('data-sitekey'), siteKeyElement)

      // Résoudre le captcha
      const response = await fetch('http://2captcha.com/in.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          key: this.apiKey,
          method: 'turnstile',
          sitekey: actualSiteKey,
          pageurl: page.url(),
          json: '1'
        })
      })

      const data = await response.json()
      if (data.status !== 1) {
        throw new Error(`Erreur 2Captcha: ${data.request}`)
      }

      const captchaId = data.request
      logger.info(`✅ Captcha soumis (ID: ${captchaId}), attente de résolution...`)

      // Attendre la résolution (polling)
      for (let i = 0; i < 60; i++) { // 60 tentatives = 2 minutes max
        await new Promise(resolve => setTimeout(resolve, 2000))

        const resultResponse = await fetch(`http://2captcha.com/res.php?key=${this.apiKey}&action=get&id=${captchaId}&json=1`)
        const result = await resultResponse.json()

        if (result.status === 1) {
          logger.info('🎉 Captcha résolu automatiquement !')
          return result.request
        }

        if (result.request === 'NOT_READY') {
          continue
        }

        throw new Error(`Erreur résolution captcha: ${result.request}`)
      }

      throw new Error('Timeout résolution captcha')
    } catch (error) {
      logger.error('❌ Échec résolution captcha automatique:', error)
      throw error
    }
  }
}

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
    let executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined
    
    // Vérifier si le chemin existe et est exécutable
    if (executablePath) {
      const fs = await import('fs')
      const { execSync } = await import('child_process')
      
      if (!fs.existsSync(executablePath)) {
        logger.warn(`⚠️ PUPPETEER_EXECUTABLE_PATH configuré mais fichier introuvable: ${executablePath}`)
        logger.info('💡 Tentative avec Chrome installé par Puppeteer...')
        executablePath = undefined
      } else {
        // Vérifier que le fichier est exécutable
        try {
          fs.accessSync(executablePath, fs.constants.X_OK)
          logger.info(`🔧 Utilisation de l'exécutable Chrome: ${executablePath}`)
          
          // Tester que Chromium peut démarrer (version)
          try {
            const version = execSync(`"${executablePath}" --version`, { timeout: 5000, encoding: 'utf-8' })
            logger.info(`✅ Chromium version: ${version.trim()}`)
          } catch (versionError) {
            logger.warn(`⚠️ Impossible d'obtenir la version de Chromium: ${versionError}`)
          }
        } catch (accessError) {
          logger.warn(`⚠️ Chromium trouvé mais non exécutable: ${executablePath}`)
          logger.info('💡 Tentative avec Chrome installé par Puppeteer...')
          executablePath = undefined
        }
      }
    } else {
      logger.info('🔧 Utilisation de Chrome installé par Puppeteer (cache automatique)')
    }
    
    // Arguments optimisés pour Fly.io - retirer --single-process qui peut causer des problèmes CDP
    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-dev-shm-usage',
      '--window-size=1920,1080',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-breakpad',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-domain-reliability',
      '--disable-features=AudioServiceOutOfProcess',
      '--disable-hang-monitor',
      '--disable-ipc-flooding-protection',
      '--disable-notifications',
      '--disable-offer-store-unmasked-wallet-cards',
      '--disable-popup-blocking',
      '--disable-print-preview',
      '--disable-prompt-on-repost',
      '--disable-renderer-backgrounding',
      '--disable-setuid-sandbox',
      '--disable-speech-api',
      '--disable-sync',
      '--disable-translate',
      '--disable-wake-on-wifi',
      '--hide-scrollbars',
      '--ignore-gpu-blacklist',
      '--metrics-recording-only',
      '--mute-audio',
      '--no-default-browser-check',
      '--no-first-run',
      '--no-pings',
      '--no-zygote', // Important pour Docker/Fly.io
      '--use-gl=swiftshader',
      '--disable-software-rasterizer',
    ]
    
    logger.info(`🔧 Lancement de Chromium avec ${launchArgs.length} arguments...`)
    
    const browser = await puppeteer.launch({
      headless: 'new', // Utiliser le nouveau mode headless
      executablePath, // Utiliser Chromium système si disponible
      protocolTimeout: 300000, // 5 minutes (augmenté pour Fly.io - Chromium peut prendre du temps à démarrer)
      timeout: 120000, // 2 minutes pour le lancement
      args: launchArgs,
      ignoreDefaultArgs: ['--disable-extensions'], // On gère nous-mêmes
    })
    
    // Vérifier que le navigateur est bien connecté
    try {
      const pages = await browser.pages()
      logger.info(`✅ Navigateur lancé avec succès, ${pages.length} page(s) ouverte(s)`)
    } catch (browserError) {
      logger.error(`❌ Erreur lors de la vérification du navigateur: ${browserError}`)
      await browser.close().catch(() => {})
      throw browserError
    }

    try {
      // Créer une nouvelle page avec un timeout explicite
      logger.info('📄 Création d\'une nouvelle page...')
      const page = await Promise.race([
        browser.newPage(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout lors de la création de la page')), 30000)
        )
      ]) as any
      
      logger.info('✅ Page créée avec succès')

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
          
          // Chercher le lien/bouton de connexion sur la page d'accueil
          logger.debug('🔍 Recherche du lien de connexion sur la page d\'accueil...')
          
          // Essayer plusieurs méthodes pour trouver le bouton de connexion
          let loginLink = null
          
          // Méthode 1: Chercher un lien avec href contenant "login" ou "signin"
          loginLink = await page.$('a[href*="login" i], a[href*="signin" i], a[href*="connexion" i]')
          
          // Méthode 2: Chercher avec XPath par texte
          if (!loginLink) {
            const loginLinks = await page.$x('//a[contains(text(), "Se connecter") or contains(text(), "Log in") or contains(text(), "Connexion")]')
            if (loginLinks.length > 0) {
              loginLink = loginLinks[0]
            }
          }
          
          // Méthode 3: Chercher un bouton avec texte de connexion
          if (!loginLink) {
            const loginButtons = await page.$x('//button[contains(text(), "Se connecter") or contains(text(), "Log in")]')
            if (loginButtons.length > 0) {
              loginLink = loginButtons[0]
            }
          }
          
          if (loginLink) {
            logger.debug('✅ Lien de connexion trouvé, clic...')
            await loginLink.click()
            await page.waitForTimeout(3000) // Attendre que le modal/page de connexion s'ouvre
          } else {
            // Si pas de lien trouvé, essayer d'aller directement sur une URL de connexion possible
            logger.debug('⚠️ Lien de connexion non trouvé, tentative avec URL directe...')
            const possibleLoginUrls = [
              'https://www.vinted.fr/auth/login',
              'https://www.vinted.fr/login',
              'https://www.vinted.fr/signin'
            ]
            
            let loginPageFound = false
            for (const url of possibleLoginUrls) {
              try {
                await page.goto(url, { waitUntil: 'networkidle2', timeout: 10000 })
                const currentUrl = page.url()
                if (currentUrl.includes('login') || currentUrl.includes('signin') || currentUrl.includes('auth')) {
                  loginPageFound = true
                  logger.debug(`✅ Page de connexion trouvée: ${url}`)
                  break
                }
              } catch (e) {
                continue
              }
            }
            
            if (!loginPageFound) {
              logger.warn('⚠️ Impossible de trouver la page de connexion automatiquement')
              logger.warn('💡 La connexion automatique sera ignorée, mais les cookies Cloudflare seront toujours générés')
              throw new Error('Page de connexion introuvable')
            }
            
            await page.waitForTimeout(2000) // Attendre que la page se charge
          }
          
          // Attendre que le formulaire soit visible (peut être dans un modal)
          await page.waitForTimeout(2000)
          
          // Prendre une capture d'écran pour debug (optionnel)
          if (process.env.DEBUG_PUPPETEER === 'true') {
            await page.screenshot({ path: 'debug-login-page.png', fullPage: true })
            logger.debug('📸 Capture d\'écran sauvegardée: debug-login-page.png')
          }
          
          // Remplir le champ email (essayer plusieurs sélecteurs avec plus de patience)
          const emailSelectors = [
            'input[type="email"]',
            'input[name="email"]',
            'input[name="login"]',
            'input[id*="email" i]',
            'input[id*="login" i]',
            'input[placeholder*="email" i]',
            'input[placeholder*="Email" i]',
            'input[autocomplete="email"]',
            'input[autocomplete="username"]',
            'form input[type="text"]', // Fallback: premier input text dans un form
            'input[type="text"]' // Dernier fallback
          ]
          
          let emailInput = null
          for (const selector of emailSelectors) {
            try {
              await page.waitForSelector(selector, { timeout: 3000, visible: true })
              emailInput = await page.$(selector)
              if (emailInput) {
                const isVisible = await emailInput.isIntersectingViewport()
                if (isVisible) {
                  logger.debug(`✅ Champ email trouvé avec sélecteur: ${selector}`)
                  break
                }
              }
            } catch (e) {
              continue
            }
          }
          
          if (emailInput) {
            await emailInput.click({ clickCount: 3 }) // Sélectionner tout
            await emailInput.type(vintedEmail, { delay: 100 })
            await page.waitForTimeout(500)
          } else {
            // Debug: lister tous les inputs disponibles
            const allInputs = await page.$$eval('input', inputs => 
              inputs.map(input => ({
                type: input.type,
                name: input.name,
                id: input.id,
                placeholder: input.placeholder,
                autocomplete: input.autocomplete
              }))
            )
            logger.warn('⚠️ Champ email introuvable. Inputs disponibles:', JSON.stringify(allInputs, null, 2))
            throw new Error('Champ email introuvable')
          }
          
          // Remplir le champ password
          const passwordSelectors = [
            'input[type="password"]',
            'input[name="password"]',
            'input[id*="password" i]',
            'input[placeholder*="password" i]',
            'input[placeholder*="Password" i]',
            'input[autocomplete="current-password"]',
            'input[autocomplete="password"]'
          ]
          
          let passwordInput = null
          for (const selector of passwordSelectors) {
            try {
              await page.waitForSelector(selector, { timeout: 3000, visible: true })
              passwordInput = await page.$(selector)
              if (passwordInput) {
                const isVisible = await passwordInput.isIntersectingViewport()
                if (isVisible) {
                  logger.debug(`✅ Champ password trouvé avec sélecteur: ${selector}`)
                  break
                }
              }
            } catch (e) {
              continue
            }
          }
          
          if (passwordInput) {
            await passwordInput.type(vintedPassword, { delay: 100 })
            await page.waitForTimeout(500)
          } else {
            throw new Error('Champ password introuvable')
          }
          
          // Chercher le bouton de soumission avec XPath (plus fiable que :has-text)
          const submitButtonXPath = '//button[contains(text(), "Se connecter") or contains(text(), "Log in") or contains(text(), "Connexion")]'
          const submitButtons = await page.$x(submitButtonXPath)
          
          if (submitButtons.length > 0) {
            await submitButtons[0].click()
          } else {
            // Fallback: chercher un bouton submit standard
            const submitButton = await page.$('button[type="submit"]')
            if (submitButton) {
              await submitButton.click()
            } else {
              throw new Error('Bouton de soumission introuvable')
            }
          }
          
          // Attendre la navigation après connexion
          try {
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 })
            logger.debug('✅ Navigation détectée après connexion')
          } catch (e) {
            logger.debug('⚠️ Pas de navigation détectée, attente...')
            await page.waitForTimeout(5000) // Attendre plus longtemps si pas de navigation
          }
          
          // Vérifier qu'on est bien connecté (URL devrait changer ou avoir des cookies access_token_web)
          const currentUrl = page.url()
          logger.debug(`📍 URL actuelle après connexion: ${currentUrl}`)
          
          // Attendre que les cookies soient générés
          await page.waitForTimeout(3000)
          
          // Vérifier si access_token_web est présent dans les cookies
          // Attendre un peu plus pour que les cookies soient bien générés
          await page.waitForTimeout(2000)
          
          const cookiesAfterLogin = await page.cookies('https://www.vinted.fr')
          const hasAccessToken = cookiesAfterLogin.some(c => c.name === 'access_token_web')
          const accessTokenCookie = cookiesAfterLogin.find(c => c.name === 'access_token_web')
          
          if (hasAccessToken && accessTokenCookie) {
            logger.info('✅ Connexion réussie, access_token_web trouvé dans les cookies')
            logger.debug(`🔑 access_token_web: ${accessTokenCookie.value.substring(0, 20)}...`)
            
            // Vérifier aussi les autres cookies importants
            const hasUserId = cookiesAfterLogin.some(c => c.name === 'user_id')
            const hasRefreshToken = cookiesAfterLogin.some(c => c.name === 'refresh_token_web')
            
            if (hasUserId) {
              logger.debug('✅ user_id trouvé dans les cookies')
            } else {
              logger.warn('⚠️ user_id non trouvé dans les cookies')
            }
            
            if (hasRefreshToken) {
              logger.debug('✅ refresh_token_web trouvé dans les cookies')
            } else {
              logger.warn('⚠️ refresh_token_web non trouvé dans les cookies')
            }
          } else {
            logger.warn('⚠️ Connexion effectuée mais access_token_web non trouvé dans les cookies')
            logger.warn('💡 Les cookies peuvent être générés après quelques secondes supplémentaires')
            logger.debug(`📋 Cookies disponibles: ${cookiesAfterLogin.map(c => c.name).join(', ')}`)
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

/**
 * Version améliorée qui tente la connexion automatique avec résolution de captcha
 */
/**
 * Fonction interne pour gérer la connexion avec le navigateur
 */
async function performAutoLoginWithBrowser(
  email: string,
  password: string,
  captchaApiKey?: string
): Promise<CookieGenerationResult> {
  // Importer Puppeteer dynamiquement
  let puppeteer: any
  let useStealth = false

  try {
    const puppeteerExtraModule = await import('puppeteer-extra')
    const StealthPluginModule = await import('puppeteer-extra-plugin-stealth')
    const puppeteerExtra = puppeteerExtraModule.default || puppeteerExtraModule
    const StealthPlugin = StealthPluginModule.default || StealthPluginModule
    puppeteerExtra.use(StealthPlugin())
    puppeteer = puppeteerExtra
    useStealth = true
    logger.info('✅ Utilisation de puppeteer-extra avec plugin stealth')
  } catch (error) {
    const puppeteerModule = await import('puppeteer')
    puppeteer = puppeteerModule.default || puppeteerModule
    logger.info('✅ Utilisation de puppeteer standard')
  }

  // Configuration du navigateur
  let executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined
  if (executablePath) {
    const fs = await import('fs')
    if (!fs.existsSync(executablePath)) {
      executablePath = undefined
    }
  }

  if (executablePath) {
    logger.info(`🔧 Utilisation de l'exécutable Chrome: ${executablePath}`)
  } else {
    logger.info('🔧 Recherche automatique de Chrome...')
  }

  // Lancer le navigateur
  let browser: any
  let result: CookieGenerationResult | null = null
  let browserError: Error | null = null
  
  try {
    // Arguments optimisés pour Fly.io (même que la fonction principale)
    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--disable-extensions',
      '--disable-background-networking',
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ]
    
    logger.info(`🔧 Lancement de Chromium pour login avec ${launchArgs.length} arguments...`)
    
    browser = await puppeteer.launch({
      headless: true,
      executablePath,
      protocolTimeout: 300000, // 5 minutes (augmenté pour Fly.io)
      timeout: 120000, // 2 minutes pour le lancement
      args: launchArgs,
      ignoreDefaultArgs: ['--disable-extensions'],
    })
    
    // Vérifier la connexion
    try {
      const pages = await browser.pages()
      logger.info(`✅ Navigateur lancé avec succès, ${pages.length} page(s) ouverte(s)`)
    } catch (browserError) {
      logger.error(`❌ Erreur lors de la vérification du navigateur: ${browserError}`)
      await browser.close().catch(() => {})
      throw browserError
    }
  
  try {
      const page = await browser.newPage()

      // Intercepter les requêtes pour voir les tokens
      let accessTokenFound = false
      let refreshTokenFound = false

      page.on('response', (response: any) => {
        const url = response.url()
        if (url.includes('vinted') && response.headers()['set-cookie']) {
          const cookies = response.headers()['set-cookie']
          if (typeof cookies === 'string' && cookies.includes('access_token_web')) {
            accessTokenFound = true
            logger.info('🎯 Access token détecté dans la réponse')
          }
          if (typeof cookies === 'string' && cookies.includes('refresh_token_web')) {
            refreshTokenFound = true
            logger.info('🎯 Refresh token détecté dans la réponse')
          }
        }
      })

      logger.info('🌐 Navigation vers Vinted...')
      await page.goto('https://www.vinted.fr', { waitUntil: 'networkidle2', timeout: 30000 })

      // Attendre que Cloudflare challenge soit résolu
      logger.info('⏳ Attente de la résolution Cloudflare...')
      await page.waitForTimeout(3000)

      // Chercher le lien de connexion
      logger.info('🔍 Recherche du lien de connexion...')
      const loginSelectors = [
        'a[href*="login"]',
        'a[href*="connexion"]',
        'button:has-text("Se connecter")',
        'button:has-text("Connexion")',
        'button:has-text("Login")',
        '[data-testid*="login"]',
        '[data-testid*="connexion"]'
      ]

      let loginClicked = false
      for (const selector of loginSelectors) {
        try {
          if (selector.includes(':has-text(')) {
            // Pour les sélecteurs avec :has-text (pas supporté par Puppeteer)
            const elements = await page.$$('a, button')
            for (const element of elements) {
              const text = await page.evaluate(el => el.textContent?.trim(), element)
              if (text && (
                text.toLowerCase().includes('se connecter') ||
                text.toLowerCase().includes('connexion') ||
                text.toLowerCase().includes('login')
              )) {
                await element.click()
                loginClicked = true
                logger.info('✅ Lien de connexion cliqué')
                break
              }
            }
          } else {
            await page.waitForSelector(selector, { timeout: 2000 })
            await page.click(selector)
            loginClicked = true
            logger.info('✅ Lien de connexion cliqué')
          }
          break
        } catch (e) {
          continue
        }
      }

      if (!loginClicked) {
        // Essayer les URLs directes (y compris la page signup qui charge le formulaire dynamiquement)
        logger.info('⚠️ Lien non trouvé, tentative URL directe...')
        const loginUrls = [
          'https://www.vinted.fr/member/signup/select_type?ref_url=%2F',
          'https://www.vinted.fr/auth/login',
          'https://www.vinted.fr/login'
        ]
        for (const url of loginUrls) {
          try {
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 10000 })
            logger.info(`✅ Page de connexion chargée: ${url}`)
            loginClicked = true
            break
          } catch (e) {
            continue
          }
        }
      }

      if (!loginClicked) {
        throw new Error('Impossible d\'accéder à la page de connexion')
      }

      // Attendre que la page soit complètement chargée
      logger.info('⏳ Attente du chargement complet de la page...')
      await page.waitForTimeout(3000)

      // Si on est sur la page signup/select_type, cliquer sur le lien email pour charger le formulaire
      logger.info('🔍 Vérification si le formulaire doit être déclenché...')
      const currentUrl = page.url()
      if (currentUrl.includes('signup/select_type') || currentUrl.includes('select_type')) {
        logger.info('📧 Page de sélection détectée, clic sur le lien email...')
        
        // Chercher et cliquer sur le lien "connecte-toi avec ton e-mail" ou "email"
        const emailLinkSelectors = [
          'a[href*="email"]',
          'a[href*="login"]',
          'a[href*="signin"]',
          'a:has-text("e-mail")',
          'a:has-text("email")',
          'a:has-text("E-mail")',
          'button:has-text("e-mail")',
          'button:has-text("email")',
          '[data-testid*="email"]',
          '[data-testid*="login"]',
          'text=connecte-toi avec ton e-mail',
          'text=connecte-toi avec ton E-mail',
          'text=Ou connecte-toi avec ton e-mail',
          'text=Ou connecte-toi avec ton E-mail',
          'text=Se connecter'
        ]

        let emailLinkClicked = false
        for (const selector of emailLinkSelectors) {
          try {
            if (selector.startsWith('text=')) {
              // Utiliser XPath pour le texte
              const text = selector.replace('text=', '')
              // XPath pour trouver un lien ou bouton contenant ce texte
              const xpathQueries = [
                `//a[contains(text(), '${text}')]`,
                `//button[contains(text(), '${text}')]`,
                `//*[contains(text(), '${text}') and (self::a or self::button)]`,
                `//a[contains(., '${text}')]`,
                `//button[contains(., '${text}')]`
              ]
              
              for (const xpath of xpathQueries) {
                try {
                  const elements = await page.$x(xpath)
                  if (elements.length > 0) {
                    const element = elements[0]
                    const isVisible = await page.evaluate((el) => {
                      const style = window.getComputedStyle(el)
                      return style.display !== 'none' && 
                             style.visibility !== 'hidden' && 
                             style.opacity !== '0'
                    }, element)
                    
                    if (isVisible) {
                      await element.click()
                      emailLinkClicked = true
                      logger.info(`✅ Lien email cliqué via XPath texte: ${text}`)
                      break
                    }
                  }
                } catch (e) {
                  continue
                }
              }
              
              if (emailLinkClicked) break
            } else {
              await page.waitForSelector(selector, { timeout: 3000 })
              await page.click(selector)
              emailLinkClicked = true
              logger.info(`✅ Lien email cliqué via sélecteur: ${selector}`)
              break
            }
          } catch (e) {
            continue
          }
        }

        // Si pas trouvé, essayer de trouver tous les liens et chercher celui qui contient "email"
        if (!emailLinkClicked) {
          logger.info('🔍 Recherche alternative du lien email...')
          try {
            // Méthode 1: Chercher tous les liens <a> et vérifier leur contenu
            const allLinks = await page.$$('a')
            logger.info(`🔍 ${allLinks.length} liens <a> trouvés sur la page`)
            
            for (const link of allLinks) {
              const linkInfo = await page.evaluate((el) => {
                return {
                  text: el.textContent?.trim() || '',
                  innerHTML: el.innerHTML || '',
                  href: el.getAttribute('href') || '',
                  className: el.getClassName?.() || '',
                  visible: window.getComputedStyle(el).display !== 'none'
                }
              }, link)
              
              logger.debug(`   Lien: "${linkInfo.text.substring(0, 50)}" (href: ${linkInfo.href.substring(0, 50)}, visible: ${linkInfo.visible})`)
              
              // Chercher "e-mail" dans le texte ou le HTML
              if (linkInfo.visible && (
                linkInfo.text.toLowerCase().includes('e-mail') ||
                linkInfo.text.toLowerCase().includes('email') ||
                linkInfo.innerHTML.toLowerCase().includes('e-mail') ||
                linkInfo.innerHTML.toLowerCase().includes('email') ||
                linkInfo.text.toLowerCase().includes('connecte-toi')
              )) {
                await link.click()
                emailLinkClicked = true
                logger.info(`✅ Lien email cliqué via recherche alternative: "${linkInfo.text.substring(0, 50)}"`)
                break
              }
            }
            
            // Méthode 2: Utiliser XPath pour trouver le lien dans le texte "Ou connecte-toi avec ton e-mail"
            if (!emailLinkClicked) {
              logger.info('🔍 Recherche XPath du lien "e-mail"...')
              try {
                // XPath pour trouver un lien <a> qui contient "e-mail" ou qui est dans un texte contenant "connecte-toi avec ton e-mail"
                const xpathExpressions = [
                  '//a[contains(text(), "e-mail")]',
                  '//a[contains(text(), "email")]',
                  '//a[contains(., "e-mail")]',
                  '//a[contains(., "email")]',
                  '//text()[contains(., "connecte-toi avec ton e-mail")]/following-sibling::a[1]',
                  '//text()[contains(., "Ou connecte-toi avec ton e-mail")]/following-sibling::a[1]',
                  '//*[contains(text(), "connecte-toi avec ton")]//a[contains(text(), "e-mail")]',
                  '//*[contains(text(), "connecte-toi avec ton")]//a[contains(text(), "email")]'
                ]
                
                for (const xpath of xpathExpressions) {
                  try {
                    const elements = await page.$x(xpath)
                    if (elements.length > 0) {
                      const element = elements[0]
                      const isVisible = await page.evaluate((el) => {
                        const style = window.getComputedStyle(el)
                        return style.display !== 'none' && 
                               style.visibility !== 'hidden' && 
                               style.opacity !== '0'
                      }, element)
                      
                      if (isVisible) {
                        await element.click()
                        emailLinkClicked = true
                        logger.info(`✅ Lien email cliqué via XPath: ${xpath}`)
                        break
                      }
                    }
                  } catch (e) {
                    continue
                  }
                }
              } catch (e) {
                logger.warn('⚠️ Recherche XPath échouée:', e)
              }
            }
            
            // Méthode 3: Chercher dans tous les éléments qui contiennent le texte et trouver le lien enfant
            if (!emailLinkClicked) {
              logger.info('🔍 Recherche dans les conteneurs de texte...')
              try {
                // Chercher un élément qui contient "connecte-toi avec ton e-mail" et trouver le lien à l'intérieur
                const containers = await page.$$('*')
                for (const container of containers) {
                  const containerText = await page.evaluate(el => el.textContent?.toLowerCase() || '', container)
                  if (containerText.includes('connecte-toi avec ton e-mail') || containerText.includes('connecte-toi avec ton email')) {
                    // Chercher un lien <a> dans ce conteneur
                    const linkInContainer = await container.$('a')
                    if (linkInContainer) {
                      const linkText = await page.evaluate(el => el.textContent?.toLowerCase() || '', linkInContainer)
                      if (linkText.includes('e-mail') || linkText.includes('email')) {
                        await linkInContainer.click()
                        emailLinkClicked = true
                        logger.info(`✅ Lien email cliqué dans conteneur: "${linkText}"`)
                        break
                      }
                    }
                  }
                }
              } catch (e) {
                logger.warn('⚠️ Recherche dans conteneurs échouée:', e)
              }
            }
            
          } catch (e) {
            logger.warn('⚠️ Recherche alternative échouée:', e)
          }
        }

        if (emailLinkClicked) {
          logger.info('⏳ Attente du chargement du formulaire email/password...')
          await page.waitForTimeout(3000)
        } else {
          logger.warn('⚠️ Lien email non trouvé, le formulaire peut déjà être visible')
        }
      }

      // Attendre un peu plus pour que le formulaire soit complètement chargé
      await page.waitForTimeout(2000)

      // Prendre une capture d'écran pour debug
      if (process.env.DEBUG_PUPPETEER === 'true' || process.env.DEBUG_PUPPETEER === '1') {
        await page.screenshot({ path: 'debug-login-page.png', fullPage: true })
        logger.info('📸 Capture d\'écran sauvegardée: debug-login-page.png')
      }

      // Vérifier s'il y a des iframes (le formulaire peut être dans un iframe)
      logger.info('🔍 Recherche d\'iframes contenant le formulaire...')
      const frames = page.frames()
      logger.info(`📋 ${frames.length} frame(s) trouvé(s) sur la page`)

      // Chercher le captcha Cloudflare Turnstile (peut bloquer l'affichage du formulaire)
      logger.info('🔍 Recherche du captcha...')
      const captchaSelectors = [
        '[data-sitekey]',
        '.cf-turnstile',
        '#cf-chl-widget',
        '[class*="turnstile"]',
        'iframe[src*="challenges.cloudflare.com"]',
        'iframe[src*="turnstile"]'
      ]

      let captchaFound = false
      let captchaService: CaptchaService | null = null
      let captchaFrame: any = null

      // Chercher le captcha dans la page principale et les iframes
      for (const frame of frames) {
        for (const selector of captchaSelectors) {
          try {
            await frame.waitForSelector(selector, { timeout: 2000 })
            captchaFound = true
            captchaFrame = frame
            logger.info(`🎯 Captcha Cloudflare Turnstile détecté dans frame: ${frame.url()}`)

            // Initialiser le service de captcha si disponible
            if (captchaApiKey) {
              captchaService = new CaptchaService(captchaApiKey)
            } else {
              logger.warn('⚠️ Captcha détecté mais CAPTCHA_API_KEY non configuré')
              logger.info('💡 Ajoutez CAPTCHA_API_KEY pour résolution automatique')
              logger.info('💡 Service recommandé: https://2captcha.com')
            }
            break
          } catch (e) {
            continue
          }
        }
        if (captchaFound) break
      }

      // Résoudre le captcha si possible (IMPORTANT: doit être fait AVANT de chercher les champs)
      if (captchaFound && captchaService) {
        try {
          logger.info('🤖 Résolution du captcha en cours...')
          const captchaToken = await captchaService.solveTurnstile(captchaFrame || page)
          
          // Injecter le token dans le formulaire (dans la page principale ou l'iframe)
          await page.evaluate((token) => {
            const input = document.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement
            if (input) {
              input.value = token
              input.dispatchEvent(new Event('change', { bubbles: true }))
            }
          }, captchaToken)
          
          // Aussi dans les iframes
          for (const frame of frames) {
            try {
              await frame.evaluate((token) => {
                const input = document.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement
                if (input) {
                  input.value = token
                  input.dispatchEvent(new Event('change', { bubbles: true }))
                }
              }, captchaToken)
            } catch (e) {
              // Ignorer
            }
          }
          
          logger.info('✅ Token captcha injecté')
          
          // Attendre que le formulaire apparaisse après résolution du captcha
          logger.info('⏳ Attente de l\'apparition du formulaire après résolution du captcha...')
          await page.waitForTimeout(3000)
        } catch (error) {
          logger.warn('⚠️ Échec résolution captcha, tentative sans...', error)
        }
      } else if (captchaFound && !captchaService) {
        logger.warn('⚠️ Captcha détecté mais pas de service configuré')
        logger.warn('⚠️ Le formulaire peut ne pas apparaître tant que le captcha n\'est pas résolu')
        logger.info('💡 Attente supplémentaire pour voir si le formulaire apparaît...')
        await page.waitForTimeout(5000)
      }

      // Attendre que le formulaire soit complètement chargé
      // Attendre que le formulaire soit complètement chargé (chargement dynamique)
      logger.info('⏳ Attente du chargement dynamique du formulaire email/password...')
      
      // Attendre que les champs email et password apparaissent
      let emailInputFound = false
      let passwordInputFound = false
      
      for (let attempt = 0; attempt < 15; attempt++) {
        try {
          const emailInputs = await page.$$('input[type="email"], input[name*="email" i], input[name*="login" i], input[placeholder*="email" i]')
          const passwordInputs = await page.$$('input[type="password"]')
          
          if (emailInputs.length > 0) {
            emailInputFound = true
            logger.info(`✅ Champ email détecté (${emailInputs.length} trouvé(s))`)
          }
          if (passwordInputs.length > 0) {
            passwordInputFound = true
            logger.info(`✅ Champ password détecté (${passwordInputs.length} trouvé(s))`)
          }
          
          if (emailInputFound && passwordInputFound) {
            logger.info('✅ Formulaire complet détecté (email + password) !')
            break
          }
        } catch (e) {
          // Continuer
        }
        
        if (attempt < 14) {
          logger.info(`⏳ Tentative ${attempt + 1}/15 - Attente du formulaire... (email: ${emailInputFound ? '✅' : '❌'}, password: ${passwordInputFound ? '✅' : '❌'})`)
          await page.waitForTimeout(2000)
        }
      }

      if (!emailInputFound || !passwordInputFound) {
        logger.warn('⚠️ Formulaire partiellement détecté, continuation quand même...')
      } else {
        logger.info('✅ Formulaire chargé, prêt à remplir les champs')
      }

      await page.waitForTimeout(1000)

      // Remplir les champs de connexion
      logger.info('📝 Remplissage des champs de connexion...')
      
      // Fonction helper pour chercher dans une frame spécifique
      const searchInFrame = async (frame: any, frameName: string) => {
        try {
          const emailSelectors = [
            'input[type="email"]',
            'input[name="email"]',
            'input[name="login"]',
            'input[name="username"]',
            'input[id*="email" i]',
            'input[type="text"]'
          ]
          
          for (const selector of emailSelectors) {
            try {
              await frame.waitForSelector(selector, { timeout: 2000, visible: true })
              const field = await frame.$(selector)
              if (field) {
                const isVisible = await frame.evaluate((el: any) => {
                  const style = window.getComputedStyle(el)
                  return style.display !== 'none' && 
                         style.visibility !== 'hidden' && 
                         style.opacity !== '0' &&
                         !el.disabled
                }, field)
                
                if (isVisible) {
                  logger.info(`✅ Champ email trouvé dans ${frameName}`)
                  return { frame, field, selector }
                }
              }
            } catch (e) {
              continue
            }
          }
        } catch (e) {
          // Ignorer les erreurs de frame
        }
        return null
      }

      // Email - Sélecteurs améliorés avec plus de patience
      const emailSelectors = [
        'input[type="email"]',
        'input[name="email"]',
        'input[name="login"]',
        'input[name="username"]',
        'input[id*="email" i]',
        'input[id*="login" i]',
        'input[id*="username" i]',
        'input[placeholder*="email" i]',
        'input[placeholder*="Email" i]',
        'input[placeholder*="e-mail" i]',
        'input[autocomplete="email"]',
        'input[autocomplete="username"]',
        'input[type="text"]' // Dernier recours
      ]

      let emailFilled = false
      let emailField: any = null

      // D'ABORD chercher dans les iframes (le formulaire est souvent dans un iframe)
      logger.info('🔍 Recherche du formulaire dans les iframes...')
      for (const frame of frames) {
        try {
          const result = await searchInFrame(frame, `iframe (${frame.url()})`)
          if (result) {
            emailField = result.field
            const targetFrame = result.frame
            // Utiliser le frame pour remplir
            await targetFrame.evaluate((el: any) => {
              el.value = ''
              el.dispatchEvent(new Event('input', { bubbles: true }))
              el.dispatchEvent(new Event('change', { bubbles: true }))
            }, emailField)
            await emailField.click()
            await page.waitForTimeout(500)
            await emailField.type(email, { delay: 100 })
            emailFilled = true
            logger.info(`✅ Email saisi dans iframe`)
            break
          }
        } catch (e) {
          // Ignorer les erreurs d'accès aux iframes
          continue
        }
      }

      // PUIS chercher dans la page principale si pas trouvé dans les iframes
      if (!emailFilled) {
        logger.info('🔍 Recherche du formulaire dans la page principale...')
        for (const selector of emailSelectors) {
          try {
            await page.waitForSelector(selector, { timeout: 5000, visible: true })
            emailField = await page.$(selector)
            if (emailField) {
            // Vérifier que le champ est visible et interactif
            const isVisible = await page.evaluate((el) => {
              const style = window.getComputedStyle(el)
              return style.display !== 'none' && 
                     style.visibility !== 'hidden' && 
                     style.opacity !== '0' &&
                     !el.disabled
            }, emailField)

            if (isVisible) {
              // Cliquer d'abord pour activer le champ
              await emailField.click()
              await page.waitForTimeout(500)
              
              // Vider le champ s'il contient quelque chose
              await page.evaluate((el) => {
                el.value = ''
                el.dispatchEvent(new Event('input', { bubbles: true }))
                el.dispatchEvent(new Event('change', { bubbles: true }))
              }, emailField)

              // Taper l'email
              await page.type(selector, email, { delay: 100 })
              emailFilled = true
              logger.info(`✅ Email saisi avec sélecteur: ${selector}`)
              break
            }
          }
        } catch (e) {
          continue
        }
      }

      // Si toujours pas trouvé, essayer de trouver tous les inputs et deviner (dans iframes ET page principale)
      if (!emailFilled) {
        logger.warn('⚠️ Sélecteurs standards échoués, recherche alternative...')
        try {
          // Chercher dans les iframes d'abord
          let allInputs: any[] = []
          for (const frame of frames) {
            try {
              const frameInputs = await frame.$$('input[type="text"], input[type="email"], input[type="password"]')
              logger.info(`🔍 ${frameInputs.length} champs input trouvés dans iframe: ${frame.url()}`)
              allInputs.push(...frameInputs.map(input => ({ input, frame })))
            } catch (e) {
              // Ignorer
            }
          }
          
          // Chercher dans la page principale
          const mainInputs = await page.$$('input[type="text"], input[type="email"], input[type="password"]')
          logger.info(`🔍 ${mainInputs.length} champs input trouvés sur la page principale`)
          allInputs.push(...mainInputs.map(input => ({ input, frame: null })))
          
          logger.info(`🔍 Total: ${allInputs.length} champs input trouvés (iframes + page principale)`)
          
          for (let i = 0; i < allInputs.length; i++) {
            const { input, frame } = allInputs[i]
            const targetContext = frame || page
            
            const inputInfo = await targetContext.evaluate((el: any) => {
              return {
                name: el.getAttribute('name'),
                id: el.getAttribute('id'),
                placeholder: el.getAttribute('placeholder'),
                type: el.getAttribute('type'),
                autocomplete: el.getAttribute('autocomplete'),
                visible: window.getComputedStyle(el).display !== 'none'
              }
            }, input)

            logger.debug(`   Input ${i + 1} ${frame ? '(iframe)' : '(page principale)'}:`, JSON.stringify(inputInfo, null, 2))

            // Si c'est probablement le champ email
            if (inputInfo.visible && (
              inputInfo.name?.toLowerCase().includes('email') ||
              inputInfo.name?.toLowerCase().includes('login') ||
              inputInfo.id?.toLowerCase().includes('email') ||
              inputInfo.placeholder?.toLowerCase().includes('email')
            )) {
              await input.click()
              await page.waitForTimeout(500)
              await targetContext.evaluate((el: any) => { el.value = '' }, input)
              await input.type(email, { delay: 100 })
              emailFilled = true
              logger.info(`✅ Email saisi dans le champ alternatif ${i + 1} ${frame ? '(iframe)' : '(page principale)'}`)
              break
            }
          }
        } catch (e) {
          logger.warn('⚠️ Recherche alternative échouée:', e)
        }
      }

      if (!emailFilled) {
        // Prendre une capture d'écran pour debug
        await page.screenshot({ path: 'debug-email-not-found.png', fullPage: true })
        logger.error('❌ Champ email introuvable après toutes les tentatives')
        logger.info('📸 Capture d\'écran sauvegardée: debug-email-not-found.png')
        throw new Error('Champ email introuvable')
      }

      await page.waitForTimeout(500)

      // Mot de passe - Sélecteurs améliorés
      const passwordSelectors = [
        'input[type="password"]',
        'input[name="password"]',
        'input[name="pass"]',
        'input[id*="password" i]',
        'input[id*="pass" i]',
        'input[placeholder*="mot de passe" i]',
        'input[placeholder*="password" i]',
        'input[placeholder*="Password" i]',
        'input[autocomplete="current-password"]',
        'input[autocomplete="password"]'
      ]

      let passwordFilled = false
      let passwordField: any = null

      for (const selector of passwordSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 5000, visible: true })
          passwordField = await page.$(selector)
          if (passwordField) {
            const isVisible = await page.evaluate((el) => {
              const style = window.getComputedStyle(el)
              return style.display !== 'none' && 
                     style.visibility !== 'hidden' && 
                     style.opacity !== '0' &&
                     !el.disabled
            }, passwordField)

            if (isVisible) {
              await passwordField.click()
              await page.waitForTimeout(500)
              await page.evaluate((el) => {
                el.value = ''
                el.dispatchEvent(new Event('input', { bubbles: true }))
                el.dispatchEvent(new Event('change', { bubbles: true }))
              }, passwordField)
              await page.type(selector, password, { delay: 100 })
              passwordFilled = true
              logger.info(`✅ Mot de passe saisi avec sélecteur: ${selector}`)
              break
            }
          }
        } catch (e) {
          continue
        }
      }

      // Recherche alternative pour le mot de passe
      if (!passwordFilled) {
        logger.warn('⚠️ Sélecteurs standards échoués pour le mot de passe, recherche alternative...')
        try {
          const allPasswordInputs = await page.$$('input[type="password"]')
          logger.info(`🔍 ${allPasswordInputs.length} champs password trouvés`)
          
          for (let i = 0; i < allPasswordInputs.length; i++) {
            const input = allPasswordInputs[i]
            const isVisible = await page.evaluate((el) => {
              const style = window.getComputedStyle(el)
              return style.display !== 'none' && !el.disabled
            }, input)

            if (isVisible) {
              await input.click()
              await page.waitForTimeout(500)
              await page.evaluate((el) => { el.value = '' }, input)
              await input.type(password, { delay: 100 })
              passwordFilled = true
              logger.info(`✅ Mot de passe saisi dans le champ alternatif ${i + 1}`)
              break
            }
          }
        } catch (e) {
          logger.warn('⚠️ Recherche alternative échouée pour password:', e)
        }
      }

      if (!passwordFilled) {
        await page.screenshot({ path: 'debug-password-not-found.png', fullPage: true })
        logger.error('❌ Champ mot de passe introuvable après toutes les tentatives')
        logger.info('📸 Capture d\'écran sauvegardée: debug-password-not-found.png')
        throw new Error('Champ mot de passe introuvable')
      }

      await page.waitForTimeout(500)

      // Cliquer sur le bouton de connexion
      logger.info('🔘 Clic sur le bouton de connexion...')
      const submitSelectors = [
        'button[type="submit"]',
        'button:has-text("Se connecter")',
        'button:has-text("Connexion")',
        'button:has-text("Login")',
        'button:has-text("Sign in")',
        'input[type="submit"]',
        '[data-testid*="submit"]',
        '[data-testid*="login"]'
      ]

      let submitClicked = false
      for (const selector of submitSelectors) {
        try {
          if (selector.includes(':has-text(')) {
            const buttons = await page.$$('button, input[type="submit"]')
            for (const button of buttons) {
              const text = await page.evaluate(el => el.textContent?.trim(), button)
              if (text && (
                text.toLowerCase().includes('se connecter') ||
                text.toLowerCase().includes('connexion') ||
                text.toLowerCase().includes('login') ||
                text.toLowerCase().includes('sign in')
              )) {
                await button.click()
                submitClicked = true
                logger.info('✅ Bouton de connexion cliqué')
                break
              }
            }
          } else {
            await page.waitForSelector(selector, { timeout: 2000 })
            await page.click(selector)
            submitClicked = true
            logger.info('✅ Bouton de connexion cliqué')
          }
          break
        } catch (e) {
          continue
        }
      }

      if (!submitClicked) {
        throw new Error('Bouton de connexion introuvable')
      }

      // Attendre la redirection ou la réponse
      logger.info('⏳ Attente de la connexion...')
      await page.waitForTimeout(5000)

      // Vérifier si la connexion a réussi
      const currentUrl = page.url()
      const isLoggedIn = !currentUrl.includes('login') && !currentUrl.includes('auth')

      if (isLoggedIn || accessTokenFound) {
        logger.info('🎉 Connexion réussie !')
      } else {
        logger.warn('⚠️ Connexion peut-être échouée, vérification des erreurs...')
        // Vérifier s'il y a des messages d'erreur
        const errorSelectors = [
          '.error',
          '.alert-error',
          '.text-error',
          '[class*="error"]',
          '[data-testid*="error"]'
        ]

        for (const selector of errorSelectors) {
          try {
            const errorElement = await page.$(selector)
            if (errorElement) {
              const errorText = await page.evaluate(el => el.textContent?.trim(), errorElement)
              if (errorText) {
                logger.warn(`⚠️ Message d'erreur détecté: ${errorText}`)
              }
            }
          } catch (e) {
            continue
          }
        }
      }

      // Récupérer tous les cookies
      logger.info('🍪 Récupération des cookies...')
      const cookies = await page.cookies()
      const cookieString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ')

      // Extraire les tokens importants
      const accessToken = cookies.find(c => c.name === 'access_token_web')?.value
      const refreshToken = cookies.find(c => c.name === 'refresh_token_web')?.value
      const cfClearance = cookies.find(c => c.name === 'cf_clearance')?.value
      const datadome = cookies.find(c => c.name.startsWith('datadome'))?.value

      logger.info(`✅ ${cookies.length} cookies récupérés`)
      if (accessToken) logger.info('✅ Access token trouvé')
      if (refreshToken) logger.info('✅ Refresh token trouvé')
      if (cfClearance) logger.info('✅ Cloudflare clearance trouvé')
      if (datadome) logger.info('✅ Datadome token trouvé')

      // Valider les cookies avec un test réel
      logger.info('🔍 Validation des cookies...')
      const testResponse = await fetch('https://www.vinted.fr/api/v2/catalog/items?search_text=test&per_page=1&page=1', {
        headers: {
          'accept': 'application/json, text/plain, */*',
          'cookie': cookieString,
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      })

      const testSuccess = testResponse.ok
      logger.info(`📊 Test de validation: ${testSuccess ? '✅ RÉUSSI' : '❌ ÉCHOUÉ'}`)

      if (!testSuccess) {
        logger.warn('⚠️ Cookies générés mais test de validation échoué')
        logger.info('💡 Les cookies peuvent ne pas être suffisants pour les endpoints authentifiés')
      }

      // Créer le résultat
      const localResult: CookieGenerationResult = {
        success: true,
        cookies: cookieString,
        details: {
          accessToken,
          refreshToken,
          cfClearance,
          datadome,
          cookieCount: cookies.length,
          testPassed: testSuccess
        }
      }

      logger.info('✅ Cookies générés avec succès (connexion automatique)')

      // Sauvegarder en base si possible
      try {
        const { supabase } = await import('@/lib/supabase')
        if (supabase) {
          await supabase
            .from('vinted_credentials')
            .upsert({
              full_cookies: cookieString,
              access_token: accessToken,
              refresh_token: refreshToken,
              is_active: true,
              updated_at: new Date().toISOString()
            }, { onConflict: 'is_active' })

          logger.info('💾 Cookies sauvegardés en base de données')
        }
      } catch (error) {
        logger.warn('⚠️ Erreur lors de la sauvegarde des cookies', error as Error)
      }

      // Stocker le résultat dans la variable externe
      result = localResult
      
      // Fermer le navigateur
      await browser.close()
    }
  } catch (error) {
    // En cas d'erreur, stocker l'erreur et fermer le navigateur
    browserError = error as Error
    try {
      await browser.close()
    } catch (e) {
      // Ignorer si déjà fermé
    }
  }
  
  } catch (launchError) {
    // Erreur lors du lancement du navigateur
    throw launchError
  }
  
  // Retourner le résultat ou lancer l'erreur
  if (browserError) {
    throw browserError
  }
  
  if (!result) {
    throw new Error('Aucun résultat généré')
  }
  
  return result
}

/**
 * Fonction principale pour la connexion automatique
 */
export async function generateVintedCookiesWithAutoLogin(): Promise<CookieGenerationResult> {
  try {
    // Vérifier les credentials
    const email = process.env.VINTED_EMAIL
    const password = process.env.VINTED_PASSWORD
    const captchaApiKey = process.env.CAPTCHA_API_KEY || process.env.TWOCAPTCHA_API_KEY

    if (!email || !password) {
      logger.warn('⚠️ VINTED_EMAIL et VINTED_PASSWORD non configurés')
      logger.info('💡 Tentative de génération de cookies Cloudflare uniquement...')
      return await generateVintedCookiesWithPuppeteer()
    }

    logger.info('🔐 Tentative de connexion automatique complète avec email/mot de passe...')

    // Appeler la fonction interne qui gère le navigateur
    return await performAutoLoginWithBrowser(email, password, captchaApiKey)

  } catch (error) {
    logger.error('❌ Échec de la génération automatique des cookies:', error)

    // Fallback: génération basique sans connexion
    logger.info('💡 Tentative de génération basique (Cloudflare seulement)...')
    try {
      return await generateVintedCookiesWithPuppeteer()
    } catch (fallbackError) {
      return {
        success: false,
        error: `Connexion automatique échouée: ${(error as Error).message}`,
        details: {
          fallbackAttempted: true,
          fallbackError: (fallbackError as Error).message
        }
      }
    }
  }
}

