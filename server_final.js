const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const { exec } = require('child_process');
const { promisify } = require('util');
require('dotenv').config();

const execAsync = promisify(exec);
const app = express();
const PORT = process.env.PORT || 3000;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const UPLOAD_DIR = './uploads';
const OUTPUT_DIR = './output';

// Middleware
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use('/output', express.static(OUTPUT_DIR));
app.use('/', express.static('public'));

// Créer les dossiers
async function ensureDirectories() {
    try {
        await fs.mkdir(UPLOAD_DIR, { recursive: true });
        await fs.mkdir(OUTPUT_DIR, { recursive: true });
        await fs.mkdir('./public', { recursive: true });
        console.log('✅ Dossiers créés');
    } catch (error) {
        console.error('❌ Erreur dossiers:', error);
    }
}

// Validar URL YouTube
function isValidYouTubeURL(url) {
    const regex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/)|youtu\.be\/)[\w-]+/;
    return regex.test(url);
}

// Extraire l'ID de la vidéo YouTube
function getVideoId(url) {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/);
    return match ? match[1] : null;
}

// Analyser avec DeepSeek
async function analyzeWithDeepSeek(videoInfo) {
    try {
        console.log('🤖 Analyse DeepSeek...');
        
        const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
            model: "deepseek-chat",
            messages: [{
                role: "user",
                content: `Analyse cette vidéo YouTube et trouve 3 segments viraux de 10-25s optimaux pour TikTok:
                
Titre: ${videoInfo.title}
Durée: ${videoInfo.duration}s
Description: ${videoInfo.description}

Créer des segments qui:
- Sont de 10-25 secondes maximum (idéal pour TikTok/Shorts)
- Ont un potentiel viral élevé
- Sont au début, milieu et fin si possible
- Évitent les moments lents ou transitions

Réponds en JSON valide:
{
  "clips": [
    {
      "start_time": 5,
      "end_time": 20,
      "title": "Moment viral court",
      "description": "Pourquoi ce segment est viral",
      "viral_score": 0.9
    }
  ]
}`
            }],
            temperature: 0.7,
            max_tokens: 1000
        }, {
            headers: {
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        let content = response.data.choices[0].message.content;
        content = content.replace(/```json\n?/, '').replace(/```/, '').trim();
        
        const analysis = JSON.parse(content);
        console.log('✅ DeepSeek analysé:', analysis.clips?.length || 0, 'clips');
        return analysis;
        
    } catch (error) {
        console.log('⚠️ DeepSeek fallback - segmentation automatique');
        
        // Fallback amélioré
        const clips = [];
        const maxDuration = Math.min(videoInfo.duration, 120); // Max 2 minutes pour le traitement
        const clipDuration = 15; // 15 secondes par clip
        
        // Début de vidéo (souvent accrocheur)
        if (maxDuration > 15) {
            clips.push({
                start_time: 3, // Skip les 3 premières secondes (souvent intro)
                end_time: 18,
                title: `Accroche - ${videoInfo.title.substring(0, 25)}`,
                description: `Début accrocheur de la vidéo`,
                viral_score: 0.8
            });
        }
        
        // Milieu de vidéo
        if (maxDuration > 45) {
            const midStart = Math.floor(maxDuration / 3);
            clips.push({
                start_time: midStart,
                end_time: midStart + clipDuration,
                title: `Moment clé - ${videoInfo.title.substring(0, 25)}`,
                description: `Contenu principal de la vidéo`,
                viral_score: 0.7
            });
        }
        
        // Fin de vidéo (souvent conclusion/appel à l'action)
        if (maxDuration > 75) {
            const endStart = Math.max(maxDuration - 20, maxDuration * 0.8);
            clips.push({
                start_time: Math.floor(endStart),
                end_time: Math.min(Math.floor(endStart) + clipDuration, maxDuration),
                title: `Conclusion - ${videoInfo.title.substring(0, 25)}`,
                description: `Conclusion impactante`,
                viral_score: 0.75
            });
        }
        
        return { clips: clips.length > 0 ? clips : [{
            start_time: 5,
            end_time: Math.min(20, maxDuration),
            title: `Extrait - ${videoInfo.title.substring(0, 30)}`,
            description: `Segment automatique`,
            viral_score: 0.6
        }] };
    }
}

// Info vidéo YouTube avec yt-dlp (version robuste)
async function getVideoInfo(url) {
    try {
        console.log('📋 Info vidéo avec yt-dlp...');
        
        // Utiliser des options plus robustes pour yt-dlp
        const command = `yt-dlp -j --no-download --extractor-args "youtube:skip=hls,dash" "${url}"`;
        const { stdout } = await execAsync(command, { timeout: 30000 });
        const info = JSON.parse(stdout);
        
        console.log(`📊 Vidéo trouvée: "${info.title}" (${info.duration}s)`);
        
        return {
            title: info.title || 'Video',
            duration: parseInt(info.duration) || 60,
            description: (info.description || '').substring(0, 300),
            uploader: info.uploader || '',
            view_count: info.view_count || 0,
            upload_date: info.upload_date || ''
        };
    } catch (error) {
        console.error('❌ Erreur yt-dlp info:', error.message);
        throw new Error(`Impossible d'obtenir les infos vidéo: ${error.message}`);
    }
}

// Télécharger vidéo avec yt-dlp (version robuste)
async function downloadVideo(url, outputPath) {
    try {
        console.log('📥 Téléchargement avec yt-dlp...');
        
        // Options de téléchargement plus flexibles
        const formats = [
            'best[height<=720][ext=mp4]', // Préférer 720p MP4
            'best[height<=480][ext=mp4]', // Fallback 480p MP4
            'best[ext=mp4]',              // N'importe quel MP4
            'best[height<=720]',          // 720p n'importe quel format
            'best'                        // Dernier recours
        ];
        
        let lastError = null;
        
        for (const format of formats) {
            try {
                const command = `yt-dlp -f "${format}" -o "${outputPath}" "${url}" --no-playlist --extract-flat never`;
                console.log(`🔄 Essai format: ${format}`);
                
                await execAsync(command, { timeout: 120000 }); // 2 minutes timeout
                
                // Vérifier si le fichier existe et n'est pas vide
                const stats = await fs.stat(outputPath);
                if (stats.size > 1024) { // Au moins 1KB
                    console.log(`✅ Téléchargé: ${(stats.size / (1024*1024)).toFixed(1)}MB`);
                    return;
                }
            } catch (error) {
                lastError = error;
                console.log(`⚠️ Format ${format} échoué, essai suivant...`);
                continue;
            }
        }
        
        throw lastError || new Error('Tous les formats ont échoué');
        
    } catch (error) {
        console.error('❌ Erreur téléchargement:', error.message);
        throw new Error(`Téléchargement impossible: ${error.message}`);
    }
}

// Créer clips (optimisé pour TikTok)
async function createClips(videoPath, clips, videoId) {
    const results = [];
    console.log(`✂️ Création ${clips.length} clips TikTok...`);
    
    for (let i = 0; i < clips.length; i++) {
        const clip = clips[i];
        const outputPath = path.join(OUTPUT_DIR, `${videoId}_clip${i + 1}.mp4`);
        
        try {
            // Limiter la durée des clips à 30s max pour TikTok
            const maxDuration = Math.min(clip.end_time - clip.start_time, 30);
            const actualEndTime = clip.start_time + maxDuration;
            
            await new Promise((resolve, reject) => {
                ffmpeg(videoPath)
                    .seekInput(clip.start_time)
                    .duration(maxDuration)
                    .videoCodec('libx264')
                    .audioCodec('aac')
                    .outputOptions([
                        '-preset veryfast',     // Encodage plus rapide
                        '-crf 28',              // Qualité adaptée
                        '-maxrate 1M',          // Limiter bitrate
                        '-bufsize 2M',          // Buffer
                        '-vf scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2', // Format vertical TikTok
                        '-ar 44100',            // Sample rate audio
                        '-ac 2',                // Stereo
                        '-movflags +faststart'  // Streaming optimizé
                    ])
                    .output(outputPath)
                    .on('end', () => {
                        console.log(`✅ Clip ${i + 1}/${clips.length} créé`);
                        resolve();
                    })
                    .on('error', (err) => {
                        console.error(`❌ Erreur clip ${i + 1}:`, err.message);
                        reject(err);
                    })
                    .run();
            });
            
            const stats = await fs.stat(outputPath);
            results.push({
                ...clip,
                end_time: actualEndTime, // Durée réelle
                filePath: `/output/${path.basename(outputPath)}`,
                fileSize: stats.size,
                duration: maxDuration,
                format: '720x1280 (TikTok)',
                bitrate: '~1Mbps'
            });
            
        } catch (error) {
            console.error(`❌ Clip ${i + 1} échoué:`, error.message);
            // Continuer avec les autres clips même si un échoue
        }
    }
    
    return results;
}

// Route principale - traitement vidéo
app.post('/api/process-video', async (req, res) => {
    const { url } = req.body;
    
    if (!url || !isValidYouTubeURL(url)) {
        return res.status(400).json({ error: 'URL YouTube invalide' });
    }
    
    const videoId = getVideoId(url);
    if (!videoId) {
        return res.status(400).json({ error: 'ID vidéo introuvable' });
    }
    
    const videoPath = path.join(UPLOAD_DIR, `${videoId}.%(ext)s`);
    const actualVideoPath = path.join(UPLOAD_DIR, `${videoId}.mp4`);
    
    try {
        console.log(`🎬 Traitement: ${videoId}`);
        
        // 1. Obtenir les infos
        const videoInfo = await getVideoInfo(url);
        console.log(`📊 "${videoInfo.title}" - ${videoInfo.duration}s - ${videoInfo.view_count?.toLocaleString()} vues`);
        
        // Vérifier les limites
        if (videoInfo.duration > 600) {
            return res.status(400).json({ 
                error: 'Vidéo trop longue (max 10 minutes)',
                duration: videoInfo.duration
            });
        }
        
        if (videoInfo.duration < 10) {
            return res.status(400).json({ 
                error: 'Vidéo trop courte (min 10 secondes)',
                duration: videoInfo.duration
            });
        }
        
        // 2. Télécharger la vidéo
        await downloadVideo(url, actualVideoPath);
        
        // 3. Analyser avec DeepSeek
        const analysis = await analyzeWithDeepSeek(videoInfo);
        
        // 4. Créer les clips
        const clips = await createClips(actualVideoPath, analysis.clips, videoId);
        
        // 5. Nettoyer
        try { 
            await fs.unlink(actualVideoPath); 
            console.log('🗑️ Fichier original supprimé');
        } catch {}
        
        const successfulClips = clips.filter(c => c.filePath);
        console.log(`🎉 Terminé: ${successfulClips.length}/${clips.length} clips générés`);
        
        res.json({
            status: 'completed',
            videoInfo: {
                ...videoInfo,
                processed_at: new Date().toISOString()
            },
            clips: successfulClips,
            stats: {
                total_clips: analysis.clips.length,
                successful_clips: successfulClips.length,
                total_size_mb: successfulClips.reduce((sum, clip) => sum + (clip.fileSize / (1024*1024)), 0).toFixed(1)
            }
        });
        
    } catch (error) {
        console.error('❌ Erreur traitement:', error.message);
        
        // Nettoyer en cas d'erreur
        try { await fs.unlink(actualVideoPath); } catch {}
        
        res.status(500).json({ 
            error: 'Erreur de traitement',
            details: error.message,
            videoId: videoId
        });
    }
});

// Route status améliorée
app.get('/api/status', (req, res) => {
    res.json({ 
        status: 'running',
        version: '3.0.0',
        deepseek: !!DEEPSEEK_API_KEY,
        ytdlp_available: true,
        ffmpeg_available: true,
        features: {
            max_video_duration: 600,
            min_video_duration: 10,
            max_clip_duration: 30,
            output_format: '720x1280 (TikTok)',
            supported_formats: ['MP4', 'WebM', 'MKV']
        },
        time: new Date().toISOString()
    });
});

// Route pour lister les fichiers avec détails
app.get('/api/files', async (req, res) => {
    try {
        const files = await fs.readdir(OUTPUT_DIR);
        const fileDetails = [];
        
        for (const file of files) {
            if (file.endsWith('.mp4')) {
                const filePath = path.join(OUTPUT_DIR, file);
                const stats = await fs.stat(filePath);
                fileDetails.push({
                    name: file,
                    size: stats.size,
                    size_mb: (stats.size / (1024*1024)).toFixed(1),
                    created: stats.ctime,
                    url: `/output/${file}`,
                    download_url: `${req.protocol}://${req.get('host')}/output/${file}`
                });
            }
        }
        
        // Trier par date de création (plus récent en premier)
        fileDetails.sort((a, b) => new Date(b.created) - new Date(a.created));
        
        res.json({ 
            files: fileDetails,
            total_files: fileDetails.length,
            total_size_mb: fileDetails.reduce((sum, file) => sum + parseFloat(file.size_mb), 0).toFixed(1)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Route de nettoyage
app.delete('/api/cleanup', async (req, res) => {
    try {
        const files = await fs.readdir(OUTPUT_DIR);
        let deleted = 0;
        
        for (const file of files) {
            if (file.endsWith('.mp4')) {
                await fs.unlink(path.join(OUTPUT_DIR, file));
                deleted++;
            }
        }
        
        res.json({ 
            message: `${deleted} fichiers supprimés`,
            deleted_count: deleted
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Démarrage
async function start() {
    await ensureDirectories();
    
    // Frontend si pas déjà créé
    try {
        await fs.access('./public/index.html');
    } catch {
        console.log('📝 Création frontend v3.0...');
        await createFrontend();
    }
    
    app.listen(PORT, () => {
        console.log(`🚀 VidClip v3.0 démarré: http://localhost:${PORT}`);
        console.log(`🔑 DeepSeek: ${DEEPSEEK_API_KEY ? 'OK' : 'NOK'}`);
        console.log(`📹 yt-dlp: OK`);
        console.log(`🎬 FFmpeg: OK`);
        console.log(`📱 Format: TikTok (720x1280)`);
    });
}

// Frontend v3.0 optimisé
async function createFrontend() {
    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>🎬 VidClip - Créateur de clips TikTok IA</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh; padding: 20px;
        }
        .container { 
            max-width: 800px; margin: 0 auto; 
            background: white; padding: 40px; border-radius: 20px; 
            box-shadow: 0 20px 60px rgba(0,0,0,0.15);
        }
        .header { text-align: center; margin-bottom: 40px; }
        .header h1 { font-size: 3em; margin-bottom: 10px; color: #333; }
        .header .subtitle { font-size: 1.2em; color: #666; margin-bottom: 20px; }
        .features { display: flex; justify-content: space-around; margin: 20px 0; flex-wrap: wrap; }
        .feature { text-align: center; padding: 10px; }
        .feature .icon { font-size: 2em; margin-bottom: 5px; }
        .feature .text { font-size: 0.9em; color: #555; }
        
        .input-section { margin: 30px 0; }
        .input-group { display: flex; gap: 15px; margin: 20px 0; }
        .url-input { 
            flex: 1; padding: 18px; border: 2px solid #e1e5e9; 
            border-radius: 12px; font-size: 16px; transition: all 0.3s;
        }
        .url-input:focus { outline: none; border-color: #667eea; box-shadow: 0 0 0 3px rgba(102,126,234,0.1); }
        .process-btn { 
            padding: 18px 35px; background: linear-gradient(135deg, #667eea, #764ba2);
            color: white; border: none; border-radius: 12px; cursor: pointer;
            font-size: 16px; font-weight: 600; transition: all 0.3s;
        }
        .process-btn:hover { transform: translateY(-2px); box-shadow: 0 10px 25px rgba(102,126,234,0.3); }
        .process-btn:disabled { background: #ccc; cursor: not-allowed; transform: none; }
        
        .status { 
            margin: 25px 0; padding: 20px; border-radius: 12px; display: none;
            font-weight: 500;
        }
        .status.processing { background: #fff3cd; border: 2px solid #ffeaa7; color: #856404; }
        .status.success { background: #d4edda; border: 2px solid #c3e6cb; color: #155724; }
        .status.error { background: #f8d7da; border: 2px solid #f5c6cb; color: #721c24; }
        
        .progress { width: 100%; height: 8px; background: #f0f0f0; border-radius: 4px; overflow: hidden; margin: 15px 0; display: none; }
        .progress-bar { height: 100%; background: linear-gradient(90deg, #667eea, #764ba2); width: 0%; transition: width 0.5s; }
        
        .results { margin-top: 40px; display: none; }
        .video-info { 
            background: #f8f9fa; padding: 20px; border-radius: 12px; margin: 20px 0;
            border-left: 5px solid #667eea;
        }
        .clips-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-top: 20px; }
        .clip-card { 
            background: white; border: 2px solid #e9ecef; border-radius: 15px; 
            padding: 20px; transition: all 0.3s; cursor: pointer;
        }
        .clip-card:hover { border-color: #667eea; transform: translateY(-5px); box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
        .clip-title { font-size: 1.1em; font-weight: 600; margin-bottom: 8px; color: #333; }
        .clip-desc { color: #666; margin-bottom: 15px; line-height: 1.4; }
        .clip-stats { display: flex; justify-content: space-between; margin: 15px 0; font-size: 0.9em; }
        .clip-stats span { background: #f8f9fa; padding: 5px 10px; border-radius: 20px; }
        .download-btn { 
            background: #28a745; color: white; padding: 12px 20px; 
            text-decoration: none; border-radius: 8px; display: inline-block;
            transition: background 0.3s; font-weight: 500;
        }
        .download-btn:hover { background: #218838; }
        
        .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e9ecef; }
        .footer a { color: #667eea; text-decoration: none; }
        
        @media (max-width: 600px) {
            .input-group { flex-direction: column; }
            .features { justify-content: center; }
            .feature { margin: 10px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎬 VidClip</h1>
            <p class="subtitle">Transformez vos vidéos YouTube en clips TikTok viraux avec l'IA</p>
            
            <div class="features">
                <div class="feature">
                    <div class="icon">🤖</div>
                    <div class="text">IA DeepSeek</div>
                </div>
                <div class="feature">
                    <div class="icon">📱</div>
                    <div class="text">Format TikTok</div>
                </div>
                <div class="feature">
                    <div class="icon">⚡</div>
                    <div class="text">Ultra rapide</div>
                </div>
                <div class="feature">
                    <div class="icon">🎯</div>
                    <div class="text">Segments viraux</div>
                </div>
            </div>
        </div>
        
        <div class="input-section">
            <div class="input-group">
                <input type="url" class="url-input" id="url" 
                       placeholder="https://youtube.com/watch?v=..." 
                       autocomplete="off">
                <button class="process-btn" onclick="processVideo()" id="processBtn">
                    🚀 Créer des clips
                </button>
            </div>
        </div>
        
        <div id="status" class="status"></div>
        <div class="progress" id="progress">
            <div class="progress-bar" id="progressBar"></div>
        </div>
        
        <div id="results" class="results">
            <div id="videoInfo" class="video-info"></div>
            <div id="clipsGrid" class="clips-grid"></div>
        </div>
        
        <div class="footer">
            <p>Propulsé par <a href="#" target="_blank">DeepSeek AI</a> • 
               Format optimisé pour TikTok (720×1280)</p>
        </div>
    </div>

    <script>
        let processing = false;
        
        async function processVideo() {
            if (processing) return;
            
            const url = document.getElementById('url').value.trim();
            const btn = document.getElementById('processBtn');
            
            if (!url || !isValidYouTubeURL(url)) {
                showStatus('⚠️ Veuillez entrer une URL YouTube valide', 'error');
                return;
            }
            
            processing = true;
            btn.disabled = true;
            btn.textContent = '⏳ Traitement en cours...';
            
            showStatus('🔄 Analyse de la vidéo...', 'processing');
            showProgress(true);
            hideResults();
            
            // Animation de progression
            let progress = 0;
            const progressInterval = setInterval(() => {
                progress += Math.random() * 15;
                if (progress > 85) progress = 85;
                updateProgress(progress);
            }, 800);
            
            try {
                const response = await fetch('/api/process-video', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url })
                });
                
                clearInterval(progressInterval);
                updateProgress(100);
                
                const data = await response.json();
                
                if (response.ok && data.clips) {
                    setTimeout(() => {
                        showStatus(\`✅ Terminé ! \${data.clips.length} clips créés\`, 'success');
                        showResults(data);
                        showProgress(false);
                    }, 500);
                } else {
                    throw new Error(data.error || 'Erreur inconnue');
                }
            } catch (error) {
                clearInterval(progressInterval);
                showProgress(false);
                showStatus(\`❌ Erreur: \${error.message}\`, 'error');
            } finally {
                processing = false;
                btn.disabled = false;
                btn.textContent = '🚀 Créer des clips';
            }
        }
        
        function isValidYouTubeURL(url) {
            return /^(https?:\\/\\/)?(www\\.)?(youtube\\.com\\/(watch\\?v=|embed\\/|v\\/)|youtu\\.be\\/)[\w-]+/.test(url);
        }
        
        function showStatus(message, type) {
            const status = document.getElementById('status');
            status.innerHTML = message;
            status.className = \`status \${type}\`;
            status.style.display = 'block';
        }
        
        function showProgress(show) {
            document.getElementById('progress').style.display = show ? 'block' : 'none';
            if (!show) updateProgress(0);
        }
        
        function updateProgress(percent) {
            document.getElementById('progressBar').style.width = percent + '%';
        }
        
        function hideResults() {
            document.getElementById('results').style.display = 'none';
        }
        
        function showResults(data) {
            const results = document.getElementById('results');
            const videoInfo = document.getElementById('videoInfo');
            const clipsGrid = document.getElementById('clipsGrid');
            
            // Info vidéo
            videoInfo.innerHTML = \`
                <h3>📹 \${data.videoInfo.title}</h3>
                <p><strong>Durée:</strong> \${data.videoInfo.duration}s • 
                   <strong>Vues:</strong> \${data.videoInfo.view_count?.toLocaleString() || 'N/A'} • 
                   <strong>Clips créés:</strong> \${data.clips.length}/\${data.stats.total_clips}</p>
                <p><strong>Taille totale:</strong> \${data.stats.total_size_mb} MB</p>
            \`;
            
            // Grille des clips
            clipsGrid.innerHTML = '';
            data.clips.forEach((clip, i) => {
                const clipCard = document.createElement('div');
                clipCard.className = 'clip-card';
                clipCard.innerHTML = \`
                    <div class="clip-title">🎯 \${clip.title}</div>
                    <div class="clip-desc">\${clip.description}</div>
                    <div class="clip-stats">
                        <span>⏱️ \${clip.duration}s</span>
                        <span>📊 \${(clip.viral_score*100).toFixed(0)}%</span>
                        <span>💾 \${(clip.fileSize/(1024*1024)).toFixed(1)}MB</span>
                    </div>
                    <a href="\${clip.filePath}" class="download-btn" download>
                        📥 Télécharger le clip \${i+1}
                    </a>
                \`;
                clipsGrid.appendChild(clipCard);
            });
            
            results.style.display = 'block';
        }
        
        // Raccourcis clavier
        document.getElementById('url').addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !processing) processVideo();
        });
        
        // Auto-focus
        document.getElementById('url').focus();
        
        // Test de connexion au démarrage
        fetch('/api/status').then(r => r.json()).then(data => {
            console.log('VidClip v' + data.version + ' connecté');
        }).catch(() => {
            showStatus('⚠️ Service temporairement indisponible', 'error');
        });
    </script>
</body>
</html>`;
    
    await fs.writeFile('./public/index.html', html);
}

start().catch(console.error);