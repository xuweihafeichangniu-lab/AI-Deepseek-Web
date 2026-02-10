
import http from 'http';
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
const agent = new HttpsProxyAgent(PROXY_URL);

const PORT = 4000;

const server = http.createServer((req, res) => {
    // Enable CORS for development
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-MBX-APIKEY');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const pathname = url.pathname;

        // Path rewriting: /api/bridge/papi/* -> papi.binance.com/*
        let hostname = '';
        let targetPath = '';

        if (pathname.startsWith('/papi/')) {
            hostname = 'papi.binance.com';
            targetPath = pathname;
        } else if (pathname.startsWith('/fapi/')) {
            hostname = 'fapi.binance.com';
            targetPath = pathname;
        } else if (pathname.startsWith('/api/v3/')) {
            hostname = 'api.binance.com';
            targetPath = pathname;
        } else {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Not Found' }));
            return;
        }

        const timestamp = Date.now();
        const recvWindow = 60000;

        // Merge query parameters
        let queryParams = url.search.substring(1);
        if (queryParams) queryParams += '&';
        queryParams += `timestamp=${timestamp}&recvWindow=${recvWindow}`;

        // Create signature
        const signature = crypto.createHmac('sha256', API_SECRET).update(queryParams).digest('hex');
        const finalUrl = `${targetPath}?${queryParams}&signature=${signature}`;

        console.log(`[Bridge] Proxying ${req.method} to ${hostname}${targetPath}`);

        const options = {
            hostname: hostname,
            port: 443,
            path: finalUrl,
            method: req.method,
            headers: {
                'X-MBX-APIKEY': API_KEY,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            agent: agent
        };

        const binanceReq = https.request(options, (binanceRes) => {
            res.writeHead(binanceRes.statusCode, { 'Content-Type': 'application/json' });
            binanceRes.pipe(res);
        });

        binanceReq.on('error', (e) => {
            console.error(`[Bridge] Error: ${e.message}`);
            res.writeHead(500);
            res.end(JSON.stringify({ error: e.message }));
        });

        if (body) {
            binanceReq.write(body);
        }
        binanceReq.end();
    });
});

server.listen(PORT, () => {
    console.log(`🚀 API Bridge running at http://localhost:${PORT}`);
    console.log(`   Proxies to: papi.binance.com, fapi.binance.com, api.binance.com`);
});
