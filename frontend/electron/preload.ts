
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    binanceRequest: (args: any) => ipcRenderer.invoke('binance-request', args),
    getConfig: () => ipcRenderer.invoke('get-config')
});
