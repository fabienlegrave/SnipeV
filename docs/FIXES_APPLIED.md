# 🔧 Corrections Appliquées - Architecture V2

## ✅ Corrections Implémentées

### 1. Puppeteer Timeout Fix

**Problème** : `ProtocolError: Network.enable timed out`

**Solution** : Ajout de `protocolTimeout: 120000` (2 minutes) dans tous les `puppeteer.launch()`

**Fichiers modifiés** :
- `lib/scrape/cookieGenerator.ts` (2 occurrences)

### 2. Health Check Fix

**Problème** : Tous les workers marqués comme "Unhealthy" - le middleware bloquait `/api/v1/worker/health`

**Solution** : 
- Ajout de `/api/v1/worker/health` aux routes publiques dans le middleware
- Augmentation du timeout du health check de 10s à 15s

**Fichiers modifiés** :
- `middleware.ts` - Route publique ajoutée
- `scripts/main-worker.ts` - Timeout augmenté

### 3. Gestion des Cookies Stabilisée

**Problème** : Fallback silencieux sur cookies expirés

**Solution** :
- `getCookiesForScraping()` ne fait plus de fallback sur `VINTED_FULL_COOKIES`
- Retourne `null` explicitement si pas de cookies en DB
- Logs d'erreur clairs : `NO_SCRAPING_COOKIES`

**Fichiers modifiés** :
- `lib/utils/getCookiesFromDb.ts` - Suppression du fallback silencieux

### 4. Route de Debug Ajoutée

**Nouveau** : `GET /api/v1/token/status`

**Fichiers créés** :
- `app/api/v1/token/status/route.ts`

### 5. Logging Amélioré

**Améliorations** :
- Vérification que Puppeteer est disponible avant de lancer
- Logs détaillés pour toutes les erreurs (Puppeteer, Supabase, table manquante)
- Messages d'aide clairs pour chaque type d'erreur

**Fichiers modifiés** :
- `scripts/token-refresh-worker.ts` - Logging amélioré

### 6. AUTO_RUN_CYCLE Désactivé par Défaut

**Problème** : Cycles automatiques sur tous les workers → double exécution

**Solution** :
- `AUTO_RUN_CYCLE` doit être explicitement `true` pour s'activer
- Par défaut : `false` (désactivé)

**Fichiers modifiés** :
- `lib/init/startup.ts` - Désactivation par défaut

### 7. Endpoint d'Orchestration

**Nouveau** : `POST /api/v1/alerts/run-once`

**Fonctionnalités** :
- Récupère les alertes actives
- Sélectionne un worker aléatoire
- Envoie la commande via load balancer
- Gère automatiquement les erreurs `NO_SCRAPING_COOKIES` (refresh auto)

**Fichiers créés** :
- `app/api/v1/alerts/run-once/route.ts`

### 8. Workers Simplifiés

**Changement** : Les workers récupèrent toujours les cookies depuis la DB (pas depuis le payload)

**Fichiers modifiés** :
- `app/api/v1/worker/execute/route.ts` - Récupération depuis DB

## 🚀 Prochaines Actions

### 1. Redéployer Tous les Workers

```bash
bash scripts/deploy.sh
```

### 2. Vérifier l'État des Cookies

```bash
curl https://main-worker-small-silence-2788.fly.dev/api/v1/token/status
```

### 3. Forcer la Génération des Cookies

```bash
curl -X POST https://main-worker-small-silence-2788.fly.dev/api/v1/token/refresh/force \
  -H "x-api-key: vinted_scraper_secure_2024"
```

### 4. Tester l'Orchestration

```bash
curl -X POST https://main-worker-small-silence-2788.fly.dev/api/v1/alerts/run-once \
  -H "x-api-key: vinted_scraper_secure_2024"
```

### 5. Configurer un Scheduler Externe

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

## 📊 Résultats Attendus

### Avant
- ❌ Puppeteer timeout
- ❌ Workers unhealthy
- ❌ Cookies expirés utilisés silencieusement
- ❌ Double exécution des cycles

### Après
- ✅ Puppeteer avec timeout de 2 minutes
- ✅ Health checks fonctionnels
- ✅ Erreurs explicites si pas de cookies en DB
- ✅ Orchestration centralisée

## 🔍 Vérification

### 1. Vérifier les Logs du Main Worker

```bash
fly logs --app main-worker-small-silence-2788 | grep -i "token\|cookie\|puppeteer"
```

Vous devriez voir :
- `✅ Puppeteer disponible`
- `✅ Tokens Cloudflare générés avec succès`
- `✅ Cookies sauvegardés avec succès`

### 2. Vérifier les Health Checks

```bash
fly logs --app main-worker-small-silence-2788 | grep -i "health"
```

Vous devriez voir :
- `✅ Worker FR (cdg): Healthy`
- `✅ Worker US (iad): Healthy`
- `✅ Worker NL (ams): Healthy`
- `✅ Worker UK (lhr): Healthy`

### 3. Vérifier l'État des Cookies

```bash
curl https://main-worker-small-silence-2788.fly.dev/api/v1/token/status
```

Réponse attendue :
```json
{
  "hasActiveCookies": true,
  "cookiesSource": "database",
  "lastRefreshAt": "2025-11-26T...",
  "recommendation": "Cookies valides disponibles"
}
```

