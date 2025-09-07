const axios = require('axios');

async function testFinalVidClip() {
    const baseUrl = 'https://3000-ijxv6ulqm8kcxz2cz8oqv-6532622b.e2b.dev';
    
    console.log('🧪 Test VidClip v3.0 Final');
    console.log('==========================');
    
    // Test 1: Status API
    try {
        console.log('\n1️⃣ Test Status API...');
        const statusResponse = await axios.get(`${baseUrl}/api/status`);
        console.log('✅ Status v' + statusResponse.data.version);
        console.log('   Features:', statusResponse.data.features.output_format);
    } catch (error) {
        console.log('❌ Status failed:', error.message);
        return;
    }
    
    // Test 2: Video processing avec la première vidéo YouTube
    try {
        console.log('\n2️⃣ Test Traitement Vidéo...');
        
        // Utiliser la première vidéo YouTube jamais uploadée (courte et stable)
        const testVideoUrl = 'https://www.youtube.com/watch?v=jNQXAC9IVRw'; // "Me at the zoo" - 19 secondes
        
        console.log(`🎥 URL de test: ${testVideoUrl}`);
        console.log('⏳ Traitement en cours... (peut prendre 1-2 minutes)');
        
        const startTime = Date.now();
        const processResponse = await axios.post(`${baseUrl}/api/process-video`, {
            url: testVideoUrl
        }, {
            timeout: 300000 // 5 minutes timeout
        });
        
        const duration = (Date.now() - startTime) / 1000;
        console.log(`⏱️ Traitement terminé en ${duration.toFixed(1)}s`);
        
        if (processResponse.data.status === 'completed') {
            const data = processResponse.data;
            const info = data.videoInfo;
            
            console.log('✅ Traitement réussi !');
            console.log(`📊 Vidéo: "${info.title}"`);
            console.log(`   Durée: ${info.duration}s | Vues: ${info.view_count?.toLocaleString()}`);
            console.log(`   Clips créés: ${data.clips.length}/${data.stats.total_clips}`);
            console.log(`   Taille totale: ${data.stats.total_size_mb}MB`);
            
            console.log('\n📋 Détails des clips:');
            data.clips.forEach((clip, i) => {
                console.log(`  ${i+1}. "${clip.title}"`);
                console.log(`     Durée: ${clip.duration}s | Score: ${(clip.viral_score * 100).toFixed(0)}%`);
                console.log(`     Format: ${clip.format} | Taille: ${(clip.fileSize/(1024*1024)).toFixed(1)}MB`);
                console.log(`     URL: ${baseUrl}${clip.filePath}`);
            });
            
        } else {
            console.log('⚠️ Traitement incomplet:', processResponse.data);
        }
        
    } catch (error) {
        console.log('❌ Traitement échoué:');
        console.log('   Message:', error.message);
        if (error.response?.data) {
            console.log('   Erreur:', error.response.data.error);
            console.log('   Détails:', error.response.data.details);
        }
    }
    
    // Test 3: Liste des fichiers
    try {
        console.log('\n3️⃣ Test Liste des Fichiers...');
        const filesResponse = await axios.get(`${baseUrl}/api/files`);
        const data = filesResponse.data;
        
        console.log('✅ Fichiers disponibles:', data.total_files);
        console.log(`   Taille totale: ${data.total_size_mb}MB`);
        
        if (data.files && data.files.length > 0) {
            console.log('\n📁 Fichiers récents:');
            data.files.slice(0, 3).forEach((file, i) => {
                console.log(`  ${i+1}. ${file.name}`);
                console.log(`     Taille: ${file.size_mb}MB`);
                console.log(`     URL: ${file.download_url}`);
            });
        }
        
    } catch (error) {
        console.log('❌ Liste fichiers échouée:', error.message);
    }
    
    console.log('\n🎉 Test terminé !');
    console.log('\n🌐 Interface web: ' + baseUrl);
    console.log('📱 Format de sortie: 720x1280 (TikTok)');
    console.log('🤖 IA: DeepSeek pour analyse virale');
}

testFinalVidClip().catch(console.error);