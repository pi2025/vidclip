const axios = require('axios');

async function testVidClip() {
    const baseUrl = 'https://3000-ijxv6ulqm8kcxz2cz8oqv-6532622b.e2b.dev';
    
    console.log('🧪 Test VidClip Application');
    console.log('========================');
    
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
    
    // Test 3: Video processing avec une vidéo courte et publique
    try {
        console.log('\n3️⃣ Test Video Processing...');
        console.log('⚠️ Test avec une courte vidéo YouTube...');
        
        // URL d'une vidéo YouTube courte et populaire pour test
        const testVideoUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'; // Rick Roll - vidéo courte et stable
        
        console.log(`🎥 URL de test: ${testVideoUrl}`);
        console.log('⏳ Traitement en cours... (cela peut prendre du temps)');
        
        const startTime = Date.now();
        const processResponse = await axios.post(`${baseUrl}/api/process-video`, {
            url: testVideoUrl
        }, {
            timeout: 120000 // 2 minutes timeout
        });
        
        const duration = (Date.now() - startTime) / 1000;
        console.log(`⏱️ Traitement terminé en ${duration}s`);
        console.log('✅ Clips générés:', processResponse.data.clips?.length || 0);
        
        if (processResponse.data.clips && processResponse.data.clips.length > 0) {
            console.log('\n📋 Détails des clips:');
            processResponse.data.clips.forEach((clip, i) => {
                console.log(`  ${i+1}. ${clip.title} (${clip.duration}s)`);
                console.log(`     Fichier: ${clip.filePath}`);
                console.log(`     Score viral: ${(clip.viral_score * 100).toFixed(0)}%`);
            });
        }
        
    } catch (error) {
        console.log('❌ Video processing failed:');
        console.log('   Message:', error.message);
        if (error.response) {
            console.log('   Status:', error.response.status);
            console.log('   Data:', error.response.data);
        }
    }
    
    console.log('\n🏁 Test terminé');
}

testVidClip().catch(console.error);