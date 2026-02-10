import React, { useState } from 'react';
import { TradeConfig, TechnicalData } from '../types';
import { fetchMarketData, fetchCurrentPrice } from '../services/binanceService';
import { getMarketReport } from '../services/aiService';

const AIAnalysisView: React.FC = () => {
    const [config, setConfig] = useState<TradeConfig>({ symbol: 'BTCUSDT', timeframe: '4h' });
    const [loading, setLoading] = useState(false);
    const [report, setReport] = useState<string | null>(null);
    const [currentPrice, setCurrentPrice] = useState<number | null>(null);

    const handleAnalyze = async () => {
        setLoading(true);
        setReport(null);
        setCurrentPrice(null);

        try {
            // 1. Get Real Price
            const price = await fetchCurrentPrice(config.symbol);
            setCurrentPrice(price);

            // 2. Get Indicators
            const data = await fetchMarketData(config.symbol, config.timeframe);
            if (!data) {
                setReport("❌ 无法获取市场数据，请检查网络连接。");
                setLoading(false);
                return;
            }

            // 3. Get AI Analysis
            const result = await getMarketReport(config, data);
            if (result) {
                setReport(result);
            } else {
                setReport("❌ AI 分析服务暂时不可用，请稍后再试。");
            }
        } catch (e) {
            setReport(`❌ 发生错误: ${e}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-4 space-y-6 h-full flex flex-col">
            {/* Header Config */}
            <div className="bg-card-dark p-4 rounded-xl border border-white/5 space-y-4">
                <h2 className="text-lg font-extrabold tracking-tight flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">psychology</span>
                    智能市场分析
                </h2>

                <div className="flex gap-3">
                    <select
                        value={config.symbol}
                        onChange={(e) => setConfig({ ...config, symbol: e.target.value })}
                        className="flex-1 bg-bg-dark border-none rounded-lg text-white font-bold p-3 focus:ring-primary"
                    >
                        <option value="BTCUSDT">BTC / USDT</option>
                        <option value="ETHUSDT">ETH / USDT</option>
                        <option value="SOLUSDT">SOL / USDT</option>
                        <option value="BNBUSDT">BNB / USDT</option>
                        <option value="PIEVERSEUSDT">PIEVERSE / USDT</option>
                        <option value="SPACEUSDT">SPACE / USDT</option>
                        <option value="AIAUSDT">AIA / USDT</option>
                    </select>

                    <select
                        value={config.timeframe}
                        onChange={(e) => setConfig({ ...config, timeframe: e.target.value })}
                        className="w-24 bg-bg-dark border-none rounded-lg text-white font-bold p-3 focus:ring-primary"
                    >
                        <option value="1h">1H</option>
                        <option value="4h">4H</option>
                        <option value="1d">1D</option>
                    </select>
                </div>

                <button
                    onClick={handleAnalyze}
                    disabled={loading}
                    className={`w-full py-3 rounded-xl font-extrabold transition-all flex items-center justify-center gap-2 ${loading ? 'bg-slate-700 text-slate-400' : 'bg-primary text-white shadow-lg shadow-primary/20 active:scale-95'}`}
                >
                    {loading ? (
                        <>
                            <span className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                            由于 DeepSeek 思考中...
                        </>
                    ) : (
                        <>
                            <span className="material-symbols-outlined">auto_awesome</span>
                            生成深度报告
                        </>
                    )}
                </button>
            </div>

            {/* Report Area */}
            <div className="flex-1 overflow-y-auto no-scrollbar bg-card-dark/50 rounded-xl border border-white/5 p-5 relative">
                {!report && !loading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 opacity-50">
                        <span className="material-symbols-outlined text-6xl mb-2">analytics</span>
                        <p className="text-xs font-bold uppercase tracking-widest">等待分析指令</p>
                    </div>
                )}

                {currentPrice && (
                    <div className="mb-4 pb-4 border-b border-white/5 flex justify-between items-baseline">
                        <span className="text-xs text-slate-400 font-bold">{config.symbol} 实时价格</span>
                        <span className="text-xl font-black text-white">${currentPrice.toLocaleString()}</span>
                    </div>
                )}

                {report && (
                    <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-headings:text-primary prose-strong:text-white">
                        <div className="whitespace-pre-wrap font-medium text-slate-300">
                            {report}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AIAnalysisView;
