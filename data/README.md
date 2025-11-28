# Fichier des favoris

Ce dossier contient le fichier `favorites.json` qui remplace l'authentification complexe pour récupérer les favoris depuis Vinted.

## Utilisation

### Option 1: Script automatique (recommandé)

Utilisez le script pour récupérer automatiquement toutes les pages de favoris :

```bash
# Avec user_id et cookies en argument
npm run fetch:favorites 152254278 "cookie1=value1; cookie2=value2"

# Ou avec VINTED_FULL_COOKIES dans .env.local
npm run fetch:favorites 152254278
```

Le script va :
1. Récupérer toutes les pages de favoris depuis l'API Vinted
2. Normaliser les items au format `ApiItem`
3. Sauvegarder automatiquement dans `data/favorites.json`

### Option 2: Mise à jour manuelle

1. **Récupérer vos favoris** depuis l'API Vinted (dans votre navigateur) :
   - Ouvrez `https://www.vinted.fr/api/v2/users/{votre_user_id}/items/favourites?per_page=50&page=1`
   - Copiez la réponse JSON

2. **Mettre à jour** le fichier `favorites.json` avec vos favoris
3. Le format attendu est un array d'`ApiItem` (voir `lib/types/core.ts`)

## Format du fichier

```json
{
  "items": [
    {
      "id": 123456,
      "title": "Titre de l'item",
      "price": {
        "amount": 50,
        "currency_code": "EUR"
      },
      "url": "https://www.vinted.fr/items/...",
      ...
    }
  ],
  "updated_at": "2024-01-01T00:00:00.000Z"
}
```

## Comment obtenir votre user_id

1. Connectez-vous sur Vinted dans votre navigateur
2. Ouvrez les outils de développement (F12)
3. Allez dans l'onglet Network
4. Naviguez vers vos favoris
5. Cherchez une requête vers `/api/v2/users/{user_id}/items/favourites`
6. Le `user_id` est dans l'URL

## Comment obtenir vos cookies

1. Connectez-vous sur Vinted dans votre navigateur
2. Ouvrez les outils de développement (F12)
3. Allez dans l'onglet Application (Chrome) ou Storage (Firefox)
4. Cookies → `https://www.vinted.fr`
5. Copiez tous les cookies (format: `cookie1=value1; cookie2=value2; ...`)

Ou utilisez l'extension bookmarklet fournie dans `public/cookie-extractor-bookmarklet.js`

## Avantages

- ✅ Plus besoin d'authentification complexe
- ✅ Mise à jour manuelle simple
- ✅ Pas de dépendance aux cookies Vinted pour l'utilisation quotidienne
- ✅ Contrôle total sur les favoris utilisés
- ✅ Script automatique pour récupérer toutes les pages
