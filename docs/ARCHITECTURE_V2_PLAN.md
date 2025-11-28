# 🏗️ Architecture V2 - Documentation Complète

## 📑 Table des Matières

1. [Architecture Actuelle](#-architecture-actuelle-implémentée) - Vue d'ensemble détaillée du système
2. [Composants Principaux](#composants-principaux) - Main Worker et Workers Régionaux
3. [Flux d'Exécution](#flux-dexécution-détaillé) - Cycles automatiques, health checks, gestion des erreurs
4. [Endpoints API](#endpoints-api) - Liste complète des endpoints
5. [Variables d'Environnement](#variables-denvironnement) - Configuration du système
6. [Logs et Monitoring](#logs-et-monitoring) - Comment surveiller le système
7. [Problèmes Identifiés](#-problèmes-identifiés-dans-larchitecture-actuelle) - Historique des problèmes résolus
8. [Migration](#-migration) - Comparaison avant/après
9. [Monitoring et Troubleshooting](#-monitoring-et-troubleshooting) - Guide de dépannage

## 📐 Architecture Actuelle (Implémentée)

### Vue d'Ensemble

L'architecture V2 est basée sur un système de **Load Balancer centralisé** (Main Worker) qui orchestre les cycles d'alertes et distribue les commandes vers des **Workers Régionaux** (FR, US, NL, UK).

```
┌─────────────────────────────────────────────────────────────┐
│                    MAIN WORKER                              │
│  (main-worker-small-silence-2788)                           │
│                                                              │
│  • Health Checks (toutes les 1 min)                        │
│  • Déclenchement automatique des cycles (toutes les 5 min)  │
│  • Distribution PARALLÈLE des alertes                      │
│  • Gestion des bans (30 min)                                │
│  • Collecte et agrégation des résultats                     │
└─────────────────────────────────────────────────────────────┘
                        │
                        │ Divise les alertes
                        │ Envoie en PARALLÈLE
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ WORKER FR    │ │ WORKER US     │ │ WORKER NL/UK │
│ (cdg)        │ │ (iad)         │ │ (ams/lhr)    │
│              │ │               │ │              │
│ • Reçoit     │ │ • Reçoit      │ │ • Reçoit     │
│   commandes  │ │   commandes   │ │   commandes  │
│   (11 alertes)│ │   (10 alertes)│ │   (10 alertes)│
│ • Récupère   │ │ • Récupère    │ │ • Récupère   │
│   cookies DB │ │   cookies DB  │ │   cookies DB │
│ • Exécute    │ │ • Exécute     │ │ • Exécute    │
│   vérif.     │ │   vérif.      │ │   vérif.     │
│   EN PARALLÈLE│ │   EN PARALLÈLE│ │   EN PARALLÈLE│
└──────────────┘ └──────────────┘ └──────────────┘
        │               │               │
        └───────────────┼───────────────┘
                        │
                        │ Résultats agrégés
                        ▼
              📊 Cycle terminé: X match(s) total
```

### Composants Principaux

#### 1. Main Worker (Load Balancer)

**Rôle** : Orchestrateur central qui gère la distribution des commandes et la santé des workers.

**Fichier** : `scripts/main-worker.ts`

**Fonctionnalités** :

1. **Health Checks Automatiques**
   - Vérifie la santé de tous les workers toutes les 1 minute (`HEALTH_CHECK_INTERVAL_MS`)
   - Endpoint utilisé : `GET /api/v1/worker/health` sur chaque worker
   - Marque les workers comme `healthy` ou `unhealthy`
   - Logs : `✅ Worker FR (cdg): Healthy` ou `⚠️ Worker FR (cdg): Unhealthy`

2. **Déclenchement Automatique des Cycles d'Alertes (Traitement en Parallèle)**
   - Fonction : `triggerAlertCycle()`
   - Intervalle : 5 minutes par défaut (`ALERT_CHECK_INTERVAL_MS = 300000`)
   - Délai initial : 1 minute après le démarrage (pour laisser les workers s'initialiser)
   - **Traitement en parallèle** : Les alertes sont divisées entre tous les workers disponibles et traitées simultanément
   - Processus :
     ```
     1. Vérifie s'il y a des alertes actives dans la DB
     2. Si aucune alerte → skip (log debug)
     3. Si alertes présentes → récupère toutes les alertes actives
     4. Récupère tous les workers disponibles (healthy et non bannis)
     5. Divise les alertes en groupes égaux pour chaque worker
     6. Crée une commande `check-alerts` pour chaque worker avec son sous-ensemble d'alertes
     7. Envoie toutes les commandes EN PARALLÈLE (Promise.allSettled)
     8. Collecte tous les résultats et log un résumé global
     ```
   - **Avantages** :
     - Traitement 4x plus rapide (si 4 workers disponibles)
     - Répartition de la charge sur différentes IPs/régions → évite les rate limits
     - Résilience : si un worker échoue, les autres continuent

3. **Load Balancing**
   - Stratégies disponibles :
     - `random` (par défaut) : Sélection aléatoire d'un worker disponible
     - `round-robin` : Rotation séquentielle
     - `least-used` : Worker avec le moins de requêtes
     - `health-based` : Worker avec le meilleur ratio succès/erreurs
   - Configuration : Variable d'environnement `LB_STRATEGY`

4. **Gestion des Bans**
   - Durée : 30 minutes (`WORKER_BAN_DURATION_MS = 1800000`)
   - Déclenchement : Automatique sur erreur 401 ou 403
   - Réactivation : Automatique après expiration du ban
   - Logs : `🚫 Worker FR (cdg) banni temporairement pour 1800s`

5. **Retry Automatique**
   - Nombre de tentatives : 3 (`MAX_RETRIES`)
   - Comportement :
     - Si erreur 403 → rotation vers un autre worker
     - Si autre erreur → retry avec un autre worker
     - Si toutes les tentatives échouent → retourne une erreur

**Configuration** (`fly.main-worker.toml`) :
```toml
[env]
  HEALTH_CHECK_INTERVAL_MS = '60000'        # 1 minute
  ALERT_CHECK_INTERVAL_MS = '300000'         # 5 minutes
  LB_STRATEGY = 'random'                      # Stratégie de load balancing
  MAX_RETRIES = '3'                          # Nombre de tentatives
  WORKER_BAN_DURATION_MS = '1800000'        # 30 minutes
  WORKER_REQUEST_TIMEOUT_MS = '30000'        # 30 secondes
```

#### 2. Workers Régionaux

**Rôle** : Exécutent les commandes reçues du Main Worker.

**Fichiers** :
- `app/api/v1/worker/execute/route.ts` : Endpoint qui reçoit les commandes
- `scripts/worker-alerts.ts` : Worker autonome (si `AUTO_RUN_CYCLE=true`)

**Fonctionnalités** :

1. **Réception des Commandes**
   - Endpoint : `POST /api/v1/worker/execute`
   - Authentification : Header `x-api-key` requis
   - Types de commandes supportées :
     - `check-alerts` : Vérification des alertes
     - `scrape` : Scraping d'une URL
     - `generate-cookies` : Génération de cookies
     - `custom` : Commandes personnalisées

2. **Exécution de la Commande `check-alerts`**
   ```
   1. Récupère les cookies depuis la DB (obligatoire)
      - Utilise `getCookiesForScraping()` 
      - Si pas de cookies → retourne erreur `NO_SCRAPING_COOKIES`
   2. Appelle `checkAlertsStandalone(cookies)` avec les alertes du payload
   3. Retourne les résultats (matches, erreurs, etc.)
   ```

3. **Gestion des Erreurs**
   - `NO_SCRAPING_COOKIES` : Retourne 503 avec message explicite
   - Erreur 403 : Retourne l'erreur au Main Worker (qui bannira le worker)
   - Autres erreurs : Retourne l'erreur avec détails

**Configuration** (`fly.worker-*.toml`) :
```toml
[env]
  # Pas de configuration spécifique nécessaire
  # Les cookies sont récupérés depuis la DB
  # AUTO_RUN_CYCLE désactivé par défaut
```

### Flux d'Exécution Détaillé

#### Cycle Automatique d'Alertes

```
1. Main Worker démarre
   ↓
2. initializeMainWorker() appelé
   ├─→ Health checks initiaux
   ├─→ setInterval(health checks, 1 min)
   ├─→ setTimeout(triggerAlertCycle, 1 min)  ← Premier cycle après 1 min
   └─→ setInterval(triggerAlertCycle, 5 min)  ← Cycles suivants toutes les 5 min
   ↓
3. triggerAlertCycle() exécuté
   ├─→ Vérifie alertes actives dans DB
   ├─→ Si aucune alerte → skip
   └─→ Si alertes présentes → continue
   ↓
4. Récupère tous les workers disponibles (healthy et non bannis)
   ├─→ Worker FR (cdg): disponible
   ├─→ Worker US (iad): disponible
   ├─→ Worker NL (ams): disponible
   └─→ Worker UK (lhr): disponible
   ↓
5. Divise les alertes en groupes égaux pour chaque worker
   ├─→ Worker FR: 11 alertes (41 / 4 = 10.25 → arrondi)
   ├─→ Worker US: 10 alertes
   ├─→ Worker NL: 10 alertes
   └─→ Worker UK: 10 alertes
   ↓
6. Crée une commande check-alerts pour chaque worker
   {
     type: 'check-alerts',
     payload: {
       alerts: [alerte1, alerte2, ...] // Sous-ensemble pour ce worker
     }
   }
   ↓
7. Envoie toutes les commandes EN PARALLÈLE (Promise.allSettled)
   ├─→ POST https://worker-fr-icy-night-8180.fly.dev/api/v1/worker/execute
   ├─→ POST https://worker-us-xxx.fly.dev/api/v1/worker/execute
   ├─→ POST https://worker-nl-xxx.fly.dev/api/v1/worker/execute
   └─→ POST https://worker-uk-xxx.fly.dev/api/v1/worker/execute
   ↓
8. Chaque Worker Régional traite sa commande en parallèle
   ├─→ Vérifie API key
   ├─→ Récupère cookies depuis DB (getCookiesForScraping)
   ├─→ Si pas de cookies → retourne NO_SCRAPING_COOKIES
   └─→ Si cookies OK → exécute checkAlertsStandalone(cookies)
   ↓
9. checkAlertsStandalone() exécuté sur chaque worker
   ├─→ Pour chaque alerte (du sous-ensemble) :
   │   ├─→ Recherche sur Vinted (délai 12-25s entre requêtes)
   │   ├─→ Filtre les items selon critères (prix, condition)
   │   └─→ Détecte les matches
   ├─→ Envoie notifications Telegram si matches trouvés
   └─→ Retourne résultats
   ↓
10. Chaque Worker retourne ses résultats au Main Worker
    {
      success: true,
      data: {
        matches: [...],
        alertsChecked: 11,
        itemsChecked: 45
      }
    }
    ↓
11. Main Worker collecte tous les résultats
    ├─→ Calcule le total de matches trouvés
    ├─→ Compte les workers réussis/échoués
    └─→ Log résumé global
    📊 Cycle terminé en 45.23s: 4/4 worker(s) réussi(s), 12 match(s) total, 0 erreur(s)
    ✅ Worker FR (cdg): 3 match(s) trouvé(s) sur 11 alerte(s)
    ✅ Worker US (iad): 4 match(s) trouvé(s) sur 10 alerte(s)
    ✅ Worker NL (ams): 2 match(s) trouvé(s) sur 10 alerte(s)
    ✅ Worker UK (lhr): 3 match(s) trouvé(s) sur 10 alerte(s)
```

#### Health Check

```
1. setInterval(checkAllWorkersHealth, 1 min)
   ↓
2. Pour chaque worker :
   ├─→ GET https://worker-fr-icy-night-8180.fly.dev/api/v1/worker/health
   ├─→ Timeout: 15 secondes
   └─→ Si OK → worker.isHealthy = true
       Si erreur → worker.isHealthy = false
   ↓
3. Logs :
   ✅ Worker FR (cdg): Healthy
   ✅ Worker US (iad): Healthy
   ⚠️ Worker NL (ams): Unhealthy - Connection timeout
```

#### Gestion des Erreurs 403

```
1. Worker Régional reçoit erreur 403 de Vinted
   ↓
2. Retourne erreur au Main Worker
   {
     success: false,
     error: "HTTP 403",
     httpStatus: 403
   }
   ↓
3. Main Worker détecte 403
   ├─→ banWorker(worker) → worker.isBanned = true
   ├─→ worker.bannedUntil = Date.now() + 30 min
   └─→ Log: 🚫 Worker FR (cdg) banni pour 403 Forbidden
   ↓
4. distributeCommand() retry avec autre worker
   ├─→ Sélectionne un worker non banni
   └─→ Envoie la commande
   ↓
5. Après 30 minutes
   ├─→ isWorkerAvailable() détecte expiration
   ├─→ worker.isBanned = false
   └─→ Log: ✅ Worker FR (cdg) réactivé après expiration du ban
```

### Endpoints API

#### Main Worker

- `GET /api/health` : Health check du main worker
- `GET /api/v1/worker/main/stats` : Statistiques des workers
- `POST /api/v1/alerts/run-once` : Déclenchement manuel d'un cycle (alternative au cycle automatique)
- `POST /api/v1/worker/main/execute` : Envoi de commande via load balancer

#### Workers Régionaux

- `GET /api/health` : Health check du worker
- `GET /api/v1/worker/health` : Health check détaillé (utilisé par Main Worker)
- `POST /api/v1/worker/execute` : Exécution de commande (appelé par Main Worker)

### Variables d'Environnement

#### Main Worker

| Variable | Défaut | Description |
|----------|--------|-------------|
| `HEALTH_CHECK_INTERVAL_MS` | `60000` | Intervalle entre health checks (1 min) |
| `ALERT_CHECK_INTERVAL_MS` | `300000` | Intervalle entre cycles d'alertes (5 min) |
| `LB_STRATEGY` | `random` | Stratégie de load balancing |
| `MAX_RETRIES` | `3` | Nombre de tentatives en cas d'erreur |
| `WORKER_BAN_DURATION_MS` | `1800000` | Durée du ban (30 min) |
| `WORKER_REQUEST_TIMEOUT_MS` | `30000` | Timeout des requêtes (30s) |

#### Workers Régionaux

| Variable | Défaut | Description |
|----------|--------|-------------|
| `AUTO_RUN_CYCLE` | `false` | Active les cycles automatiques (non recommandé) |
| `ENABLE_FAILOVER` | `false` | Active le failover automatique sur 403 |

### Logs et Monitoring

#### Logs du Main Worker

```
🚀 Initialisation du Main Worker (Load Balancer)...
📋 Stratégie de load balancing: random
📋 Workers configurés: 4
   - Worker FR (cdg): https://worker-fr-icy-night-8180.fly.dev
   - Worker US (iad): https://worker-us-late-dream-9122.fly.dev
   ...
📋 Intervalle de vérification des alertes: 5 minutes
🏥 Vérification de la santé de tous les workers...
✅ Worker FR (cdg): Healthy
✅ Worker US (iad): Healthy
...
🔔 Déclenchement automatique du cycle de vérification des alertes (5 alerte(s))...
🔄 Tentative 1/3 avec Worker FR (cdg)
✅ Cycle d'alertes terminé avec succès via worker-fr: 2 match(s) trouvé(s)
```

#### Logs des Workers Régionaux

```
🔧 Worker worker-fr-icy-night-8180 (cdg): Exécution d'une commande de type "check-alerts"
🔔 Worker worker-fr-icy-night-8180 (cdg): Vérification des alertes
✅ Worker worker-fr-icy-night-8180 (cdg): Cookies récupérés depuis la DB
✅ Worker worker-fr-icy-night-8180 (cdg): Commande exécutée avec succès
```

## 📋 Problèmes Identifiés dans l'Architecture Actuelle

### A. Initialisation "Magique"
- **Problème** : Side-effects cachés au démarrage (load balancer, cron cookies, auto-run cycles)
- **Impact** : Debug compliqué, comportement non déterministe
- **Solution** : Endpoints explicites, pas de side-effects cachés

### B. Gestion des Cookies Complexe
- **Problème** : Deux types de cookies, plusieurs sources, fallbacks silencieux
- **Impact** : 401/403 random, utilisation de cookies expirés sans le voir
- **Solution** : Une seule source de vérité (DB), pas de fallback silencieux

### C. Load Balancer en Mémoire
- **Problème** : État perdu au redémarrage, bans en mémoire
- **Impact** : Comportement aléatoire après restart
- **Solution** : État en DB (étape 3 optionnelle)

### D. Cron Implicite dans les Workers
- **Problème** : AUTO_RUN_CYCLE sur plusieurs workers → double exécution
- **Impact** : Rate limit, spam, doublons
- **Solution** : Orchestration centralisée via endpoint

### E. Couplage Fort
- **Problème** : Next.js + Worker + Scraper + Puppeteer dans la même base
- **Impact** : Fragilité, difficulté à raisonner
- **Solution** : Séparation des responsabilités

## ✅ Étape 1 : Stabiliser la Gestion des Cookies (IMPLÉMENTÉE)

### Changements Appliqués

1. **Suppression du fallback silencieux** :
   - `getCookiesForScraping()` ne fait plus de fallback sur `VINTED_FULL_COOKIES`
   - Retourne `null` explicitement si pas de cookies en DB
   - Logs d'erreur clairs : `NO_SCRAPING_COOKIES`

2. **Route de debug** :
   - `GET /api/v1/token/status` - Vérifie l'état des cookies
   - Retourne : `hasActiveCookies`, `lastRefreshAt`, `cookiesPreview`

3. **Amélioration du logging** :
   - `refreshTokens()` loggue maintenant toutes les erreurs Puppeteer
   - Vérifie que Puppeteer est disponible
   - Logs détaillés pour Supabase (erreurs de table, permissions)

### Résultat Attendu

- Les workers échouent explicitement si pas de cookies en DB
- Plus d'utilisation silencieuse de cookies expirés
- Debug facilité via `/api/v1/token/status`

## ✅ Étape 2 : Arrêter les Cron Implicites (IMPLÉMENTÉE)

### Changements Appliqués

1. **Désactivation de AUTO_RUN_CYCLE par défaut** :
   - `AUTO_RUN_CYCLE` doit être explicitement `true` pour s'activer
   - Par défaut : `false` (désactivé)

2. **Endpoint d'orchestration** :
   - `POST /api/v1/alerts/run-once` - Orchestre un cycle complet
   - Récupère les alertes actives
   - Sélectionne un worker aléatoire
   - Envoie la commande via load balancer
   - Gère les erreurs (NO_SCRAPING_COOKIES → refresh automatique)

3. **Workers ne récupèrent plus les cookies depuis le payload** :
   - Les workers récupèrent toujours depuis la DB
   - Plus de confusion entre cookies favoris et scraping

### Résultat Attendu

- Plus de double exécution
- Orchestration centralisée et prévisible
- Scheduler externe peut appeler `/api/v1/alerts/run-once` toutes les X minutes

## 📝 Utilisation de la Nouvelle Architecture

### 1. Vérifier l'État des Cookies

```bash
curl https://main-worker-small-silence-2788.fly.dev/api/v1/token/status
```

Réponse :
```json
{
  "hasActiveCookies": true,
  "cookiesSource": "database",
  "lastRefreshAt": "2025-11-26T12:00:00Z",
  "cookiesPreview": "cf_clearance=...",
  "env": {
    "hasVINTED_FULL_COOKIES": true,
    "hasCloudflareCookies": true,
    "note": "VINTED_FULL_COOKIES présent mais non utilisé pour scraping (DB uniquement)"
  }
}
```

### 2. Forcer la Génération des Cookies

```bash
curl -X POST https://main-worker-small-silence-2788.fly.dev/api/v1/token/refresh/force \
  -H "x-api-key: vinted_scraper_secure_2024"
```

### 3. Lancer un Cycle de Vérification

```bash
curl -X POST https://main-worker-small-silence-2788.fly.dev/api/v1/alerts/run-once \
  -H "x-api-key: vinted_scraper_secure_2024"
```

### 4. Déclenchement Automatique (Implémenté)

**Le Main Worker déclenche automatiquement les cycles** toutes les 5 minutes (configurable via `ALERT_CHECK_INTERVAL_MS`).

**Aucun scheduler externe n'est nécessaire** pour le fonctionnement de base.

**Option Alternative : Scheduler Externe** (si vous voulez un contrôle plus fin)

Si vous préférez déclencher manuellement ou avec un intervalle différent, vous pouvez utiliser :

**Option A : GitHub Actions** (gratuit)
```yaml
# .github/workflows/check-alerts.yml
name: Check Alerts
on:
  schedule:
    - cron: '*/5 * * * *'  # Toutes les 5 minutes
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Alert Check
        run: |
          curl -X POST https://main-worker-small-silence-2788.fly.dev/api/v1/alerts/run-once \
            -H "x-api-key: ${{ secrets.API_SECRET }}"
```

**Option B : cron-job.org** (gratuit)
- Créer un job qui appelle `POST /api/v1/alerts/run-once` toutes les 5 minutes

**Option C : Fly.io Cron** (si disponible)
- Utiliser les cron jobs Fly.io si supportés

**Note** : Si vous utilisez un scheduler externe, vous pouvez désactiver le déclenchement automatique en définissant `ALERT_CHECK_INTERVAL_MS` à une valeur très élevée.

## 🔄 Migration

### Avant (Architecture V1)
```
Worker démarre
  ↓
AUTO_RUN_CYCLE=true
  ↓
setInterval() → runFullCycle() toutes les X minutes
  ↓
Récupère cookies (DB → fallback env)
  ↓
Vérifie les alertes
```

### Après (Architecture V2 - Actuel)
```
Main Worker démarre
  ↓
initializeMainWorker()
  ├─→ Health checks initiaux
  ├─→ setInterval(health checks, 1 min)
  ├─→ setTimeout(triggerAlertCycle, 1 min)  ← Premier cycle
  └─→ setInterval(triggerAlertCycle, 5 min)  ← Cycles automatiques
  ↓
triggerAlertCycle() (automatique toutes les 5 min)
  ├─→ Vérifie alertes actives dans DB
  ├─→ Si aucune alerte → skip
  └─→ Si alertes présentes → continue
  ↓
Main Worker orchestre
  ├─→ Récupère alertes actives
  ├─→ Sélectionne worker (random/round-robin/etc.)
  └─→ Envoie commande via distributeCommand()
  ↓
Worker régional
  ├─→ Reçoit commande check-alerts
  ├─→ Récupère cookies depuis DB (obligatoire)
  └─→ Exécute checkAlertsStandalone(cookies)
  ↓
Retourne résultats au Main Worker
  ↓
Main Worker log les résultats
```

**Note** : Un scheduler externe peut toujours être utilisé pour déclencher manuellement via `POST /api/v1/alerts/run-once`, mais ce n'est plus nécessaire car le Main Worker déclenche automatiquement les cycles.

## ⚠️ Breaking Changes

1. **AUTO_RUN_CYCLE désactivé par défaut sur les Workers Régionaux** :
   - Les workers régionaux ne lancent plus de cycles automatiques par défaut
   - Les cycles sont maintenant orchestrés par le Main Worker automatiquement
   - Pour activer les cycles automatiques sur un worker régional : définir `AUTO_RUN_CYCLE=true` (non recommandé)

2. **Pas de fallback sur VINTED_FULL_COOKIES** :
   - Les workers échouent explicitement si pas de cookies en DB
   - Il faut générer les cookies via le main worker ou le Cookie Factory

3. **Workers ne reçoivent plus les cookies dans le payload** :
   - Les cookies sont toujours récupérés depuis la DB par les workers
   - Le Main Worker n'envoie que les alertes dans le payload

## 🔍 Monitoring et Troubleshooting

### Vérifier l'État du Système

#### 1. Vérifier les Logs du Main Worker

```bash
fly logs --app main-worker-small-silence-2788 --no-tail
```

**Logs attendus** :
- `✅ Main Worker initialisé`
- `🏥 Vérification de la santé de tous les workers...`
- `✅ Worker FR (cdg): Healthy`
- `🔔 Déclenchement automatique du cycle de vérification des alertes...`
- `✅ Cycle d'alertes terminé avec succès via worker-fr: X match(s) trouvé(s)`

#### 2. Vérifier les Logs d'un Worker Régional

```bash
fly logs --app worker-fr-icy-night-8180 --no-tail
```

**Logs attendus** :
- `✅ Cookies récupérés depuis la DB`
- `🔔 Worker worker-fr-icy-night-8180 (cdg): Vérification des alertes`
- `✅ Worker worker-fr-icy-night-8180 (cdg): Commande exécutée avec succès`

#### 3. Vérifier les Statistiques des Workers

```bash
curl https://main-worker-small-silence-2788.fly.dev/api/v1/worker/main/stats \
  -H "x-api-key: vinted_scraper_secure_2024"
```

**Réponse** :
```json
{
  "totalWorkers": 4,
  "availableWorkers": 3,
  "bannedWorkers": 1,
  "unhealthyWorkers": 0,
  "workers": [
    {
      "id": "worker-fr",
      "name": "Worker FR",
      "region": "cdg",
      "isHealthy": true,
      "isBanned": false,
      "requestCount": 42,
      "successCount": 40,
      "errorCount": 2,
      "successRate": 95.24
    }
  ]
}
```

#### 4. Vérifier l'État des Cookies

```bash
curl https://main-worker-small-silence-2788.fly.dev/api/v1/token/status
```

### Problèmes Courants

#### Problème : Aucun cycle d'alertes déclenché

**Symptômes** :
- Pas de logs `🔔 Déclenchement automatique du cycle...`
- Les alertes ne sont pas vérifiées

**Solutions** :
1. Vérifier que `ALERT_CHECK_INTERVAL_MS` est configuré (par défaut 5 min)
2. Vérifier les logs du Main Worker pour des erreurs
3. Vérifier qu'il y a des alertes actives dans la DB
4. Vérifier que le Main Worker est bien démarré

#### Problème : Workers bannis en permanence

**Symptômes** :
- Logs : `🚫 Worker FR (cdg) banni pour 403 Forbidden`
- `availableWorkers: 0` dans les stats

**Solutions** :
1. Attendre 30 minutes (durée du ban)
2. Vérifier les cookies dans la DB (peut-être expirés)
3. Régénérer les cookies via `/api/v1/token/refresh/force`
4. Vérifier que les workers peuvent accéder à la DB

#### Problème : Erreur `NO_SCRAPING_COOKIES`

**Symptômes** :
- Logs : `❌ NO_SCRAPING_COOKIES - Impossible de récupérer les cookies depuis la DB`
- Les cycles échouent systématiquement

**Solutions** :
1. Vérifier qu'il y a des cookies Cloudflare dans la DB
2. Générer des cookies via le Cookie Factory
3. Vérifier les secrets Fly.io (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

#### Problème : Workers unhealthy

**Symptômes** :
- Logs : `⚠️ Worker FR (cdg): Unhealthy`
- Health checks échouent

**Solutions** :
1. Vérifier que le worker est démarré : `fly status --app worker-fr-icy-night-8180`
2. Vérifier les logs du worker pour des erreurs
3. Vérifier que l'endpoint `/api/v1/worker/health` répond
4. Redémarrer le worker si nécessaire : `fly restart --app worker-fr-icy-night-8180`

## 🚀 Prochaines Étapes (Optionnelles)

### Étape 3 : Job System (Optionnel)
- Table `alert_runs` pour tracer les exécutions
- Historique des runs, erreurs, matches
- Métriques de performance

### Étape 4 : Load Balancer en DB (Optionnel)
- Table `worker_status` pour persister l'état
- Bans et stats persistés
- Survie aux redémarrages

### Étape 5 : Nettoyage
- Config typée (Zod)
- Logs structurés (Pino)
- Factorisation de la logique Vinted

## 📊 Comparaison Avant/Après

| Aspect | Avant (V1) | Après (V2) |
|--------|------------|------------|
| **Cookies** | DB → Env (fallback silencieux) | DB uniquement (erreur explicite) |
| **Cycles** | AUTO_RUN_CYCLE sur chaque worker | Orchestration centralisée automatique (Main Worker) |
| **Debug** | Difficile (logs éparpillés) | `/api/v1/token/status` + logs clairs |
| **Prévisibilité** | Aléatoire (dépend du timing) | Déterministe (orchestration centralisée) |
| **Scheduler** | Implicite (setInterval sur chaque worker) | Automatique (Main Worker) ou explicite (scheduler externe optionnel) |
| **Load Balancing** | Aucun | Random/Round-robin/Least-used/Health-based |
| **Gestion des Erreurs** | Basique | Bans automatiques, retry, failover |
| **Health Checks** | Aucun | Automatiques toutes les 1 minute |

