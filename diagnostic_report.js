const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

async function generateDiagnosticReport() {
    const baseUrl = 'https://3000-ijxv6ulqm8kcxz2cz8oqv-6532622b.e2b.dev';
    const report = {
        timestamp: new Date().toISOString(),
        application: 'VidClip v3.0',
        status: 'ANALYSING',
        tests: {},
        system: {},
        issues: [],
        recommendations: []
    };
    
    console.log('🔍 Génération du rapport de diagnostic VidClip');
    console.log('============================================');
    
    // Test 1: System Dependencies
    try {
        console.log('\n📋 Test des dépendances système...');
        
        // Node.js
        const { stdout: nodeVersion } = await execAsync('node --version');
        report.system.nodejs = nodeVersion.trim();
        
        // FFmpeg
        const { stdout: ffmpegVersion } = await execAsync('ffmpeg -version | head -1');
        report.system.ffmpeg = ffmpegVersion.trim();
        
        // yt-dlp
        const { stdout: ytdlpVersion } = await execAsync('yt-dlp --version');
        report.system.ytdlp = ytdlpVersion.trim();
        
        // PM2
        const { stdout: pm2Status } = await execAsync('cd /home/user/webapp && npx pm2 jlist');
        const pm2Data = JSON.parse(pm2Status);
        report.system.pm2 = pm2Data.length > 0 ? pm2Data[0].pm2_env?.status : 'not running';
        
        report.tests.system_dependencies = 'PASS';
        console.log('✅ Dépendances système OK');
        
    } catch (error) {
        report.tests.system_dependencies = 'FAIL';
        report.issues.push(`Dépendances système: ${error.message}`);
        console.log('❌ Problème dépendances système');
    }
    
    // Test 2: Application Status
    try {
        console.log('\n🚀 Test de l\'état de l\'application...');
        
        const statusResponse = await axios.get(`${baseUrl}/api/status`, { timeout: 5000 });
        report.tests.application_status = 'PASS';
        report.application_info = statusResponse.data;
        console.log(`✅ Application v${statusResponse.data.version} en ligne`);
        
    } catch (error) {
        report.tests.application_status = 'FAIL';
        report.issues.push(`Application non accessible: ${error.message}`);
        console.log('❌ Application non accessible');
    }
    
    // Test 3: File Structure
    try {
        console.log('\n📁 Test de la structure des fichiers...');
        
        const requiredFiles = [
            'server_final.js',
            'package.json',
            'ecosystem.config.js',
            '.env'
        ];
        
        const requiredDirs = [
            'uploads',
            'output',
            'public',
            'logs'
        ];
        
        for (const file of requiredFiles) {
            await fs.access(path.join('/home/user/webapp', file));
        }
        
        for (const dir of requiredDirs) {
            await fs.access(path.join('/home/user/webapp', dir));
        }
        
        report.tests.file_structure = 'PASS';
        console.log('✅ Structure des fichiers OK');
        
    } catch (error) {
        report.tests.file_structure = 'FAIL';
        report.issues.push(`Structure fichiers: ${error.message}`);
        console.log('❌ Problème structure fichiers');
    }
    
    // Test 4: Demo Files
    try {
        console.log('\n🎬 Test des fichiers de démonstration...');
        
        const outputFiles = await fs.readdir('/home/user/webapp/output');
        const mp4Files = outputFiles.filter(f => f.endsWith('.mp4'));
        
        report.tests.demo_files = mp4Files.length > 0 ? 'PASS' : 'WARN';
        report.demo_files_count = mp4Files.length;
        
        if (mp4Files.length > 0) {
            console.log(`✅ ${mp4Files.length} fichiers de démo disponibles`);
        } else {
            console.log('⚠️ Aucun fichier de démo trouvé');
        }
        
    } catch (error) {
        report.tests.demo_files = 'FAIL';
        report.issues.push(`Fichiers démo: ${error.message}`);
        console.log('❌ Problème fichiers démo');
    }
    
    // Test 5: API Endpoints
    try {
        console.log('\n🔌 Test des endpoints API...');
        
        // Test files endpoint
        const filesResponse = await axios.get(`${baseUrl}/api/files`, { timeout: 5000 });
        report.api_files_count = filesResponse.data.total_files || 0;
        
        report.tests.api_endpoints = 'PASS';
        console.log('✅ Endpoints API fonctionnels');
        
    } catch (error) {
        report.tests.api_endpoints = 'FAIL';
        report.issues.push(`API endpoints: ${error.message}`);
        console.log('❌ Problème endpoints API');
    }
    
    // Test 6: Frontend Access
    try {
        console.log('\n🌐 Test d\'accès au frontend...');
        
        const frontendResponse = await axios.get(baseUrl, { 
            timeout: 5000,
            headers: { 'User-Agent': 'Mozilla/5.0 (diagnostic)' }
        });
        
        report.tests.frontend_access = frontendResponse.status === 200 ? 'PASS' : 'FAIL';
        console.log('✅ Frontend accessible');
        
    } catch (error) {
        report.tests.frontend_access = 'FAIL';
        report.issues.push(`Frontend: ${error.message}`);
        console.log('❌ Problème accès frontend');
    }
    
    // Test 7: Environment Variables
    try {
        console.log('\n🔐 Test des variables d\'environnement...');
        
        const envContent = await fs.readFile('/home/user/webapp/.env', 'utf8');
        const hasDeepSeekKey = envContent.includes('DEEPSEEK_API_KEY=sk-');
        
        report.tests.environment_vars = hasDeepSeekKey ? 'PASS' : 'WARN';
        report.deepseek_configured = hasDeepSeekKey;
        
        if (hasDeepSeekKey) {
            console.log('✅ Variables d\'environnement configurées');
        } else {
            console.log('⚠️ Clé DeepSeek non configurée');
            report.recommendations.push('Configurer la clé API DeepSeek pour l\\'analyse IA');
        }
        
    } catch (error) {
        report.tests.environment_vars = 'FAIL';
        report.issues.push(`Variables environnement: ${error.message}`);
        console.log('❌ Problème variables environnement');
    }
    
    // Génération des recommandations
    if (report.issues.length === 0) {
        report.status = 'HEALTHY';
        report.recommendations.push('Application entièrement fonctionnelle');
        report.recommendations.push('Déploiement prêt pour la production');
    } else if (report.issues.length <= 2) {
        report.status = 'WARNING';
        report.recommendations.push('Application fonctionnelle avec quelques améliorations possibles');
    } else {
        report.status = 'CRITICAL';
        report.recommendations.push('Plusieurs problèmes nécessitent une attention immédiate');
    }
    
    // Recommandations génériques
    if (report.application_info?.deepseek === false) {
        report.recommendations.push('Configurer la clé DeepSeek API pour l\\'analyse IA complète');
    }
    
    if (report.demo_files_count === 0) {
        report.recommendations.push('Exécuter `node create_demo.js` pour créer du contenu de démonstration');
    }
    
    report.recommendations.push('Consulter README_COMPLET.md pour la documentation complète');
    report.recommendations.push('URL d\\'accès: ' + baseUrl);
    
    // Affichage du rapport
    console.log('\n' + '='.repeat(50));
    console.log('📊 RAPPORT DE DIAGNOSTIC VIDCLIP');
    console.log('='.repeat(50));
    console.log(`🕒 Timestamp: ${report.timestamp}`);
    console.log(`📱 Statut général: ${getStatusEmoji(report.status)} ${report.status}`);
    console.log(`🔗 URL d'accès: ${baseUrl}`);
    
    if (report.application_info) {
        console.log(`🏷️  Version: ${report.application_info.version}`);
        console.log(`🤖 DeepSeek IA: ${report.application_info.deepseek ? '✅' : '❌'}`);
        console.log(`📹 yt-dlp: ${report.application_info.ytdlp_available ? '✅' : '❌'}`);
        console.log(`🎬 FFmpeg: ${report.application_info.ffmpeg_available ? '✅' : '❌'}`);
    }
    
    console.log('\n🧪 RÉSULTATS DES TESTS:');
    for (const [test, result] of Object.entries(report.tests)) {
        console.log(`   ${getResultEmoji(result)} ${test}: ${result}`);
    }
    
    if (report.issues.length > 0) {
        console.log('\n❌ PROBLÈMES DÉTECTÉS:');
        report.issues.forEach((issue, i) => {
            console.log(`   ${i + 1}. ${issue}`);
        });
    }
    
    console.log('\n💡 RECOMMANDATIONS:');
    report.recommendations.forEach((rec, i) => {
        console.log(`   ${i + 1}. ${rec}`);
    });
    
    console.log('\n📊 MÉTRIQUES:');
    console.log(`   • Fichiers de démo: ${report.demo_files_count || 0}`);
    console.log(`   • Tests réussis: ${Object.values(report.tests).filter(t => t === 'PASS').length}/${Object.keys(report.tests).length}`);
    console.log(`   • Node.js: ${report.system.nodejs || 'N/A'}`);
    console.log(`   • PM2: ${report.system.pm2 || 'N/A'}`);
    
    // Sauvegarde du rapport
    await fs.writeFile(
        '/home/user/webapp/diagnostic_report.json', 
        JSON.stringify(report, null, 2)
    );
    
    console.log('\n💾 Rapport sauvegardé dans diagnostic_report.json');
    console.log('='.repeat(50));
    
    return report;
}

function getStatusEmoji(status) {
    switch (status) {
        case 'HEALTHY': return '🟢';
        case 'WARNING': return '🟡';
        case 'CRITICAL': return '🔴';
        default: return '⚪';
    }
}

function getResultEmoji(result) {
    switch (result) {
        case 'PASS': return '✅';
        case 'WARN': return '⚠️';
        case 'FAIL': return '❌';
        default: return '⚪';
    }
}

generateDiagnosticReport().catch(console.error);