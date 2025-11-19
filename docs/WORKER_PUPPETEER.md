# Worker d'Alertes avec Puppeteer

Worker autonome qui génère automatiquement les cookies via Puppeteer et vérifie les alertes en continu.

## 🎯 Fonctionnalités

- ✅ Génère automatiquement les cookies via Puppeteer (contourne Cloudflare)
- ✅ Vérifie les alertes toutes les X minutes (configurable)
- ✅ Sauvegarde les matches en base de données
- ✅ Tourne en continu (24/7)
- ✅ Gestion automatique des cookies (régénération si nécessaire)

## 🚀 Utilisation

### En local

1. **Configurer les variables d'environnement** (`.env.local`) :
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
API_SECRET=your_secure_api_secret
CHECK_INTERVAL_MINUTES=5
```

2. **Démarrer le worker** :
```bash
npm run worker:alerts
```

Ou directement :
```bash
node scripts/alertsWorkerPuppeteer.js
```

### Sur Railway

**Option 1 : Service séparé (Recommandé)**

1. **Créer un nouveau service** dans Railway pour le worker
2. **Utiliser le Dockerfile.worker** :
   - Dans Railway → New Service → GitHub Repo
   - Sélectionnez votre repo
   - Railway détectera automatiquement `Dockerfile.worker`
   - Ou configurez manuellement : Settings → Dockerfile Path → `Dockerfile.worker`

3. **Configurer les variables d'environnement** :
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
API_SECRET=your_secure_api_secret
CHECK_INTERVAL_MINUTES=5
API_BASE_URL=https://your-app.up.railway.app
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
```

4. **Déployer** : Railway lancera automatiquement le worker

**Option 2 : Même service que l'app**

Si vous voulez tout dans un seul service, vous pouvez utiliser un process manager comme `pm2` ou simplement lancer le worker en arrière-plan. Mais l'option 1 est recommandée pour une meilleure isolation.

## ⚙️ Configuration

### Variables d'environnement

| Variable | Description | Défaut |
|----------|-------------|--------|
| `SUPABASE_URL` | URL de votre projet Supabase | Requis |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service role Supabase | Requis |
| `API_SECRET` | Secret API pour l'authentification | `vinted_scraper_secure_2024` |
| `CHECK_INTERVAL_MINUTES` | Intervalle entre les vérifications (minutes) | `5` |
| `PUPPETEER_EXECUTABLE_PATH` | Chemin vers Chromium (Railway) | Auto-détecté |
| `API_BASE_URL` | URL de l'API (si utilisation HTTP) | `http://localhost:3000` |

### Intervalle de vérification

Par défaut, le worker vérifie les alertes toutes les **5 minutes**.

Pour changer :
```bash
CHECK_INTERVAL_MINUTES=10 node scripts/alertsWorkerPuppeteer.js
```

## 🔄 Fonctionnement

### Cycle de vérification

1. **Récupération des cookies** :
   - Génère automatiquement les cookies via Puppeteer (plus besoin de DB)
   - Si pas disponibles ou expirés, génère via Puppeteer
   - Sauvegarde automatiquement en DB

2. **Vérification des alertes** :
   - Lit les alertes actives depuis la DB
   - Pour chaque alerte, interroge l'API Vinted avec filtres
   - Compare les résultats avec les critères de l'alerte

3. **Sauvegarde des matches** :
   - Sauvegarde les items trouvés dans `alert_matches`
   - Met à jour `last_check_at` pour chaque alerte
   - Incrémente `triggered_count` si match trouvé

4. **Attente** :
   - Attend `CHECK_INTERVAL_MINUTES` minutes
   - Répète le cycle

### Gestion des cookies

- **Première utilisation** : Génère les cookies via Puppeteer
- **Utilisations suivantes** : Utilise les cookies de la DB
- **Expiration** : Régénère automatiquement si les cookies ne fonctionnent plus

## 📊 Logs

Le worker affiche des logs détaillés :

```
🚀 Démarrage du worker d'alertes...
⏰ Intervalle de vérification: 5 minutes

============================================================
🔄 Vérification des alertes - 2025-11-17T21:30:00.000Z
============================================================
✅ Cookies récupérés depuis la DB
✅ Utilisation de la version standalone
✅ Vérification terminée:
   - Alertes vérifiées: 2
   - Items vérifiés: 150
   - Matches trouvés: 3

🎯 Matches trouvés:
   - Alerte "Nintendo Switch": Super Mario Odyssey (Title match)
   - Alerte "PlayStation 5": Spider-Man 2 (Title match)

⏱️  Durée: 12s
⏰ Prochaine vérification dans 5 minutes...
```

## 🐛 Dépannage

### Erreur : "Puppeteer non installé"

**Solution** :
```bash
npm install puppeteer puppeteer-extra puppeteer-extra-plugin-stealth
```

### Erreur : "Could not find Chrome"

**Sur Windows** :
```bash
NODE_TLS_REJECT_UNAUTHORIZED=0 npx puppeteer browsers install chrome
```

**Sur Railway** :
- Chromium est installé via le Dockerfile
- Vérifiez `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`

### Erreur : "SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis"

**Solution** :
- Vérifiez que les variables d'environnement sont définies
- Sur Railway, ajoutez-les dans Settings → Variables

### Le worker s'arrête

**Causes possibles** :
- Erreur non gérée
- Timeout
- Manque de mémoire

**Solution** :
- Vérifiez les logs
- Sur Railway, configurez un restart automatique
- Augmentez les ressources si nécessaire

## 🔧 Arrêt propre

Le worker gère les signaux `SIGINT` et `SIGTERM` pour un arrêt propre :

```bash
# Arrêter avec Ctrl+C
Ctrl+C

# Ou envoyer SIGTERM
kill -TERM <pid>
```

## 📝 Comparaison avec GitHub Actions

| Feature | GitHub Actions | Worker Puppeteer |
|---------|----------------|------------------|
| Génération cookies | ❌ Non (nécessite cookies manuels) | ✅ Oui (automatique) |
| Contourne Cloudflare | ❌ Non | ✅ Oui (via Puppeteer) |
| Coût | Gratuit (limite) | Gratuit (Railway) ou local |
| Maintenance | Configuration GitHub | Script simple |
| Logs | GitHub Actions | Terminal/Railway |

## ✅ Avantages

- ✅ **Automatique** : Génère les cookies automatiquement
- ✅ **Fiable** : Contourne Cloudflare via Puppeteer
- ✅ **Simple** : Un seul script à lancer
- ✅ **Flexible** : Configurable (intervalle, etc.)
- ✅ **24/7** : Tourne en continu

---

**Le worker Puppeteer est la solution recommandée pour les alertes automatiques !** 🚀

