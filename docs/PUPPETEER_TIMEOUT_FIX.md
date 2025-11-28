# 🔧 Fix Puppeteer Timeout sur Fly.io

## Problème

Puppeteer timeout avec l'erreur :
```
ProtocolError: Network.enable timed out. Increase the 'protocolTimeout' setting in launch/connect calls for a higher timeout if needed.
```

L'erreur se produit après environ 2 minutes 25 secondes, ce qui dépasse le timeout par défaut de 30 secondes et même le timeout de 2 minutes que nous avions configuré.

## Solution Appliquée

### 1. Augmentation du Timeout Protocol

**Avant** : `protocolTimeout: 120000` (2 minutes)
**Après** : `protocolTimeout: 300000` (5 minutes)

### 2. Ajout d'un Timeout pour le Lancement

Ajout de `timeout: 120000` (2 minutes) pour le lancement du navigateur lui-même.

### 3. Optimisation pour Fly.io

Ajout de l'argument `--single-process` qui peut aider sur des environnements avec peu de ressources comme Fly.io.

## Fichiers Modifiés

- `lib/scrape/cookieGenerator.ts` (2 occurrences de `puppeteer.launch()`)

## Changements Détaillés

### Première occurrence (ligne ~160)
```typescript
const browser = await puppeteer.launch({
  headless: 'new',
  executablePath,
  protocolTimeout: 300000, // 5 minutes (augmenté de 2 minutes)
  timeout: 120000, // 2 minutes pour le lancement
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-dev-shm-usage',
    '--window-size=1920,1080',
    '--disable-gpu',
    '--single-process', // Nouveau : aide sur Fly.io
  ],
})
```

### Deuxième occurrence (ligne ~632)
```typescript
browser = await puppeteer.launch({
  headless: true,
  executablePath,
  protocolTimeout: 300000, // 5 minutes (augmenté de 2 minutes)
  timeout: 120000, // 2 minutes pour le lancement
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
    '--disable-web-security',
    '--disable-features=VizDisplayCompositor',
    '--single-process', // Nouveau : aide sur Fly.io
    '--user-agent=...'
  ]
})
```

## Pourquoi ces changements ?

1. **`protocolTimeout: 300000`** : Sur Fly.io, Chromium peut prendre plus de temps à démarrer et à établir la connexion CDP. 5 minutes donnent une marge de sécurité.

2. **`timeout: 120000`** : Timeout spécifique pour le lancement du processus Chromium. Si Chromium ne démarre pas en 2 minutes, on échoue rapidement.

3. **`--single-process`** : Utilise un seul processus au lieu de plusieurs, ce qui peut réduire la consommation mémoire et améliorer la stabilité sur des environnements avec peu de ressources.

## Prochaines Étapes

1. **Redéployer le main worker** :
   ```bash
   fly deploy --app main-worker-small-silence-2788 --config fly.main-worker.toml
   ```

2. **Vérifier les logs** :
   ```bash
   fly logs --app main-worker-small-silence-2788 | grep -i "puppeteer\|cookie\|timeout"
   ```

3. **Tester la génération de cookies** :
   ```bash
   curl -X POST https://main-worker-small-silence-2788.fly.dev/api/v1/token/refresh/force \
     -H "x-api-key: vinted_scraper_secure_2024"
   ```

## Si le problème persiste

Si le timeout persiste même avec 5 minutes, cela peut indiquer :

1. **Chromium ne démarre pas** : Vérifier que Chromium est correctement installé dans le Dockerfile
2. **Problème de ressources** : Fly.io peut avoir des limitations de ressources qui empêchent Chromium de démarrer
3. **Problème réseau** : La connexion CDP peut être bloquée par le réseau Fly.io

### Solutions alternatives

1. **Augmenter encore le timeout** (jusqu'à 10 minutes si nécessaire)
2. **Vérifier les ressources Fly.io** : S'assurer que la machine a suffisamment de RAM/CPU
3. **Utiliser un service externe** : Si Puppeteer ne fonctionne pas sur Fly.io, utiliser un service externe pour générer les cookies (ex: Browserless.io, ScrapingBee)

## Vérification

Après le déploiement, vérifier que :
- ✅ Puppeteer démarre sans erreur
- ✅ Chromium se lance correctement
- ✅ Les cookies sont générés avec succès
- ✅ Les cookies sont stockés en base de données

