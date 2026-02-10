import { TradeConfig } from '../types';
import { fetchMarketData, getAccountEquity, setLeverage, executeOrder, closeAllPositions, fetchCurrentPrice, getSymbolInfo, getLeverageBracket } from './binanceService';
import { getAIAnalysis } from './aiService';
import { analyzeMomentum } from '../utils/indicators';

interface StrategyState {
    isRunning: boolean;
    isPaperTrading: boolean; // New: Paper Trading Mode
    initialEquity: number;
    currentPosition: {
        symbol: string;
        side: 'LONG' | 'SHORT';
        size: number; // Position amount
        entryPrice: number;
    } | null;
    lastTradeTime: number;
    dailyLoss: number;
    dailyTradesCount: number;
    lastResetDate: string;
    isBanned: boolean;
    nextUpdateAt: number;
    currentLoopId: number;
    activeLeverage: number;
    cycleIndex: number;
}


const state: StrategyState = {
    isRunning: false,
    isPaperTrading: true, // Default to true if user asked for "simulated position"
    initialEquity: 100,
    currentPosition: null,
    lastTradeTime: 0,
    dailyLoss: 0,
    dailyTradesCount: 0,
    lastResetDate: new Date().toLocaleDateString(),
    isBanned: false,
    nextUpdateAt: 0,
    currentLoopId: 0,
    activeLeverage: 10,
    cycleIndex: 0
};


// Initial default leverage
const DEFAULT_LEVERAGE = 10;
const STOP_LOSS_PCT = 0.4; // 40%
const TAKE_PROFIT_PCT = 0.3; // 30%
const WAIT_CYCLES = [3, 2, 1]; // Minutes


function checkDailyReset() {
    const today = new Date().toLocaleDateString();
    if (state.lastResetDate !== today) {
        state.dailyTradesCount = 0;
        state.lastResetDate = today;
        return true;
    }
    return false;
}

// Helper to fetch current position from Electron Bridge
// Returns: Position object, null (if confirmed no position), or undefined (if sync failed)
async function fetchCurrentPositions(symbol: string) {
    try {
        const api = (window as any).electronAPI;
        if (!api) return undefined;

        const res = await api.binanceRequest({ path: '/papi/v1/um/positions' });
        if (res.error) {
            console.error("Position Sync Error:", res.error);
            return undefined; // Sync failed, don't clear state
        }

        const data = res.data;
        if (!Array.isArray(data)) {
            console.error("Unexpected Position Data Format:", data);
            return undefined;
        }

        // Find position in the returned array
        const pos = data.find((p: any) => p.symbol.toUpperCase() === symbol.toUpperCase() && parseFloat(p.positionAmt) !== 0);

        if (pos) {
            const amt = parseFloat(pos.positionAmt);
            return {
                symbol,
                side: amt > 0 ? 'LONG' as const : 'SHORT' as const,
                size: Math.abs(amt),
                entryPrice: parseFloat(pos.entryPrice)
            };
        }
        return null; // Confirmed no position
    } catch (e) {
        console.error("Sync Positions Exception:", e);
        return undefined;
    }
}

export const getStrategyState = () => ({ ...state });

export const startStrategy = async (config: TradeConfig, onLog: (msg: string) => void, isPaperTrading: boolean = false) => {
    if (state.isRunning) return;

    state.isRunning = true;
    state.isPaperTrading = isPaperTrading;
    state.activeLeverage = DEFAULT_LEVERAGE; // Reset leverage to default on start
    onLog(`🚀 正在启动策略引擎 (${isPaperTrading ? '模拟盘' : '实盘'})...`);

    try {
        if (state.isPaperTrading) {
            state.initialEquity = 100; // Reset to 100 for paper trading
            onLog(`🚀 模拟盘启动! 固定初始权益: $${state.initialEquity.toFixed(2)}`);
        } else {
            const eq = await getAccountEquity();
            state.initialEquity = eq;
            onLog(`🚀 实盘启动! 实时调取权益: $${state.initialEquity.toFixed(2)}`);
        }

        state.dailyLoss = 0;
        state.isBanned = false;
        state.cycleIndex = 0; // Reset cycle at start

        onLog(`⚠️ 风控已激活: 亏损 > 40% ($${(state.initialEquity * 0.4).toFixed(2)}) 将强制熔断`);

        if (!state.isPaperTrading) {
            // 1. Fetch Leverage Brackets to see max allowed
            const bracket = await getLeverageBracket(config.symbol);
            if (bracket && bracket.brackets && bracket.brackets.length > 0) {
                const maxAllowed = Math.max(...bracket.brackets.map((b: any) => b.initialLeverage));
                if (state.activeLeverage > maxAllowed) {
                    onLog(`⚠️ 该币种最大杠杆限制为 ${maxAllowed}x，已自动调整`);
                    state.activeLeverage = maxAllowed;
                }
            }

            // 2. Set Leverage
            const levRes = await setLeverage(config.symbol, state.activeLeverage);
            if (levRes && levRes.error) {
                onLog(`❌ 设置杠杆失败: ${levRes.error}，将尝试以当前账户设置继续`);
            } else {
                onLog(`✅ 杠杆已成功设置为: ${state.activeLeverage}x`);
            }

            // Sync initial position state
            state.currentPosition = await fetchCurrentPositions(config.symbol);
        } else {
            state.currentPosition = null;
        }

        if (state.currentPosition) {
            onLog(`📋 检测到已有仓位: ${state.currentPosition.side} ${state.currentPosition.size}`);
        }

        state.currentLoopId++;
        runLoop(config, onLog, state.currentLoopId);
    } catch (e: any) {

        onLog(`❌ 启动异常: ${e.message || e}`);
        state.isRunning = false;
    }
};

export const stopStrategy = (onLog: (msg: string) => void) => {
    state.isRunning = false;
    onLog("🛑 策略已手动停止");
};

// Helper: Analyze Trend (Generic)
const analyzeTrend = (candles: any[], timeframe: string) => {
    if (!candles || candles.length < 5) return { timeframe, trend: 'UNKNOWN', isReversal: false, isStrongReversal: false, engulfingPatten: 'NONE' };

    const last = candles[candles.length - 1]; // Current (unfinished) candle
    const prev = candles[candles.length - 2]; // Previous completed candle

    // Check Previous 3 Candles Range (excluding current)
    const prev3 = candles.slice(candles.length - 4, candles.length - 1);
    const prev3High = Math.max(...prev3.map((c: any) => c.high));
    const prev3Low = Math.min(...prev3.map((c: any) => c.low));

    // Simple Engulfing Check (1 Candle)
    // Bullish Engulfing: Prev was Red, Curr is Green, and Curr Body covers Prev Body
    const isBullishEngulfing = (prev.close < prev.open) && (last.close > last.open) &&
        (last.open <= prev.close) && (last.close >= prev.open);

    // Bearish Engulfing: Prev was Green, Curr is Red, and Curr Body covers Prev Body
    const isBearishEngulfing = (prev.close > prev.open) && (last.close < last.open) &&
        (last.open >= prev.close) && (last.close <= prev.open);

    // Strong Engulfing Check (3 Candles)
    // Bullish: Current Green Body covers Prev 3 High/Low Range
    const isStrongBullish = (last.close > last.open) && (last.close > prev3High) && (last.open < prev3Low);

    // Bearish: Current Red Body covers Prev 3 High/Low Range
    const isStrongBearish = (last.close < last.open) && (last.close < prev3Low) && (last.open > prev3High);

    const isStrongReversal = isStrongBullish || isStrongBearish;
    const isReversal = isBullishEngulfing || isBearishEngulfing || isStrongReversal;

    // Trend Direction
    const trend = last.close > last.open ? 'UP' : 'DOWN';

    let pattern = 'NONE';
    if (isStrongBullish) pattern = 'STRONG_BULLISH_ENGULFING';
    else if (isStrongBearish) pattern = 'STRONG_BEARISH_ENGULFING';
    else if (isBullishEngulfing) pattern = 'BULLISH_ENGULFING';
    else if (isBearishEngulfing) pattern = 'BEARISH_ENGULFING';

    return {
        timeframe,
        trend,
        isReversal,
        isStrongReversal,
        engulfingPatten: pattern,
        lastClose: last.close,
        prevClose: prev.close
    };
};

const runLoop = async (config: TradeConfig, onLog: (msg: string) => void, loopId: number) => {
    if (!state.isRunning || state.currentLoopId !== loopId) {
        if (state.currentLoopId !== loopId) {
            console.log(`[Loop ${loopId}] Terminating due to loop ID mismatch (current: ${state.currentLoopId})`);
        }
        return;
    }

    try {
        // 1. Risk Check & Take Profit Check (based on Position ROE)
        // ... (Risk check logic remains same, implicit in existing code above this block in file) ...
        if (state.currentPosition) {
            const currentPrice = await fetchCurrentPrice(config.symbol);

            // Safety: Price Sanity Check
            if (currentPrice > 0 && currentPrice > state.currentPosition.entryPrice * 0.05) {
                const pnl = (currentPrice - state.currentPosition.entryPrice) * state.currentPosition.size * (state.currentPosition.side === 'LONG' ? 1 : -1);
                const marginUsed = (state.currentPosition.size * state.currentPosition.entryPrice) / state.activeLeverage;
                const roe = (pnl / marginUsed) * 100;

                // Stop Loss Check
                if (roe <= -STOP_LOSS_PCT * 100) {
                    onLog(`🚨 [止损触发] 当前价格: $${currentPrice.toFixed(2)}, 入场价: $${state.currentPosition.entryPrice.toFixed(2)}, ROE (${roe.toFixed(2)}%) 触及止损线 (${-STOP_LOSS_PCT * 100}%)!`);

                    if (state.isPaperTrading) {
                        state.initialEquity += pnl;
                        onLog(`📝 [模拟结算] 止损离场。已实现盈亏: ${pnl.toFixed(2)} USDT, 剩余余额: ${state.initialEquity.toFixed(2)} USDT`);
                    } else {
                        await closeAllPositions(config.symbol);
                    }

                    state.currentPosition = null;

                    const waitMins = WAIT_CYCLES[state.cycleIndex];
                    state.cycleIndex = (state.cycleIndex + 1) % WAIT_CYCLES.length;

                    const waitMs = 1000 * 60 * waitMins;
                    state.nextUpdateAt = Date.now() + waitMs;
                    onLog(`💤 任务处理完毕。进入 ${waitMins} 分钟沉睡等待周期...`);
                    setTimeout(() => runLoop(config, onLog, loopId), waitMs);
                    return;
                }

                // Take Profit Check
                if (roe >= TAKE_PROFIT_PCT * 100) {
                    onLog(`🎉 [止盈达成] 当前价格: $${currentPrice.toFixed(2)}, 入场价: $${state.currentPosition.entryPrice.toFixed(2)}, ROE (${roe.toFixed(2)}%) 已达到目标 (${TAKE_PROFIT_PCT * 100}%)! 正在平仓获利了结...`);

                    if (state.isPaperTrading) {
                        state.initialEquity += pnl;
                        onLog(`📝 [模拟结算] 止盈平仓.已实现盈亏: ${pnl.toFixed(2)} USDT, 当前余额: ${state.initialEquity.toFixed(2)} USDT`);
                    } else {
                        await closeAllPositions(config.symbol);
                    }

                    state.currentPosition = null;
                    const waitMins = WAIT_CYCLES[state.cycleIndex];
                    state.cycleIndex = (state.cycleIndex + 1) % WAIT_CYCLES.length;

                    const waitMs = 1000 * 60 * waitMins;
                    state.nextUpdateAt = Date.now() + waitMs;
                    onLog(`💤 任务处理完毕。进入 ${waitMins} 分钟沉睡等待周期...`);
                    setTimeout(() => runLoop(config, onLog, loopId), waitMs);
                    return;
                }

                // Store for AI Analysis
                (state.currentPosition as any).roe = roe;
                (state.currentPosition as any).pnl = pnl;
            } else {
                onLog(`⚠️ [数据安全] 捕获到异常行情价格: $${currentPrice}。为防止误触发风控，本次周期跳过盈亏检查。`);
            }
        }

        // 1.2 Daily Trade Limit Check
        checkDailyReset();

        // 2. Sync Position data before AI moves
        if (!state.isPaperTrading) {
            const syncedPos = await fetchCurrentPositions(config.symbol);
            if (syncedPos !== undefined) {
                state.currentPosition = syncedPos;
                if (syncedPos) {
                    onLog(`📡 仓位同步成功: ${syncedPos.side} ${syncedPos.size}`);
                }
            } else {
                onLog(`⚠️ 仓位同步暂不可用，保留本地状态: ${state.currentPosition ? state.currentPosition.side : '无仓位'}`);
            }
        }

        // 3. Fetch Data (Original Timeframe e.g. 15m)
        onLog(`⏳ [${new Date().toLocaleTimeString()}] 正在扫描 ${config.symbol} 市场数据 (${config.timeframe})...`);
        const data = await fetchMarketData(config.symbol, config.timeframe);

        if (!data) {
            onLog("❌ 15m 行情获取失败 (可能 VPN/网络不稳定)，60秒内重试...");
            setTimeout(() => runLoop(config, onLog, loopId), 60000);
            return;
        }

        // 3.1 Fetch Data Multi-Timeframe (15m, 1h, 4h) - Direct API Call
        const api = (window as any).electronAPI;
        let trendContext = {
            t15m: { trend: 'UNKNOWN', engulfingPatten: 'NONE' },
            t1h: { trend: 'UNKNOWN', engulfingPatten: 'NONE' },
            t4h: { trend: 'UNKNOWN', engulfingPatten: 'NONE' }
        };

        let momentumRawKlines: any[] = [];

        if (api) {
            // Fetch 15m (50 candles) for Trend & Momentum
            const res15m = await api.binanceRequest({
                path: '/fapi/v1/klines',
                query: { symbol: config.symbol, interval: '15m', limit: 50 + 10 } // Extra buffer
            });
            if (res15m.data && Array.isArray(res15m.data)) {
                momentumRawKlines = res15m.data;
                const candles15m = res15m.data.map((d: any) => ({
                    open: parseFloat(d[1]), high: parseFloat(d[2]), low: parseFloat(d[3]), close: parseFloat(d[4])
                }));
                // Analyze last 50
                const slice15m = candles15m.slice(-50);
                trendContext.t15m = analyzeTrend(slice15m, '15m');
            }

            // Fetch 1h (30 candles)
            const res1h = await api.binanceRequest({
                path: '/fapi/v1/klines',
                query: { symbol: config.symbol, interval: '1h', limit: 30 }
            });
            if (res1h.data && Array.isArray(res1h.data)) {
                const candles1h = res1h.data.map((d: any) => ({
                    open: parseFloat(d[1]), high: parseFloat(d[2]), low: parseFloat(d[3]), close: parseFloat(d[4])
                }));
                trendContext.t1h = analyzeTrend(candles1h, '1h');
            }

            // Fetch 4h (10 candles)
            const res4h = await api.binanceRequest({
                path: '/fapi/v1/klines',
                query: { symbol: config.symbol, interval: '4h', limit: 10 }
            });
            if (res4h.data && Array.isArray(res4h.data)) {
                const candles4h = res4h.data.map((d: any) => ({
                    open: parseFloat(d[1]), high: parseFloat(d[2]), low: parseFloat(d[3]), close: parseFloat(d[4])
                }));
                trendContext.t4h = analyzeTrend(candles4h, '4h');
            }
        }

        // Log Trend Overview
        onLog(`📈 趋势分析 | 4h:${trendContext.t4h.trend} | 1h:${trendContext.t1h.trend} | 15m:${trendContext.t15m.trend}`);
        if ((trendContext.t4h as any).isStrongReversal) onLog(`🚨 4h 强反转信号! ${(trendContext.t4h as any).engulfingPatten}`);

        // 3.2 Momentum Analysis (Using fetched 15m raw klines)
        let momentum = { signal: 'NONE', reason: '' };
        if (momentumRawKlines.length > 0) {
            momentum = analyzeMomentum(momentumRawKlines);
            if (momentum.signal !== 'NONE') {
                onLog(`🚀 动能监测 (15m): ${momentum.signal} - ${momentum.reason}`);
            }
        }

        // 4. AI Analysis
        onLog("🤖 正在请求 DeepSeek AI 模型分析行情并制定交易策略...");
        const analysis = await getAIAnalysis(config, data, state.currentPosition, trendContext, momentum);

        if (!analysis || analysis.error) {
            const errorMsg = analysis?.error || "AI 无响应";
            onLog(`❌ AI 分析失败: ${errorMsg} (建议检查 VPN)，10秒后重试...`);
            setTimeout(() => runLoop(config, onLog, loopId), 10000);
            return;
        }

        const price = await fetchCurrentPrice(config.symbol);

        if (price <= 0) {
            onLog("❌ 当前价格获取异常或为0，跳过本次执行以防止计算错误");
            return;
        }

        onLog(`💡 AI 深度分析: ${analysis.reasoning}`);
        onLog(`📊 AI 最终决策: 【${analysis.signal}】 (置信度: ${analysis.confidence}%)`);

        if (analysis.signal === 'EXIT') {
            onLog("🚪 AI 建议平仓离场...");
            if (!state.isPaperTrading) {
                await closeAllPositions(config.symbol);
            } else if (state.currentPosition) {
                const currentPrice = await fetchCurrentPrice(config.symbol);
                const pnl = (currentPrice - state.currentPosition.entryPrice) * state.currentPosition.size * (state.currentPosition.side === 'LONG' ? 1 : -1);
                state.initialEquity += pnl;
                onLog(`📝 [模拟结算] AI 主动离场。已实现盈亏: ${pnl.toFixed(2)} USDT, 当前余额: ${state.initialEquity.toFixed(2)} USDT`);
            }
            state.currentPosition = null;
        } else if (analysis.signal !== 'HOLD') {
            let tradeEquity = state.initialEquity;
            if (!state.isPaperTrading) {
                try {
                    tradeEquity = await getAccountEquity();
                } catch (e) {
                    onLog("⚠️ 获取最新权益失败，使用初始权益进行开仓计算");
                }
            }
            await handleTradeLogic(config.symbol, analysis.signal, tradeEquity, price, onLog);
        } else {
            onLog("💤 AI 建议持币等待，本次无操作。");
        }
    } catch (e: any) {
        onLog(`❌ 策略异常: ${e.message || e}`);
    }

    // Schedule next loop
    if (state.isRunning && !state.isBanned) {
        const waitMins = WAIT_CYCLES[state.cycleIndex];
        state.cycleIndex = (state.cycleIndex + 1) % WAIT_CYCLES.length;

        const waitMs = 1000 * 60 * waitMins;
        state.nextUpdateAt = Date.now() + waitMs;
        onLog(`💤 任务处理完毕。进入 ${waitMins} 分钟沉睡等待周期...`);
        setTimeout(() => runLoop(config, onLog, loopId), waitMs);
    }
}

const handleTradeLogic = async (symbol: string, signal: 'BUY' | 'SELL', equity: number, price: number, onLog: (msg: string) => void) => {
    const direction = signal === 'BUY' ? 'LONG' : 'SHORT';
    const directionLabel = signal === 'BUY' ? '做多 (LONG)' : '做空 (SHORT)';
    const side = signal;

    // Fetch symbol info for precision
    const symbolInfo = await getSymbolInfo(symbol);
    const precision = symbolInfo ? parseInt(symbolInfo.quantityPrecision) : 3;

    // Case 1: No Position -> Open 20%
    if (!state.currentPosition) {
        // Lower the safety minimum to $1 so that 20% of $10 ($2) is honored.
        const usdtAmount = Math.max(equity * 0.2, 1);
        const quantity = (usdtAmount * state.activeLeverage) / price;
        const formattedQuantity = parseFloat(quantity.toFixed(precision));

        onLog(`🆕 AI 建议开仓: ${directionLabel} (投入保证金: $${usdtAmount.toFixed(2)}, 杠杆: ${state.activeLeverage}x)`);


        if (state.isPaperTrading) {
            onLog(`📝 [模拟盘] 已模拟开仓: ${directionLabel} ${formattedQuantity} ${symbol} @ $${price}`);

            state.dailyTradesCount++;
            state.currentPosition = { symbol, side: direction, size: formattedQuantity, entryPrice: price };
        } else {
            const res = await executeOrder(symbol, side, formattedQuantity);
            if (res.orderId) {
                onLog(`✅ 开仓成功！订单号: ${res.orderId}`);
                state.dailyTradesCount++;
                state.currentPosition = { symbol, side: direction, size: formattedQuantity, entryPrice: price };
            } else if (res.msg) {
                onLog(`❌ 开仓失败: ${res.msg}`);
            } else {
                onLog(`❌ 开仓异常: ${JSON.stringify(res)}`);
            }
        }
    }
    // Case 2: Same Direction -> Add 5%
    else if (state.currentPosition.side === direction) {
        const usdtAmount = Math.max(equity * 0.05, 1);
        const quantity = (usdtAmount * state.activeLeverage) / price;
        const formattedQuantity = parseFloat(quantity.toFixed(precision));

        onLog(`➕ AI 建议加仓: ${directionLabel} (追加保证金: $${usdtAmount.toFixed(2)})`);


        if (state.isPaperTrading) {
            onLog(`📝 [模拟盘] 已模拟加仓: ${directionLabel} ${formattedQuantity} ${symbol}`);

            state.dailyTradesCount++;
            // Simple average price for paper trading
            const totalSize = state.currentPosition.size + formattedQuantity;
            const avgEntry = (state.currentPosition.entryPrice * state.currentPosition.size + price * formattedQuantity) / totalSize;
            state.currentPosition = { ...state.currentPosition, size: totalSize, entryPrice: avgEntry };
        } else {
            const res = await executeOrder(symbol, side, formattedQuantity);
            if (res.orderId) {
                onLog(`✅ 加仓成功`);
                state.dailyTradesCount++;
            } else if (res.msg) {
                onLog(`❌ 加仓失败: ${res.msg}`);
            } else {
                onLog(`❌ 加仓异常: ${JSON.stringify(res)}`);
            }
        }
    }
    // Case 3: Reverse -> Close All, Open 10%
    else {
        onLog(`🔄 AI 信号突然反转! 正在平仓原来的 ${state.currentPosition.side} 并进行反手开仓...`);

        const usdtAmount = Math.max(equity * 0.1, 1);
        const quantity = (usdtAmount * state.activeLeverage) / price;
        const formattedQuantity = parseFloat(quantity.toFixed(precision));

        if (state.isPaperTrading) {
            onLog(`📝 [模拟盘] 已平仓所有仓位`);
            state.currentPosition = null;

            const res = { orderId: 'PAPER_ORDER_' + Date.now() }; // Fake result for simulation
            if (res.orderId) {
                onLog(`✅ 反手开仓 ${directionLabel} 成功 (模拟)`);

                state.dailyTradesCount++;
                state.currentPosition = { symbol, side: direction, size: formattedQuantity, entryPrice: price };
            }
        } else {
            await closeAllPositions(symbol);
            const res = await executeOrder(symbol, side, formattedQuantity);
            if (res.orderId) {
                onLog(`✅ 反手开仓 ${directionLabel} 成功`);

                state.dailyTradesCount++;
                state.currentPosition = { symbol, side: direction, size: formattedQuantity, entryPrice: price };
            } else if (res.msg) {
                onLog(`❌ 反手开仓失败: ${res.msg}`);
            } else {
                onLog(`❌ 反手开仓异常: ${JSON.stringify(res)}`);
            }
        }
    }
};
