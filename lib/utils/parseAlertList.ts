/**
 * Parse une liste de jeux depuis un fichier texte
 * Format attendu: "Nom du jeu - Prix€" ou "Nom du jeu - Prix €"
 * Supporte aussi des annotations comme "Recherche"
 */

export interface ParsedAlert {
  gameTitle: string
  maxPrice: number
  platform?: string | null
  notes?: string
}

export interface ParseResult {
  alerts: ParsedAlert[]
  errors: Array<{ line: number; content: string; error: string }>
  skipped: number
}

/**
 * Parse une ligne de texte pour extraire le nom du jeu et le prix
 */
function parseLine(line: string, lineNumber: number): { alert: ParsedAlert | null; error: string | null } {
  // Nettoyer la ligne
  const cleaned = line.trim()
  
  // Ignorer les lignes vides
  if (!cleaned) {
    return { alert: null, error: null }
  }

  // Pattern pour "Nom - Prix€" ou "Nom - Prix €"
  // Supporte aussi "Nom - Recherche - Prix€"
  const patterns = [
    // Format: "Nom - Prix€" ou "Nom - Prix €"
    /^(.+?)\s*-\s*(\d+(?:[.,]\d+)?)\s*€?\s*$/i,
    // Format: "Nom - Recherche - Prix€"
    /^(.+?)\s*-\s*(?:Recherche|recherche)\s*-\s*(\d+(?:[.,]\d+)?)\s*€?\s*$/i,
    // Format: "Nom - Prix€ - Notes"
    /^(.+?)\s*-\s*(\d+(?:[.,]\d+)?)\s*€?\s*-\s*(.+)$/i,
  ]

  for (const pattern of patterns) {
    const match = cleaned.match(pattern)
    if (match) {
      const gameTitle = match[1].trim()
      const priceStr = match[2].replace(',', '.')
      const price = parseFloat(priceStr)
      const notes = match[3]?.trim()

      if (!gameTitle) {
        return { alert: null, error: 'Nom du jeu manquant' }
      }

      if (isNaN(price) || price <= 0) {
        return { alert: null, error: `Prix invalide: ${match[2]}` }
      }

      // Essayer d'extraire la plateforme du nom (ex: "Game - Switch" ou "Game Switch")
      let platform: string | null = null
      let finalTitle = gameTitle

      // Patterns pour détecter la plateforme
      const platformPatterns = [
        /\s*-\s*(Nintendo Switch|Switch|PS5|PS4|PS3|Xbox|Xbox Series|Xbox One|PC|Steam|Game Boy|3DS|DS|Wii|Wii U)$/i,
        /\s+(Nintendo Switch|Switch|PS5|PS4|PS3|Xbox|Xbox Series|Xbox One|PC|Steam|Game Boy|3DS|DS|Wii|Wii U)$/i,
      ]

      for (const platformPattern of platformPatterns) {
        const platformMatch = gameTitle.match(platformPattern)
        if (platformMatch) {
          platform = platformMatch[1]
          finalTitle = gameTitle.replace(platformPattern, '').trim()
          break
        }
      }

      return {
        alert: {
          gameTitle: finalTitle,
          maxPrice: price,
          platform: platform || null,
          notes: notes || undefined,
        },
        error: null,
      }
    }
  }

  // Si aucun pattern ne correspond, essayer de détecter un prix seul
  const priceOnlyMatch = cleaned.match(/^(\d+(?:[.,]\d+)?)\s*€?\s*$/)
  if (priceOnlyMatch) {
    return { alert: null, error: 'Nom du jeu manquant (seulement le prix trouvé)' }
  }

  return { alert: null, error: 'Format non reconnu' }
}

/**
 * Parse un texte complet contenant plusieurs lignes
 */
export function parseAlertList(text: string): ParseResult {
  const lines = text.split('\n')
  const alerts: ParsedAlert[] = []
  const errors: Array<{ line: number; content: string; error: string }> = []
  let skipped = 0

  lines.forEach((line, index) => {
    const lineNumber = index + 1
    const { alert, error } = parseLine(line, lineNumber)

    if (error) {
      errors.push({
        line: lineNumber,
        content: line.trim(),
        error,
      })
    } else if (alert) {
      alerts.push(alert)
    } else {
      // Ligne vide, on la compte comme ignorée
      skipped++
    }
  })

  return {
    alerts,
    errors,
    skipped,
  }
}

/**
 * Valide une liste d'alertes parsées
 */
export function validateParsedAlerts(alerts: ParsedAlert[]): { valid: ParsedAlert[]; duplicates: ParsedAlert[] } {
  const seen = new Set<string>()
  const valid: ParsedAlert[] = []
  const duplicates: ParsedAlert[] = []

  for (const alert of alerts) {
    // Créer une clé unique basée sur le titre et la plateforme
    const key = `${alert.gameTitle.toLowerCase()}_${alert.platform?.toLowerCase() || 'any'}`
    
    if (seen.has(key)) {
      duplicates.push(alert)
    } else {
      seen.add(key)
      valid.push(alert)
    }
  }

  return { valid, duplicates }
}

