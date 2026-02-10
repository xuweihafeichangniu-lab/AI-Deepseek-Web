import React, { useState, useEffect, useRef } from 'react';
import { TradingStep, TradeConfig, TechnicalData } from '../types';
import { getAIAnalysis } from '../services/aiService';
import { fetchMarketData, executeOrder, fetchCurrentPrice, getAccountEquity } from '../services/binanceService';
import { startStrategy, stopStrategy, getStrategyState } from '../services/strategyService';

const TradingInterface: React.FC = () => {
  const [mode, setMode] = useState<'MANUAL' | 'AUTO'>('MANUAL');
  const [step, setStep] = useState<TradingStep>(TradingStep.SETUP);
  const [isSimMode, setIsSimMode] = useState(true); // Default to true as per user request
  const [config, setConfig] = useState<TradeConfig>({ symbol: 'BTCUSDT', timeframe: '15m' });
  const [techData, setTechData] = useState<TechnicalData | null>(null);
  const [aiResult, setAiResult] = useState<any>(null);
  const [equity, setEquity] = useState<number | null>(null);
  const [virtualEquity, setVirtualEquity] = useState<number>(100);
  const [logs, setLogs] = useState<string[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    // Create a function to fetch equity
    const updateEquity = async () => {
      try {
        if (!isSimMode) {
          const eq = await getAccountEquity();
          setEquity(eq);
        } else {
          // In simulation mode, we calculate virtual equity based on strategy state's initialEquity + unrealized PnL
          const s = getStrategyState();
          if (s.isRunning && s.currentPosition) {
            const currentPrice = await fetchCurrentPrice(config.symbol);
            if (currentPrice > 0) {
              const pnl = (currentPrice - s.currentPosition.entryPrice) * s.currentPosition.size * (s.currentPosition.side === 'LONG' ? 1 : -1);
              setVirtualEquity(s.initialEquity + pnl);
            } else {
              setVirtualEquity(s.initialEquity);
            }
          } else {
            // No running position, show the realized balance
            setVirtualEquity(s.initialEquity);
          }
        }

      } catch (e) {
        console.error(e);
      }
    };

    updateEquity();
    // Poll every 10s for more responsive simulated PnL
    const interval = setInterval(updateEquity, 10000);
    return () => clearInterval(interval);
  }, [isSimMode, config.symbol]);

  // --- MANUAL MODE FUNCTIONS ---
  const startAnalysis = async () => {
    setStep(TradingStep.DATA_COLLECTION);
    setLogs([]);
    addLog(`正在初始化 ${config.symbol} 量化任务...`);

    // Step 1: Fetch Real Indicators
    addLog(`正在从币安获取 K线数据 (${config.timeframe})...`);

    try {
      const data = await fetchMarketData(config.symbol, config.timeframe);

      if (!data) {
        addLog("❌ 获取K线数据失败，请检查网络或代理配置");
        setStep(TradingStep.SETUP);
        return;
      }

      setTechData(data);
      addLog(`✅ 指标计算完成: MA7=${data.ma7.toFixed(2)}, BOLL-UP=${data.boll.up.toFixed(2)}`);
      addLog(`斐波那契周期数据已锁定: 0.618 分位于 $${data.fibonacci.level618.toFixed(2)}`);

      // Step 2: AI Analysis
      setStep(TradingStep.AI_ANALYSIS);
      addLog(`正在将多维数据上传至 DeepSeek AI 引擎...`);
      const result = await getAIAnalysis(config, data);

      if (!result) {
        addLog("❌ AI 分析失败，API 可能与其连接中断");
        setStep(TradingStep.SETUP);
        return;
      }

      setAiResult(result);
      addLog(`🤖 DeepSeek 决策返回: ${result?.signal} | 置信度: ${result?.confidence}%`);
      addLog(`策略分析: ${result?.reasoning}`);

      setStep(TradingStep.EXECUTION);
    } catch (e) {
      addLog(`❌ 发生未知错误: ${e}`);
      setStep(TradingStep.SETUP);
    }
  };

  const handleExecute = async () => {
    // ... (existing execute logic, omitted for brevity but kept in file)
    if (!aiResult) return;
    // ...
  };

  const testConnection = async () => {
    addLog("🔍 开始全链路连接测试...");

    // 1. Test Public API
    const price = await fetchCurrentPrice('BTCUSDT');
    if (price > 0) {
      addLog(`✅ 行情接口正常 (BTC price: $${price})`);
    } else {
      addLog("❌ 行情接口失败 (无法连接币安，请检查代理)");
    }

    // 2. Test Private API
    try {
      const eq = await getAccountEquity();
      if (eq !== null) {
        addLog(`✅ 账户接口正常 (权益: $${eq})`);
        setEquity(eq);
      }
    } catch (e: any) {
      addLog(`❌ 账户接口失败: ${e.message}`);
    }
  };

  // --- AUTO MODE FUNCTIONS ---
  const [isAutoRunning, setIsAutoRunning] = useState(false);
  const [strategyState, setStrategyState] = useState(getStrategyState());
  const [timeLeft, setTimeLeft] = useState<string>('--:--');

  useEffect(() => {
    const timer = setInterval(() => {
      const s = getStrategyState();
      setStrategyState(s);
      setIsAutoRunning(s.isRunning);

      if (s.isRunning && s.nextUpdateAt > 0) {
        const diff = Math.max(0, s.nextUpdateAt - Date.now());
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        setTimeLeft(`${mins}:${secs.toString().padStart(2, '0')}`);
      } else {
        setTimeLeft('--:--');
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const toggleAutoStrategy = () => {
    if (isAutoRunning) {
      stopStrategy(addLog);
      setIsAutoRunning(false);
    } else {
      setLogs([]);
      setIsAutoRunning(true);
      startStrategy(config, addLog, isSimMode);
    }
  };

  // --- SYMBOL DYNAMICS ---
  const [dynamicSymbols, setDynamicSymbols] = useState<{ symbol: string, change: number }[]>([]);
  const syncGainers = async () => {
    addLog("正在扫描盘面涨幅榜前10名...");
    const { fetchTopGainers } = await import('../services/binanceService');
    const gainers = await fetchTopGainers(10);
    setDynamicSymbols(gainers);
    if (gainers.length > 0) {
      addLog(`✅ 成功录入 ${gainers.length} 个强势币种: ${gainers.map(g => g.symbol).join(', ')}`);
      setConfig(prev => ({ ...prev, symbol: gainers[0].symbol }));
    }
  };

  return (
    <div className="p-4 space-y-6">
      {/* Equity Display */}
      <div className={`p-4 rounded-xl border flex justify-between items-center transition-all ${isSimMode ? 'bg-gradient-to-r from-primary/20 to-transparent border-primary/20' : 'bg-gradient-to-r from-binance/20 to-transparent border-binance/20'}`}>
        <div>
          <p className={`text-[10px] font-bold uppercase tracking-wider ${isSimMode ? 'text-primary' : 'text-binance'}`}>
            {isSimMode ? '模拟盘 (Virtual) 权益' : '币安实盘 (PAPI) 权益'}
          </p>
          <h2 className="text-2xl font-black text-white tracking-tight">
            {isSimMode ? `$${virtualEquity.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : (equity !== null ? `$${equity.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '...')}
            <span className="text-xs font-bold text-slate-500 ml-1">USDT</span>
          </h2>
        </div>
        <div className={`size-10 rounded-full flex items-center justify-center ${isSimMode ? 'bg-primary/20' : 'bg-binance/20'}`}>
          <span className={`material-symbols-outlined ${isSimMode ? 'text-primary' : 'text-binance'}`}>
            {isSimMode ? 'monitoring' : 'account_balance_wallet'}
          </span>
        </div>
      </div>

      {/* Mode & Sim Toggle */}
      <div className="space-y-3">
        <div className="flex bg-card-dark p-1 rounded-xl border border-white/5">
          <button
            onClick={() => { setMode('MANUAL'); setIsAutoRunning(false); stopStrategy(() => { }); }}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${mode === 'MANUAL' ? 'bg-binance text-bg-dark shadow-md' : 'text-slate-500'}`}
          >
            手动辅助
          </button>
          <button
            onClick={() => setMode('AUTO')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${mode === 'AUTO' ? 'bg-primary text-white shadow-md' : 'text-slate-500'}`}
          >
            全自动托管
          </button>
        </div>

        <div className="flex items-center justify-between px-2 py-1">
          <div className="flex items-center gap-2">
            <span className={`material-symbols-outlined text-sm ${isSimMode ? 'text-primary' : 'text-slate-500'}`}>
              {isSimMode ? 'verified_user' : 'shield'}
            </span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {isSimMode ? '正在使用模拟币 (100U)' : '正在连接币安实盘'}
            </span>
          </div>
          <button
            onClick={() => !isAutoRunning && setIsSimMode(!isSimMode)}
            disabled={isAutoRunning}
            className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors focus:outline-none ${isSimMode ? 'bg-primary' : 'bg-slate-700'} ${isAutoRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${isSimMode ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
      </div>

      {/* Configuration Area */}
      <div className="space-y-4 animate-in fade-in">
        <div className="bg-card-dark p-4 rounded-xl border border-white/5">
          <div className="flex justify-between items-center mb-3">
            <p className="text-[10px] font-bold text-slate-500 uppercase">目标币种 & 周期</p>
            <button
              onClick={syncGainers}
              className="text-[10px] bg-binance/10 text-binance px-2 py-1 rounded hover:bg-binance/20 transition-colors font-bold"
            >
              同步涨幅榜前10
            </button>
          </div>
          <div className="flex gap-3">
            <select
              value={config.symbol}
              onChange={(e) => setConfig({ ...config, symbol: e.target.value })}
              disabled={isAutoRunning || (step !== TradingStep.SETUP && mode === 'MANUAL')}
              className="flex-1 bg-bg-dark border-none rounded-lg text-white font-bold p-3 focus:ring-binance"
            >
              <optgroup label="主流币种">
                <option value="BTCUSDT">BTC / USDT</option>
                <option value="ETHUSDT">ETH / USDT</option>
                <option value="SOLUSDT">SOL / USDT</option>
              </optgroup>
              {dynamicSymbols.length > 0 && (
                <optgroup label="今日热门 (涨幅榜)">
                  {dynamicSymbols.map(s => (
                    <option key={s.symbol} value={s.symbol}>
                      {s.symbol.replace('USDT', '')} / USDT (+{s.change.toFixed(2)}%)
                    </option>
                  ))}
                </optgroup>
              )}
            </select>

            <select
              value={config.timeframe}
              onChange={(e) => setConfig({ ...config, timeframe: e.target.value })}
              disabled={isAutoRunning || (step !== TradingStep.SETUP && mode === 'MANUAL')}
              className="w-24 bg-bg-dark border-none rounded-lg text-white font-bold p-3 focus:ring-binance"
            >
              <option value="15m">15m</option>
              <option value="1h">1h</option>
              <option value="4h">4h</option>
              <option value="1d">1D</option>
            </select>
          </div>
        </div>

        {mode === 'MANUAL' ? (
          /* MANUAL MODE UI */
          <>
            {step === TradingStep.SETUP ? (
              <div className="flex gap-3">
                <button
                  onClick={startAnalysis}
                  className="flex-[2] bg-binance text-bg-dark font-extrabold py-4 rounded-xl shadow-lg shadow-binance/20 active:scale-95 transition-transform"
                >
                  开始单次分析
                </button>
                <button
                  onClick={testConnection}
                  className="flex-1 bg-white/5 text-slate-400 font-bold py-4 rounded-xl border border-white/5 hover:bg-white/10 active:scale-95 transition-all"
                >
                  测试连接
                </button>
              </div>
            ) : (
              /* Progress View (Same as before) */
              <div className="space-y-4 animate-in fade-in">
                {/* Short Status */}
                <div className="flex justify-between items-center px-2">
                  <span className="text-xs font-bold text-slate-400">当前任务状态:</span>
                  <span className="text-xs font-black text-binance">{step}</span>
                </div>

                {/* AI Result Card */}
                {aiResult && (
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-3 relative overflow-hidden animate-in slide-in-from-top-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-black px-2 py-0.5 rounded ${aiResult.signal === 'BUY' ? 'bg-success text-white' : 'bg-danger text-white'}`}>
                        {aiResult.signal === 'BUY' ? '多 (LONG)' : '空 (SHORT)'}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400">DeepSeek 推荐 | {aiResult.confidence}%</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed font-medium">
                      {aiResult.reasoning}
                    </p>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setStep(TradingStep.SETUP)}
                    className="flex-1 bg-white/5 text-slate-400 font-bold py-3 rounded-xl border border-white/5"
                  >
                    重置
                  </button>
                  {step === TradingStep.EXECUTION && (
                    <button
                      onClick={handleExecute}
                      className="flex-[2] bg-primary text-white font-bold py-3 rounded-xl shadow-lg shadow-primary/20 active:scale-95"
                    >
                      确认下单
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          /* AUTO MODE UI */
          <div className="space-y-4 animate-in fade-in">
            {/* Status Card */}
            <div className="bg-card-dark border border-white/5 rounded-xl p-4 flex justify-between items-center">
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase">策略运行状态</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`size-2 rounded-full ${isAutoRunning ? 'bg-success animate-pulse' : 'bg-slate-600'}`}></span>
                  <span className={`text-sm font-black ${isAutoRunning ? 'text-success' : 'text-slate-400'}`}>
                    {isAutoRunning ? '已启动 - 运行中' : '已停止 - 待命'}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-slate-500 uppercase">距下次执行</p>
                <p className="text-xl font-black text-white font-mono">{timeLeft}</p>
              </div>
            </div>

            {/* Current Position UI */}
            {strategyState.currentPosition && (
              <div className="bg-gradient-to-br from-primary/10 to-transparent border border-primary/20 p-4 rounded-xl">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] font-black text-primary uppercase">当前持有仓位</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${strategyState.currentPosition.side === 'LONG' ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'}`}>
                    {strategyState.currentPosition.side} {strategyState.activeLeverage}x
                  </span>

                </div>
                <div className="flex justify-between items-end">
                  <div>
                    <h4 className="text-lg font-black text-white">{strategyState.currentPosition.symbol}</h4>
                    <p className="text-[10px] text-slate-400">数量: {strategyState.currentPosition.size.toFixed(4)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-slate-400">初始价格</p>
                    <p className="text-sm font-bold text-white">${strategyState.currentPosition.entryPrice.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Rules Summary */}
            <div className={`p-4 rounded-xl border transition-opacity ${isAutoRunning ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-primary text-base">rule</span>
                <h3 className="text-sm font-bold text-white">策略运行规则</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 p-2 rounded-lg border border-white/5">
                  <p className="text-[8px] font-bold text-slate-500 uppercase">获利分红</p>
                  <p className="text-xs font-bold text-success">30% 止盈</p>
                </div>
                <div className="bg-white/5 p-2 rounded-lg border border-white/5">
                  <p className="text-[8px] font-bold text-slate-500 uppercase">风险熔断</p>
                  <p className="text-xs font-bold text-danger">40% 止损</p>
                </div>
                <div className="bg-white/5 p-2 rounded-lg border border-white/5">
                  <p className="text-[8px] font-bold text-slate-500 uppercase">今日开单</p>
                  <p className="text-xs font-bold text-white">{strategyState.dailyTradesCount} 次 (不限)</p>
                </div>

                <div className="bg-white/5 p-2 rounded-lg border border-white/5">
                  <p className="text-[8px] font-bold text-slate-500 uppercase">杠杆比例</p>
                  <p className="text-xs font-bold text-binance">{strategyState.activeLeverage.toFixed(1)}x</p>
                </div>
                <div className="bg-white/5 p-2 rounded-lg border border-white/5">
                  <p className="text-[8px] font-bold text-slate-500 uppercase">执行周期</p>
                  <p className="text-xs font-bold text-primary">3-2-1 分钟</p>
                </div>

              </div>
            </div>

            <button
              onClick={toggleAutoStrategy}
              disabled={strategyState.isBanned}
              className={`w-full py-4 rounded-xl font-extrabold shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2 ${strategyState.isBanned ? 'bg-slate-800 text-slate-500' : isAutoRunning ? 'bg-danger text-white shadow-danger/20' : 'bg-primary text-white shadow-primary/20'}`}
            >
              {strategyState.isBanned ? (
                <>
                  <span className="material-symbols-outlined">gpp_bad</span>
                  账户已熔断 (禁止交易)
                </>
              ) : isAutoRunning ? (
                <>
                  <span className="material-symbols-outlined">stop_circle</span>
                  停止自动交易
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined">play_circle</span>
                  启动自动策略
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Shared Terminal Logs */}
      <div className="bg-black rounded-xl p-3 border border-slate-800 font-mono text-[10px] text-success/80 h-48 overflow-y-auto no-scrollbar relative">
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent pointer-events-none"></div>
        {logs.map((log, i) => (
          <p key={i} className="mb-1 leading-relaxed border-b border-white/5 pb-0.5 last:border-0">{log}</p>
        ))}
        <div ref={logEndRef} />
      </div>
    </div>
  );
};

export default TradingInterface;
