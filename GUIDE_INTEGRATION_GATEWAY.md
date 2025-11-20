# 🔧 Guide d'Intégration du Gateway

## Problème

Vous avez déployé 3 scraper nodes (scraper-fr, scraper-nl, scraper-us) mais seul le worker de l'app principale reçoit du trafic. Les scraper nodes ne sont pas utilisés.

## Solution

Le code existant utilise `fetchWithRetry` qui fait des appels directs à Vinted. Il faut activer le gateway pour que les requêtes passent par les scraper nodes.

## ✅ Étapes pour Activer le Gateway

### 1. Vérifier que les scraper nodes sont déployés

```bash
fly status --app scraper-fr
fly status --app scraper-nl
fly status --app scraper-us
```

Tous doivent être actifs.

### 2. Configurer les URLs des nodes dans l'app principale

```bash
fly secrets set SCRAPER_FR_URL="http://scraper-fr.internal:3000" --app vinted-last
fly secrets set SCRAPER_NL_URL="http://scraper-nl.internal:3000" --app vinted-last
fly secrets set SCRAPER_US_URL="http://scraper-us.internal:3000" --app vinted-last
```

### 3. Activer le gateway

```bash
fly secrets set ENABLE_GATEWAY="true" --app vinted-last
```

### 4. Redéployer l'app principale

```bash
fly deploy --app vinted-last
```

## 🔍 Vérification

### Vérifier que le gateway est activé

```bash
# Voir les secrets
fly secrets list --app vinted-last | grep GATEWAY
```

Vous devriez voir :
- `ENABLE_GATEWAY=true`
- `SCRAPER_FR_URL=...`
- `SCRAPER_NL_URL=...`
- `SCRAPER_US_URL=...`

### Vérifier les statistiques du cluster

```bash
curl -X GET https://vinted-last.fly.dev/api/v1/scrape/gateway \
  -H "x-api-key: votre_api_secret"
```

Vous devriez voir les 3 nodes avec leurs statistiques.

### Vérifier les logs

```bash
# Logs de l'app principale (devrait montrer l'utilisation du gateway)
fly logs --app vinted-last | grep -i gateway

# Logs des scraper nodes (devraient montrer des requêtes)
fly logs --app scraper-fr
fly logs --app scraper-nl
fly logs --app scraper-us
```

## 📊 Comment ça fonctionne maintenant

1. **Avant** : `fetchWithRetry` → appel direct à Vinted
2. **Maintenant** : `fetchWithRetry` → vérifie `ENABLE_GATEWAY` → si activé, utilise `fetchViaGateway` → route vers un scraper node → le scraper node fait la requête à Vinted

## 🎯 Résultat attendu

- Les requêtes sont réparties entre les 3 scraper nodes
- Rotation automatique en cas de 403
- Bans temporaires de 15 minutes
- Statistiques disponibles via l'API

## ⚠️ Important

- Le gateway ne s'active que pour les URLs contenant `vinted.fr`
- Si le gateway échoue, il y a un fallback vers le mode direct
- Les scraper nodes doivent être actifs pour recevoir du trafic

## 🆘 Dépannage

### Les scraper nodes ne reçoivent toujours pas de trafic

1. Vérifier que `ENABLE_GATEWAY=true` est bien configuré
2. Vérifier que les URLs des nodes sont correctes
3. Vérifier les logs de l'app principale pour voir si le gateway est utilisé
4. Redéployer l'app principale après avoir configuré les secrets

### Erreur "Aucun node disponible"

1. Vérifier que les 3 scraper nodes sont déployés et actifs
2. Vérifier les URLs dans les secrets
3. Vérifier que le réseau interne Fly.io fonctionne (`.internal`)

### Le gateway ne route pas les requêtes

1. Vérifier que l'URL contient `vinted.fr` (le gateway ne s'active que pour Vinted)
2. Vérifier les logs pour voir les erreurs
3. Tester manuellement l'API gateway

---

**Note** : Après avoir activé le gateway, toutes les requêtes à Vinted passeront par les scraper nodes, ce qui permet la rotation automatique et la gestion des bans.

