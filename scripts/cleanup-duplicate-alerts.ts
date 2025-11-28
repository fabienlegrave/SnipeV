/**
 * Script pour nettoyer les alertes en doublon
 * Garde la plus récente et désactive/supprime les autres
 */

// Charger les variables d'environnement depuis .env.local
import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'

async function cleanupDuplicateAlerts() {
  try {
    if (!supabase) {
      throw new Error('Supabase client not available')
    }

    logger.info('🔍 Recherche des alertes en doublon...')

    // Récupérer toutes les alertes
    const { data: allAlerts, error: fetchError } = await supabase
      .from('price_alerts')
      .select('id, game_title, platform, created_at, is_active')
      .order('created_at', { ascending: false })

    if (fetchError) {
      throw new Error(`Erreur récupération alertes: ${fetchError.message}`)
    }

    if (!allAlerts || allAlerts.length === 0) {
      logger.info('ℹ️ Aucune alerte trouvée')
      return
    }

    logger.info(`📋 ${allAlerts.length} alertes trouvées`)

    // Normaliser les titres pour détecter les doublons similaires
    function normalizeTitle(title: string): string {
      return title
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Supprimer les accents
        .replace(/[^\w\s]/g, '') // Supprimer la ponctuation
        .replace(/\s+/g, ' ') // Normaliser les espaces
        .trim()
    }
    
    // Grouper par game_title normalisé + platform
    const groups = new Map<string, typeof allAlerts>()
    
    for (const alert of allAlerts) {
      const normalizedTitle = normalizeTitle(alert.game_title || '')
      const key = `${normalizedTitle}|||${alert.platform || ''}`
      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key)!.push(alert)
    }

    // Trouver les groupes avec doublons
    const duplicates: Array<{ key: string; alerts: typeof allAlerts }> = []
    for (const [key, alerts] of groups.entries()) {
      if (alerts.length > 1) {
        duplicates.push({ key, alerts })
      }
    }

    if (duplicates.length === 0) {
      logger.info('✅ Aucun doublon trouvé')
      return
    }

    logger.info(`⚠️ ${duplicates.length} groupe(s) avec doublons trouvé(s)`)

    let totalDeleted = 0
    let totalDeactivated = 0

    // Pour chaque groupe de doublons, garder la plus récente et supprimer/désactiver les autres
    for (const { key, alerts } of duplicates) {
      // Trier par date de création (la plus récente en premier)
      const sorted = [...alerts].sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )

      const [keep, ...toRemove] = sorted
      
      logger.info(`\n📦 Groupe: "${alerts[0].game_title}" (${alerts[0].platform || 'any'})`)
      logger.info(`   ✅ Garde: ID ${keep.id} (créée le ${keep.created_at})`)
      logger.info(`   ❌ À supprimer: ${toRemove.length} alerte(s)`)

      // Supprimer les doublons (ou les désactiver si vous préférez)
      for (const alertToRemove of toRemove) {
        // Option 1: Supprimer complètement
        const { error: deleteError } = await supabase
          .from('price_alerts')
          .delete()
          .eq('id', alertToRemove.id)

        if (deleteError) {
          logger.error(`   ❌ Erreur suppression alerte ${alertToRemove.id}: ${deleteError.message}`)
        } else {
          totalDeleted++
          logger.info(`   ✅ Alerte ${alertToRemove.id} supprimée`)
        }

        // Option 2: Désactiver au lieu de supprimer (décommentez si vous préférez)
        /*
        const { error: updateError } = await supabase
          .from('price_alerts')
          .update({ is_active: false })
          .eq('id', alertToRemove.id)

        if (updateError) {
          logger.error(`   ❌ Erreur désactivation alerte ${alertToRemove.id}: ${updateError.message}`)
        } else {
          totalDeactivated++
          logger.info(`   ✅ Alerte ${alertToRemove.id} désactivée`)
        }
        */
      }
    }

    logger.info(`\n✅ Nettoyage terminé:`)
    logger.info(`   - ${totalDeleted} alerte(s) supprimée(s)`)
    if (totalDeactivated > 0) {
      logger.info(`   - ${totalDeactivated} alerte(s) désactivée(s)`)
    }

  } catch (error: any) {
    logger.error('❌ Erreur lors du nettoyage:', error)
    process.exit(1)
  }
}

cleanupDuplicateAlerts()

