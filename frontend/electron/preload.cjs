
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    binanceRequest: (args) => ipcRenderer.invoke('binance-request', args),
    aiRequest: (args) => ipcRenderer.invoke('ai-request', args),
    getKnowledge: () => ipcRenderer.invoke('get-knowledge'),
    saveAPIKeys: (keys) => ipcRenderer.invoke('save-api-keys', keys),
    loadAPIKeys: () => ipcRenderer.invoke('load-api-keys'),
    getAppConfig: () => ipcRenderer.invoke('get-config')
});
