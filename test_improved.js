const axios = require('axios');

async function testImprovedVidClip() {
    const baseUrl = 'https://3000-ijxv6ulqm8kcxz2cz8oqv-6532622b.e2b.dev';
    
    console.log('🧪 Test VidClip v2.0 avec yt-dlp');
    console.log('================================');
    
    // Test 1: Status API
    try {
        console.log('\n1️⃣ Test Status API...');
        const statusResponse = await axios.get(`${baseUrl}/api/status`);
        console.log('✅ Status:', statusResponse.data);
    } catch (error) {
        console.log('❌ Status failed:', error.message);
        return;
    }
    
    // Test 2: Frontend access
    try {
        console.log('\n2️⃣ Test Frontend...');
        const frontendResponse = await axios.get(baseUrl);
        console.log('✅ Frontend accessible (', frontendResponse.status, ')');
    } catch (error) {
        console.log('❌ Frontend failed:', error.message);
    }
    
    // Test 3: Video processing avec une vidéo très courte
    try {
        console.log('\n3️⃣ Test Video Processing avec yt-dlp...');
        
        // URLs de test (vidéos courtes)
        const testUrls = [
            'https://www.youtube.com/watch?v=BaW_jenozKc', // YouTube Shorts - très court
            'https://www.youtube.com/watch?v=fJ9rUzIMcZQ', // Autre vidéo courte
        ];
        
        for (const testVideoUrl of testUrls) {
            try {
                console.log(`\n🎥 Test avec: ${testVideoUrl}`);
                console.log('⏳ Traitement en cours...');
                
                const startTime = Date.now();
                const processResponse = await axios.post(`${baseUrl}/api/process-video`, {
                    url: testVideoUrl
                }, {
                    timeout: 180000 // 3 minutes timeout
                });
                
                const duration = (Date.now() - startTime) / 1000;
                console.log(`⏱️ Traitement terminé en ${duration}s`);
                console.log('✅ Clips générés:', processResponse.data.clips?.length || 0);
                
                if (processResponse.data.videoInfo) {
                    const info = processResponse.data.videoInfo;
                    console.log(`📊 Info vidéo: "${info.title}" (${info.duration}s)`);
                    console.log(`👀 Vues: ${info.view_count?.toLocaleString() || 'N/A'}`);
                }
                
                if (processResponse.data.clips && processResponse.data.clips.length > 0) {
                    console.log('\n📋 Détails des clips:');
                    processResponse.data.clips.forEach((clip, i) => {
                        console.log(`  ${i+1}. ${clip.title}`);
                        console.log(`     Durée: ${clip.duration}s | Score: ${(clip.viral_score * 100).toFixed(0)}%`);
                        console.log(`     Fichier: ${clip.filePath} (${(clip.fileSize/(1024*1024)).toFixed(1)}MB)`);
                    });
                }
                
                // Test réussi, on s'arrête ici
                console.log('\n🎉 Test réussi avec cette vidéo !');
                break;
                
            } catch (error) {
                console.log(`❌ Échec avec cette vidéo: ${error.message}`);
                if (error.response?.data) {
                    console.log(`   Détails: ${error.response.data.details || error.response.data.error}`);
                }
                console.log('   Essai avec la vidéo suivante...');
                continue;
            }
        }
        
    } catch (error) {
        console.log('❌ Tous les tests de traitement ont échoué');
    }
    
    // Test 4: Liste des fichiers
    try {
        console.log('\n4️⃣ Test liste des fichiers...');
        const filesResponse = await axios.get(`${baseUrl}/api/files`);
        console.log('✅ Fichiers disponibles:', filesResponse.data.files?.length || 0);
        
        if (filesResponse.data.files && filesResponse.data.files.length > 0) {
            console.log('\n📁 Fichiers générés:');
            filesResponse.data.files.forEach((file, i) => {
                console.log(`  ${i+1}. ${file.name} (${(file.size/(1024*1024)).toFixed(1)}MB)`);
                console.log(`     URL: ${baseUrl}${file.url}`);
            });
        }
        
    } catch (error) {
        console.log('❌ Liste fichiers failed:', error.message);
    }
    
    console.log('\n🏁 Test terminé');
}

testImprovedVidClip().catch(console.error);