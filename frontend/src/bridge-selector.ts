import { webBridge } from './web-bridge';

export const getAPI = () => {
    if ((window as any).electronAPI) {
        return (window as any).electronAPI;
    }
    // Fallback to web bridge if not in Electron context
    return webBridge;
};
