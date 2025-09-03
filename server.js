#!/bin/bash
echo "🚀 Déploiement VidClip"

# Installer Docker si nécessaire
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
fi

# Créer .env depuis .env.example
cp .env.example .env

# Créer les dossiers
mkdir -p uploads output public logs

# Lancer avec Docker
docker-compose up --build -d

echo "✅ VidClip déployé !"
echo "🌐 Accès: http://localhost:3000"
