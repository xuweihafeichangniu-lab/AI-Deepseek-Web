
const electron = require('electron');
const { app, BrowserWindow, ipcMain } = electron;
const path = require('path');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const { HttpsProxyAgent } = require('https-proxy-agent');

let mainWindow = null;

// --- Load Config ---
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

// --- Electron App Lifecycle ---

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1240,
        height: 900,
        backgroundColor: '#0b0e11',
        icon: path.join(__dirname, '../public/vite.svg'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        title: "币安 AI 量化大师 - Desktop"
    });

    if (process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
}

app.whenReady().then(() => {
    console.log('🚀 Electron App Ready');
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// --- IPC Communication (The Bridge) ---

ipcMain.handle('binance-request', async (event, args) => {
    const { path: targetPath, method = 'GET', query = {} } = args;

    return new Promise((resolve) => {
        let hostname = '';
        if (targetPath.startsWith('/papi/')) hostname = 'papi.binance.com';
        else if (targetPath.startsWith('/fapi/')) hostname = 'fapi.binance.com';
        else if (targetPath.startsWith('/api/v3/')) hostname = 'api.binance.com';
        else {
            return resolve({ error: 'Invalid Target Path' });
        }

        const timestamp = Date.now();
        const recvWindow = 60000;

        // Construct query string
        const urlParams = new URLSearchParams();
        Object.keys(query).forEach(key => urlParams.append(key, query[key]));
        urlParams.append('timestamp', timestamp.toString());
        urlParams.append('recvWindow', recvWindow.toString());

        const queryString = urlParams.toString();
        const signature = crypto.createHmac('sha256', API_SECRET).update(queryString).digest('hex');

        const finalPath = `${targetPath.split('?')[0]}?${queryString}&signature=${signature}`;

        const options = {
            hostname: hostname,
            port: 443,
            path: finalPath,
            method: method,
            headers: {
                'X-MBX-APIKEY': API_KEY,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            agent: agent
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve({ status: res.statusCode, data: json });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data, error: 'JSON Parse Error' });
                }
            });
        });

        req.on('error', (e) => {
            resolve({ error: e.message });
        });

        req.end();
    });
});

ipcMain.handle('get-config', () => {
    return { symbol: 'BTCUSDT' };
});
