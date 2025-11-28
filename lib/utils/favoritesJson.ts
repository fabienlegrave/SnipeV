/**
 * Module simple pour lire les favoris depuis un fichier JSON
 * Remplace la complexité de l'authentification Vinted
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { logger } from '../logger'
import type { ApiItem } from '../types/core'

interface FavoritesJson {
  items: ApiItem[]
  updated_at: string | null
  note?: string
}

const FAVORITES_JSON_PATH = join(process.cwd(), 'data', 'favorites.json')

/**
 * Lit les favoris depuis le fichier JSON
 */
export function getFavoritesFromJson(): ApiItem[] {
  try {
    const fileContent = readFileSync(FAVORITES_JSON_PATH, 'utf-8')
    const data: FavoritesJson = JSON.parse(fileContent)
    
    if (!Array.isArray(data.items)) {
      logger.warn('⚠️ Le fichier favorites.json ne contient pas un array d\'items valide')
      return []
    }
    
    logger.info(`✅ ${data.items.length} favoris chargés depuis data/favorites.json`)
    
    if (data.updated_at) {
      logger.info(`📅 Dernière mise à jour: ${data.updated_at}`)
    }
    
    return data.items
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      logger.warn('⚠️ Fichier data/favorites.json non trouvé. Créez-le avec un array vide: {"items": []}')
    } else {
      logger.error(`❌ Erreur lecture favorites.json: ${error.message}`)
    }
    return []
  }
}

