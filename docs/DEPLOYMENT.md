# Guide de Déploiement

Votre application Next.js est **prête à être déployée** ! Next.js est full-stack, donc votre frontend ET votre backend (API routes) seront déployés ensemble automatiquement.

## 🚀 Option 1 : Vercel (Recommandé - Gratuit)

Vercel est la plateforme officielle de Next.js, c'est le plus simple et le plus rapide.

### Étapes de déploiement

1. **Préparer le code**
   ```bash
   # Tester le build localement
   npm run build
   ```

2. **Créer un compte Vercel**
   - Allez sur [vercel.com](https://vercel.com)
   - Connectez-vous avec GitHub

3. **Déployer depuis GitHub**
   - Dans Vercel, cliquez sur "Add New Project"
   - Importez votre repository GitHub
   - Vercel détecte automatiquement Next.js
   - Cliquez sur "Deploy"

4. **Configurer les variables d'environnement**
   
   Dans Vercel Dashboard → Votre projet → Settings → Environment Variables, ajoutez :

   **Variables Frontend (NEXT_PUBLIC_*)**
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   NEXT_PUBLIC_API_SECRET=your_client_api_secret
   ```

   **Variables Backend (Server Only)**
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   API_SECRET=your_secure_api_secret
   OPENAI_API_KEY=sk-proj-your_openai_key (si vous utilisez l'IA)
   ```

   ⚠️ **Important** : 
   - Les variables `NEXT_PUBLIC_*` sont accessibles côté client
   - Les autres variables sont **uniquement** côté serveur (sécurisées)

5. **Redéployer**
   - Après avoir ajouté les variables, allez dans "Deployments"
   - Cliquez sur "Redeploy" sur le dernier déploiement

6. **Votre app est en ligne !**
   - Vercel vous donne une URL : `https://votre-app.vercel.app`
   - Vos API routes sont accessibles : `https://votre-app.vercel.app/api/v1/...`

### Note sur les alertes automatiques

Les alertes peuvent être vérifiées via l'interface web ou via l'API `/api/v1/alerts/check`.

## 🚀 Option 2 : Railway (Alternative)

Railway est une autre option populaire et gratuite.

1. **Créer un compte** sur [railway.app](https://railway.app)
2. **Nouveau projet** → "Deploy from GitHub repo"
3. **Configurer les variables d'environnement** (même liste que Vercel)
4. **Déployer** - Railway détecte automatiquement Next.js

## 🚀 Option 3 : Netlify

Netlify supporte aussi Next.js.

1. Créer un compte sur [netlify.com](https://netlify.com)
2. "Add new site" → "Import from Git"
3. Connecter votre repo GitHub
4. Build command : `npm run build`
5. Publish directory : `.next`
6. Configurer les variables d'environnement

## 📋 Checklist avant déploiement

- [ ] Tester le build local : `npm run build`
- [ ] Vérifier que toutes les migrations SQL sont exécutées dans Supabase
- [ ] Préparer la liste des variables d'environnement
- [ ] S'assurer que `API_SECRET` est fort et unique
- [ ] Vérifier que les clés Supabase sont correctes (production)

## 🔧 Variables d'environnement requises

### Obligatoires

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# API Security
API_SECRET=votre_secret_fort_et_unique
NEXT_PUBLIC_API_SECRET=votre_secret_fort_et_unique
```

### Optionnelles

```env
# OpenAI (si vous utilisez l'analyse IA)
OPENAI_API_KEY=sk-proj-...

# Vinted (fallback si pas de cookies)
VINTED_ACCESS_TOKEN=...
```

## 🧪 Tester après déploiement

1. **Tester le frontend**
   - Visitez `https://votre-app.vercel.app`
   - Vérifiez que l'interface se charge

2. **Tester une API route**
   ```bash
   curl -X POST https://votre-app.vercel.app/api/v1/token/validate \
     -H "Content-Type: application/json" \
     -H "x-api-key: votre_api_secret" \
     -d '{"token": "test"}'
   ```

3. **Tester les alertes**
   - Utilisez l'interface web pour vérifier les alertes
   - Ou appelez directement `/api/v1/alerts/check` avec votre API key

## 🐛 Dépannage

### Erreur : "Missing environment variables"
- Vérifiez que toutes les variables sont bien configurées dans Vercel
- Redéployez après avoir ajouté des variables

### Erreur : "Database connection failed"
- Vérifiez `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`
- Assurez-vous d'utiliser les clés de **production** (pas de développement)

### Erreur : "Unauthorized" sur les API routes
- Vérifiez que `API_SECRET` est bien configuré dans Vercel
- Vérifiez que le header `x-api-key` est bien envoyé

### Build échoue
- Vérifiez les logs de build dans Vercel
- Testez localement : `npm run build`
- Vérifiez que toutes les dépendances sont dans `package.json`

## 📝 Notes importantes

- ✅ **Vercel est gratuit** pour les projets personnels
- ✅ **Déploiements automatiques** : chaque push sur `main` redéploie
- ✅ **HTTPS automatique** : votre app est en HTTPS par défaut
- ✅ **CDN global** : votre app est rapide partout dans le monde
- ⚠️ **Variables sensibles** : ne jamais commiter `.env.local` dans Git
- ⚠️ **Rate limits** : Vercel free tier a des limites (généralement suffisant)

## 🔄 Mise à jour après déploiement

Après avoir déployé, vous pouvez utiliser l'API pour vérifier les alertes :

```bash
# Exemple d'appel à l'API d'alertes
curl -X POST https://votre-app.vercel.app/api/v1/alerts/check \
  -H "Content-Type: application/json" \
  -H "x-api-key: votre_api_secret"
```

