# Pourquoi ça fonctionne en local mais pas sur Vercel ?

## 🔍 Causes possibles

### 1. **Header `host` interdit** (Probable cause principale)

Le header `host` ne doit **jamais** être défini manuellement dans les requêtes fetch. Node.js le gère automatiquement, et Vercel/Cloudflare peut rejeter les requêtes avec un header `host` personnalisé.

**Problème actuel** : Dans `buildVintedApiHeaders`, on définit `'host': 'www.vinted.fr'` ce qui peut causer un 403 sur Vercel.

### 2. **IP différente = Cookies Cloudflare invalides**

Les cookies `cf_clearance` et `datadome` sont liés à :
- Votre IP locale
- Votre fingerprint de navigateur

Quand Vercel fait la requête depuis ses serveurs (IP différente), ces cookies peuvent être rejetés par Cloudflare.

### 3. **Headers modifiés par Vercel**

Vercel peut modifier certains headers comme :
- `connection` → peut être changé en `close` ou supprimé
- `accept-encoding` → peut être modifié
- Headers `sec-*` → peuvent être considérés comme suspects depuis un serveur

### 4. **User-Agent détecté comme bot**

Vercel utilise Node.js fetch qui peut avoir un User-Agent différent, détecté comme bot par Cloudflare.

## ✅ Solution : Retirer le header `host`

Le header `host` est automatiquement géré par Node.js et ne doit jamais être défini manuellement.

