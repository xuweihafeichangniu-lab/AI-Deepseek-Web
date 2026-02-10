
const https = require('https');
const fs = require('fs');
const path = require('path');
const { HttpsProxyAgent } = require('https-proxy-agent');

// 1. Try to load config
const appDataPath = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME + "/.local/share");
const configPath = path.join(appDataPath, 'SUPER AI', 'user_config.json');
const envPath = path.resolve(process.cwd(), '.env.local');

let config = {
    proxyUrl: 'http://127.0.0.1:7897' // Default fallback (updated from test-connection.js suggestion)
};

console.log('--- Config Search ---');
if (fs.existsSync(configPath)) {
    try {
        const fileContent = fs.readFileSync(configPath, 'utf8');
        console.log(`Found user_config.json at: ${configPath}`);
        const userConfig = JSON.parse(fileContent);
        if (userConfig.proxyUrl) config.proxyUrl = userConfig.proxyUrl;
    } catch (e) {
        console.error('Error reading user_config.json:', e.message);
    }
} else {
    console.log(`user_config.json not found at: ${configPath}`);
}

// Check .env.local as backup for proxy
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/VITE_PROXY_URL=(.*)/);
    if (match && match[1]) {
        config.proxyUrl = match[1].trim();
        console.log(`Found proxy in .env.local: ${config.proxyUrl}`);
    }
}

console.log(`\n--- Active Configuration ---`);
console.log(`Proxy URL: ${config.proxyUrl}`);

const agent = config.proxyUrl ? new HttpsProxyAgent(config.proxyUrl) : undefined;

function testUrl(url) {
    return new Promise((resolve) => {
        console.log(`\nTesting: ${url}`);
        const options = {
            method: 'GET',
            agent: agent,
            timeout: 10000
        };

        const req = https.request(url, options, (res) => {
            console.log(`Status: ${res.statusCode}`);
            res.on('data', () => { });
            res.on('end', () => {
                console.log('Response received.');
                resolve(true);
            });
        });

        req.on('error', (e) => {
            console.error(`Connection Failed: ${e.message}`);
            if (e.code) console.error(`Code: ${e.code}`);
            if (e.cause) console.error(`Cause:`, e.cause);
            resolve(false);
        });

        req.on('timeout', () => {
            console.error('Request Timed Out (10s)');
            req.destroy();
            resolve(false);
        });

        req.end();
    });
}

async function run() {
    console.log('\n--- Connectivity Diagnosis ---');

    // 1. Test Google (Control)
    console.log('\n[1/3] Testing Google (Proxy Check)...');
    await testUrl('https://www.google.com');

    // 2. Test Binance Spot
    console.log('\n[2/3] Testing Binance Spot API...');
    await testUrl('https://api.binance.com/api/v3/ping');

    // 3. Test Binance Futures
    console.log('\n[3/3] Testing Binance Futures API...');
    await testUrl('https://fapi.binance.com/fapi/v1/ping');
}

run();
