
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

// Config
const proxyUrl = 'socks5://127.0.0.1:7897';
const apiKey = 'YOUR_API_KEY'; // Placeholder: User will fill this or we can try to load from config
const apiSecret = 'YOUR_API_SECRET'; // Placeholder

// Helper
function getAgent(url) {
    if (url.startsWith('socks')) return new SocksProxyAgent(url);
    return new HttpsProxyAgent(url);
}

const agent = getAgent(proxyUrl);

async function loadKeys() {
    const appDataPath = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME + "/.local/share");
    const configPath = path.join(appDataPath, 'SUPER AI', 'user_config.json');
    if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return { key: config.binanceKey, secret: config.binanceSecret };
    }
    return { key: process.env.VITE_BINANCE_API_KEY, secret: process.env.VITE_BINANCE_SECRET };
}

async function run() {
    const keys = await loadKeys();
    const currentKey = keys.key || apiKey;
    const currentSecret = keys.secret || apiSecret;

    if (!currentKey || !currentSecret || currentKey === 'YOUR_API_KEY') {
        console.error('\n❌ 错误：缺少 API Key 或 Secret');
        console.error('请打开文件 "d:/AIdeepseekOK/AI deepseek chaoji/AI deepseek/debug-signed.cjs"');
        console.error('并在第 9 行和第 10 行填入您的真实 Binance API Key 和 Secret。');
        console.error('示例: const apiKey = "vmPU...";');
        return;
    }

    console.log(`🔑 Using Key starts with: ${currentKey.substring(0, 4)}...`);
    console.log(`🌐 Proxy: ${proxyUrl}`);

    const timestamp = Date.now();
    const query = `timestamp=${timestamp}&recvWindow=60000`;
    const signature = crypto.createHmac('sha256', currentSecret).update(query).digest('hex');
    const pathStr = `/papi/v1/account?${query}&signature=${signature}`;

    const options = {
        hostname: 'papi.binance.com',
        port: 443,
        path: pathStr,
        method: 'GET',
        headers: {
            'X-MBX-APIKEY': currentKey,
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        agent: agent
    };

    console.log(`🚀 Requesting: https://fapi.binance.com${pathStr}`);

    const req = https.request(options, (res) => {
        console.log(`Status: ${res.statusCode}`);
        console.log(`Headers:`, res.headers);
        let data = '';
        res.on('data', (c) => data += c);
        res.on('end', () => {
            console.log(`\n--- Response Body ---`);
            console.log(data); // Will print the HTML error if blocked
        });
    });

    req.on('error', (e) => console.error('Request Error:', e));
    req.end();
}

run();
