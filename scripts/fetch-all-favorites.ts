/**
 * Script pour récupérer TOUTES les pages de favoris depuis l'API Vinted
 * et les exporter dans data/favorites.json
 * 
 * Usage:
 *   npx tsx scripts/fetch-all-favorites.ts <user_id> [cookies]
 * 
 * Exemple:
 *   npx tsx scripts/fetch-all-favorites.ts 152254278 "cookie1=value1; cookie2=value2"
 * 
 * Ou définir VINTED_FULL_COOKIES dans .env.local
 */

// Charger les variables d'environnement depuis .env.local
import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { writeFileSync } from 'fs'
import { join } from 'path'
import { createFullSessionFromCookies } from '@/lib/scrape/fullSessionManager'
import { buildVintedApiHeaders } from '@/lib/scrape/fullSessionManager'
import { normalizeApiItem } from '@/lib/scrape/searchCatalogWithFullSession'
import { getAuthenticatedCookiesForFavorites } from '@/lib/utils/getCookiesFromDb'
import { logger } from '@/lib/logger'
import type { ApiItem } from '@/lib/types/core'

const USER_ID = process.argv[2]
const COOKIES_ARG = process.argv[3]
const PER_PAGE = 50

if (!USER_ID) {
  console.error('❌ Usage: npx tsx scripts/fetch-all-favorites.ts <user_id> [cookies]')
  console.error('   Ou définir VINTED_FULL_COOKIES dans .env.local (avec access_token_web)')
  process.exit(1)
}

// Récupérer les cookies authentifiés (uniquement depuis .env.local)
function getCookies(): string | null {
  // 1. Depuis l'argument de ligne de commande (override)
  if (COOKIES_ARG) {
    return COOKIES_ARG
  }
  
  // 2. Depuis .env.local (doit contenir access_token_web)
  const cookies = getAuthenticatedCookiesForFavorites()
  if (cookies) {
    return cookies
  }
  
  console.error('❌ Cookies authentifiés non fournis')
  console.error('   Fournissez-les en argument ou définissez VINTED_FULL_COOKIES')
  process.exit(1)
}

// Récupérer une page de favoris
async function fetchFavoritesPage(
  userId: string,
  page: number,
  cookies: string
): Promise<{ items: ApiItem[], pagination: any }> {
  const url = `https://www.vinted.fr/api/v2/users/${userId}/items/favourites?per_page=${PER_PAGE}&page=${page}`
  
  const session = createFullSessionFromCookies(cookies)
  const headers = buildVintedApiHeaders(session)
  
  // Modifier les headers pour l'API JSON (pas HTML)
  // Les headers doivent correspondre à ce que le navigateur envoie pour les requêtes API JSON
  headers['accept'] = 'application/json, text/plain, */*'
  headers['sec-fetch-dest'] = 'empty'
  headers['sec-fetch-mode'] = 'cors'
  headers['sec-fetch-site'] = 'same-origin'
  headers['referer'] = 'https://www.vinted.fr/'
  // Retirer les headers HTML qui ne sont pas nécessaires pour l'API JSON
  delete headers['upgrade-insecure-requests']
  
  console.log(`📄 Récupération page ${page}...`)
  
  const response = await fetch(url, {
    headers,
    method: 'GET',
  })
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }
  
  const data = await response.json()
  
  // Parser la réponse (peut être un array ou un objet avec items)
  let items: any[] = []
  let pagination: any = null
  
  if (Array.isArray(data)) {
    items = data
  } else if (data.items && Array.isArray(data.items)) {
    items = data.items
    pagination = data.pagination
  } else if (data.data && Array.isArray(data.data)) {
    items = data.data
    pagination = data.pagination || data.meta
  } else if (data.favourites && Array.isArray(data.favourites)) {
    items = data.favourites
    pagination = data.pagination
  }
  
  // Normaliser les items
  const normalizedItems = items.map(normalizeApiItem).filter(Boolean) as ApiItem[]
  
  return {
    items: normalizedItems,
    pagination: pagination || { current_page: page, total_pages: 1 }
  }
}

// Récupérer toutes les pages
async function fetchAllFavorites(userId: string, cookies: string): Promise<ApiItem[]> {
  const allItems: ApiItem[] = []
  let page = 1
  let hasMore = true
  let totalPages: number | null = null
  
  while (hasMore) {
    try {
      const { items, pagination } = await fetchFavoritesPage(userId, page, cookies)
      
      allItems.push(...items)
      console.log(`✅ Page ${page}: ${items.length} favoris (total: ${allItems.length})`)
      
      // Déterminer s'il y a plus de pages
      if (pagination) {
        totalPages = pagination.total_pages || pagination.total_pages
        const currentPage = pagination.current_page || page
        
        if (totalPages && currentPage >= totalPages) {
          hasMore = false
        } else if (items.length < PER_PAGE) {
          // Si on a moins d'items que per_page, c'est la dernière page
          hasMore = false
        } else {
          hasMore = true
        }
      } else {
        // Si pas de pagination, arrêter si on a moins d'items que per_page
        hasMore = items.length >= PER_PAGE
      }
      
      page++
      
      // Délai entre les pages pour éviter le rate limiting
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
      
      // Limite de sécurité
      if (page > 100) {
        console.warn('⚠️ Limite de 100 pages atteinte')
        break
      }
    } catch (error: any) {
      console.error(`❌ Erreur page ${page}:`, error.message)
      break
    }
  }
  
  return allItems
}

// Fonction principale
async function main() {
  try {
    console.log('🚀 Récupération de tous les favoris...')
    console.log(`👤 User ID: ${USER_ID}`)
    
    const cookies = getCookies()
    if (!cookies) {
      console.error('❌ Impossible de récupérer les cookies authentifiés')
      console.error('💡 Configurez VINTED_FULL_COOKIES dans .env.local avec access_token_web')
      process.exit(1)
    }
    
    console.log(`🍪 Cookies authentifiés récupérés (${cookies.length} caractères)`)
    
    const allFavorites = await fetchAllFavorites(USER_ID, cookies)
    
    console.log(`\n✅ Total: ${allFavorites.length} favoris récupérés`)
    
    // Sauvegarder dans data/favorites.json
    const outputPath = join(process.cwd(), 'data', 'favorites.json')
    const output = {
      items: allFavorites,
      updated_at: new Date().toISOString(),
      note: "Mettez à jour ce fichier manuellement avec vos favoris Vinted. Format: array d'ApiItem (voir lib/types/core.ts). Exemple: [{\"id\": 123456, \"title\": \"Item title\", \"price\": {\"amount\": 50, \"currency_code\": \"EUR\"}, ...}]"
    }
    
    writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8')
    
    console.log(`\n💾 Favoris sauvegardés dans: ${outputPath}`)
    console.log(`📊 ${allFavorites.length} items exportés`)
    
  } catch (error: any) {
    console.error('❌ Erreur:', error.message)
    process.exit(1)
  }
}

main()

