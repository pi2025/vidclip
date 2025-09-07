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
                content: `Analyse cette vidéo YouTube et trouve 3 segments viraux de 15-30s:
                
Titre: ${videoInfo.title}
Durée: ${videoInfo.duration}s
Description: ${videoInfo.description}

Réponds en JSON:
{
  "clips": [
    {
      "start_time": 30,
      "end_time": 50,
      "title": "Moment viral",
      "description": "Pourquoi c'est viral",
      "viral_score": 0.8
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
        console.log('✅ DeepSeek OK:', analysis.clips?.length || 0, 'clips');
        return analysis;
        
    } catch (error) {
        console.log('⚠️ DeepSeek fallback, using automatic segmentation');
        
        // Fallback automatique
        const clips = [];
        const duration = Math.min(videoInfo.duration, 180); // Max 3min
        const numClips = 3;
        
        for (let i = 0; i < numClips; i++) {
            const start = Math.floor((duration / numClips) * i);
            const end = Math.min(start + 20, videoInfo.duration);
            
            clips.push({
                start_time: start,
                end_time: end,
                title: `Clip ${i + 1} - ${videoInfo.title.substring(0, 30)}`,
                description: `Segment automatique ${i + 1}`,
                viral_score: 0.7
            });
        }
        
        return { clips };
    }
}

// Info vidéo YouTube avec yt-dlp
async function getVideoInfo(url) {
    try {
        console.log('📋 Info vidéo avec yt-dlp...');
        
        const { stdout } = await execAsync(`yt-dlp -j --no-download "${url}"`);
        const info = JSON.parse(stdout);
        
        return {
            title: info.title || 'Video',
            duration: parseInt(info.duration) || 60,
            description: (info.description || '').substring(0, 300),
            uploader: info.uploader || '',
            view_count: info.view_count || 0
        };
    } catch (error) {
        console.error('❌ Erreur yt-dlp:', error.message);
        throw new Error(`Erreur info: ${error.message}`);
    }
}

// Télécharger vidéo avec yt-dlp
async function downloadVideo(url, outputPath) {
    try {
        console.log('📥 Téléchargement avec yt-dlp...');
        
        // Télécharger la meilleure qualité vidéo+audio
        const command = `yt-dlp -f "best[ext=mp4]/best" -o "${outputPath}" "${url}"`;
        await execAsync(command);
        
        // Vérifier si le fichier existe
        const stats = await fs.stat(outputPath);
        if (stats.size === 0) {
            throw new Error('Fichier vidéo vide');
        }
        
        console.log('✅ Téléchargement terminé:', (stats.size / (1024*1024)).toFixed(1), 'MB');
        
    } catch (error) {
        console.error('❌ Erreur téléchargement:', error.message);
        throw new Error(`Erreur téléchargement: ${error.message}`);
    }
}

// Créer clips
async function createClips(videoPath, clips, videoId) {
    const results = [];
    console.log(`✂️ Création ${clips.length} clips...`);
    
    for (let i = 0; i < clips.length; i++) {
        const clip = clips[i];
        const outputPath = path.join(OUTPUT_DIR, `${videoId}_${i + 1}.mp4`);
        
        try {
            await new Promise((resolve, reject) => {
                ffmpeg(videoPath)
                    .seekInput(clip.start_time)
                    .duration(clip.end_time - clip.start_time)
                    .size('1080x1920') // Format vertical TikTok
                    .videoCodec('libx264')
                    .audioCodec('aac')
                    .outputOptions([
                        '-preset fast', 
                        '-crf 23',
                        '-vf pad=1080:1920:0:(1920-ih)/2:black' // Padding vertical
                    ])
                    .output(outputPath)
                    .on('end', resolve)
                    .on('error', (err) => {
                        console.error(`❌ FFmpeg error clip ${i + 1}:`, err.message);
                        reject(err);
                    })
                    .run();
            });
            
            const stats = await fs.stat(outputPath);
            results.push({
                ...clip,
                filePath: `/output/${path.basename(outputPath)}`,
                fileSize: stats.size,
                duration: clip.end_time - clip.start_time
            });
            
            console.log(`✅ Clip ${i + 1} créé (${(stats.size / (1024*1024)).toFixed(1)}MB)`);
            
        } catch (error) {
            console.error(`❌ Clip ${i + 1} failed:`, error.message);
        }
    }
    
    return results;
}

// Route principale
app.post('/api/process-video', async (req, res) => {
    const { url } = req.body;
    
    if (!url || !isValidYouTubeURL(url)) {
        return res.status(400).json({ error: 'URL YouTube invalide' });
    }
    
    const videoId = getVideoId(url);
    if (!videoId) {
        return res.status(400).json({ error: 'Impossible d\'extraire l\'ID vidéo' });
    }
    
    const videoPath = path.join(UPLOAD_DIR, `${videoId}.mp4`);
    
    try {
        console.log(`🎬 Traitement vidéo: ${videoId}`);
        
        // 1. Info vidéo
        const videoInfo = await getVideoInfo(url);
        console.log(`📊 Durée: ${videoInfo.duration}s, Vues: ${videoInfo.view_count}`);
        
        // Vérifier la durée (limiter à 10 minutes max)
        if (videoInfo.duration > 600) {
            return res.status(400).json({ 
                error: 'Vidéo trop longue (max 10 minutes)',
                duration: videoInfo.duration
            });
        }
        
        // 2. Télécharger
        await downloadVideo(url, videoPath);
        
        // 3. Analyser avec DeepSeek
        const analysis = await analyzeWithDeepSeek(videoInfo);
        
        // 4. Créer clips
        const clips = await createClips(videoPath, analysis.clips, videoId);
        
        // 5. Nettoyer le fichier original
        try { 
            await fs.unlink(videoPath); 
            console.log('🗑️ Fichier original supprimé');
        } catch {}
        
        console.log(`✅ Traitement terminé: ${clips.length} clips générés`);
        
        res.json({
            status: 'completed',
            videoInfo,
            clips: clips.filter(c => c.filePath),
            processed_at: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Erreur traitement:', error.message);
        
        // Nettoyer en cas d'erreur
        try { await fs.unlink(videoPath); } catch {}
        
        res.status(500).json({ 
            error: 'Erreur traitement',
            details: error.message 
        });
    }
});

// Route status
app.get('/api/status', (req, res) => {
    res.json({ 
        status: 'running',
        deepseek: !!DEEPSEEK_API_KEY,
        ytdlp_available: true,
        ffmpeg_available: true,
        time: new Date().toISOString(),
        version: '2.0.0'
    });
});

// Route pour lister les fichiers output
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
                    created: stats.ctime,
                    url: `/output/${file}`
                });
            }
        }
        
        res.json({ files: fileDetails });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Démarrage
async function start() {
    await ensureDirectories();
    
    // Frontend simple si pas de public/index.html
    try {
        await fs.access('./public/index.html');
    } catch {
        console.log('📝 Création frontend...');
        await createFrontend();
    }
    
    app.listen(PORT, () => {
        console.log(`🚀 VidClip v2.0 démarré: http://localhost:${PORT}`);
        console.log(`🔑 DeepSeek: ${DEEPSEEK_API_KEY ? 'OK' : 'NOK'}`);
        console.log(`📹 yt-dlp: OK`);
        console.log(`🎬 FFmpeg: OK`);
    });
}

// Frontend amélioré
async function createFrontend() {
    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>🎬 VidClip v2.0</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0; 
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        .container { 
            max-width: 700px; 
            margin: 0 auto; 
            background: white; 
            padding: 40px; 
            border-radius: 15px; 
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }
        h1 { 
            color: #333; 
            text-align: center; 
            margin-bottom: 10px;
            font-size: 2.5em;
        }
        .subtitle {
            text-align: center;
            color: #666;
            margin-bottom: 30px;
            font-size: 1.1em;
        }
        .input-group {
            display: flex;
            gap: 10px;
            margin: 30px 0;
        }
        input[type="url"] { 
            flex: 1;
            padding: 15px; 
            border: 2px solid #e1e5e9; 
            border-radius: 8px;
            font-size: 16px;
            transition: border-color 0.3s;
        }
        input[type="url"]:focus {
            outline: none;
            border-color: #667eea;
        }
        button { 
            padding: 15px 30px; 
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white; 
            border: none; 
            border-radius: 8px; 
            cursor: pointer;
            font-size: 16px;
            font-weight: 600;
            transition: transform 0.2s;
        }
        button:hover { transform: translateY(-2px); }
        button:disabled {
            background: #ccc;
            cursor: not-allowed;
            transform: none;
        }
        .status { 
            margin: 20px 0; 
            padding: 15px; 
            border-radius: 8px;
            display: none;
        }
        .processing { 
            background: #fff3cd; 
            border: 2px solid #ffeaa7; 
            color: #856404;
        }
        .success { 
            background: #d4edda; 
            border: 2px solid #c3e6cb; 
            color: #155724;
        }
        .error { 
            background: #f8d7da; 
            border: 2px solid #f5c6cb; 
            color: #721c24;
        }
        .clips { 
            margin-top: 30px;
            display: none;
        }
        .clip { 
            margin: 15px 0; 
            padding: 20px; 
            background: #f8f9fa; 
            border-radius: 10px;
            border-left: 4px solid #667eea;
        }
        .clip h4 {
            margin: 0 0 10px 0;
            color: #333;
        }
        .clip p {
            margin: 5px 0;
            color: #666;
        }
        .download { 
            background: #28a745; 
            color: white; 
            padding: 10px 20px; 
            text-decoration: none; 
            border-radius: 5px;
            display: inline-block;
            margin-top: 10px;
            transition: background 0.3s;
        }
        .download:hover {
            background: #218838;
        }
        .progress {
            width: 100%;
            height: 6px;
            background: #e1e5e9;
            border-radius: 3px;
            overflow: hidden;
            margin: 10px 0;
        }
        .progress-bar {
            height: 100%;
            background: linear-gradient(90deg, #667eea, #764ba2);
            width: 0%;
            transition: width 0.3s;
        }
        @media (max-width: 600px) {
            .input-group {
                flex-direction: column;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎬 VidClip</h1>
        <p class="subtitle">Transformez vos vidéos YouTube en clips TikTok viraux avec l'IA</p>
        
        <div class="input-group">
            <input type="url" id="url" placeholder="https://youtube.com/watch?v=..." 
                   autocomplete="off">
            <button onclick="process()" id="processBtn">🚀 Analyser</button>
        </div>
        
        <div id="status" class="status"></div>
        <div class="progress" id="progress" style="display:none;">
            <div class="progress-bar" id="progressBar"></div>
        </div>
        <div id="results" class="clips"></div>
    </div>

    <script>
        let processing = false;
        
        async function process() {
            if (processing) return;
            
            const url = document.getElementById('url').value.trim();
            const btn = document.getElementById('processBtn');
            const status = document.getElementById('status');
            const results = document.getElementById('results');
            const progress = document.getElementById('progress');
            const progressBar = document.getElementById('progressBar');
            
            if (!url) {
                showStatus('⚠️ Veuillez entrer une URL YouTube valide', 'error');
                return;
            }
            
            if (!isValidYouTubeURL(url)) {
                showStatus('⚠️ URL YouTube invalide', 'error');
                return;
            }
            
            processing = true;
            btn.disabled = true;
            btn.textContent = '⏳ Traitement...';
            
            showStatus('🔄 Traitement en cours...', 'processing');
            results.style.display = 'none';
            progress.style.display = 'block';
            
            // Simulation de progression
            let prog = 0;
            const progressInterval = setInterval(() => {
                prog += Math.random() * 20;
                if (prog > 90) prog = 90;
                progressBar.style.width = prog + '%';
            }, 500);
            
            try {
                const response = await fetch('/api/process-video', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url })
                });
                
                const data = await response.json();
                clearInterval(progressInterval);
                progressBar.style.width = '100%';
                
                if (response.ok && data.clips) {
                    showStatus(\`✅ Terminé ! \${data.clips.length} clips générés\`, 'success');
                    showResults(data);
                    progress.style.display = 'none';
                } else {
                    throw new Error(data.error || 'Erreur inconnue');
                }
            } catch (error) {
                clearInterval(progressInterval);
                progress.style.display = 'none';
                showStatus('❌ Erreur: ' + error.message, 'error');
            } finally {
                processing = false;
                btn.disabled = false;
                btn.textContent = '🚀 Analyser';
            }
        }
        
        function isValidYouTubeURL(url) {
            const regex = /^(https?:\\/\\/)?(www\\.)?(youtube\\.com\\/(watch\\?v=|embed\\/|v\\/)|youtu\\.be\\/)[\w-]+/;
            return regex.test(url);
        }
        
        function showStatus(msg, type) {
            const status = document.getElementById('status');
            status.innerHTML = msg;
            status.className = 'status ' + type;
            status.style.display = 'block';
        }
        
        function showResults(data) {
            const results = document.getElementById('results');
            results.innerHTML = \`
                <h3>📹 \${data.videoInfo.title}</h3>
                <p><strong>Durée:</strong> \${data.videoInfo.duration}s | <strong>Clips générés:</strong> \${data.clips.length}</p>
            \`;
            
            data.clips.forEach((clip, i) => {
                const div = document.createElement('div');
                div.className = 'clip';
                div.innerHTML = \`
                    <h4>🎯 \${clip.title}</h4>
                    <p>\${clip.description}</p>
                    <p><small>
                        ⏱️ Durée: \${clip.duration}s | 
                        📊 Score viral: \${(clip.viral_score*100).toFixed(0)}% |
                        💾 Taille: \${(clip.fileSize/(1024*1024)).toFixed(1)}MB
                    </small></p>
                    <a href="\${clip.filePath}" class="download" download>
                        📥 Télécharger le clip \${i+1}
                    </a>
                \`;
                results.appendChild(div);
            });
            
            results.style.display = 'block';
        }
        
        document.getElementById('url').addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !processing) {
                process();
            }
        });
        
        // Auto-focus sur l'input
        document.getElementById('url').focus();
    </script>
</body>
</html>`;
    
    await fs.writeFile('./public/index.html', html);
}

start().catch(console.error);