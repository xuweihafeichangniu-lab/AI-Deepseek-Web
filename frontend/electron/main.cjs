
const electron = require('electron');
const { app, BrowserWindow, ipcMain, dialog } = electron;
const path = require('path');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

let mainWindow = null;

// --- Globals & State (Initialized in app.ready) ---
let logPath = '';
let configPath = '';
let envPath = '';
let API_KEY = '';
let API_SECRET = '';
let DEEPSEEK_KEY = '';
let USER_PROXY = '';
let agent = undefined;

const isProd = app.isPackaged || process.env.NODE_ENV === 'production';

// --- Logging ---
function logInfo(msg) {
    const data = `[${new Date().toISOString()}] INFO: ${msg}\n`;
    if (logPath) fs.appendFileSync(logPath, data);
    console.log(msg);
}

function logError(msg, err) {
    try {
        const data = `\n[${new Date().toISOString()}] ERROR - ${msg}: ${err?.stack || err || 'Unknown Error'}\n`;
        if (logPath) {
            fs.appendFileSync(logPath, data);
        }
        console.error(msg, err);
    } catch (e) {
        console.error('Logging system failed:', e);
    }
}


process.on('uncaughtException', (err) => {
    logError('Uncaught Exception', err);
});

// --- Helper Functions ---

function findEnvPath() {
    try {
        const possiblePaths = [
            path.join(path.dirname(app.getPath('exe')), '.env.local'), // Next to EXE
            path.join(process.resourcesPath, '.env.local'),            // In Resources
            path.join(process.cwd(), '.env.local')                     // For Dev
        ];
        for (const p of possiblePaths) {
            try {
                if (fs.existsSync(p)) return p;
            } catch (e) { }
        }
        return possiblePaths[0];
    } catch (e) {
        return '.env.local';
    }
}

function getAgent(proxyUrl) {
    try {
        if (!proxyUrl || !proxyUrl.trim()) return undefined;
        const url = proxyUrl.trim();
        if (url.startsWith('socks')) {
            return new SocksProxyAgent(url);
        }
        return new HttpsProxyAgent(url);
    } catch (e) {
        console.error(`[Agent] Failed to create agent for ${proxyUrl}:`, e.message);
        return undefined;
    }
}

function updateProxyAgent(proxyUrl) {
    if (proxyUrl && proxyUrl.trim()) {
        USER_PROXY = proxyUrl.trim();
        agent = getAgent(USER_PROXY);
        console.log(`🌐 Proxy updated to: ${USER_PROXY}`);
    } else {
        USER_PROXY = '';
        agent = undefined;
        console.log(`🌐 Proxy disabled`);
    }
}

function loadInitialConfig() {
    logInfo(`[Init] EXE Dir: ${path.dirname(app.getPath('exe'))}`);
    logInfo(`[Init] Resources: ${process.resourcesPath}`);
    logInfo(`[Init] CWD: ${process.cwd()}`);
    logInfo(`[Init] Config Path: ${configPath}`);
    logInfo(`[Init] Env Path: ${envPath}`);

    // 1. AppData config
    if (fs.existsSync(configPath)) {
        try {
            const userConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (userConfig.binanceKey) API_KEY = userConfig.binanceKey.trim();
            if (userConfig.binanceSecret) API_SECRET = userConfig.binanceSecret.trim();
            if (userConfig.deepseekKey) DEEPSEEK_KEY = userConfig.deepseekKey.trim();
            if (userConfig.proxyUrl !== undefined) updateProxyAgent(userConfig.proxyUrl);
            logInfo('✅ Loaded config from user_config.json');
        } catch (e) {
            logError('Failed to parse user_config.json', e);
        }
    }

    // 2. .env.local override
    if (fs.existsSync(envPath)) {
        try {
            const envContent = fs.readFileSync(envPath, 'utf8');
            envContent.split('\n').forEach(line => {
                const parts = line.split('=');
                if (parts.length >= 2) {
                    const key = parts[0].trim();
                    const val = parts.slice(1).join('=').trim();
                    if (key === 'VITE_BINANCE_API_KEY' && val) API_KEY = val;
                    if (key === 'VITE_BINANCE_SECRET' && val) API_SECRET = val;
                    if (key === 'VITE_DEEPSEEK_API_KEY' && val) DEEPSEEK_KEY = val;
                    if (key === 'VITE_PROXY_URL' && val) updateProxyAgent(val);
                }
            });
            logInfo('✅ Loaded/Overrode config from .env.local');
        } catch (e) {
            logError('Failed to parse .env.local', e);
        }
    }

    logInfo(`[Init] Final API Key configured: ${API_KEY ? (API_KEY.substring(0, 5) + '...') : 'EMPTY'}`);
}


function createWindow() {
    logInfo('[Init] Creating Main Window...');
    const iconPath = isProd
        ? path.join(process.resourcesPath, 'app/dist/vite.svg') // Verify this in build
        : path.join(__dirname, '../public/vite.svg');

    mainWindow = new BrowserWindow({
        width: 1240,
        height: 900,
        backgroundColor: '#0b0e11',
        icon: iconPath,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        title: "SUPER AI"
    });

    if (isProd) {
        const filePath = path.join(__dirname, '../dist/index.html');
        mainWindow.loadFile(filePath).catch(err => {
            logError('Failed to load index.html', err);
            dialog.showErrorBox('Startup Error', `Failed to load app files: ${err.message}`);
        });
    } else {
        const devUrl = 'http://localhost:5173';
        mainWindow.loadURL(devUrl).catch(() => {
            setTimeout(() => mainWindow.loadURL(devUrl), 2000);
        });
    }

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        logError('Page failed to load', `${errorDescription} (${errorCode})`);
        dialog.showErrorBox('Page Load Error', `${errorDescription} (${errorCode})`);
    });
}

// --- App Lifecycle ---

app.whenReady().then(() => {
    try {
        // Initialize paths after app is ready
        logPath = path.join(app.getPath('userData'), 'crash-log.txt');
        configPath = path.resolve(app.getPath('userData'), 'user_config.json');
        envPath = findEnvPath();

        loadInitialConfig();
        createWindow();

        // Debug Tools
        if (isProd) {
            mainWindow.webContents.openDevTools({ mode: 'detach' });
        }
    } catch (e) {
        logError('Fatal error in whenReady', e);
        dialog.showErrorBox('Fatal Error', e.message);
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// --- IPC Communication ---

ipcMain.handle('binance-request', async (event, args) => {
    const { path: targetPath, method = 'GET', query = {}, overrideKeys, overrideProxy } = args;
    let currentAgent = (overrideProxy !== undefined) ? getAgent(overrideProxy) : agent;

    logInfo(`[Binance Request] Start: ${targetPath}`);

    // Create a timeout promise to ensure we never hang more than 40s
    const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => {
            logInfo(`[Binance Request] FORCED TIMEOUT at 40s for ${targetPath}`);
            resolve({ error: 'Global Request Timeout (40s)' });
        }, 40000);
    });

    const requestPromise = new Promise((resolve) => {
        let hostname = '';
        if (targetPath.startsWith('/papi/')) hostname = 'papi.binance.com';
        else if (targetPath.startsWith('/fapi/')) hostname = 'fapi.binance.com';
        else if (targetPath.startsWith('/api/v3/')) hostname = 'api.binance.com';
        else {
            logInfo(`[Binance Request] Error: Invalid Path ${targetPath}`);
            return resolve({ error: 'Invalid Target Path' });
        }

        const currentKey = (overrideKeys?.key || API_KEY || '').trim();
        const currentSecret = (overrideKeys?.secret || API_SECRET || '').trim();

        if (!currentKey || !currentSecret) {
            logInfo(`[Binance Request] Error: Missing Credentials`);
            return resolve({ error: 'Missing Binance API Credentials' });
        }

        const urlParams = new URLSearchParams();
        Object.keys(query).forEach(k => urlParams.append(k, query[k]));
        urlParams.append('timestamp', Date.now().toString());
        urlParams.append('recvWindow', '60000');

        const queryString = urlParams.toString();
        const signature = crypto.createHmac('sha256', currentSecret).update(queryString).digest('hex');
        const finalPath = `${targetPath.split('?')[0]}?${queryString}&signature=${signature}`;

        const options = {
            hostname, port: 443, path: finalPath, method, timeout: 15000,
            headers: { 'X-MBX-APIKEY': currentKey, 'Content-Type': 'application/x-www-form-urlencoded' },
            agent: currentAgent
        };

        logInfo(`[Binance Request] Sending to ${hostname}${targetPath}...`);

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                logInfo(`[Binance Request] Done. Status: ${res.statusCode}`);
                try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
                catch (e) { resolve({ status: res.statusCode, data, error: 'JSON Parse Error' }); }
            });
        });

        req.on('error', e => {
            logInfo(`[Binance Request] Network Error: ${e.message}`);
            resolve({ error: `Network Error: ${e.message}` });
        });

        req.setTimeout(15000, () => {
            logInfo(`[Binance Request] Internal Timeout (15s) for ${targetPath}`);
            req.destroy();
            resolve({ error: 'Timeout' });
        });

        req.end();
    });

    return Promise.race([requestPromise, timeoutPromise]);
});

ipcMain.handle('ai-request', async (event, args) => {
    const { path: targetPath, method = 'POST', body = {}, overrideKey, overrideProxy } = args;
    let currentAgent = (overrideProxy !== undefined) ? getAgent(overrideProxy) : agent;

    logInfo(`[AI Request] Start: ${targetPath}`);

    const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => {
            logInfo(`[AI Request] FORCED TIMEOUT at 60s for ${targetPath}`);
            resolve({ error: 'Global AI Request Timeout (60s)' });
        }, 60000);
    });

    const requestPromise = new Promise((resolve) => {
        const currentKey = (overrideKey || DEEPSEEK_KEY || '').trim();
        if (!currentKey) {
            logInfo(`[AI Request] Error: Missing Key`);
            return resolve({ error: 'Missing DeepSeek API Key' });
        }

        const options = {
            hostname: 'api.deepseek.com', port: 443, path: targetPath, method, timeout: 45000,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentKey}` },
            agent: currentAgent
        };

        logInfo(`[AI Request] Sending to DeepSeek...`);

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                logInfo(`[AI Request] Done. Status: ${res.statusCode}`);
                try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
                catch (e) { resolve({ status: res.statusCode, data, error: 'JSON Parse Error' }); }
            });
        });

        req.on('error', e => {
            logInfo(`[AI Request] Network Error: ${e.message}`);
            resolve({ error: `AI Network Error: ${e.message}` });
        });

        req.setTimeout(45000, () => {
            logInfo(`[AI Request] Internal Timeout (45s) for ${targetPath}`);
            req.destroy();
            resolve({ error: 'Timeout' });
        });

        req.write(JSON.stringify(body));
        req.end();
    });

    return Promise.race([requestPromise, timeoutPromise]);
});

ipcMain.handle('save-api-keys', async (event, keys) => {
    try {
        API_KEY = (keys.binanceKey || API_KEY || '').trim();
        API_SECRET = (keys.binanceSecret || API_SECRET || '').trim();
        DEEPSEEK_KEY = (keys.deepseekKey || DEEPSEEK_KEY || '').trim();
        if (keys.proxyUrl) updateProxyAgent(keys.proxyUrl);

        try { fs.writeFileSync(configPath, JSON.stringify(keys, null, 2)); } catch (e) { }
        try {
            const envContent = [
                `VITE_BINANCE_API_KEY=${keys.binanceKey || ''}`,
                `VITE_BINANCE_SECRET=${keys.binanceSecret || ''}`,
                `VITE_DEEPSEEK_API_KEY=${keys.deepseekKey || ''}`,
                `VITE_PROXY_URL=${keys.proxyUrl || ''}`
            ].join('\n');
            fs.writeFileSync(envPath, envContent);
        } catch (e) { }

        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('load-api-keys', async () => {
    if (fs.existsSync(configPath)) {
        try { return JSON.parse(fs.readFileSync(configPath, 'utf8')); }
        catch (e) { return { error: e.message }; }
    }
    return { binanceKey: API_KEY, binanceSecret: API_SECRET, deepseekKey: DEEPSEEK_KEY, proxyUrl: USER_PROXY };
});

ipcMain.handle('get-config', () => ({ symbol: 'BTCUSDT' }));

ipcMain.handle('get-knowledge', async () => {
    try {
        const kDir = path.join(__dirname, '../knowledge');
        // Simple search logic for example
        return { content: "Knowledge base loaded." };
    } catch (e) { return { error: e.message }; }
});
