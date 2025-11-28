# Logique de Recherche et Stratégie Anti-Ban

## 📋 Vue d'ensemble

Ce document décrit la logique complète de recherche des alertes, les stratégies anti-détection mises en place, et les paramètres de configuration pour éviter les bannissements IP de Vinted.

## 🏗️ Architecture de Recherche

### Flux Principal

```
Main Worker (Orchestrateur)
    ↓
    Déclenchement automatique toutes les 10 minutes
    ↓
    Sélection de 2 workers disponibles (max)
    ↓
    Distribution des alertes entre les 2 workers
    ↓
    Chaque worker traite ses alertes séquentiellement
    ↓
    Pour chaque alerte:
        - Recherche sur Vinted API (2 pages max)
        - Délai avec jitter entre chaque page (12-25s)
        - Délai avec jitter entre chaque alerte (12-25s)
        - Matching des items trouvés
        - Sauvegarde des matches en DB
```

## ⚙️ Configuration Actuelle (Compromis)

### Paramètres Globaux

| Paramètre | Valeur | Description |
|-----------|--------|-------------|
| **Intervalle entre cycles** | `10 minutes` (600000ms) | Fréquence de déclenchement des cycles d'alertes |
| **Workers en parallèle** | `2 maximum` | Nombre de workers utilisés simultanément |
| **Pages par recherche** | `2 pages max` | Nombre de pages de résultats par alerte |
| **Items par recherche** | `40 items max` | Limite d'items récupérés par alerte (2 pages × 20 items) |
| **Délai entre pages** | `12-25 secondes` | Délai avec jitter entre chaque page |
| **Délai entre alertes** | `12-25 secondes` | Délai avec jitter entre chaque alerte |
| **Délai de base** | `15 secondes` | Délai de base (configurable via DB ou env) |

### Calcul du Volume de Requêtes

**Exemple avec 41 alertes :**
- **Workers utilisés** : 2
- **Alertes par worker** : ~21 alertes (41 ÷ 2)
- **Pages par alerte** : 2 pages
- **Requêtes par alerte** : 2 requêtes (1 par page)
- **Total requêtes** : 41 alertes × 2 pages = **82 requêtes par cycle**
- **Fréquence** : Toutes les 10 minutes
- **Requêtes par heure** : ~492 requêtes/heure

**Comparaison avec l'ancienne configuration (trop agressive) :**
- 4 workers × 3 pages × 41 alertes = **492 requêtes toutes les 5 minutes**
- **Requêtes par heure** : ~5904 requêtes/heure

**Réduction : ~92% de requêtes en moins** ✅

## 🔄 Cycle de Recherche Détaillé

### 1. Déclenchement Automatique

Le Main Worker déclenche automatiquement un cycle toutes les 10 minutes :

```typescript
// scripts/main-worker.ts
ALERT_CHECK_INTERVAL_MS = 600000 // 10 minutes
```

### 2. Sélection des Workers

- **Stratégie** : Utiliser maximum 2 workers disponibles
- **Filtrage** : Exclut les workers bannis ou unhealthy
- **Distribution** : Répartition équitable des alertes entre les 2 workers

```typescript
const maxWorkersToUse = Math.min(2, availableWorkers.length)
const selectedWorkers = availableWorkers.slice(0, maxWorkersToUse)
```

### 3. Traitement des Alertes

Chaque worker traite ses alertes **séquentiellement** (une après l'autre) :

```typescript
// lib/alerts/checkAlertsStandalone.ts
for (let i = 0; i < alerts.length; i++) {
  const alert = alerts[i]
  
  // Délai avec jitter entre chaque alerte (sauf la première)
  if (i > 0) {
    const delay = await getRequestDelayWithJitter() // 12-25s
    await new Promise(resolve => setTimeout(resolve, delay))
  }
  
  // Recherche sur Vinted
  const items = await searchAllPagesWithFullSession(alert.game_title, {
    priceTo: alert.max_price,
    limit: 40, // 2 pages × 20 items
    session
  })
}
```

### 4. Recherche Paginée

Pour chaque alerte, on récupère jusqu'à 2 pages de résultats :

```typescript
// lib/scrape/searchCatalogWithFullSession.ts
const maxPagesToSearch = 2

while (hasMore && currentPage <= maxPagesToSearch) {
  // Délai avec jitter avant chaque page (sauf la première)
  if (currentPage > 1) {
    const delay = await getRequestDelayWithJitter() // 12-25s
    await new Promise(resolve => setTimeout(resolve, delay))
  }
  
  // Requête API Vinted
  const result = await searchCatalogWithFullSession({
    searchText: alert.game_title,
    priceTo: alert.max_price,
    page: currentPage,
    perPage: 20
  }, session)
  
  currentPage++
}
```

## 🛡️ Stratégies Anti-Détection

### 1. Délai avec Jitter

**Objectif** : Éviter les patterns détectables de requêtes régulières

```typescript
// lib/config/delays.ts
export async function getRequestDelayWithJitter(): Promise<number> {
  const baseDelay = await getRequestDelayMs() // 15s par défaut
  // Jitter : entre 80% et 160% du délai de base
  const jitter = 0.8 + Math.random() * 0.8
  const delayWithJitter = Math.round(baseDelay * jitter)
  
  // Plage finale : 12-25 secondes
  return Math.max(12000, Math.min(25000, delayWithJitter))
}
```

**Résultat** : Délai variable entre 12 et 25 secondes, rendant les requêtes moins prévisibles.

### 2. Limitation du Nombre de Pages

**Avant** : 3 pages par recherche (60 items)
**Maintenant** : 2 pages par recherche (40 items)

**Impact** : Réduction de 33% des requêtes par alerte.

### 3. Traitement Séquentiel

**Stratégie** : Les alertes sont traitées une par une, jamais en parallèle sur le même worker.

**Avantage** : 
- Pas de burst de requêtes simultanées
- Délais respectés entre chaque requête
- Pattern plus naturel (comme un utilisateur humain)

### 4. Limitation des Workers

**Stratégie** : Maximum 2 workers en parallèle (au lieu de 4).

**Avantage** :
- Réduction de 50% des requêtes simultanées
- Répartition de la charge sur plusieurs IPs (régions différentes)
- Moins de risque de ban IP global

### 5. Headers Réalistes

Les requêtes utilisent des headers identiques à un navigateur Chrome réel :

```typescript
{
  'accept': 'text/html,application/xhtml+xml,...',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...',
  'sec-ch-ua': '"Google Chrome";v="141", ...',
  'accept-language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
  // ... 20+ headers supplémentaires
}
```

### 6. Gestion des Erreurs 403

**Détection** : Si un worker reçoit une erreur 403, il est automatiquement banni pour 1 heure.

**Régénération automatique** : Si tous les workers reçoivent des 403, le système régénère automatiquement les cookies Cloudflare.

**Détection de ban IP** : Si les cookies ont été régénérés récemment (< 5 min) et qu'on a encore des 403, c'est probablement un ban IP (pas juste des cookies expirés).

## 📊 Optimisations et Seuils

### Arrêt Prématuré de la Pagination

La recherche s'arrête automatiquement si :

1. **Peu de résultats** : Moins de 20 items disponibles (< 1 page)
   ```typescript
   if (totalItemsFromApi < MIN_TOTAL_ITEMS_THRESHOLD) {
     hasMore = false // Arrêt
   }
   ```

2. **Items trop anciens** : Tous les items de la page ont plus de 7 jours
   ```typescript
   const MAX_ITEM_AGE_DAYS = 7
   if (allItemsTooOld) {
     hasMore = false // Arrêt
   }
   ```

3. **Page vide** : Aucun item retourné par l'API
   ```typescript
   if (result.items.length === 0) {
     hasMore = false // Arrêt
   }
   ```

### Limite d'Items

- **Par alerte** : 40 items maximum (2 pages × 20 items)
- **Par page** : 20 items maximum (limite API Vinted)

## 🔧 Configuration Avancée

### Variables d'Environnement

```bash
# Intervalle entre cycles (en millisecondes)
ALERT_CHECK_INTERVAL_MS=600000  # 10 minutes

# Délai de base entre requêtes (en millisecondes)
REQUEST_DELAY_MS=15000  # 15 secondes

# Durée du ban worker après 403 (en millisecondes)
WORKER_BAN_DURATION_MS=3600000  # 1 heure
```

### Configuration via Base de Données

Le délai entre requêtes peut être modifié via la table `app_settings` :

```sql
INSERT INTO app_settings (key, value) 
VALUES ('request_delay_ms', '15000')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

**Plage valide** : 1000ms (1s) à 60000ms (60s)

## 📈 Monitoring et Logs

### Logs Importants

1. **Déclenchement de cycle** :
   ```
   🔔 Déclenchement automatique du cycle de vérification des alertes (41 alerte(s)) sur 2 worker(s)...
   ```

2. **Distribution** :
   ```
   📊 Distribution: Worker FR: 21 alerte(s), Worker US: 20 alerte(s)
   ```

3. **Délais** :
   ```
   ⏳ Attente de 18.3s avant la prochaine requête (alerte 2/41)...
   ⏳ Délai de 14.7s avant la page 2/2...
   ```

4. **Résultats** :
   ```
   ✅ Worker FR (cdg): 3 match(s) trouvé(s) sur 21 alerte(s)
   📊 Cycle terminé en 245.32s: 2/2 worker(s) réussi(s), 5 match(s) total
   ```

### Métriques Clés

- **Temps moyen par cycle** : ~4-5 minutes pour 41 alertes
- **Requêtes par cycle** : ~82 requêtes (41 alertes × 2 pages)
- **Taux de succès** : Surveillé via les logs de workers
- **Bans détectés** : Logs avec temps restant avant réactivation

## 🚨 Gestion des Bannissements

### Ban d'un Worker

Quand un worker reçoit une erreur 403 :
1. Le worker est marqué comme `banned`
2. `bannedUntil` est défini à `Date.now() + 3600000` (1 heure)
3. Le worker est exclu des prochains cycles
4. Log : `🚫 Worker Worker FR (cdg) banni temporairement pour 3600s`

### Réactivation Automatique

Après 1 heure, le worker est automatiquement réactivé lors du prochain health check.

### Régénération de Cookies

Si tous les workers reçoivent des 403 :
1. Vérification si cookies régénérés récemment (< 5 min)
2. Si oui → Probable ban IP, on attend
3. Si non → Régénération automatique des cookies Cloudflare
4. Réactivation des workers après 30 secondes

## 🎯 Recommandations

### Si vous recevez encore des bans :

1. **Augmenter l'intervalle** : Passer de 10 min à 15-20 min
   ```bash
   ALERT_CHECK_INTERVAL_MS=900000  # 15 minutes
   ```

2. **Réduire à 1 worker** : Utiliser un seul worker à la fois
   ```typescript
   const maxWorkersToUse = 1  // Au lieu de 2
   ```

3. **Réduire les pages** : Passer à 1 page par recherche
   ```typescript
   const maxPagesToSearch = 1  // Au lieu de 2
   ```

4. **Augmenter les délais** : Passer à 20-30 secondes entre requêtes
   ```bash
   REQUEST_DELAY_MS=20000  # 20 secondes
   ```

### Si vous voulez plus de résultats :

1. **Augmenter les pages** : Passer à 3 pages (attention aux bans)
2. **Augmenter les workers** : Passer à 3-4 workers (risque accru)
3. **Réduire l'intervalle** : Passer à 5 minutes (plus agressif)

## 📝 Résumé des Paramètres Actuels

| Paramètre | Valeur | Impact |
|-----------|--------|--------|
| Intervalle cycles | 10 min | ⚖️ Compromis |
| Workers parallèles | 2 max | ⚖️ Compromis |
| Pages par recherche | 2 | ⚖️ Compromis |
| Items par recherche | 40 | ⚖️ Compromis |
| Délai entre requêtes | 12-25s | ✅ Anti-détection |
| Ban duration | 1 heure | ✅ Protection |

**Statut actuel** : Configuration de compromis optimisée pour éviter les bans tout en gardant une bonne couverture des résultats.

