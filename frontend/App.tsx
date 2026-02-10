import React, { useState } from 'react';
import Dashboard from './components/Dashboard';
import TradingInterface from './components/TradingInterface';
import AIAnalysisView from './components/AIAnalysisView';
import Settings from './components/Settings';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'trading' | 'analysis' | 'settings'>('settings');

  return (
    <div className="flex flex-col h-screen bg-bg-dark text-slate-100 max-w-[480px] mx-auto relative overflow-hidden shadow-2xl">
      {/* Header */}
      <header className="flex items-center justify-between p-4 bg-card-dark/50 backdrop-blur-md border-b border-white/5 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="size-10 bg-binance rounded-full flex items-center justify-center shadow-lg shadow-binance/20">
            <span className="material-symbols-outlined text-bg-dark font-bold">bolt</span>
          </div>
          <div>
            <h1 className="text-sm font-extrabold tracking-tight uppercase">SUPER AI</h1>
            <div className="flex items-center gap-1.5">
              <span className="size-1.5 bg-success rounded-full animate-pulse"></span>
              <span className="text-[10px] text-slate-500 font-bold tracking-widest uppercase">DeepSeek Connected</span>
            </div>
          </div>
        </div>
        <button
          onClick={() => setActiveTab('settings')}
          className={`p-2 hover:bg-white/5 rounded-lg transition-colors ${activeTab === 'settings' ? 'bg-white/10 text-binance' : ''}`}
        >
          <span className="material-symbols-outlined text-slate-400">settings</span>
        </button>
      </header>

      {/* Content Area */}
      <main className="flex-1 overflow-y-auto no-scrollbar pb-24">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'analysis' && <AIAnalysisView />}
        {activeTab === 'trading' && <TradingInterface />}
        {activeTab === 'settings' && <Settings />}
      </main>

      {/* Navigation Bar */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-card-dark/90 backdrop-blur-xl border-t border-white/5 px-6 py-3 z-50 flex items-center justify-between">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'dashboard' ? 'text-binance' : 'text-slate-500'}`}
        >
          <span className={`material-symbols-outlined ${activeTab === 'dashboard' ? 'font-bold' : ''}`}>dashboard</span>
          <span className="text-[10px] font-bold uppercase tracking-tighter">控制面板</span>
        </button>

        <button
          onClick={() => setActiveTab('analysis')}
          className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'analysis' ? 'text-primary' : 'text-slate-500'}`}
        >
          <span className={`material-symbols-outlined ${activeTab === 'analysis' ? 'font-bold' : ''}`}>psychology</span>
          <span className="text-[10px] font-bold uppercase tracking-tighter">AI 分析</span>
        </button>

        <div className="relative -mt-10 group">
          <div className="absolute inset-0 bg-binance/20 blur-xl rounded-full scale-150 group-hover:bg-binance/30 transition-all"></div>
          <button
            onClick={() => setActiveTab('trading')}
            className={`relative size-14 flex items-center justify-center rounded-full bg-binance text-bg-dark shadow-xl active:scale-95 transition-transform ${activeTab === 'trading' ? 'ring-4 ring-binance/20' : ''}`}
          >
            <span className="material-symbols-outlined text-3xl font-bold">add</span>
          </button>
        </div>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'settings' ? 'text-binance' : 'text-slate-500'}`}
        >
          <span className={`material-symbols-outlined ${activeTab === 'settings' ? 'font-bold' : ''}`}>settings</span>
          <span className="text-[10px] font-bold uppercase tracking-tighter">设置</span>
        </button>

        <button
          onClick={() => setActiveTab('trading')}
          className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'trading' ? 'text-binance' : 'text-slate-500'}`}
        >
          <span className={`material-symbols-outlined ${activeTab === 'trading' ? 'font-bold' : ''}`}>candlestick_chart</span>
          <span className="text-[10px] font-bold uppercase tracking-tighter">量化交易</span>
        </button>
      </nav>

      {/* Background Decor */}
      <div className="fixed inset-0 pointer-events-none -z-10 opacity-30">
        <div className="absolute top-1/4 -right-20 size-64 bg-primary/20 rounded-full blur-[100px]"></div>
        <div className="absolute bottom-1/4 -left-20 size-64 bg-binance/10 rounded-full blur-[100px]"></div>
      </div>
    </div>
  );
};

export default App;
