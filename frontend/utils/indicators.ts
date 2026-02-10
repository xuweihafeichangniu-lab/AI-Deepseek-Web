import { TechnicalData } from '../types';

export const calculateSMA = (data: number[], period: number): number => {
    if (data.length < period) return data[data.length - 1] || 0;
    const slice = data.slice(-period);
    const sum = slice.reduce((a, b) => a + b, 0);
    return sum / period;
};

export const calculateBollingerBands = (data: number[], period: number = 20, multiplier: number = 2) => {
    if (data.length < period) return { up: 0, mb: 0, dn: 0 };
    const sma = calculateSMA(data, period);
    const slice = data.slice(-period);
    const squaredDiffs = slice.map(val => Math.pow(val - sma, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
    const stdDev = Math.sqrt(variance);
    return {
        up: sma + (multiplier * stdDev),
        mb: sma,
        dn: sma - (multiplier * stdDev)
    };
};

export const calculateFibonacci = (high: number, low: number, current: number) => {
    const diff = high - low;
    return {
        level0: low,
        level382: low + (diff * 0.382),
        level50: low + (diff * 0.5),
        level618: low + (diff * 0.618),
        level100: high
    };
};

// Helper to convert Binance KLine to TechnicalData
export const processTechnicalData = (klineData: any[]): TechnicalData => {
    const closes = klineData.map(d => parseFloat(d[4]));
    const highs = klineData.map(d => parseFloat(d[2]));
    const lows = klineData.map(d => parseFloat(d[3]));
    const currentPrice = closes[closes.length - 1];

    // Calculate MAs
    const ma7 = calculateSMA(closes, 7);
    const ma25 = calculateSMA(closes, 25);
    const ma99 = calculateSMA(closes, 99);

    const boll = calculateBollingerBands(closes, 20);

    const fibPeriod = 150;
    const startIdx = Math.max(0, highs.length - fibPeriod);
    const recentHigh = Math.max(...highs.slice(startIdx));
    const recentLow = Math.min(...lows.slice(startIdx));
    const fibonacci = calculateFibonacci(recentHigh, recentLow, currentPrice);

    return {
        currentPrice,
        ma7,
        ma25,
        ma99,
        boll,
        fibonacci
    };
};
// Helper to get MA slope (simple: current > previous)
const isSlopeUp = (current: number, prev: number) => current > prev;
const isSlopeDown = (current: number, prev: number) => current < prev;

export const analyzeMomentum = (candles: any[]) => {
    if (!candles || candles.length < 50) return { signal: 'NONE', reason: '' };

    const closes = candles.map((c: any) => parseFloat(c[4]));
    const opens = candles.map((c: any) => parseFloat(c[1]));

    // Current MA
    const ma7 = calculateSMA(closes, 7);
    const ma25 = calculateSMA(closes, 25);
    const ma99 = calculateSMA(closes, 99);

    // Previous Candle MA (to detect crossover)
    const prevCloses = closes.slice(0, -1);
    const prevMa7 = calculateSMA(prevCloses, 7);
    const prevMa25 = calculateSMA(prevCloses, 25);
    const prevMa99 = calculateSMA(prevCloses, 99);

    // Check for Crossover or Near-Cross (within 0.5%)
    const isCrossUp25 = (prevMa7 <= prevMa25 && ma7 >= ma25) || (Math.abs(ma7 - ma25) / ma25 < 0.005 && ma7 < ma25 && isSlopeUp(ma7, prevMa7));
    const isCrossUp99 = (prevMa7 <= prevMa99 && ma7 >= ma99) || (Math.abs(ma7 - ma99) / ma99 < 0.005 && ma7 < ma99 && isSlopeUp(ma7, prevMa7));
    const isCrossDown25 = (prevMa7 >= prevMa25 && ma7 <= ma25) || (Math.abs(ma7 - ma25) / ma25 < 0.005 && ma7 > ma25 && isSlopeDown(ma7, prevMa7));
    const isCrossDown99 = (prevMa7 >= prevMa99 && ma7 <= ma99) || (Math.abs(ma7 - ma99) / ma99 < 0.005 && ma7 > ma99 && isSlopeDown(ma7, prevMa7));

    // Check 3 Candles Pattern (Last 3 completed candles, excluding current unfinished one if needed, 
    // but usually user means "most recent 3"). Let's use last 3 known candles.
    const last3 = candles.slice(-3);

    // 3 White Soldiers (Three consecutive UP candles)
    const isThreeWhiteSoldiers = last3.every((c: any) => parseFloat(c[4]) > parseFloat(c[1]));

    // 3 Black Crows (Three consecutive DOWN candles)
    const isThreeBlackCrows = last3.every((c: any) => parseFloat(c[4]) < parseFloat(c[1]));

    let signal = 'NONE';
    let reason = '';

    // Logic: Cross/Near-Cross + MA Slope + 3 Candles
    if ((isCrossUp25 || isCrossUp99) && isSlopeUp(ma7, prevMa7) && isThreeWhiteSoldiers) {
        signal = 'BULLISH';
        reason = `MA7上穿/接近MA25/99 + 均线向上 + 三连阳动能`;
    } else if ((isCrossDown25 || isCrossDown99) && isSlopeDown(ma7, prevMa7) && isThreeBlackCrows) {
        signal = 'BEARISH';
        reason = `MA7下穿/接近MA25/99 + 均线向下 + 三连阴动能`;
    }

    return { signal, reason };
};
