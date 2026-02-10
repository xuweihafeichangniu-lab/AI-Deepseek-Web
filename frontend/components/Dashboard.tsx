import React, { useState, useEffect } from 'react';
import { Asset } from '../types';
import { getAccountEquity, fetchTickers24h } from '../services/binanceService';

const Dashboard: React.FC = () => {
  const [assets, setAssets] = useState<Asset[]>([
    { symbol: 'BTC', balance: 0, price: 0, change24h: 0 },
    { symbol: 'ETH', balance: 0, price: 0, change24h: 0 },
    { symbol: 'SOL', balance: 0, price: 0, change24h: 0 },
  ]);
  const [equity, setEquity] = useState<number>(0);

  const updateDashboard = async () => {
    try {
      // 1. Fetch Tickers
      const rawTickers = await fetchTickers24h(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']);

      const newAssets = assets.map(asset => {
        const ticker = rawTickers.find((t: any) => t.symbol === `${asset.symbol}USDT`);
        if (ticker) {
          return {
            ...asset,
            price: parseFloat(ticker.lastPrice),
            change24h: parseFloat(ticker.priceChangePercent)
          };
        }
        return asset;
      });
      setAssets(newAssets);

      // 2. Fetch Equity
      const eq = await getAccountEquity();
      setEquity(eq);
    } catch (e) {
      console.error("Dashboard Update Error:", e);
    }
  };

  useEffect(() => {
    updateDashboard();
    const interval = setInterval(updateDashboard, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-4 space-y-6">
      {/* Balance Card */}
      <div className="relative overflow-hidden p-6 rounded-2xl bg-gradient-to-br from-binance to-amber-600 text-bg-dark shadow-xl">
        <div className="absolute -right-8 -top-8 size-32 bg-white/10 rounded-full blur-2xl"></div>
        <div className="relative z-10">
          <p className="text-bg-dark/60 text-xs font-bold uppercase tracking-widest mb-1">实盘合约账户权益</p>
          <div className="flex items-baseline gap-2 mb-4">
            <h2 className="text-4xl font-extrabold tracking-tighter">
              {equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h2>
            <span className="text-sm font-bold opacity-80 uppercase">USDT</span>
          </div>
          <div className="flex items-center gap-4 pt-4 border-t border-bg-dark/10">
            <div className="flex flex-col">
              <span className="text-[10px] text-bg-dark/50 font-bold uppercase">状态</span>
              <span className="font-bold text-success-dark">实时更新中</span>
            </div>
            <button className="ml-auto bg-bg-dark text-binance px-4 py-1.5 rounded-lg text-xs font-extrabold active:scale-95 transition-transform">
              资产详情
            </button>
          </div>
        </div>
      </div>

      {/* Positions List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-400">主流币种行情 (Futures)</h3>
          <span className="text-[10px] font-bold text-binance cursor-pointer hover:underline">查看全部</span>
        </div>

        {assets.map((asset) => (
          <div key={asset.symbol} className="bg-card-dark border border-white/5 rounded-xl p-4 flex items-center justify-between hover:bg-card-dark/80 transition-colors">
            <div className="flex items-center gap-4">
              <div className="size-10 rounded-full bg-white/5 flex items-center justify-center border border-white/5">
                <span className="text-sm font-black">{asset.symbol[0]}</span>
              </div>
              <div>
                <h4 className="font-bold tracking-tight">{asset.symbol} / USDT</h4>
                <p className="text-[10px] text-slate-500 font-medium">永续合约</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-bold">${asset.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${asset.change24h >= 0 ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                {asset.change24h > 0 ? '+' : ''}{asset.change24h.toFixed(2)}%
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Market Ticker Sim */}
      <div className="bg-card-dark/30 rounded-xl p-4 border border-white/5">
        <div className="flex items-center gap-2 mb-3">
          <span className="material-symbols-outlined text-sm text-binance">campaign</span>
          <p className="text-[10px] font-bold text-slate-500 uppercase">实时行情预警</p>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">行情数据已同步至币安 FAPI</span>
            <span className="text-slate-500">Live</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
