const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const ytdl = require('ytdl-core');
require('dotenv').config();

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
        console.log('⚠️ DeepSeek fallback');
        
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

// Info vidéo YouTube
async function getVideoInfo(url) {
    try {
        console.log('📋 Info vidéo...');
        const info = await ytdl.getInfo(url);
        
        return {
            title: info.videoDetails.title || 'Video',
            duration: parseInt(info.videoDetails.lengthSeconds),
            description: (info.videoDetails.description || '').substring(0, 300)
        };
    } catch (error) {
        throw new Error(`Erreur info: ${error.message}`);
    }
}

// Télécharger vidéo
async function downloadVideo(url, outputPath) {
    return new Promise((resolve, reject) => {
        console.log('📥 Téléchargement...');
        
        const stream = ytdl(url, { quality: 'highest', filter: 'videoandaudio' });
        const writeStream = require('fs').createWriteStream(outputPath);
        
        stream.pipe(writeStream);
        stream.on('error', reject);
        writeStream.on('error', reject);
        writeStream.on('finish', resolve);
    });
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
                    .size('1080x1920')
                    .videoCodec('libx264')
                    .audioCodec('aac')
                    .outputOptions(['-preset fast', '-crf 23'])
                    .output(outputPath)
                    .on('end', resolve)
                    .on('error', reject)
                    .run();
            });
            
            const stats = await fs.stat(outputPath);
            results.push({
                ...clip,
                filePath: `/output/${path.basename(outputPath)}`,
                fileSize: stats.size,
                duration: clip.end_time - clip.start_time
            });
            
            console.log(`✅ Clip ${i + 1} créé`);
            
        } catch (error) {
            console.error(`❌ Clip ${i + 1}:`, error.message);
        }
    }
    
    return results;
}

// Route principale
app.post('/api/process-video', async (req, res) => {
    const { url } = req.body;
    
    if (!url || !ytdl.validateURL(url)) {
        return res.status(400).json({ error: 'URL YouTube invalide' });
    }
    
    const videoId = ytdl.getVideoID(url);
    const videoPath = path.join(UPLOAD_DIR, `${videoId}.mp4`);
    
    try {
        // 1. Info vidéo
        const videoInfo = await getVideoInfo(url);
        
        // 2. Télécharger
        await downloadVideo(url, videoPath);
        
        // 3. Analyser avec DeepSeek
        const analysis = await analyzeWithDeepSeek(videoInfo);
        
        // 4. Créer clips
        const clips = await createClips(videoPath, analysis.clips, videoId);
        
        // 5. Nettoyer
        try { await fs.unlink(videoPath); } catch {}
        
        res.json({
            status: 'completed',
            videoInfo,
            clips: clips.filter(c => c.filePath)
        });
        
    } catch (error) {
        console.error('❌ Erreur:', error);
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
        time: new Date().toISOString()
    });
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
        console.log(`🚀 VidClip démarré: http://localhost:${PORT}`);
        console.log(`🔑 DeepSeek: ${DEEPSEEK_API_KEY ? 'OK' : 'NOK'}`);
    });
}

// Frontend minimal
async function createFrontend() {
    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>VidClip</title>
    <style>
        body { font-family: Arial; margin: 40px; background: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
        h1 { color: #333; text-align: center; }
        input[type="url"] { width: 70%; padding: 10px; border: 1px solid #ddd; border-radius: 5px; }
        button { width: 25%; padding: 10px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; }
        button:hover { background: #0056b3; }
        .status { margin: 20px 0; padding: 10px; border-radius: 5px; }
        .processing { background: #fff3cd; border: 1px solid #ffeaa7; }
        .success { background: #d4edda; border: 1px solid #c3e6cb; }
        .error { background: #f8d7da; border: 1px solid #f5c6cb; }
        .clips { margin-top: 20px; }
        .clip { margin: 10px 0; padding: 15px; background: #f8f9fa; border-radius: 5px; }
        .download { background: #28a745; color: white; padding: 8px 16px; text-decoration: none; border-radius: 3px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎬 VidClip</h1>
        <p>Transformez vos vidéos YouTube en clips TikTok</p>
        
        <div style="margin: 20px 0;">
            <input type="url" id="url" placeholder="https://youtube.com/watch?v=...">
            <button onclick="process()">Analyser</button>
        </div>
        
        <div id="status" class="status" style="display:none;"></div>
        <div id="results" class="clips" style="display:none;"></div>
    </div>

    <script>
        async function process() {
            const url = document.getElementById('url').value;
            const status = document.getElementById('status');
            const results = document.getElementById('results');
            
            if (!url) {
                showStatus('Entrez une URL YouTube', 'error');
                return;
            }
            
            showStatus('Traitement en cours...', 'processing');
            results.style.display = 'none';
            
            try {
                const response = await fetch('/api/process-video', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url })
                });
                
                const data = await response.json();
                
                if (response.ok && data.clips) {
                    showStatus('Terminé !', 'success');
                    showResults(data.clips);
                } else {
                    throw new Error(data.error || 'Erreur inconnue');
                }
            } catch (error) {
                showStatus('Erreur: ' + error.message, 'error');
            }
        }
        
        function showStatus(msg, type) {
            const status = document.getElementById('status');
            status.textContent = msg;
            status.className = 'status ' + type;
            status.style.display = 'block';
        }
        
        function showResults(clips) {
            const results = document.getElementById('results');
            results.innerHTML = '<h3>Clips générés:</h3>';
            
            clips.forEach((clip, i) => {
                const div = document.createElement('div');
                div.className = 'clip';
                div.innerHTML = \`
                    <h4>\${clip.title}</h4>
                    <p>\${clip.description}</p>
                    <p><small>Durée: \${clip.duration}s | Score: \${(clip.viral_score*100).toFixed(0)}%</small></p>
                    <a href="\${clip.filePath}" class="download" download>📥 Télécharger</a>
                \`;
                results.appendChild(div);
            });
            
            results.style.display = 'block';
        }
        
        document.getElementById('url').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') process();
        });
    </script>
</body>
</html>`;
    
    await fs.writeFile('./public/index.html', html);
}

start().catch(console.error);
