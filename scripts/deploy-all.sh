#!/bin/bash
# Script pour créer et déployer toutes les apps Fly.io

set -e  # Arrêter en cas d'erreur

echo "🚀 Création et déploiement des apps Fly.io"
echo ""

# Vérifier que fly CLI est installé
if ! command -v fly &> /dev/null; then
    echo "❌ Fly CLI n'est pas installé"
    echo "💡 Installez-le avec: curl -L https://fly.io/install.sh | sh"
    exit 1
fi

# Vérifier l'authentification
echo "🔐 Vérification de l'authentification..."
fly auth whoami || {
    echo "❌ Non authentifié. Exécutez: fly auth login"
    exit 1
}

echo ""
echo "📦 Étape 1: Création des apps..."
echo ""

# Créer le Main Worker
echo "📦 Création de main-worker..."
fly apps create main-worker || echo "⚠️  main-worker existe déjà"

# Créer les Workers Régionaux
echo "📦 Création de worker-fr..."
fly apps create worker-fr || echo "⚠️  worker-fr existe déjà"

echo "📦 Création de worker-us..."
fly apps create worker-us || echo "⚠️  worker-us existe déjà"

echo "📦 Création de worker-nl..."
fly apps create worker-nl || echo "⚠️  worker-nl existe déjà"

echo "📦 Création de worker-uk..."
fly apps create worker-uk || echo "⚠️  worker-uk existe déjà"

echo ""
echo "✅ Toutes les apps sont créées"
echo ""
echo "📝 Étape 2: Configuration des secrets..."
echo ""
echo "⚠️  IMPORTANT: Configurez les secrets avant de déployer:"
echo ""
echo "Pour le Main Worker:"
echo "  fly secrets set API_SECRET=\"vinted_scraper_secure_2024\" SUPABASE_URL=\"https://gmumhsqlewekjlrdsmgf.supabase.co\" SUPABASE_SERVICE_ROLE_KEY=\"YOUR_KEY\" --app main-worker"
echo ""
echo "Pour chaque Worker (FR, US, NL, UK):"
echo "  fly secrets set API_SECRET=\"vinted_scraper_secure_2024\" SUPABASE_URL=\"https://gmumhsqlewekjlrdsmgf.supabase.co\" SUPABASE_SERVICE_ROLE_KEY=\"YOUR_KEY\" --app worker-fr"
echo ""
read -p "Appuyez sur Entrée pour continuer avec le déploiement (ou Ctrl+C pour configurer les secrets d'abord)..."

echo ""
echo "🚀 Étape 3: Déploiement du Main Worker..."
fly deploy --config fly.main-worker.toml --app main-worker

echo ""
echo "🚀 Étape 4: Déploiement des Workers Régionaux..."
echo ""

echo "📦 Déploiement de worker-fr..."
fly deploy --config fly.worker-fr.toml --app worker-fr

echo "📦 Déploiement de worker-us..."
fly deploy --config fly.worker-us.toml --app worker-us

echo "📦 Déploiement de worker-nl..."
fly deploy --config fly.worker-nl.toml --app worker-nl

echo "📦 Déploiement de worker-uk..."
fly deploy --config fly.worker-uk.toml --app worker-uk

echo ""
echo "✅ Déploiement terminé!"
echo ""
echo "🧪 Vérification:"
echo "  fly status --app main-worker"
echo "  fly logs --app main-worker"
echo ""
echo "🌐 URLs:"
echo "  Main Worker: https://main-worker.fly.dev"
echo "  Worker FR: https://worker-fr.fly.dev"
echo "  Worker US: https://worker-us.fly.dev"
echo "  Worker NL: https://worker-nl.fly.dev"
echo "  Worker UK: https://worker-uk.fly.dev"

