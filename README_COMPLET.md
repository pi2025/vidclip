# 🎬 VidClip - Créateur de Clips TikTok IA

## 📋 Vue d'ensemble

VidClip est une application web qui transforme automatiquement les vidéos YouTube en clips courts optimisés pour TikTok, Instagram Reels et YouTube Shorts. Utilisant l'intelligence artificielle DeepSeek, l'application analyse le contenu vidéo pour identifier les segments les plus viraux.

## ✨ Fonctionnalités principales

### 🤖 Analyse IA avec DeepSeek
- Analyse automatique du contenu vidéo
- Identification des moments viraux
- Segmentation intelligente optimisée pour les réseaux sociaux
- Score de viralité pour chaque segment

### 📱 Optimisation TikTok
- Format vertical 720x1280 pixels (ratio 9:16)
- Clips de 10-30 secondes (durée optimale)
- Compression adaptée pour les réseaux sociaux
- Qualité vidéo optimisée (~1Mbps)

### 🛠️ Technologies utilisées
- **Backend**: Node.js, Express
- **Traitement vidéo**: FFmpeg, yt-dlp
- **IA**: DeepSeek API
- **Frontend**: HTML5, CSS3, JavaScript vanilla
- **Déploiement**: Docker, PM2

## 🚀 Installation et déploiement

### Prérequis
```bash
- Node.js >= 16.0.0
- FFmpeg
- yt-dlp
- Docker (optionnel)
```

### Installation locale
```bash
# Cloner le projet
git clone https://github.com/votre-username/vidclip.git
cd vidclip

# Installer les dépendances
npm install

# Configurer les variables d'environnement
cp .env.example .env
# Éditer .env avec votre clé DeepSeek API

# Démarrer l'application
npm start
```

### Déploiement Docker
```bash
# Méthode rapide avec le script
chmod +x deploy.sh
./deploy.sh

# Ou manuellement
docker-compose up --build -d
```

### Déploiement production avec PM2
```bash
# Installer PM2
npm install -g pm2

# Démarrer avec PM2
pm2 start ecosystem.config.js

# Vérifier le statut
pm2 status
pm2 logs vidclip-app
```

## 📡 API Endpoints

### Status API
```http
GET /api/status
```
Retourne l'état de l'application et les fonctionnalités disponibles.

**Réponse:**
```json
{
  "status": "running",
  "version": "3.0.0",
  "deepseek": true,
  "ytdlp_available": true,
  "ffmpeg_available": true,
  "features": {
    "max_video_duration": 600,
    "min_video_duration": 10,
    "max_clip_duration": 30,
    "output_format": "720x1280 (TikTok)",
    "supported_formats": ["MP4", "WebM", "MKV"]
  }
}
```

### Traitement vidéo
```http
POST /api/process-video
Content-Type: application/json

{
  "url": "https://youtube.com/watch?v=VIDEO_ID"
}
```

**Réponse successful:**
```json
{
  "status": "completed",
  "videoInfo": {
    "title": "Titre de la vidéo",
    "duration": 360,
    "view_count": 1000000,
    "uploader": "Nom du créateur"
  },
  "clips": [
    {
      "title": "Moment viral 1",
      "description": "Segment captivant du début",
      "start_time": 5,
      "end_time": 20,
      "duration": 15,
      "viral_score": 0.9,
      "filePath": "/output/VIDEO_ID_clip1.mp4",
      "fileSize": 2048576,
      "format": "720x1280 (TikTok)",
      "bitrate": "~1Mbps"
    }
  ],
  "stats": {
    "total_clips": 3,
    "successful_clips": 3,
    "total_size_mb": "5.2"
  }
}
```

### Liste des fichiers
```http
GET /api/files
```
Retourne la liste des clips générés avec leurs métadonnées.

### Nettoyage
```http
DELETE /api/cleanup
```
Supprime tous les fichiers de clips générés.

## 🔧 Configuration

### Variables d'environnement (.env)
```bash
# API DeepSeek (obligatoire pour l'analyse IA)
DEEPSEEK_API_KEY=sk-your-deepseek-api-key

# Port de l'application (optionnel, défaut: 3000)
PORT=3000

# Environnement (optionnel)
NODE_ENV=production
```

### Limites par défaut
- **Durée vidéo max**: 10 minutes (600s)
- **Durée vidéo min**: 10 secondes
- **Durée clip max**: 30 secondes
- **Nombre de clips**: 3 par vidéo
- **Format de sortie**: MP4, 720x1280, ~1Mbps

## 🎯 Utilisation

### Interface web
1. Accéder à `http://localhost:3000`
2. Coller l'URL YouTube dans le champ
3. Cliquer sur "Créer des clips"
4. Attendre le traitement (1-3 minutes selon la vidéo)
5. Télécharger les clips générés

### API REST
```javascript
// Exemple d'utilisation avec fetch
const response = await fetch('/api/process-video', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: 'https://youtube.com/watch?v=VIDEO_ID' })
});

const result = await response.json();
console.log(`${result.clips.length} clips créés`);
```

## 📊 Architecture technique

### Stack technologique
```
Frontend (SPA)
    ↓
Express.js API
    ↓
yt-dlp → FFmpeg → DeepSeek AI
    ↓
Fichiers MP4 (720x1280)
```

### Flux de traitement
1. **Validation URL**: Vérification de l'URL YouTube
2. **Extraction infos**: Métadonnées vidéo avec yt-dlp
3. **Téléchargement**: Vidéo source en qualité optimale
4. **Analyse IA**: Identification des segments viraux
5. **Découpage**: Création des clips avec FFmpeg
6. **Optimisation**: Format TikTok, compression
7. **Nettoyage**: Suppression fichiers temporaires

### Gestion des erreurs
- Fallback automatique si DeepSeek échoue
- Retry avec différents formats vidéo
- Validation stricte des paramètres
- Logs détaillés pour debugging

## 🐳 Docker

### Dockerfile optimisé
```dockerfile
FROM node:18-alpine

# Installation des dépendances système
RUN apk add --no-cache ffmpeg python3 make g++ curl

# Configuration de l'application
WORKDIR /app
COPY package*.json ./
RUN npm install --production

# Copie des fichiers sources
COPY server_final.js ./
COPY .env ./

# Création des dossiers
RUN mkdir -p uploads output public logs

# Exposition du port
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/status || exit 1

# Démarrage
CMD ["node", "server_final.js"]
```

### Docker Compose
```yaml
version: '3.8'
services:
  vidclip:
    build: .
    container_name: vidclip-app
    ports:
      - "3000:3000"
    env_file:
      - .env
    volumes:
      - ./output:/app/output
      - ./logs:/app/logs
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/status"]
      interval: 30s
      timeout: 10s
      retries: 3
```

## 🔐 Sécurité

### Mesures implémentées
- Validation stricte des URLs
- Limitation de la taille des fichiers
- Nettoyage automatique des fichiers temporaires
- Timeouts pour éviter les blocages
- Sanitization des noms de fichiers

### Recommandations production
- Utiliser HTTPS
- Configurer un reverse proxy (nginx)
- Limiter les requêtes par IP
- Monitoring des ressources système
- Sauvegardes régulières

## 📈 Performance

### Optimisations implémentées
- Encoding FFmpeg optimisé (`-preset fast`)
- Compression adaptée pour le web
- Streaming des fichiers de sortie
- Traitement asynchrone
- Gestion mémoire optimisée

### Métriques typiques
- **Traitement vidéo 5min**: ~2-3 minutes
- **Clip 15s**: ~200KB final
- **Mémoire utilisée**: ~100-200MB
- **CPU**: Pic pendant l'encoding FFmpeg

## 🧪 Tests

### Tests automatiques disponibles
```bash
# Test complet de l'application
node test_final.js

# Test avec contenu de démonstration
node create_demo.js
```

### Endpoints de test
- `/api/status` - Vérification santé
- `/api/files` - Liste des fichiers disponibles
- Démonstration avec clips pré-générés

## 🚨 Résolution de problèmes

### Erreurs communes

#### "Video unavailable" ou "Not available on this app"
- **Cause**: Restrictions géographiques YouTube ou serveur bloqué
- **Solution**: Utiliser un VPN ou serveur dans une région non bloquée

#### "Command failed: yt-dlp"
- **Cause**: Format vidéo non supporté ou restrictions
- **Solution**: L'application essaie automatiquement plusieurs formats

#### "FFmpeg error"
- **Cause**: Vidéo corrompue ou format non supporté
- **Solution**: Vérifier l'installation FFmpeg et les codecs

#### Mémoire insuffisante
- **Cause**: Vidéo trop longue ou qualité trop élevée
- **Solution**: Augmenter les limites ou utiliser un serveur plus puissant

### Logs utiles
```bash
# Logs PM2
pm2 logs vidclip-app

# Logs Docker
docker logs vidclip-app

# Logs fichiers
tail -f logs/combined.log
```

## 🤝 Contribution

### Structure du code
```
vidclip/
├── server_final.js          # Serveur principal
├── ecosystem.config.js      # Configuration PM2
├── docker-compose.yml       # Configuration Docker
├── package.json            # Dépendances Node.js
├── .env.example           # Variables d'environnement exemple
├── uploads/               # Fichiers temporaires
├── output/               # Clips générés
├── public/              # Interface web
└── logs/               # Logs application
```

### Développement
1. Fork du projet
2. Créer une branche feature
3. Commits atomiques avec messages clairs
4. Tests complets avant PR
5. Documentation mise à jour

## 📄 Licence

MIT License - Voir LICENSE file pour plus de détails.

## 🔗 Liens utiles

- [Documentation DeepSeek API](https://deepseek.com/api)
- [FFmpeg Documentation](https://ffmpeg.org/documentation.html)
- [yt-dlp GitHub](https://github.com/yt-dlp/yt-dlp)
- [Docker Hub](https://hub.docker.com)

## 📞 Support

Pour le support technique :
1. Vérifier la section résolution de problèmes
2. Consulter les logs de l'application
3. Ouvrir une issue sur GitHub avec les détails
4. Inclure la version, OS et logs pertinents

---

**VidClip v3.0** - Créateur de clips TikTok IA  
Développé avec ❤️ pour les créateurs de contenu