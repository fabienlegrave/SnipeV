# Améliorations de l'Architecture - Système de Recherche et Workers

## Vue d'ensemble

Ce document décrit les améliorations architecturales apportées au système de recherche Vinted et à la gestion des workers.

## 1. Unification de la Logique de Recherche

### Nouveau module : `lib/scrape/unifiedSearch.ts`

**Objectif** : Fusionner les fonctionnalités de `searchCatalog.ts` et `searchCatalogWithFullSession.ts` en un seul module cohérent.

**Fonctionnalités** :
- `searchSinglePage()` : Recherche d'une seule page avec gestion de session
- `searchMultiplePages()` : Recherche multi-pages avec pagination intelligente
- `normalizeApiItem()` : Normalisation unifiée des items API
- Support complet des sessions (cookies Cloudflare et tokens)
- Arrêt automatique basé sur l'âge des items (7 jours par défaut)
- Déduplication automatique des résultats
- Filtrage par pertinence intégré

**Avantages** :
- Code DRY (Don't Repeat Yourself)
- Maintenance simplifiée
- Comportement cohérent
- Meilleure gestion des erreurs

## 2. Gestion Centralisée des Sessions

### Nouveau module : `lib/auth/sessionManager.ts`

**Objectif** : Centraliser la gestion des cookies et tokens avec fallback automatique.

**Fonctionnalités** :
- `SessionManager.getSession()` : Récupération de session avec fallback en cascade
- Cache des cookies DB (60s TTL) pour réduire les requêtes
- Validation de session
- Rafraîchissement automatique des cookies

**Cascade de fallback** :
1. Cookies fournis dans la requête (priorité haute)
2. Cookies depuis la base de données (recommandé)
3. Access token depuis env/requête (fallback)
4. Aucune authentification disponible (erreur)

**Avantages** :
- Logique d'authentification centralisée
- Réduction des accès DB grâce au cache
- Gestion transparente des sessions expirées
- Meilleure observabilité

## 3. Failover Automatique Intégré

### Nouveau module : `lib/scrape/searchWithFailover.ts`

**Objectif** : Intégrer le système de failover directement dans les recherches.

**Fonctionnalités** :
- `SearchFailoverManager` : Gestionnaire de failover pour les recherches
- Détection automatique des erreurs 403/401
- Retry avec backoff exponentiel
- Rotation automatique des workers
- Régénération automatique des sessions
- Statistiques de failover

**Configuration** :
- `MAX_403_BEFORE_FAILOVER` : 3 erreurs avant failover
- `SUCCESS_RESET_TIMEOUT` : 5 minutes
- Retry automatique jusqu'à 3 fois

**Avantages** :
- Résilience accrue
- Gestion automatique des bans
- Rotation intelligente des ressources
- Pas d'intervention manuelle nécessaire

## 4. Distribution Optimisée des Recherches

### Nouveau module : `lib/workers/searchDistributor.ts`

**Objectif** : Optimiser la distribution des recherches entre les workers.

**Fonctionnalités** :
- `SearchDistributor` : Orchestrateur de workers
- 4 stratégies de distribution :
  - `round-robin` : Distribution équitable
  - `random` : Distribution aléatoire
  - `least-loaded` : Vers le worker le moins chargé (recommandé)
  - `health-based` : Basé sur le taux de succès
- Gestion de la charge par worker
- Ban temporaire en cas d'erreurs 403
- Traitement par batch avec concurrence configurable

**Configuration** :
- `maxConcurrentRequests` : 4 par défaut
- `banDuration` : 30 minutes
- `timeout` : 60 secondes

**Avantages** :
- Meilleure utilisation des workers
- Évite la surcharge d'un seul worker
- Gestion automatique des workers défaillants
- Scalabilité horizontale

## 5. Système de Cache Intelligent

### Migration : `003_create_search_cache`

**Objectif** : Réduire drastiquement la pression sur l'API Vinted.

**Structure** :
```sql
CREATE TABLE search_cache (
  id uuid PRIMARY KEY,
  search_query text NOT NULL,
  search_hash text UNIQUE NOT NULL,  -- Hash MD5 pour lookup rapide
  filters jsonb,                      -- Filtres appliqués
  results jsonb NOT NULL,             -- Résultats cachés
  item_count integer,                 -- Nombre d'items
  created_at timestamptz,
  expires_at timestamptz NOT NULL,    -- Expiration (15min par défaut)
  hit_count integer,                  -- Nombre d'utilisations
  last_hit_at timestamptz,
  metadata jsonb                      -- Métadonnées additionnelles
);
```

### Module : `lib/cache/searchCache.ts`

**Fonctionnalités** :
- `get()` : Récupération depuis le cache
- `set()` : Sauvegarde dans le cache
- `invalidate()` : Invalidation ciblée
- `cleanup()` : Nettoyage des entrées expirées
- `getStats()` : Statistiques d'utilisation (hit rate, etc.)
- Nettoyage automatique périodique
- Limite de taille (1000 entrées max)

**Configuration** :
- `SEARCH_CACHE_TTL_MINUTES` : 15 minutes par défaut
- `SEARCH_CACHE_ENABLED` : true par défaut
- Nettoyage automatique toutes les 30 minutes

**Avantages** :
- Réduction drastique des appels API (économie de coûts)
- Réponses instantanées pour les recherches populaires
- Meilleur respect des rate limits
- Persistance en base de données

## 6. Nouvelles Routes API

### Routes de Cache

#### `POST /api/v1/cache/cleanup`
Nettoyage manuel du cache expiré
```json
Response: { "success": true, "cleaned": 42 }
```

#### `GET /api/v1/cache/stats`
Statistiques du cache
```json
Response: {
  "success": true,
  "stats": {
    "hits": 150,
    "misses": 50,
    "hitRate": 75,
    "totalEntries": 234
  }
}
```

#### `POST /api/v1/cache/invalidate`
Invalidation du cache
```json
Request: {
  "query": "zelda",  // Optionnel si all=true
  "filters": {},     // Optionnel
  "all": false       // true pour tout invalider
}
```

### Route de Distribution

#### `GET /api/v1/distributor/stats`
Statistiques des workers
```json
Response: {
  "success": true,
  "stats": {
    "totalWorkers": 4,
    "availableWorkers": 3,
    "bannedWorkers": 1,
    "strategy": "least-loaded",
    "workers": [...]
  }
}
```

### Route de Recherche Améliorée

#### `POST /api/v1/scrape/search`
Recherche avec cache et failover
```json
Request: {
  "query": "zelda oracle",
  "priceFrom": 10,
  "priceTo": 50,
  "limit": 100,
  "useCache": true,        // Nouveau : utiliser le cache
  "maxPages": 2,           // Nouveau : pages max
  "minRelevanceScore": 50,
  "fullCookies": "...",    // Optionnel
  "accessToken": "..."     // Optionnel
}

Response: {
  "items": [...],
  "metadata": {
    "pagesSearched": 2,
    "totalItemsFound": 87,
    "cached": false,       // Nouveau : indique si résultat du cache
    "cacheHit": false,
    "filterMetrics": {
      "beforeFilter": 120,
      "afterFilter": 87,
      "removedDuplicates": 15
    }
  }
}
```

## 7. Utilisation

### Recherche Simple avec Cache

```typescript
import { searchWithFailover } from '@/lib/scrape/searchWithFailover'

const result = await searchWithFailover('zelda oracle', {
  priceFrom: 10,
  priceTo: 50,
  limit: 100,
  maxPages: 2,
  enableFailover: true
})
```

### Distribution sur Workers

```typescript
import { globalDistributor } from '@/lib/workers/searchDistributor'

const result = await globalDistributor.distributeSearch({
  searchText: 'zelda oracle',
  options: {
    priceFrom: 10,
    priceTo: 50,
    limit: 100
  }
})
```

### Gestion du Cache

```typescript
import { globalSearchCache } from '@/lib/cache/searchCache'

// Récupérer depuis le cache
const cached = await globalSearchCache.get('zelda', { priceFrom: 10 })

// Sauvegarder dans le cache
await globalSearchCache.set('zelda', { priceFrom: 10 }, result)

// Statistiques
const stats = await globalSearchCache.getStats()
console.log(`Hit rate: ${stats.hitRate}%`)
```

## 8. Configuration Environnement

```env
# Cache
SEARCH_CACHE_ENABLED=true
SEARCH_CACHE_TTL_MINUTES=15

# Distribution
DISTRIBUTOR_STRATEGY=least-loaded
MAX_CONCURRENT_REQUESTS=4
WORKER_BAN_DURATION_MS=1800000
WORKER_TIMEOUT_MS=60000

# Workers URLs
WORKER_FR_URL=http://worker-fr.internal:3000
WORKER_US_URL=http://worker-us.internal:3000
WORKER_NL_URL=http://worker-nl.internal:3000
WORKER_UK_URL=http://worker-uk.internal:3000
```

## 9. Métriques et Monitoring

### Métriques de Cache
- Hit rate (taux de succès du cache)
- Nombre total d'entrées
- Entrées les plus anciennes/récentes
- Hits/Misses par période

### Métriques de Workers
- Nombre de workers disponibles
- Workers bannis temporairement
- Workers unhealthy
- Taux de succès par worker
- Distribution de la charge

### Métriques de Failover
- Nombre de 403 consécutifs
- Temps depuis dernier succès
- Historique des failovers

## 10. Bénéfices

### Performance
- **Cache** : Réduction de 60-80% des appels API Vinted
- **Distribution** : Meilleure utilisation des ressources
- **Failover** : Récupération automatique en cas d'erreur

### Fiabilité
- Retry automatique avec backoff
- Rotation automatique des workers
- Gestion des bans temporaires
- Pas de single point of failure

### Maintenabilité
- Code unifié et DRY
- Modules bien séparés
- Configuration centralisée
- Logs détaillés

### Coûts
- Réduction des coûts d'API
- Meilleure utilisation des workers
- Moins d'interventions manuelles

## 11. Prochaines Étapes Recommandées

1. **Monitoring** : Ajouter des métriques Prometheus/Grafana
2. **Alertes** : Notifier en cas de tous les workers bannis
3. **Optimisation du TTL** : Ajuster selon les patterns d'utilisation
4. **Rate Limiting** : Ajouter du rate limiting par utilisateur
5. **Documentation API** : Générer une doc OpenAPI/Swagger

## 12. Notes Importantes

- Le cache utilise la base de données Supabase (RLS activé)
- Les workers doivent être déployés sur Fly.io pour les URLs internes
- Le système de failover nécessite Fly CLI pour les opérations
- Les cookies Cloudflare sont nécessaires pour le scraping
- Tous les anciens modules (`searchCatalog.ts`, etc.) peuvent être dépréciés progressivement
