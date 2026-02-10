import { getAPI } from '../src/bridge-selector';
import { TechnicalData } from '../types';
import { processTechnicalData } from '../utils/indicators';

const getElectronAPI = () => getAPI();
const symbolInfoCache: Record<string, any> = {};

// Robust request wrapper with retry logic
const requestWithRetry = async (args: any, retries: number = 2, delay: number = 2000): Promise<any> => {
    const api = getElectronAPI();
    if (!api) throw new Error("Electron API not found");

    for (let i = 0; i <= retries; i++) {
        try {
            const res = await api.binanceRequest(args);
            if (!res.error) return res;

            // If it's a timeout or network error, we might want to retry
            const isRetryable = res.error.includes('Timeout') || res.error.includes('Network Error');
            if (!isRetryable || i === retries) return res;

            console.warn(`[Binance Service] Request failed, retrying (${i + 1}/${retries})...`, res.error);
            await new Promise(resolve => setTimeout(resolve, delay * (i + 1))); // Exponential-ish backoff
        } catch (e: any) {
            if (i === retries) throw e;
            await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
        }
    }
};

export const fetchMarketData = async (symbol: string, interval: string): Promise<TechnicalData | null> => {
    try {
        const api = getElectronAPI();
        if (!api) throw new Error("Electron API not found");

        const res = await requestWithRetry({
            path: '/fapi/v1/klines',
            query: { symbol, interval, limit: 200 }
        });

        if (res.error) throw new Error(res.error);
        const data = res.data;

        if (!Array.isArray(data)) {
            console.error('Binance Futures API Error:', data);
            return null;
        }

        return processTechnicalData(data);
    } catch (error) {
        console.error('Market Data Fetch Error:', error);
        return null;
    }
};

export const fetchCurrentPrice = async (symbol: string) => {
    try {
        const api = getElectronAPI();
        if (!api) return 0;

        const res = await requestWithRetry({
            path: '/fapi/v1/ticker/price',
            query: { symbol }
        });

        if (res.error) throw new Error(res.error);
        return parseFloat(res.data.price);
    } catch (e) {
        console.error(e);
        return 0;
    }
};

export const fetchTickers24h = async (symbols: string[]) => {
    try {
        const api = getElectronAPI();
        if (!api) return [];

        // For Futures PAPI/FAPI, we can fetch all or specific
        // To be safe and efficient, we fetch all and filter locally or use the symbol param if supported
        const res = await requestWithRetry({
            path: '/fapi/v1/ticker/24hr'
        });

        if (res.error) throw new Error(res.error);
        const data = res.data;

        if (!Array.isArray(data)) return [];

        return data.filter((item: any) => symbols.includes(item.symbol));
    } catch (e) {
        console.error("Fetch Tickers 24h Error:", e);
        return [];
    }
};

export const getAccountEquity = async () => {
    try {
        const api = getElectronAPI();
        if (!api) throw new Error("Desktop Bridge Not Active");

        const res = await requestWithRetry({
            path: '/papi/v1/account'
        });

        if (res.error) throw new Error(res.error);
        if (res.status !== 200) throw new Error(`API Error ${res.status}: ${JSON.stringify(res.data)}`);

        const data = res.data;
        // PAPI returns accountEquity or actualEquity
        const equityStr = data.accountEquity || data.actualEquity || "0";
        const equity = parseFloat(equityStr);
        console.log("✅ Equity Fetched via Desktop Bridge:", equity);
        return equity;
    } catch (e) {
        console.error("Get Equity Error:", e);
        throw e;
    }
};

export const setLeverage = async (symbol: string, leverage: number) => {
    try {
        const api = getElectronAPI();
        const res = await requestWithRetry({
            path: '/papi/v1/um/leverage',
            method: 'POST',
            query: { symbol, leverage }
        });
        if (res.error) return { error: res.error };
        return res.data;
    } catch (e: any) {
        console.error("Set Leverage Error:", e);
        return { error: e.message || "Unknown error" };
    }
};

export const getLeverageBracket = async (symbol: string) => {
    try {
        const api = getElectronAPI();
        const res = await requestWithRetry({
            path: '/fapi/v1/leverageBracket',
            query: { symbol }
        });
        if (res.error) return null;

        // PAPI or FAPI might return in different formats
        const data = res.data;
        if (Array.isArray(data)) {
            return data.find((b: any) => b.symbol === symbol) || data[0];
        }
        return data;
    } catch (e) {
        console.error("Get Leverage Bracket Error:", e);
        return null;
    }
};

export const closeAllPositions = async (symbol: string) => {
    try {
        const api = getElectronAPI();
        const res = await requestWithRetry({ path: '/papi/v1/um/positions' });
        const data = res.data;

        const positions = (Array.isArray(data) ? data : []).filter((p: any) => p.symbol === symbol && parseFloat(p.positionAmt) !== 0);

        if (!positions || positions.length === 0) {
            return { msg: 'No open positions' };
        }

        for (const pos of positions) {
            const amt = parseFloat(pos.positionAmt);
            const side = amt > 0 ? 'SELL' : 'BUY';
            const quantity = Math.abs(amt);

            await executeOrder(symbol, side, quantity, undefined, true);
        }

        return { msg: 'All positions closed' };
    } catch (e) {
        console.error("Close Positions Error:", e);
        return { error: e };
    }
};

export const getSymbolInfo = async (symbol: string) => {
    if (symbolInfoCache[symbol]) return symbolInfoCache[symbol];
    try {
        const api = getElectronAPI();
        const res = await requestWithRetry({
            path: '/fapi/v1/exchangeInfo'
        });
        if (res.data && res.data.symbols) {
            const info = res.data.symbols.find((s: any) => s.symbol === symbol);
            if (info) {
                symbolInfoCache[symbol] = info;
                return info;
            }
        }
    } catch (e) {
        console.error("Fetch Symbol Info Error:", e);
    }
    return null;
};

export const executeOrder = async (symbol: string, side: 'BUY' | 'SELL', quantity: number, price?: number, reduceOnly: boolean = false) => {
    try {
        const api = getElectronAPI();

        // Final precision safety check: If quantity is passed as a number, we ensure it's rounded correctly
        // However, strategyService should already handle this. We do it here too just in case.
        const symbolInfo = await getSymbolInfo(symbol);
        let finalQuantity = quantity;
        if (symbolInfo) {
            const qp = parseInt(symbolInfo.quantityPrecision);
            finalQuantity = parseFloat(quantity.toFixed(qp));
        }

        const query: any = { symbol, side, type: 'MARKET', quantity: finalQuantity };
        if (reduceOnly) query.reduceOnly = 'true';

        const res = await requestWithRetry({
            path: '/papi/v1/um/order',
            method: 'POST',
            query
        });

        if (res.error) return { msg: res.error };
        if (res.status !== 200) return { msg: res.data?.msg || `HTTP ${res.status}` };

        return res.data;
    } catch (error: any) {
        console.error('Order Execution Error:', error);
        return { msg: error.message || 'Unknown Execution Error' };
    }
};
export const fetchTopGainers = async (limit: number = 10) => {
    try {
        const api = getElectronAPI();
        if (!api) return [];

        // 1. Fetch Exchange Info to get current trading status
        const infoRes = await requestWithRetry({ path: '/fapi/v1/exchangeInfo' });
        if (infoRes.error) throw new Error(infoRes.error);
        const tradingSymbols = (infoRes.data.symbols || [])
            .filter((s: any) => s.status === 'TRADING')
            .map((s: any) => s.symbol);

        // 2. Fetch 24h Ticker data
        const res = await api.binanceRequest({
            path: '/fapi/v1/ticker/24hr'
        });

        if (res.error) throw new Error(res.error);
        const data = res.data;

        if (!Array.isArray(data)) return [];

        // EXCLUSIONS: Indices, special tokens, domestication metrics etc.
        const BLACKLIST = [
            'BTCDOMUSDT', 'DEFIUSDT', 'FOOTBALLUSDT', 'BLUEBIRDUSDT',
            'INDEXUSDT', '1000LUNCUSDT', '1000SHIBUSDT'
        ];

        const MIN_VOLUME = 20000000; // 20M USDT minimum 24h volume for liquidity

        // Filter and sort by priceChangePercent
        return data
            .filter((item: any) => {
                const isUSDT = item.symbol.endsWith('USDT');
                const isNotBlacklisted = !BLACKLIST.includes(item.symbol);
                const isActuallyTrading = tradingSymbols.includes(item.symbol);
                const hasVolume = parseFloat(item.quoteVolume) >= MIN_VOLUME;
                return isUSDT && isNotBlacklisted && isActuallyTrading && hasVolume;
            })
            .sort((a: any, b: any) => parseFloat(b.priceChangePercent) - parseFloat(a.priceChangePercent))
            .slice(0, limit)
            .map((item: any) => ({
                symbol: item.symbol,
                change: parseFloat(item.priceChangePercent),
                volume: parseFloat(item.quoteVolume)
            }));
    } catch (e) {
        console.error("Fetch Top Gainers Error:", e);
        return [];
    }
};


