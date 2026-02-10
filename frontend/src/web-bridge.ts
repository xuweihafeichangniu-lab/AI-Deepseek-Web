const API_BASE = window.location.origin;

export const webBridge = {
    binanceRequest: async (args) => {
        const res = await fetch(`${API_BASE}/api/binance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(args)
        });
        const data = await res.json();
        return { status: res.status, data };
    },
    aiRequest: async (args) => {
        const res = await fetch(`${API_BASE}/api/ai`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(args)
        });
        const data = await res.json();
        return { status: res.status, data };
    },
    saveApiKeys: async (keys) => {
        const res = await fetch(`${API_BASE}/api/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(keys)
        });
        return await res.json();
    },
    loadApiKeys: async () => {
        const res = await fetch(`${API_BASE}/api/config`);
        return await res.json();
    },
    getKnowledge: async () => {
        // For web, knowledge might be limited or pre-bundled
        return { content: "Market Analysis Patterns loaded." };
    }
};
