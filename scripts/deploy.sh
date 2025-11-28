#!/bin/bash
# Script pour déployer toutes les apps Fly.io (sans création)

# Ne pas arrêter en cas d'erreur pour permettre les vérifications
set +e

echo "🚀 Déploiement des apps Fly.io"
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
echo "📦 Déploiement du Main Worker..."
# Détecter le nom réel de l'app
MAIN_WORKER_APP=$(fly apps list 2>/dev/null | grep -i "main-worker" | awk '{print $1}' | head -1)
MAIN_WORKER_APP=${MAIN_WORKER_APP:-"main-worker-small-silence-2788"}

echo "   📋 App détectée: $MAIN_WORKER_APP"
# Vérifier si l'app a des machines
if ! fly status --app "$MAIN_WORKER_APP" 2>/dev/null | grep -q "Machines"; then
    echo "   ℹ️  Première initialisation et déploiement..."
    fly launch --config fly.main-worker.toml --name "$MAIN_WORKER_APP" --copy-config --yes
else
    echo "   🚀 Déploiement..."
    fly deploy --config fly.main-worker.toml --app "$MAIN_WORKER_APP"
fi

echo ""
echo "📦 Déploiement des Workers Régionaux..."
echo ""

# Détecter les noms réels des apps
WORKER_FR_APP=$(fly apps list 2>/dev/null | grep -i "worker-fr" | awk '{print $1}' | head -1)
WORKER_FR_APP=${WORKER_FR_APP:-"worker-fr-icy-night-8180"}
WORKER_US_APP=$(fly apps list 2>/dev/null | grep -i "worker-us" | awk '{print $1}' | head -1)
WORKER_US_APP=${WORKER_US_APP:-"worker-us-late-dream-9122"}
WORKER_NL_APP=$(fly apps list 2>/dev/null | grep -i "worker-nl" | awk '{print $1}' | head -1)
WORKER_NL_APP=${WORKER_NL_APP:-"worker-nl-falling-snow-1037"}
WORKER_UK_APP=$(fly apps list 2>/dev/null | grep -i "worker-uk" | awk '{print $1}' | head -1)
WORKER_UK_APP=${WORKER_UK_APP:-"worker-uk-silent-voice-1248"}

echo "📦 Déploiement de worker-fr ($WORKER_FR_APP)..."
if ! fly status --app "$WORKER_FR_APP" 2>/dev/null | grep -q "Machines"; then
    echo "   ℹ️  Première initialisation et déploiement..."
    fly launch --config fly.worker-fr.toml --name "$WORKER_FR_APP" --copy-config --yes
else
    echo "   🚀 Déploiement..."
    fly deploy --config fly.worker-fr.toml --app "$WORKER_FR_APP"
fi

echo "📦 Déploiement de worker-us ($WORKER_US_APP)..."
if ! fly status --app "$WORKER_US_APP" 2>/dev/null | grep -q "Machines"; then
    echo "   ℹ️  Première initialisation et déploiement..."
    fly launch --config fly.worker-us.toml --name "$WORKER_US_APP" --copy-config --yes
else
    echo "   🚀 Déploiement..."
    fly deploy --config fly.worker-us.toml --app "$WORKER_US_APP"
fi

echo "📦 Déploiement de worker-nl ($WORKER_NL_APP)..."
if ! fly status --app "$WORKER_NL_APP" 2>/dev/null | grep -q "Machines"; then
    echo "   ℹ️  Première initialisation et déploiement..."
    fly launch --config fly.worker-nl.toml --name "$WORKER_NL_APP" --copy-config --yes
else
    echo "   🚀 Déploiement..."
    fly deploy --config fly.worker-nl.toml --app "$WORKER_NL_APP"
fi

echo "📦 Déploiement de worker-uk ($WORKER_UK_APP)..."
if ! fly status --app "$WORKER_UK_APP" 2>/dev/null | grep -q "Machines"; then
    echo "   ℹ️  Première initialisation et déploiement..."
    fly launch --config fly.worker-uk.toml --name "$WORKER_UK_APP" --copy-config --yes
else
    echo "   🚀 Déploiement..."
    fly deploy --config fly.worker-uk.toml --app "$WORKER_UK_APP"
fi

echo ""
echo "✅ Déploiement terminé!"
echo ""
echo "🧪 Vérification:"
echo "  fly status --app main-worker"
echo "  fly logs --app main-worker"
echo ""
echo "🌐 URLs:"
echo "  Main Worker: https://$MAIN_WORKER_APP.fly.dev"
echo "  Worker FR: https://$WORKER_FR_APP.fly.dev"
echo "  Worker US: https://$WORKER_US_APP.fly.dev"
echo "  Worker NL: https://$WORKER_NL_APP.fly.dev"
echo "  Worker UK: https://$WORKER_UK_APP.fly.dev"

