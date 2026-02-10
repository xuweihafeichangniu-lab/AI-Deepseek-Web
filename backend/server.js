const express = require('express');
const cors = require('cors');
const https = require('https');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serving static files from frontend build
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// --- Config State ---
let API_KEY = process.env.VITE_BINANCE_API_KEY || '';
let API_SECRET = process.env.VITE_BINANCE_SECRET || '';
let DEEPSEEK_KEY = process.env.VITE_DEEPSEEK_API_KEY || '';
let USER_PROXY = process.env.VITE_PROXY_URL || '';

function getAgent(proxyUrl) {
    try {
        if (!proxyUrl || !proxyUrl.trim()) return undefined;
        const url = proxyUrl.trim();
        if (url.startsWith('socks')) return new SocksProxyAgent(url);
        return new HttpsProxyAgent(url);
    } catch (e) {
        console.error(`[Agent] Failed to create agent:`, e.message);
        return undefined;
    }
}

// --- Endpoints ---

app.post('/api/binance', async (req, res) => {
    const { path: targetPath, method = 'GET', query = {}, overrideKeys, overrideProxy } = req.body;
    const currentAgent = (overrideProxy !== undefined) ? getAgent(overrideProxy) : getAgent(USER_PROXY);

    console.log(`[Binance Request] ${method} ${targetPath}`);

    let hostname = '';
    if (targetPath.startsWith('/papi/')) hostname = 'papi.binance.com';
    else if (targetPath.startsWith('/fapi/')) hostname = 'fapi.binance.com';
    else if (targetPath.startsWith('/api/v3/')) hostname = 'api.binance.com';
    else return res.status(400).json({ error: 'Invalid Target Path' });

    const currentKey = (overrideKeys?.key || API_KEY || '').trim();
    const currentSecret = (overrideKeys?.secret || API_SECRET || '').trim();

    if (!currentKey || !currentSecret) return res.status(401).json({ error: 'Missing Binance API Credentials' });

    const urlParams = new URLSearchParams();
    Object.keys(query).forEach(k => urlParams.append(k, query[k]));
    urlParams.append('timestamp', Date.now().toString());
    urlParams.append('recvWindow', '60000');

    const queryString = urlParams.toString();
    const signature = crypto.createHmac('sha256', currentSecret).update(queryString).digest('hex');
    const finalPath = `${targetPath.split('?')[0]}?${queryString}&signature=${signature}`;

    const options = {
        hostname, port: 443, path: finalPath, method, timeout: 30000,
        headers: { 'X-MBX-APIKEY': currentKey, 'Content-Type': 'application/x-www-form-urlencoded' },
        agent: currentAgent
    };

    const binanceReq = https.request(options, (binanceRes) => {
        let data = '';
        binanceRes.on('data', c => data += c);
        binanceRes.on('end', () => {
            try { res.status(binanceRes.statusCode).json(JSON.parse(data)); }
            catch (e) { res.status(binanceRes.statusCode).send(data); }
        });
    });

    binanceReq.on('error', e => res.status(500).json({ error: `Network Error: ${e.message}` }));
    binanceReq.end();
});

app.post('/api/ai', async (req, res) => {
    const { path: targetPath, body = {}, overrideKey, overrideProxy } = req.body;
    const currentAgent = (overrideProxy !== undefined) ? getAgent(overrideProxy) : getAgent(USER_PROXY);

    console.log(`[AI Request] ${targetPath}`);

    const currentKey = (overrideKey || DEEPSEEK_KEY || '').trim();
    if (!currentKey) return res.status(401).json({ error: 'Missing DeepSeek API Key' });

    const options = {
        hostname: 'api.deepseek.com', port: 443, path: targetPath, method: 'POST', timeout: 45000,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentKey}` },
        agent: currentAgent
    };

    const aiReq = https.request(options, (aiRes) => {
        let data = '';
        aiRes.on('data', c => data += c);
        aiRes.on('end', () => {
            try { res.status(aiRes.statusCode).json(JSON.parse(data)); }
            catch (e) { res.status(aiRes.statusCode).send(data); }
        });
    });

    aiReq.on('error', e => res.status(500).json({ error: `AI Network Error: ${e.message}` }));
    aiReq.write(JSON.stringify(body));
    aiReq.end();
});

// For configuration persistence in web version
app.post('/api/config', (req, res) => {
    const keys = req.body;
    API_KEY = keys.binanceKey || API_KEY;
    API_SECRET = keys.binanceSecret || API_SECRET;
    DEEPSEEK_KEY = keys.deepseekKey || DEEPSEEK_KEY;
    USER_PROXY = keys.proxyUrl || USER_PROXY;
    res.json({ success: true });
});

app.get('/api/config', (req, res) => {
    res.json({
        binanceKey: API_KEY,
        binanceSecret: API_SECRET,
        deepseekKey: DEEPSEEK_KEY,
        proxyUrl: USER_PROXY
    });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Web Server running on http://0.0.0.0:${PORT}`);
});
