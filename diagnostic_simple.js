const fs = require('fs').promises;
const axios = require('axios');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const baseUrl = 'https://3000-ijxv6ulqm8kcxz2cz8oqv-6532622b.e2b.dev';

async function runDiagnostic() {
    console.log('🔍 Diagnostic VidClip v3.0');
    console.log('==========================');
    
    const results = {
        timestamp: new Date().toISOString(),
        tests: 0,
        passed: 0,
        failed: 0,
        warnings: 0
    };
    
    // Test 1: Application Status
    try {
        console.log('\n1️⃣ Test application...');
        const response = await axios.get(`${baseUrl}/api/status`, { timeout: 5000 });
        console.log(`✅ VidClip v${response.data.version} en ligne`);
        console.log(`   DeepSeek: ${response.data.deepseek ? 'OK' : 'NOK'}`);
        console.log(`   yt-dlp: ${response.data.ytdlp_available ? 'OK' : 'NOK'}`);
        console.log(`   FFmpeg: ${response.data.ffmpeg_available ? 'OK' : 'NOK'}`);
        results.passed++;
    } catch (error) {
        console.log('❌ Application non accessible');
        results.failed++;
    }
    results.tests++;
    
    // Test 2: PM2 Status
    try {
        console.log('\n2️⃣ Test PM2...');
        const { stdout } = await execAsync('cd /home/user/webapp && npx pm2 jlist');
        const pm2Data = JSON.parse(stdout);
        const status = pm2Data[0]?.pm2_env?.status || 'stopped';
        console.log(`✅ PM2 status: ${status}`);
        results.passed++;
    } catch (error) {
        console.log('❌ Problème PM2');
        results.failed++;
    }
    results.tests++;
    
    // Test 3: Files API
    try {
        console.log('\n3️⃣ Test API fichiers...');
        const response = await axios.get(`${baseUrl}/api/files`, { timeout: 5000 });
        const fileCount = response.data.total_files || 0;
        console.log(`✅ ${fileCount} fichiers disponibles`);
        console.log(`   Taille totale: ${response.data.total_size_mb}MB`);
        results.passed++;
    } catch (error) {
        console.log('❌ API fichiers inaccessible');
        results.failed++;
    }
    results.tests++;
    
    // Test 4: Frontend
    try {
        console.log('\n4️⃣ Test frontend...');
        const response = await axios.get(baseUrl, { timeout: 5000 });
        console.log(`✅ Frontend accessible (${response.status})`);
        results.passed++;
    } catch (error) {
        console.log('❌ Frontend inaccessible');
        results.failed++;
    }
    results.tests++;
    
    // Test 5: Demo Files
    try {
        console.log('\n5️⃣ Test fichiers demo...');
        const files = await fs.readdir('/home/user/webapp/output');
        const demoFiles = files.filter(f => f.endsWith('.mp4'));
        console.log(`✅ ${demoFiles.length} fichiers demo trouvés`);
        if (demoFiles.length === 0) {
            console.log('   💡 Exécuter: node create_demo.js');
            results.warnings++;
        }
        results.passed++;
    } catch (error) {
        console.log('❌ Problème fichiers demo');
        results.failed++;
    }
    results.tests++;
    
    // Test 6: Environment
    try {
        console.log('\n6️⃣ Test configuration...');
        const envContent = await fs.readFile('/home/user/webapp/.env', 'utf8');
        const hasDeepSeek = envContent.includes('DEEPSEEK_API_KEY=sk-');
        console.log(`${hasDeepSeek ? '✅' : '⚠️'} DeepSeek API: ${hasDeepSeek ? 'configuré' : 'manquant'}`);
        
        if (hasDeepSeek) {
            results.passed++;
        } else {
            results.warnings++;
        }
    } catch (error) {
        console.log('❌ Problème configuration');
        results.failed++;
    }
    results.tests++;
    
    // Résumé
    console.log('\n' + '='.repeat(40));
    console.log('📊 RÉSUMÉ DIAGNOSTIC');
    console.log('='.repeat(40));
    console.log(`🧪 Tests effectués: ${results.tests}`);
    console.log(`✅ Réussis: ${results.passed}`);
    console.log(`❌ Échecs: ${results.failed}`);
    console.log(`⚠️ Avertissements: ${results.warnings}`);
    
    const successRate = Math.round((results.passed / results.tests) * 100);
    console.log(`📈 Taux de réussite: ${successRate}%`);
    
    let overallStatus = 'HEALTHY';
    if (results.failed > 0) {
        overallStatus = 'CRITICAL';
    } else if (results.warnings > 0) {
        overallStatus = 'WARNING';
    }
    
    const statusEmoji = overallStatus === 'HEALTHY' ? '🟢' : 
                       overallStatus === 'WARNING' ? '🟡' : '🔴';
    
    console.log(`${statusEmoji} Statut: ${overallStatus}`);
    
    console.log('\n🌐 ACCÈS APPLICATION');
    console.log('='.repeat(40));
    console.log(`Interface web: ${baseUrl}`);
    console.log('API status: ' + baseUrl + '/api/status');
    console.log('API files: ' + baseUrl + '/api/files');
    
    console.log('\n💡 ACTIONS RECOMMANDÉES');
    console.log('='.repeat(40));
    
    if (results.failed > 0) {
        console.log('• Vérifier les logs PM2: npx pm2 logs');
        console.log('• Redémarrer si nécessaire: npx pm2 restart all');
    }
    
    if (results.warnings > 0) {
        console.log('• Créer fichiers demo: node create_demo.js');
        console.log('• Configurer DeepSeek API dans .env');
    }
    
    console.log('• Documentation complète: README_COMPLET.md');
    console.log('• Support: Vérifier les logs et GitHub issues');
    
    // Sauvegarde des résultats
    await fs.writeFile('/home/user/webapp/diagnostic_results.json', JSON.stringify({
        ...results,
        url: baseUrl,
        status: overallStatus,
        success_rate: successRate
    }, null, 2));
    
    console.log('\n💾 Résultats sauvegardés dans diagnostic_results.json');
    console.log('='.repeat(40));
}

runDiagnostic().catch(console.error);