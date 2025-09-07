const fs = require('fs').promises;
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');

// Créer une vidéo de démonstration simple avec FFmpeg
async function createDemoVideo() {
    const outputPath = path.join('./uploads', 'demo_video.mp4');
    
    return new Promise((resolve, reject) => {
        console.log('🎬 Création vidéo de démonstration...');
        
        ffmpeg()
            .input('color=blue:size=1280x720:duration=60:rate=30')
            .inputOptions(['-f lavfi'])
            .input('sine=frequency=1000:duration=60')
            .inputOptions(['-f lavfi'])
            .videoCodec('libx264')
            .audioCodec('aac')
            .outputOptions([
                '-preset fast',
                '-crf 23',
                '-pix_fmt yuv420p'
            ])
            .output(outputPath)
            .on('end', () => {
                console.log('✅ Vidéo de démo créée');
                resolve(outputPath);
            })
            .on('error', (err) => {
                console.error('❌ Erreur création démo:', err);
                reject(err);
            })
            .run();
    });
}

// Créer des clips de démonstration
async function createDemoClips(videoPath) {
    const clips = [
        { start: 5, duration: 15, title: "Début captivant", score: 0.9 },
        { start: 25, duration: 20, title: "Moment clé", score: 0.8 },
        { start: 50, duration: 10, title: "Conclusion percutante", score: 0.85 }
    ];
    
    console.log('✂️ Création des clips de démonstration...');
    
    for (let i = 0; i < clips.length; i++) {
        const clip = clips[i];
        const outputPath = path.join('./output', `demo_clip_${i + 1}.mp4`);
        
        await new Promise((resolve, reject) => {
            ffmpeg(videoPath)
                .seekInput(clip.start)
                .duration(clip.duration)
                .videoCodec('libx264')
                .audioCodec('aac')
                .outputOptions([
                    '-preset fast',
                    '-crf 28',
                    '-vf scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2',
                    '-movflags +faststart'
                ])
                .output(outputPath)
                .on('end', () => {
                    console.log(`✅ Clip démo ${i + 1} créé`);
                    resolve();
                })
                .on('error', reject)
                .run();
        });
    }
}

async function setupDemo() {
    try {
        // S'assurer que les dossiers existent
        await fs.mkdir('./uploads', { recursive: true });
        await fs.mkdir('./output', { recursive: true });
        
        // Créer la vidéo de démo
        const demoVideoPath = await createDemoVideo();
        
        // Créer les clips de démo
        await createDemoClips(demoVideoPath);
        
        console.log('🎉 Démonstration prête !');
        console.log('📁 Fichiers créés dans ./output/');
        
    } catch (error) {
        console.error('❌ Erreur setup démo:', error);
    }
}

setupDemo();