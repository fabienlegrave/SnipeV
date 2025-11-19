# Déploiement sur Railway

Railway est une alternative à Vercel qui supporte mieux Puppeteer et les applications nécessitant des dépendances système.

## 🚀 Avantages de Railway

- ✅ Supporte Puppeteer nativement
- ✅ Peut installer Chromium via Dockerfile
- ✅ Timeout plus long (pas de limite stricte)
- ✅ Plan gratuit généreux
- ✅ Déploiement automatique depuis GitHub

## 📋 Prérequis

1. **Compte Railway** : https://railway.app (gratuit)
2. **Repository GitHub** : Votre code doit être sur GitHub
3. **Dockerfile** : Déjà créé dans le projet

## 🔧 Étapes de déploiement

### 1. Créer un projet Railway

1. Allez sur https://railway.app
2. Cliquez sur "New Project"
3. Sélectionnez "Deploy from GitHub repo"
4. Autorisez Railway à accéder à votre repository
5. Sélectionnez votre repository `vinted_last`

### 2. Configurer les variables d'environnement

Dans Railway, allez dans **Variables** et ajoutez :

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# API
API_SECRET=your_secure_api_secret
NEXT_PUBLIC_API_SECRET=your_secure_api_secret

# OpenAI (optionnel)
OPENAI_API_KEY=sk-proj-your_key

# Vinted (optionnel, mais recommandé)
VINTED_ACCESS_TOKEN=your_token

# Puppeteer (automatique via Dockerfile)
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
```

### 3. Déployer

Railway détecte automatiquement le Dockerfile et déploie l'application.

**Temps de déploiement** : 5-10 minutes (première fois)

### 4. Obtenir l'URL

Une fois déployé, Railway vous donne une URL comme :
- `https://votre-app.up.railway.app`

Vous pouvez aussi configurer un domaine personnalisé.

## 🧪 Tester Puppeteer sur Railway

Une fois déployé, testez la génération de cookies :

```bash
curl -X POST https://votre-app.up.railway.app/api/v1/admin/vinted/generate-cookies \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_SECRET" \
  -d '{"autoSave": true}'
```

## ⚙️ Configuration des alertes

Pour utiliser les alertes, vous pouvez appeler l'API directement :

```yaml
env:
  API_BASE_URL: https://votre-app.up.railway.app
```

## 💰 Coûts

**Plan gratuit** :
- $5 de crédit/mois
- Suffisant pour une petite application
- Pas de carte de crédit requise

**Plan Pro** ($20/mois) :
- Plus de ressources
- Domaine personnalisé
- Support prioritaire

## 🔍 Vérifier les logs

Dans Railway, allez dans **Deployments** → **View Logs** pour voir :
- Les logs de build
- Les logs d'exécution
- Les erreurs éventuelles

## 🐛 Dépannage

### Build échoue

**Erreur** : "Cannot find module"
- Vérifiez que `package.json` est correct
- Vérifiez que toutes les dépendances sont listées

**Erreur** : "Chromium not found"
- Vérifiez que le Dockerfile installe Chromium
- Vérifiez `PUPPETEER_EXECUTABLE_PATH`

### Runtime échoue

**Erreur** : "Timeout"
- Railway a des timeouts plus longs que Vercel
- Vérifiez les logs pour plus de détails

**Erreur** : "Memory limit exceeded"
- Upgrade vers le plan Pro
- Ou optimisez l'utilisation mémoire

## 📝 Comparaison Vercel vs Railway

| Feature | Vercel | Railway |
|---------|--------|---------|
| Puppeteer | ❌ Non supporté | ✅ Supporté |
| Chromium | ❌ Non disponible | ✅ Via Dockerfile |
| Timeout | 10-60s | Plus long |
| Dockerfile | ❌ Non | ✅ Oui |
| Plan gratuit | ✅ Oui | ✅ Oui ($5/mois) |
| Next.js | ✅ Optimisé | ✅ Supporté |

## 🎯 Prochaines étapes

1. **Créer le compte Railway**
2. **Connecter votre repo GitHub**
3. **Configurer les variables d'environnement**
4. **Déployer**
5. **Tester la génération de cookies**

---

**Railway est la meilleure alternative à Vercel pour votre cas d'usage avec Puppeteer.** 🚀

