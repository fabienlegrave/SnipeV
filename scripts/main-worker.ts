/**
 * Main Worker - Load Balancer
 * Distribue les commandes vers les workers régionaux (fr, us, nl, uk)
 * Gère le load balancing et la santé des workers
 */

import { logger } from '@/lib/logger'
import { globalSearchCache, schedulePeriodicCleanup } from '@/lib/cache/searchCache'

interface WorkerNode {
  id: string
  name: string
  region: string
  url: string // URL interne du worker (ex: http://worker-fr.internal:3000)
  isHealthy: boolean
  isBanned: boolean
  bannedUntil?: number
  lastUsed?: number
  requestCount: number
  successCount: number
  errorCount: number
  lastError?: string
  lastHealthCheck?: number
}

interface WorkerCommand {
  type: 'scrape' | 'check-alerts' | 'generate-cookies' | 'custom'
  payload: any
  priority?: number
  retryCount?: number
}

interface WorkerResponse {
  success: boolean
  data?: any
  error?: string
  workerId?: string
}

// Configuration des workers régionaux
const WORKER_NODES: WorkerNode[] = [
  {
    id: 'worker-fr',
    name: 'Worker FR',
    region: 'cdg',
    url: process.env.WORKER_FR_URL || 'http://worker-fr.internal:3000',
    isHealthy: true,
    isBanned: false,
    requestCount: 0,
    successCount: 0,
    errorCount: 0,
  },
  {
    id: 'worker-us',
    name: 'Worker US',
    region: 'iad',
    url: process.env.WORKER_US_URL || 'http://worker-us.internal:3000',
    isHealthy: true,
    isBanned: false,
    requestCount: 0,
    successCount: 0,
    errorCount: 0,
  },
  {
    id: 'worker-nl',
    name: 'Worker NL',
    region: 'ams',
    url: process.env.WORKER_NL_URL || 'http://worker-nl.internal:3000',
    isHealthy: true,
    isBanned: false,
    requestCount: 0,
    successCount: 0,
    errorCount: 0,
  },
  {
    id: 'worker-uk',
    name: 'Worker UK',
    region: 'lhr',
    url: process.env.WORKER_UK_URL || 'http://worker-uk.internal:3000',
    isHealthy: true,
    isBanned: false,
    requestCount: 0,
    successCount: 0,
    errorCount: 0,
  },
]

// Configuration
const CONFIG = {
  loadBalancingStrategy: (process.env.LB_STRATEGY as 'round-robin' | 'random' | 'least-used' | 'health-based') || 'random', // Random par défaut pour éviter rate limit
  banDuration: parseInt(process.env.WORKER_BAN_DURATION_MS || '3600000', 10), // 1 heure (pour bans IP de Vinted)
  healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL_MS || '60000', 10), // 1 minute
  requestTimeout: parseInt(process.env.WORKER_REQUEST_TIMEOUT_MS || '60000', 10), // 60 secondes (augmenté pour les cycles longs)
  maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
  alertCheckInterval: parseInt(process.env.ALERT_CHECK_INTERVAL_MS || '600000', 10), // 10 minutes par défaut (compromis entre agressivité et performance)
}

// État global
let currentWorkerIndex = 0 // Pour round-robin
let lastCookieRegeneration: number | null = null // Timestamp de la dernière régénération de cookies

/**
 * Vérifie si un worker est disponible
 */
function isWorkerAvailable(worker: WorkerNode): boolean {
  if (!worker.isHealthy) return false
  
  if (worker.isBanned) {
    const now = Date.now()
    if (worker.bannedUntil && now < worker.bannedUntil) {
      return false
    } else {
      // Le ban a expiré, réactiver
      worker.isBanned = false
      worker.bannedUntil = undefined
      logger.info(`✅ Worker ${worker.name} (${worker.region}) réactivé après expiration du ban`)
      return true
    }
  }
  
  return true
}

/**
 * Marque un worker comme banni temporairement
 */
function banWorker(worker: WorkerNode): void {
  worker.isBanned = true
  worker.bannedUntil = Date.now() + CONFIG.banDuration
  logger.warn(`🚫 Worker ${worker.name} (${worker.region}) banni temporairement pour ${CONFIG.banDuration / 1000}s`)
}

/**
 * Sélectionne le meilleur worker selon la stratégie de load balancing
 * Priorise les workers non bannis
 */
function selectWorker(): WorkerNode | null {
  // Séparer les workers disponibles en deux groupes : non bannis et bannis (mais disponibles)
  const nonBannedWorkers = WORKER_NODES.filter(worker => isWorkerAvailable(worker) && !worker.isBanned)
  const availableWorkers = nonBannedWorkers.length > 0 
    ? nonBannedWorkers 
    : WORKER_NODES.filter(worker => isWorkerAvailable(worker))
  
  if (availableWorkers.length === 0) {
    logger.error('❌ Aucun worker disponible')
    return null
  }
  
  switch (CONFIG.loadBalancingStrategy) {
    case 'round-robin': {
      let attempts = 0
      while (attempts < WORKER_NODES.length) {
        const worker = WORKER_NODES[currentWorkerIndex % WORKER_NODES.length]
        currentWorkerIndex++
        
        if (isWorkerAvailable(worker)) {
          return worker
        }
        attempts++
      }
      return availableWorkers[0]
    }
    
    case 'random': {
      const randomIndex = Math.floor(Math.random() * availableWorkers.length)
      return availableWorkers[randomIndex]
    }
    
    case 'least-used': {
      return availableWorkers.reduce((prev, curr) => 
        curr.requestCount < prev.requestCount ? curr : prev
      )
    }
    
    case 'health-based': {
      return availableWorkers.reduce((prev, curr) => {
        const prevRatio = prev.successCount / Math.max(prev.requestCount, 1)
        const currRatio = curr.successCount / Math.max(curr.requestCount, 1)
        return currRatio > prevRatio ? curr : prev
      })
    }
    
    default:
      return availableWorkers[0]
  }
}

/**
 * Vérifie la santé d'un worker
 */
async function checkWorkerHealth(worker: WorkerNode): Promise<boolean> {
  // Générer l'URL publique à partir de l'URL interne si nécessaire
  const getPublicUrl = (internalUrl: string): string => {
    // Si c'est déjà une URL publique, la retourner telle quelle
    if (internalUrl.startsWith('https://')) {
      return internalUrl
    }
    // Extraire le nom de l'app de l'URL interne (ex: worker-fr-icy-night-8180.internal -> worker-fr-icy-night-8180)
    const match = internalUrl.match(/http:\/\/([^.]+)\.internal/)
    if (match) {
      const appName = match[1]
      return `https://${appName}.fly.dev`
    }
    return internalUrl
  }
  
  const urlsToTry = [
    worker.url, // Essayer d'abord l'URL configurée (interne)
    getPublicUrl(worker.url), // Puis l'URL publique en fallback
  ]
  
  for (const healthUrl of urlsToTry) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000) // 15s pour health check (augmenté)
      
      const response = await fetch(`${healthUrl}/api/v1/worker/health`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Main-Worker-Health-Check/1.0',
          'Accept': 'application/json',
        },
      })
      
      clearTimeout(timeoutId)
      
      if (response.ok) {
        const data = await response.json().catch(() => ({}))
        worker.isHealthy = true
        worker.lastHealthCheck = Date.now()
        // Si on utilise l'URL publique, mettre à jour l'URL du worker
        if (healthUrl !== worker.url && healthUrl.startsWith('https://')) {
          worker.url = healthUrl
          logger.debug(`✅ Worker ${worker.name} (${worker.region}): Healthy via public URL ${healthUrl}`)
        } else {
          logger.debug(`✅ Worker ${worker.name} (${worker.region}): Healthy`, data)
        }
        return true
      }
    } catch (error: any) {
      // Continuer avec l'URL suivante
      if (healthUrl === urlsToTry[urlsToTry.length - 1]) {
        // Dernière tentative échouée
        worker.isHealthy = false
        worker.lastHealthCheck = Date.now()
        worker.lastError = error.message || 'Health check failed'
        logger.warn(`⚠️ Worker ${worker.name} (${worker.region}): ${error.message || 'Health check failed'} (tried: ${urlsToTry.join(', ')})`)
        return false
      }
    }
  }
  
  return false
}

/**
 * Envoie une commande à un worker
 */
async function sendCommandToWorker(
  worker: WorkerNode,
  command: WorkerCommand
): Promise<WorkerResponse> {
  worker.requestCount++
  worker.lastUsed = Date.now()
  
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.requestTimeout)
    
    const response = await fetch(`${worker.url}/api/v1/worker/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.API_SECRET || process.env.NEXT_PUBLIC_API_SECRET || '',
      },
      body: JSON.stringify(command),
      signal: controller.signal,
    })
    
    clearTimeout(timeoutId)
    
    const data = await response.json()
    
    if (response.ok) {
      worker.successCount++
      return {
        success: true,
        data: data.data || data,
        workerId: worker.id,
      }
    } else {
      worker.errorCount++
      worker.lastError = data.error || `HTTP ${response.status}`
      
      // Si c'est un 401 ou 403, bannir le worker pendant 30 minutes
      if (response.status === 401 || response.status === 403) {
        banWorker(worker)
        logger.warn(`🚫 Worker ${worker.name} (${worker.region}) banni pour ${response.status === 401 ? '401 Unauthorized' : '403 Forbidden'}`)
      }
      
      // Marquer comme unhealthy après plusieurs erreurs
      if (worker.errorCount > 5 && worker.errorCount > worker.successCount) {
        worker.isHealthy = false
        logger.warn(`⚠️ Worker ${worker.name} (${worker.region}) marqué comme unhealthy`)
      }
      
      return {
        success: false,
        error: data.error || `HTTP ${response.status}`,
        workerId: worker.id,
      }
    }
  } catch (error: any) {
    worker.errorCount++
    worker.lastError = error.message || 'Unknown error'
    
    if (error.name === 'AbortError') {
      worker.lastError = 'Timeout'
    }
    
    // Marquer comme unhealthy après plusieurs erreurs
    if (worker.errorCount > 5 && worker.errorCount > worker.successCount) {
      worker.isHealthy = false
      logger.warn(`⚠️ Worker ${worker.name} (${worker.region}) marqué comme unhealthy`)
    }
    
    return {
      success: false,
      error: error.message || 'Unknown error',
      workerId: worker.id,
    }
  }
}

/**
 * Distribue une commande vers un worker avec retry automatique
 */
export async function distributeCommand(command: WorkerCommand): Promise<WorkerResponse> {
  const maxAttempts = CONFIG.maxRetries
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const worker = selectWorker()
    
    if (!worker) {
      return {
        success: false,
        error: 'Aucun worker disponible',
      }
    }
    
    logger.info(`🔄 Tentative ${attempt + 1}/${maxAttempts} avec ${worker.name} (${worker.region})`)
    
    const result = await sendCommandToWorker(worker, command)
    
    if (result.success) {
      logger.info(`✅ Commande exécutée avec succès via ${worker.name} (${worker.region})`)
      return result
    } else {
      logger.warn(`❌ Échec avec ${worker.name} (${worker.region}): ${result.error}`)
      
      // Si c'est un 403, essayer un autre worker
      if (result.error?.includes('403')) {
        logger.info(`🔄 Rotation vers un autre worker après 403...`)
        continue
      }
      
      // Pour les autres erreurs, réessayer avec un autre worker
      if (attempt < maxAttempts - 1) {
        logger.info(`🔄 Tentative avec un autre worker...`)
        continue
      }
    }
  }
  
  return {
    success: false,
    error: `Échec après ${maxAttempts} tentatives avec différents workers`,
  }
}

/**
 * Récupère les statistiques des workers
 */
export function getWorkersStats(): {
  totalWorkers: number
  availableWorkers: number
  bannedWorkers: number
  unhealthyWorkers: number
  workers: Array<{
    id: string
    name: string
    region: string
    isHealthy: boolean
    isBanned: boolean
    requestCount: number
    successCount: number
    errorCount: number
    successRate: number
    lastError?: string
  }>
} {
  const availableWorkers = WORKER_NODES.filter(worker => isWorkerAvailable(worker))
  const bannedWorkers = WORKER_NODES.filter(worker => worker.isBanned)
  const unhealthyWorkers = WORKER_NODES.filter(worker => !worker.isHealthy)
  
  return {
    totalWorkers: WORKER_NODES.length,
    availableWorkers: availableWorkers.length,
    bannedWorkers: bannedWorkers.length,
    unhealthyWorkers: unhealthyWorkers.length,
    workers: WORKER_NODES.map(worker => ({
      id: worker.id,
      name: worker.name,
      region: worker.region,
      isHealthy: worker.isHealthy,
      isBanned: worker.isBanned,
      requestCount: worker.requestCount,
      successCount: worker.successCount,
      errorCount: worker.errorCount,
      successRate: worker.requestCount > 0 
        ? (worker.successCount / worker.requestCount) * 100 
        : 0,
      lastError: worker.lastError,
    })),
  }
}

/**
 * Formate le statut d'un worker avec toutes les informations
 */
function formatWorkerStatus(worker: WorkerNode, isHealthy: boolean): string {
  const healthIcon = isHealthy ? '✅' : '⚠️'
  const healthStatus = isHealthy ? 'Healthy' : 'Unhealthy'
  
  let statusParts = [`${healthIcon} ${worker.name} (${worker.region}): ${healthStatus}`]
  
  // Ajouter le statut de ban si applicable
  if (worker.isBanned && worker.bannedUntil) {
    const remainingMs = worker.bannedUntil - Date.now()
    if (remainingMs > 0) {
      const remainingMinutes = Math.ceil(remainingMs / 1000 / 60)
      const remainingSeconds = Math.ceil((remainingMs % 60000) / 1000)
      statusParts.push(`🚫 Banned (${remainingMinutes}m ${remainingSeconds}s restantes)`)
    } else {
      // Le ban est expiré mais pas encore réactivé
      statusParts.push(`🚫 Ban expiré (réactivation en cours...)`)
    }
  } else if (worker.isBanned) {
    statusParts.push(`🚫 Banned`)
  }
  
  return statusParts.join(' - ')
}

/**
 * Vérifie la santé de tous les workers
 */
export async function checkAllWorkersHealth(): Promise<void> {
  logger.info('🏥 Vérification de la santé de tous les workers...')
  
  const healthChecks = WORKER_NODES.map(worker => checkWorkerHealth(worker))
  const results = await Promise.allSettled(healthChecks)
  
  results.forEach((result, index) => {
    const worker = WORKER_NODES[index]
    if (result.status === 'fulfilled' && result.value) {
      logger.info(formatWorkerStatus(worker, true))
    } else {
      const errorMsg = result.status === 'rejected' 
        ? result.reason?.message || 'Unknown error'
        : worker.lastError || 'Health check failed'
      const status = formatWorkerStatus(worker, false)
      logger.warn(`${status} - ${errorMsg} (URL: ${worker.url})`)
    }
  })
}

/**
 * Divise un tableau en groupes de taille approximativement égale
 */
function chunkArray<T>(array: T[], numChunks: number): T[][] {
  if (numChunks <= 0 || array.length === 0) return []
  if (numChunks >= array.length) return array.map(item => [item])
  
  const chunks: T[][] = []
  const chunkSize = Math.ceil(array.length / numChunks)
  
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize))
  }
  
  return chunks
}

/**
 * Déclenche un cycle de vérification des alertes en parallèle sur tous les workers disponibles
 */
async function triggerAlertCycle(): Promise<void> {
  try {
    // Vérifier s'il y a des alertes actives
    const { supabase } = await import('@/lib/supabase')
    if (!supabase) {
      logger.warn('⚠️ Supabase non disponible, impossible de vérifier les alertes')
      return
    }

    // Récupérer toutes les alertes actives
    const { data: alerts, error: alertsError } = await supabase
      .from('price_alerts')
      .select('id, game_title, platform, max_price, condition')
      .eq('is_active', true)

    if (alertsError) {
      logger.warn(`⚠️ Erreur lors de la récupération des alertes: ${alertsError.message}`)
      return
    }

    if (!alerts || alerts.length === 0) {
      logger.debug('ℹ️ Aucune alerte active, skip du cycle')
      return
    }

    // Récupérer tous les workers disponibles
    const availableWorkers = WORKER_NODES.filter(worker => isWorkerAvailable(worker))
    
    if (availableWorkers.length === 0) {
      // Vérifier si tous les workers sont bannis (403) - dans ce cas, régénérer les cookies
      const allBanned = WORKER_NODES.every(worker => worker.isBanned && worker.isHealthy)
      const allBannedBy403 = WORKER_NODES.every(worker => 
        worker.isBanned && 
        worker.isHealthy && 
        (worker.lastError?.includes('403') || worker.lastError?.includes('Forbidden'))
      )
      
      if (allBannedBy403) {
        logger.warn('⚠️ Tous les workers sont bannis pour 403 - Régénération automatique des cookies...')
        logger.info('🔄 Déclenchement de la régénération des cookies Cloudflare...')
        
        try {
          // Générer de nouveaux cookies via Puppeteer (le main worker a Puppeteer)
          const { generateVintedCookiesWithPuppeteer } = await import('@/lib/scrape/cookieGenerator')
          const result = await generateVintedCookiesWithPuppeteer()
          
          if (result.success && result.cookies) {
            // Sauvegarder en DB
            const { supabase } = await import('@/lib/supabase')
            if (supabase) {
              // Extraire les infos des cookies
              const tokenMatch = result.cookies.match(/access_token_web=([^;]+)/)
              const refreshTokenMatch = result.cookies.match(/refresh_token_web=([^;]+)/)
              const userIdMatch = result.cookies.match(/user_id=([^;]+)/)
              
              const accessToken = tokenMatch ? tokenMatch[1] : null
              const refreshToken = refreshTokenMatch ? refreshTokenMatch[1] : null
              const userId = userIdMatch ? userIdMatch[1] : null
              
              // Désactiver les anciens credentials actifs
              await supabase
                .from('vinted_credentials')
                .update({ is_active: false })
                .eq('is_active', true)
              
              // Sauvegarder les nouveaux cookies
              const { error: saveError } = await supabase
                .from('vinted_credentials')
                .insert({
                  full_cookies: result.cookies.trim(),
                  access_token: accessToken,
                  refresh_token: refreshToken,
                  user_id: userId,
                  is_active: true,
                  notes: 'Auto-généré après ban 403 de tous les workers',
                  updated_at: new Date().toISOString(),
                  last_used_at: new Date().toISOString(),
                })
              
              if (saveError) {
                logger.error(`❌ Erreur lors de la sauvegarde des cookies: ${saveError.message}`)
              } else {
                // Enregistrer le timestamp de la régénération
                lastCookieRegeneration = Date.now()
                
                logger.info('✅ Nouveaux cookies générés et sauvegardés en DB')
                logger.info('💡 Les workers pourront utiliser les nouveaux cookies lors du prochain cycle')
                
                // Réactiver les workers immédiatement (les nouveaux cookies sont en DB)
                // Les workers récupéreront automatiquement les nouveaux cookies au prochain cycle
                logger.info('🔄 Réactivation immédiate des workers (nouveaux cookies disponibles en DB)...')
                WORKER_NODES.forEach(worker => {
                  if (worker.isBanned && worker.isHealthy) {
                    worker.isBanned = false
                    worker.bannedUntil = undefined
                    logger.info(`✅ ${worker.name} (${worker.region}) réactivé après régénération des cookies`)
                  }
                })
              }
            } else {
              logger.error('❌ Supabase non disponible, impossible de sauvegarder les cookies')
            }
          } else {
            logger.error(`❌ Échec de la régénération des cookies: ${result.error}`)
          }
        } catch (error: any) {
          logger.error(`❌ Erreur lors de la régénération automatique des cookies: ${error.message}`)
        }
      } else {
        logger.error('❌ Aucun worker disponible pour traiter les alertes')
        const excludedWorkers = WORKER_NODES.filter(worker => !isWorkerAvailable(worker))
        const bannedWorkers = excludedWorkers.filter(w => w.isBanned)
        const unhealthyWorkers = excludedWorkers.filter(w => !w.isHealthy && !w.isBanned)
        
        if (bannedWorkers.length > 0) {
          logger.warn(`🚫 ${bannedWorkers.length} worker(s) banni(s)`)
        }
        if (unhealthyWorkers.length > 0) {
          logger.warn(`⚠️ ${unhealthyWorkers.length} worker(s) unhealthy`)
        }
      }
      return
    }

    // APPROCHE COMPROMIS: Utiliser 2 workers en parallèle pour un bon équilibre
    // Limiter à 2 workers max pour réduire l'agressivité tout en gardant un bon débit
    // Prioriser les workers non bannis
    const nonBannedWorkers = availableWorkers.filter(w => !w.isBanned)
    const workersToSelectFrom = nonBannedWorkers.length > 0 ? nonBannedWorkers : availableWorkers
    const maxWorkersToUse = Math.min(2, workersToSelectFrom.length)
    const selectedWorkers = workersToSelectFrom.slice(0, maxWorkersToUse)
    
    if (selectedWorkers.length === 0) {
      logger.error('❌ Aucun worker disponible pour traiter les alertes')
      return
    }
    
    logger.info(`🔔 Déclenchement automatique du cycle de vérification des alertes (${alerts.length} alerte(s)) sur ${selectedWorkers.length} worker(s)...`)
    logger.info(`🔄 Stratégie: Traitement en parallèle sur ${selectedWorkers.length} worker(s) pour un bon compromis`)
    
    // Logger les workers exclus (bannis ou unhealthy) pour visibilité
    if (availableWorkers.length < WORKER_NODES.length) {
      const excludedWorkers = WORKER_NODES.filter(worker => !isWorkerAvailable(worker))
      const bannedWorkers = excludedWorkers.filter(w => w.isBanned)
      const unhealthyWorkers = excludedWorkers.filter(w => !w.isHealthy && !w.isBanned)
      
      if (bannedWorkers.length > 0) {
        const banInfo = bannedWorkers.map(w => {
          const remainingTime = w.bannedUntil ? Math.ceil((w.bannedUntil - Date.now()) / 1000 / 60) : 0
          return `${w.name} (${w.region})${remainingTime > 0 ? ` - ${remainingTime}min restantes` : ''}`
        }).join(', ')
        logger.info(`🚫 Workers bannis (exclus): ${banInfo}`)
      }
      
      if (unhealthyWorkers.length > 0) {
        const unhealthyInfo = unhealthyWorkers.map(w => `${w.name} (${w.region})${w.lastError ? ` - ${w.lastError}` : ''}`).join(', ')
        logger.warn(`⚠️ Workers unhealthy (exclus): ${unhealthyInfo}`)
      }
    }

    // Diviser les alertes en groupes pour les 2 workers
    const alertChunks = chunkArray(alerts, selectedWorkers.length)
    
    logger.info(`📊 Distribution: ${alertChunks.map((chunk, i) => `${selectedWorkers[i].name}: ${chunk.length} alerte(s)`).join(', ')}`)

    // Préparer les commandes pour chaque worker
    const commands = selectedWorkers.map((worker, index) => {
      const alertsForWorker = alertChunks[index] || []
      return {
        worker,
        command: {
          type: 'check-alerts' as const,
          payload: {
            alerts: alertsForWorker.map(a => ({
              id: a.id,
              game_title: a.game_title,
              platform: a.platform,
              max_price: a.max_price,
              condition: a.condition,
            })),
          },
        } as WorkerCommand,
      }
    })

    // Envoyer les commandes en parallèle (2 workers max)
    const startTime = Date.now()
    const results = await Promise.allSettled(
      commands.map(({ worker, command }) => 
        sendCommandToWorker(worker, command).then(result => ({
          worker,
          result,
        }))
      )
    )

    const endTime = Date.now()
    const duration = ((endTime - startTime) / 1000).toFixed(2)

    // Analyser les résultats
    let totalMatches = 0
    let successCount = 0
    let errorCount = 0
    const errors: string[] = []

    results.forEach((settledResult, index) => {
      const { worker } = commands[index]
      
      if (settledResult.status === 'fulfilled') {
        const { result } = settledResult.value
        
        if (result.success) {
          successCount++
          const data = result.data as any
          const matches = data.matches?.length || 0
          totalMatches += matches
          logger.info(`✅ ${worker.name} (${worker.region}): ${matches} match(s) trouvé(s) sur ${alertChunks[index].length} alerte(s)`)
        } else {
          errorCount++
          const errorMsg = result.error || 'Erreur inconnue'
          errors.push(`${worker.name}: ${errorMsg}`)
          
          // Si c'est une erreur NO_SCRAPING_COOKIES, logger en error pour attirer l'attention
          if (errorMsg.includes('NO_SCRAPING_COOKIES')) {
            logger.error(`❌ ${worker.name} (${worker.region}): ${errorMsg}`)
          } else {
            logger.warn(`⚠️ ${worker.name} (${worker.region}): ${errorMsg}`)
          }
        }
      } else {
        errorCount++
        const errorMsg = settledResult.reason?.message || 'Erreur inconnue'
        errors.push(`${worker.name}: ${errorMsg}`)
        logger.error(`❌ ${worker.name} (${worker.region}): Échec - ${errorMsg}`)
      }
    })

    // Résumé global
    logger.info(`📊 Cycle terminé en ${duration}s: ${successCount}/${selectedWorkers.length} worker(s) réussi(s), ${totalMatches} match(s) total, ${errorCount} erreur(s)`)
    
    if (errorCount > 0 && errors.length > 0) {
      logger.warn(`⚠️ Erreurs rencontrées: ${errors.join('; ')}`)
      
      // Détecter si toutes les erreurs sont des 403 (cookies expirés)
      const all403Errors = errors.every(e => 
        e.includes('403') || 
        e.includes('Forbidden') || 
        e.includes('Cookies invalides') ||
        e.includes('Cookies expirés')
      )
      
      // Si tous les workers ont échoué avec des 403, vérifier si c'est un ban IP ou des cookies expirés
      if (all403Errors && errorCount === availableWorkers.length && successCount === 0) {
        // Si les cookies ont été régénérés récemment (moins de 5 minutes), c'est probablement un ban IP
        const timeSinceLastRegen = lastCookieRegeneration ? Date.now() - lastCookieRegeneration : Infinity
        if (timeSinceLastRegen < 300000) { // 5 minutes
          logger.warn('⚠️ Tous les workers ont échoué avec des erreurs 403')
          logger.warn('🚫 Les cookies ont été régénérés il y a moins de 5 minutes - Probable ban IP de Vinted')
          logger.warn(`💡 Les workers sont bannis pour 1 heure. Attente de la réactivation automatique...`)
          logger.warn(`💡 Les workers seront réactivés dans ${Math.ceil((CONFIG.banDuration - (Date.now() - (lastCookieRegeneration || Date.now()))) / 1000 / 60)} minutes`)
        } else {
          logger.warn('⚠️ Tous les workers ont échoué avec des erreurs 403 - Régénération automatique des cookies...')
          logger.info('🔄 Déclenchement de la régénération des cookies Cloudflare...')
          
          try {
            // Générer de nouveaux cookies via Puppeteer (le main worker a Puppeteer)
            const { generateVintedCookiesWithPuppeteer } = await import('@/lib/scrape/cookieGenerator')
            const result = await generateVintedCookiesWithPuppeteer()
            
            if (result.success && result.cookies) {
              // Sauvegarder en DB
              const { supabase } = await import('@/lib/supabase')
              if (supabase) {
                // Extraire les infos des cookies
                const tokenMatch = result.cookies.match(/access_token_web=([^;]+)/)
                const refreshTokenMatch = result.cookies.match(/refresh_token_web=([^;]+)/)
                const userIdMatch = result.cookies.match(/user_id=([^;]+)/)
                
                const accessToken = tokenMatch ? tokenMatch[1] : null
                const refreshToken = refreshTokenMatch ? refreshTokenMatch[1] : null
                const userId = userIdMatch ? userIdMatch[1] : null
                
                // Désactiver les anciens credentials actifs
                await supabase
                  .from('vinted_credentials')
                  .update({ is_active: false })
                  .eq('is_active', true)
                
                // Sauvegarder les nouveaux cookies
                const { error: saveError } = await supabase
                  .from('vinted_credentials')
                  .insert({
                    full_cookies: result.cookies.trim(),
                    access_token: accessToken,
                    refresh_token: refreshToken,
                    user_id: userId,
                    is_active: true,
                    notes: 'Auto-généré après erreurs 403 de tous les workers',
                    updated_at: new Date().toISOString(),
                    last_used_at: new Date().toISOString(),
                  })
                
                if (saveError) {
                  logger.error(`❌ Erreur lors de la sauvegarde des cookies: ${saveError.message}`)
                } else {
                  // Enregistrer le timestamp de la régénération
                  lastCookieRegeneration = Date.now()
                  
                  logger.info('✅ Nouveaux cookies générés et sauvegardés en DB')
                  logger.info('💡 Les workers pourront utiliser les nouveaux cookies lors du prochain cycle')
                  
                  // Réactiver les workers immédiatement (les nouveaux cookies sont en DB)
                  // Les workers récupéreront automatiquement les nouveaux cookies au prochain cycle
                  logger.info('🔄 Réactivation immédiate des workers (nouveaux cookies disponibles en DB)...')
                  WORKER_NODES.forEach(worker => {
                    if (worker.isBanned && worker.isHealthy) {
                      worker.isBanned = false
                      worker.bannedUntil = undefined
                      logger.info(`✅ ${worker.name} (${worker.region}) réactivé après régénération des cookies`)
                    }
                  })
                }
              } else {
                logger.error('❌ Supabase non disponible, impossible de sauvegarder les cookies')
              }
            } else {
              logger.error(`❌ Échec de la régénération des cookies: ${result.error}`)
            }
          } catch (error: any) {
            logger.error(`❌ Erreur lors de la régénération automatique des cookies: ${error.message}`)
          }
        }
      }
      
      // Si toutes les erreurs sont NO_SCRAPING_COOKIES, donner des conseils
      if (errors.every(e => e.includes('NO_SCRAPING_COOKIES'))) {
        logger.error(`💡 Les cookies Cloudflare ne sont pas disponibles en base de données`)
        logger.error(`💡 Le worker de régénération automatique devrait générer les cookies dans quelques minutes`)
        logger.error(`💡 Ou générer manuellement via: POST /api/v1/token/refresh/force`)
      }
    }
  } catch (error) {
    logger.error('❌ Erreur lors du déclenchement automatique du cycle d\'alertes', error as Error)
  }
}

/**
 * Initialise le main worker
 */
export async function initializeMainWorker(): Promise<void> {
  logger.info('🚀 Initialisation du Main Worker (Load Balancer)...')
  logger.info(`📋 Stratégie de load balancing: ${CONFIG.loadBalancingStrategy}`)
  logger.info(`📋 Workers configurés: ${WORKER_NODES.length}`)
  WORKER_NODES.forEach(worker => {
    logger.info(`   - ${worker.name} (${worker.region}): ${worker.url}`)
  })
  logger.info(`📋 Durée du ban: ${CONFIG.banDuration / 1000 / 60} minutes (30min)`)
  logger.info(`📋 Intervalle de vérification des alertes: ${CONFIG.alertCheckInterval / 1000 / 60} minutes`)
  
  // Vérifier la santé de tous les workers au démarrage
  await checkAllWorkersHealth()
  
  // Vérifier périodiquement la santé des workers
  setInterval(async () => {
    await checkAllWorkersHealth()
  }, CONFIG.healthCheckInterval)
  
  // Déclencher automatiquement les cycles d'alertes
  // Attendre 1 minute après le démarrage pour laisser les workers s'initialiser
  setTimeout(async () => {
    await triggerAlertCycle()
  }, 60000)
  
  // Puis déclencher périodiquement
  setInterval(async () => {
    await triggerAlertCycle()
  }, CONFIG.alertCheckInterval)
  
  // Initialiser le worker de régénération automatique des tokens
  try {
    const { initializeTokenRefreshWorker } = await import('./token-refresh-worker')
    logger.info('🔄 Initialisation du worker de régénération automatique des tokens...')
    await initializeTokenRefreshWorker()
  } catch (error) {
    logger.warn('⚠️ Impossible d\'initialiser le worker de régénération des tokens:', error as Error)
    logger.info('💡 Les tokens seront régénérés manuellement ou via l\'initialisation normale')
  }

  // Initialiser le nettoyage automatique du cache
  try {
    await schedulePeriodicCleanup(30) // Toutes les 30 minutes
    logger.info('✅ Nettoyage automatique du cache activé (toutes les 30 minutes)')
  } catch (error) {
    logger.warn('⚠️ Impossible d\'initialiser le nettoyage du cache:', error as Error)
  }

  logger.info('✅ Main Worker initialisé')
}

// Export pour utilisation dans les routes API
export { WORKER_NODES, CONFIG }

