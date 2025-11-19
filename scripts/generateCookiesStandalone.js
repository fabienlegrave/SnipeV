/**
 * Script standalone pour générer les cookies via Puppeteer
 * Exécuté via child_process pour éviter les problèmes d'analyse statique Next.js
 */

async function generateCookies() {
  try {
    // Import dynamique de puppeteer
    let puppeteer
    
    try {
      const puppeteerExtra = require('puppeteer-extra')
      const StealthPlugin = require('puppeteer-extra-plugin-stealth')
      puppeteerExtra.use(StealthPlugin())
      puppeteer = puppeteerExtra
      console.log('✅ Utilisation de puppeteer-extra avec plugin stealth')
    } catch (error) {
      puppeteer = require('puppeteer')
      console.log('✅ Utilisation de puppeteer standard')
    }

    console.log('🌐 Démarrage du navigateur headless...')

    // Déterminer le chemin Chromium/Chrome
    let executablePath = process.env.PUPPETEER_EXECUTABLE_PATH
    
    // Si pas de chemin défini, essayer les chemins Linux par défaut
    if (!executablePath) {
      const fs = require('fs')
      const possiblePaths = [
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
      ]
      
      for (const path of possiblePaths) {
        if (fs.existsSync(path)) {
          executablePath = path
          console.log(`✅ Chromium trouvé à: ${path}`)
          break
        }
      }
    }
    
    if (executablePath) {
      console.log(`🔧 Utilisation de Chromium: ${executablePath}`)
    } else {
      console.log('⚠️ Aucun chemin Chromium spécifié, Puppeteer utilisera son Chrome intégré')
    }
    
    const browser = await puppeteer.launch({
      headless: 'new', // Utiliser le nouveau mode headless
      executablePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-dev-shm-usage',
        '--window-size=1920,1080',
        '--disable-gpu',
      ],
    })

    try {
      const page = await browser.newPage()

      // Masquer les signaux d'automatisation
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
        })

        window.chrome = {
          runtime: {},
        }

        const originalQuery = window.navigator.permissions.query
        window.navigator.permissions.query = (parameters) =>
          parameters.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission })
            : originalQuery(parameters)

        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5],
        })

        Object.defineProperty(navigator, 'languages', {
          get: () => ['fr-FR', 'fr', 'en-US', 'en'],
        })
      })

      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
      )

      await page.setViewport({ width: 1920, height: 1080 })

      console.log('🌐 Navigation vers Vinted (avec délais anti-rate-limit)...')
      
      // Navigation initiale avec timeout plus long
      try {
        await page.goto('https://www.vinted.fr', {
          waitUntil: 'domcontentloaded', // Plus permissif que networkidle2
          timeout: 60000, // 60 secondes pour laisser le temps aux challenges
        })
      } catch (error) {
        console.warn('⚠️ Timeout initial, mais continuons...')
      }

      // Attendre un peu pour laisser les scripts se charger
      await page.waitForTimeout(5000)

      // Attendre et gérer les challenges Cloudflare/Datadome avec plus de patience
      let challengeResolved = false
      let attempts = 0
      const maxAttempts = 10
      
      while (!challengeResolved && attempts < maxAttempts) {
        attempts++
        const title = await page.title()
        const url = page.url()
        
        console.log(`🔍 Vérification challenge (tentative ${attempts}/${maxAttempts})...`)
        console.log(`   URL: ${url}`)
        console.log(`   Title: ${title}`)
        
        // Vérifier si on est bloqué par un challenge
        const hasChallenge = title.includes('Just a moment') || 
                            title.includes('Checking your browser') ||
                            title.includes('Please wait') ||
                            url.includes('challenge') ||
                            url.includes('datadome')
        
        if (hasChallenge) {
          console.log(`⏳ Challenge détecté (${title}), attente ${10 * attempts}s...`)
          await page.waitForTimeout(10000 * attempts) // Délai progressif
          
          try {
            // Attendre que la page se charge
            await page.waitForNavigation({ 
              waitUntil: 'domcontentloaded', 
              timeout: 30000 
            }).catch(() => {
              console.log('ℹ️ Pas de navigation détectée, mais continuons...')
            })
          } catch (error) {
            console.log('ℹ️ Navigation timeout, mais continuons...')
          }
        } else {
          // Vérifier si on a des cookies maintenant
          const cookies = await page.cookies('https://www.vinted.fr')
          const hasImportantCookies = cookies.some(c => 
            c.name.includes('cf_') || 
            c.name.includes('datadome') ||
            c.name.includes('__cf')
          )
          
          if (hasImportantCookies || cookies.length > 5) {
            console.log(`✅ Challenge résolu ou page chargée (${cookies.length} cookies trouvés)`)
            challengeResolved = true
            break
          } else {
            console.log(`⏳ Pas encore de cookies importants, attente supplémentaire...`)
            await page.waitForTimeout(5000)
          }
        }
      }
      
      // Attendre un peu plus pour s'assurer que tout est chargé
      await page.waitForTimeout(3000)
      
      // Vérifier les cookies après l'attente
      const initialCookies = await page.cookies('https://www.vinted.fr')
      console.log(`🍪 Cookies après navigation: ${initialCookies.length} trouvés`)
      
      if (initialCookies.length === 0) {
        console.warn('⚠️ Aucun cookie récupéré après navigation initiale')
        console.warn('💡 Cela peut indiquer un blocage temporaire de Vinted (rate limit)')
        console.warn('💡 Attente supplémentaire de 10 secondes...')
        await page.waitForTimeout(10000)
      }

      // Essayer de se connecter si des credentials sont fournis (optionnel)
      // Cela permettra d'obtenir access_token_web
      const vintedEmail = process.env.VINTED_EMAIL
      const vintedPassword = process.env.VINTED_PASSWORD
      
      if (vintedEmail && vintedPassword) {
        try {
          console.log('🔐 Tentative de connexion pour obtenir access_token_web...')
          
          // Écouter les requêtes réseau pour détecter quand access_token_web est généré
          let accessTokenDetected = false
          page.on('response', (response) => {
            const setCookieHeader = response.headers()['set-cookie']
            if (setCookieHeader && setCookieHeader.includes('access_token_web=')) {
              accessTokenDetected = true
              console.log('✅ access_token_web détecté dans les headers de réponse')
            }
          })
          
          // Essayer plusieurs URLs de login possibles
          const loginUrls = [
            'https://www.vinted.fr/users/login',
            'https://www.vinted.fr/login',
            'https://www.vinted.fr/authentication/login'
          ]
          
          let loginSuccess = false
          for (const loginUrl of loginUrls) {
            try {
              console.log(`🌐 Tentative de navigation vers ${loginUrl}...`)
              await page.goto(loginUrl, {
                waitUntil: 'networkidle2',
                timeout: 20000,
              })
              
              await page.waitForTimeout(2000)
              
              // Vérifier si on est sur une page de login
              const currentUrl = page.url()
              console.log(`📍 URL actuelle: ${currentUrl}`)
              
              // Attendre que la page soit complètement chargée
              await page.waitForTimeout(2000)
              
              // Utiliser evaluate pour chercher les champs dans le DOM de manière plus robuste
              const formFields = await page.evaluate(() => {
                const inputs = Array.from(document.querySelectorAll('input'))
                const emailInputs = inputs.filter(input => {
                  const type = (input.type || '').toLowerCase()
                  const name = (input.name || '').toLowerCase()
                  const id = (input.id || '').toLowerCase()
                  const placeholder = (input.placeholder || '').toLowerCase()
                  const autocomplete = (input.autocomplete || '').toLowerCase()
                  
                  return type === 'email' ||
                         name.includes('email') ||
                         id.includes('email') ||
                         placeholder.includes('email') ||
                         autocomplete.includes('email') ||
                         autocomplete === 'username'
                })
                
                const passwordInputs = inputs.filter(input => {
                  const type = (input.type || '').toLowerCase()
                  return type === 'password'
                })
                
                return {
                  email: emailInputs.length > 0 ? {
                    selector: emailInputs[0].id ? `#${emailInputs[0].id}` : 
                             emailInputs[0].name ? `input[name="${emailInputs[0].name}"]` :
                             emailInputs[0].type ? `input[type="${emailInputs[0].type}"]` : null,
                    index: inputs.indexOf(emailInputs[0])
                  } : null,
                  password: passwordInputs.length > 0 ? {
                    selector: passwordInputs[0].id ? `#${passwordInputs[0].id}` : 
                             passwordInputs[0].name ? `input[name="${passwordInputs[0].name}"]` :
                             'input[type="password"]',
                    index: inputs.indexOf(passwordInputs[0])
                  } : null,
                  allInputs: inputs.length,
                  firstInputIndex: inputs.length > 0 ? 0 : null,
                  secondInputIndex: inputs.length > 1 ? 1 : null
                }
              })
              
              console.log('🔍 Champs de formulaire détectés:', JSON.stringify(formFields, null, 2))
              
              if (currentUrl.includes('login') || currentUrl.includes('authentication') || formFields.allInputs > 0) {
                console.log(`✅ Page de login détectée: ${currentUrl}`)
                
                let emailField = null
                let passwordField = null
                let allInputs = null
                
                // Essayer de trouver le champ email
                if (formFields.email && formFields.email.selector) {
                  try {
                    emailField = await page.$(formFields.email.selector)
                    if (emailField) {
                      console.log(`✅ Champ email trouvé avec: ${formFields.email.selector}`)
                    }
                  } catch (e) {
                    console.warn(`⚠️ Impossible d'utiliser le sélecteur ${formFields.email.selector}`)
                  }
                }
                
                // Fallback: utiliser tous les inputs
                if (!emailField) {
                  console.warn('⚠️ Champ email non trouvé avec sélecteur spécifique, tentative avec tous les inputs...')
                  allInputs = await page.$$('input')
                  if (allInputs.length > 0 && formFields.firstInputIndex !== null) {
                    emailField = allInputs[formFields.firstInputIndex]
                    console.log(`✅ Utilisation du premier input (index ${formFields.firstInputIndex}) comme champ email`)
                  }
                }
                
                if (emailField) {
                  // Vider le champ et taper l'email
                  await emailField.click({ clickCount: 3 })
                  await page.waitForTimeout(200)
                  await emailField.type(vintedEmail, { delay: 50 })
                  await page.waitForTimeout(500)
                  
                  // Trouver le champ password
                  if (formFields.password && formFields.password.selector) {
                    try {
                      passwordField = await page.$(formFields.password.selector)
                      if (passwordField) {
                        console.log(`✅ Champ password trouvé avec: ${formFields.password.selector}`)
                      }
                    } catch (e) {
                      console.warn(`⚠️ Impossible d'utiliser le sélecteur ${formFields.password.selector}`)
                    }
                  }
                  
                  if (!passwordField) {
                    // Si on n'a pas encore récupéré allInputs, le faire maintenant
                    if (!allInputs) {
                      allInputs = await page.$$('input')
                    }
                    // Chercher un input de type password
                    for (let i = 0; i < allInputs.length; i++) {
                      const inputType = await allInputs[i].evaluate(el => el.type)
                      if (inputType === 'password') {
                        passwordField = allInputs[i]
                        console.log(`✅ Champ password trouvé (input index ${i})`)
                        break
                      }
                    }
                    // Si toujours pas trouvé, prendre le deuxième input
                    if (!passwordField && allInputs.length > 1 && formFields.secondInputIndex !== null) {
                      passwordField = allInputs[formFields.secondInputIndex]
                      console.log(`✅ Utilisation du deuxième input (index ${formFields.secondInputIndex}) comme champ password`)
                    }
                  }
                  
                  if (passwordField) {
                    await passwordField.click({ clickCount: 3 })
                    await page.waitForTimeout(200)
                    await passwordField.type(vintedPassword, { delay: 50 })
                    await page.waitForTimeout(500)
                    
                    // Trouver et cliquer sur le bouton de soumission
                    const submitSelectors = [
                      'button[type="submit"]',
                      'button:has-text("Se connecter")',
                      'button:has-text("Log in")',
                      'button:has-text("Connexion")',
                      'input[type="submit"]',
                      'button[data-testid*="submit"]',
                      'button[data-testid*="login"]',
                      'button.authentication__submit'
                    ]
                    
                    let submitButton = null
                    for (const selector of submitSelectors) {
                      try {
                        submitButton = await page.$(selector)
                        if (submitButton) {
                          console.log(`✅ Bouton submit trouvé avec: ${selector}`)
                          break
                        }
                      } catch (e) {
                        // Continuer
                      }
                    }
                    
                    if (submitButton) {
                      console.log('🔄 Soumission du formulaire...')
                      await submitButton.click()
                      
                      // Attendre la navigation ou la génération du token
                      try {
                        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 })
                        console.log('✅ Navigation après connexion détectée')
                      } catch (e) {
                        console.log('ℹ️ Pas de navigation détectée, mais la connexion peut avoir réussi')
                      }
                      
                      // Attendre que le token soit généré (vérifier plusieurs fois)
                      for (let i = 0; i < 10; i++) {
                        await page.waitForTimeout(1000)
                        const cookies = await page.cookies('https://www.vinted.fr')
                        if (cookies.some(c => c.name === 'access_token_web') || accessTokenDetected) {
                          console.log('✅ access_token_web généré avec succès!')
                          loginSuccess = true
                          break
                        }
                      }
                      
                      // Si le token n'est pas encore généré, essayer d'accéder à une zone protégée
                      // pour forcer la génération du token (selon la politique des cookies de Vinted)
                      if (!loginSuccess) {
                        console.log('🔄 Token non détecté, tentative d\'accès à une zone protégée...')
                        try {
                          // Essayer d'accéder à une page protégée (profil, messages, etc.)
                          const protectedUrls = [
                            'https://www.vinted.fr/member',
                            'https://www.vinted.fr/account',
                            'https://www.vinted.fr/messages',
                            'https://www.vinted.fr/items/new'
                          ]
                          
                          for (const protectedUrl of protectedUrls) {
                            try {
                              console.log(`🌐 Accès à ${protectedUrl}...`)
                              await page.goto(protectedUrl, {
                                waitUntil: 'networkidle2',
                                timeout: 15000,
                              })
                              await page.waitForTimeout(2000)
                              
                              // Vérifier si le token est maintenant présent
                              const cookies = await page.cookies('https://www.vinted.fr')
                              if (cookies.some(c => c.name === 'access_token_web')) {
                                console.log('✅ access_token_web généré après accès à zone protégée!')
                                loginSuccess = true
                                break
                              }
                            } catch (e) {
                              // Continuer avec la prochaine URL
                              console.log(`⚠️ Échec avec ${protectedUrl}: ${e.message}`)
                            }
                          }
                        } catch (error) {
                          console.warn('⚠️ Erreur lors de l\'accès aux zones protégées:', error.message)
                        }
                      }
                      
                      if (loginSuccess) {
                        break // Sortir de la boucle des URLs
                      }
                    } else {
                      console.warn('⚠️ Bouton submit non trouvé')
                    }
                  } else {
                    console.warn('⚠️ Champ password non trouvé')
                  }
                } else {
                  console.warn('⚠️ Aucun champ de formulaire trouvé')
                }
              }
            } catch (error) {
              console.warn(`⚠️ Échec avec ${loginUrl}:`, error.message)
              // Continuer avec la prochaine URL
            }
          }
          
          if (!loginSuccess) {
            console.warn('⚠️ Connexion automatique échouée (non bloquant)')
            console.warn('💡 Les cookies Cloudflare sont toujours générés, mais access_token_web sera manquant')
          }
        } catch (error) {
          console.warn('⚠️ Erreur lors de la tentative de connexion:', error.message || 'Unknown error')
          console.warn('💡 Les cookies Cloudflare sont toujours générés, mais access_token_web sera manquant')
        }
      } else {
        console.log('ℹ️ VINTED_EMAIL et VINTED_PASSWORD non configurés - connexion automatique désactivée')
        console.log('💡 Pour obtenir access_token_web, configurez VINTED_EMAIL et VINTED_PASSWORD dans .env.local')
      }

      // Récupérer les cookies finaux (plusieurs tentatives si nécessaire)
      let cookies = await page.cookies('https://www.vinted.fr')
      console.log(`🍪 ${cookies.length} cookies récupérés après toutes les opérations`)
      
      // Si aucun cookie important, essayer une dernière navigation
      const hasImportantCookies = cookies.some(c => 
        c.name.includes('cf_') || 
        c.name.includes('datadome') ||
        c.name.includes('__cf') ||
        c.name.includes('token') ||
        c.name.includes('_vinted')
      )
      
      if (!hasImportantCookies && cookies.length < 3) {
        console.warn('⚠️ Très peu de cookies récupérés, tentative de navigation supplémentaire...')
        try {
          await page.goto('https://www.vinted.fr/how_it_works', {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
          })
          await page.waitForTimeout(5000)
          cookies = await page.cookies('https://www.vinted.fr')
          console.log(`🍪 Après navigation supplémentaire: ${cookies.length} cookies`)
        } catch (error) {
          console.warn('⚠️ Navigation supplémentaire échouée:', error.message)
        }
      }
      
      // Avertissement final si toujours aucun cookie
      if (cookies.length === 0) {
        console.error('❌ CRITIQUE: Aucun cookie récupéré!')
        console.error('💡 Causes possibles:')
        console.error('   1. Blocage temporaire de Vinted suite à des rate limits (429)')
        console.error('   2. IP temporairement bloquée')
        console.error('   3. Challenge Cloudflare/Datadome non résolu')
        console.error('💡 Solutions:')
        console.error('   - Attendre 10-30 minutes avant de réessayer')
        console.error('   - Utiliser un VPN ou changer d\'IP')
        console.error('   - Essayer en mode headful (headless: false) pour debug')
      }

      const cookieString = cookies
        .map(cookie => `${cookie.name}=${cookie.value}`)
        .join('; ')

      // Vérifier les cookies importants
      const hasCfClearance = cookies.some(c => c.name === 'cf_clearance')
      const hasDatadome = cookies.some(c => c.name.toLowerCase().includes('datadome'))
      const hasAccessToken = cookies.some(c => c.name === 'access_token_web')
      const hasRefreshToken = cookies.some(c => c.name === 'refresh_token_web')
      
      // Lister tous les cookies pour debug
      console.log('📋 Liste des cookies récupérés:')
      cookies.forEach(cookie => {
        const isImportant = cookie.name.includes('datadome') || 
                            cookie.name.includes('cf_') ||
                            cookie.name.includes('token') ||
                            cookie.name.includes('access') ||
                            cookie.name.includes('refresh')
        if (isImportant) {
          console.log(`   ✅ ${cookie.name}: ${cookie.value.substring(0, 30)}...`)
        }
      })

      if (!hasAccessToken) {
        console.warn('⚠️ access_token_web non trouvé dans les cookies générés')
        console.warn('💡 Pour obtenir access_token_web, configurez VINTED_EMAIL et VINTED_PASSWORD')
      } else {
        console.log('✅ access_token_web trouvé dans les cookies générés')
      }
      
      if (!hasRefreshToken) {
        console.warn('⚠️ refresh_token_web non trouvé dans les cookies générés')
      } else {
        console.log('✅ refresh_token_web trouvé dans les cookies générés')
      }
      
      if (!hasDatadome) {
        console.warn('⚠️ Cookie Datadome non trouvé dans les cookies générés')
        console.warn('💡 Datadome peut être généré après la connexion ou lors de certaines actions')
      } else {
        console.log('✅ Cookie Datadome trouvé dans les cookies générés')
      }
      
      if (!hasCfClearance) {
        console.warn('⚠️ cf_clearance non trouvé dans les cookies générés')
      } else {
        console.log('✅ cf_clearance trouvé dans les cookies générés')
      }

      await browser.close()

      const result = {
        success: true,
        cookies: cookieString,
        details: {
          cf_clearance: cookies.find(c => c.name === 'cf_clearance')?.value,
          datadome: cookies.find(c => c.name.includes('datadome'))?.value,
          access_token_web: cookies.find(c => c.name === 'access_token_web')?.value,
        }
      }

      // Output JSON pour que le parent puisse le lire
      console.log(JSON.stringify(result))
      process.exit(0)

    } catch (error) {
      await browser.close()
      throw error
    }

  } catch (error) {
    const result = {
      success: false,
      error: error.message || 'Unknown error',
      details: {
        message: 'Failed to generate cookies with Puppeteer'
      }
    }
    console.error(JSON.stringify(result))
    process.exit(1)
  }
}

generateCookies()

