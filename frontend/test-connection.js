
import https from 'https';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { HttpsProxyAgent } from 'https-proxy-agent';

// Load .env.local manually
const envPath = path.resolve(process.cwd(), '.env.local');
let API_KEY = '';
let API_SECRET = '';

if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach(line => {
        const parts = line.split('=');
        if (parts.length >= 2) {
            const key = parts[0].trim();
            const val = parts.slice(1).join('=').trim();
            if (key === 'VITE_BINANCE_API_KEY') API_KEY = val;
            if (key === 'VITE_BINANCE_SECRET') API_SECRET = val;
        }
    });
}

const PROXY_URL = 'http://127.0.0.1:7897';
console.log(`\n🔍 Checking Config...`);
console.log(`API Key: ${API_KEY ? API_KEY.slice(0, 4) + '***' : 'MISSING'}`);
console.log(`Proxy: ${PROXY_URL}`);

const agent = new HttpsProxyAgent(PROXY_URL);

function getSignature(queryString) {
    return crypto.createHmac('sha256', API_SECRET).update(queryString).digest('hex');
}

function makeRequest(label, hostname, pathStr) {
    return new Promise((resolve) => {
        console.log(`\n🚀 Testing ${label}...`);

        const timestamp = Date.now();
        const qs = `timestamp=${timestamp}&recvWindow=60000`;
        const signature = getSignature(qs);
        const fullPath = `${pathStr}?${qs}&signature=${signature}`;

        const options = {
            hostname: hostname,
            port: 443,
            path: fullPath,
            method: 'GET',
            headers: {
                'X-MBX-APIKEY': API_KEY
            },
            agent: agent
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                const status = res.statusCode;
                if (status === 200) {
                    console.log(`✅ ${label} Success (200)`);
                    try {
                        const json = JSON.parse(data);
                        // Summary
                        if (json.canTrade !== undefined) console.log(`   Account Can Trade: ${json.canTrade}`);
                        if (json.totalMarginBalance) console.log(`   Margin Balance: ${json.totalMarginBalance}`);
                        if (json.accountType) console.log(`   Account Type: ${json.accountType}`);
                        if (json.updateTime) console.log(`   Update Time: ${json.updateTime}`);
                    } catch (e) { }
                } else {
                    console.log(`❌ ${label} Failed (${status}): ${data}`);
                }
                resolve();
            });
        });

        req.on('error', (e) => {
            console.error(`❌ ${label} Network Error: ${e.message}`);
            resolve();
        });

        req.end();
    });
}

async function run() {
    if (!API_KEY || !API_SECRET) {
        console.error("❌ CRITICAL: API Key or Secret missing in .env.local");
        return;
    }

    // 1. Test Spot
    await makeRequest('SPOT (api.binance.com)', 'api.binance.com', '/api/v3/account');

    // 2. Test Futures
    await makeRequest('FUTURES (fapi.binance.com)', 'fapi.binance.com', '/fapi/v2/account');

    // 3. Test Portfolio (Unified Account)
    await makeRequest('PORTFOLIO (papi.binance.com)', 'papi.binance.com', '/papi/v1/account');
}

run();
