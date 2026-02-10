import React, { useState, useEffect } from 'react';

const Settings: React.FC = () => {
    const [binanceKey, setBinanceKey] = useState('');
    const [binanceSecret, setBinanceSecret] = useState('');
    const [deepseekKey, setDeepseekKey] = useState('');
    const [proxyUrl, setProxyUrl] = useState('http://127.0.0.1:7897');
    const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error', message: string, details?: string }>({ type: 'idle', message: '' });

    useEffect(() => {
        loadKeys();
    }, []);

    const loadKeys = async () => {
        const api = (window as any).electronAPI;
        if (api) {
            const keys = await api.loadAPIKeys();
            if (keys) {
                setBinanceKey(keys.binanceKey || '');
                setBinanceSecret(keys.binanceSecret || '');
                setDeepseekKey(keys.deepseekKey || '');
                if (keys.proxyUrl) setProxyUrl(keys.proxyUrl);
            }
        }
    };

    const verifyBinance = async () => {
        setStatus({ type: 'loading', message: '正在保存配置并验证币安 API...' });
        const api = (window as any).electronAPI;

        // 1. Save Keys First (User Request)
        await api.saveAPIKeys({ binanceKey, binanceSecret, deepseekKey, proxyUrl });

        try {
            // 2. Try Futures (Preferred)
            // Note: We don't need overrideKeys anymore since we saved them, but keeping them doesn't hurt.
            // Actually, let's use the saved state by NOT passing overrides? 
            // Better to be explicit for the verification call to ensure UI state matches.
            let res = await api.binanceRequest({
                path: '/fapi/v1/account',
                overrideKeys: { key: binanceKey, secret: binanceSecret },
                overrideProxy: proxyUrl
            });

            if (res.status === 200) {
                setStatus({ type: 'success', message: '币安合约 API 验证成功！' });
                return;
            }

            // 3. Fallback to Spot
            console.log('Futures verification failed, trying Spot...', res);
            res = await api.binanceRequest({
                path: '/api/v3/account',
                overrideKeys: { key: binanceKey, secret: binanceSecret },
                overrideProxy: proxyUrl
            });

            if (res.status === 200) {
                setStatus({ type: 'success', message: '币安现货 API 验证成功！(注意: 合约接口可能被拦截)' });
            } else {
                setStatus({ type: 'error', message: `验证失败 (Spot: ${res.status})`, details: JSON.stringify(res.data) });
            }
        } catch (e: any) {
            setStatus({ type: 'error', message: '验证过程出错', details: e.message });
        }
    };

    const verifyDeepSeek = async () => {
        setStatus({ type: 'loading', message: '正在保存配置并验证 DeepSeek API...' });
        const api = (window as any).electronAPI;

        // 1. Save Keys First
        await api.saveAPIKeys({ binanceKey, binanceSecret, deepseekKey, proxyUrl });

        try {
            const res = await api.aiRequest({
                path: '/chat/completions',
                body: {
                    model: "deepseek-chat",
                    messages: [{ role: "user", content: "hi" }],
                    max_tokens: 5
                },
                overrideKey: deepseekKey,
                overrideProxy: proxyUrl
            });
            if (res.error) {
                setStatus({ type: 'error', message: 'DeepSeek 验证失败', details: res.error });
                return;
            }
            if (res.status === 200) {
                setStatus({ type: 'success', message: 'DeepSeek API 验证成功！' });
            } else {
                setStatus({ type: 'error', message: `DeepSeek API 返回错误 (${res.status})`, details: JSON.stringify(res.data) });
            }
        } catch (e: any) {
            setStatus({ type: 'error', message: 'DeepSeek 验证过程出错', details: e.message });
        }
    };

    const saveKeys = async () => {
        const api = (window as any).electronAPI;
        const res = await api.saveAPIKeys({ binanceKey, binanceSecret, deepseekKey, proxyUrl });
        if (res.success) {
            setStatus({ type: 'success', message: '配置已保存成功！请重启软件应用代理设置。' });
        } else {
            setStatus({ type: 'error', message: '保存失败', details: res.error });
        }
    };

    return (
        <div className="p-6 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="space-y-2">
                <h2 className="text-2xl font-bold text-binance">系统设置</h2>
                <p className="text-slate-400 text-sm">配置您的个人 API 接口和代理以启用自动化交易。</p>
            </div>

            {/* Network Section */}
            <div className="bg-card-dark/40 border border-white/5 rounded-2xl p-5 space-y-4 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-2">
                    <span className="material-symbols-outlined text-slate-400">lan</span>
                    <h3 className="font-bold text-slate-200 uppercase tracking-wider text-sm">网络代理配置</h3>
                </div>
                <div>
                    <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1.5 ml-1">HTTP PROXY URL</label>
                    <input
                        type="text"
                        value={proxyUrl}
                        onChange={(e) => setProxyUrl(e.target.value)}
                        className="w-full bg-bg-dark/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-slate-500/50 transition-colors"
                        placeholder="例如: http://127.0.0.1:7897"
                    />
                    <p className="text-[10px] text-slate-600 mt-2 italic ml-1">* 更改代理后需保存并重启软件生效</p>
                </div>
            </div>

            {/* Binance API Section */}
            <div className="bg-card-dark/40 border border-white/5 rounded-2xl p-5 space-y-4 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-2">
                    <span className="material-symbols-outlined text-binance">account_balance_wallet</span>
                    <h3 className="font-bold text-slate-200 uppercase tracking-wider text-sm">币安 API 配置 (Futures)</h3>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1.5 ml-1">API KEY</label>
                        <input
                            type="password"
                            value={binanceKey}
                            onChange={(e) => setBinanceKey(e.target.value)}
                            className="w-full bg-bg-dark/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-binance/50 transition-colors"
                            placeholder="输入您的 Binance API Key"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1.5 ml-1">API SECRET</label>
                        <input
                            type="password"
                            value={binanceSecret}
                            onChange={(e) => setBinanceSecret(e.target.value)}
                            className="w-full bg-bg-dark/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-binance/50 transition-colors"
                            placeholder="输入您的 Binance API Secret"
                        />
                    </div>
                    <button
                        onClick={verifyBinance}
                        className="w-full py-3 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-bold uppercase tracking-widest transition-all border border-white/5 active:scale-[0.98]"
                    >
                        验证币安接口
                    </button>
                </div>
            </div>

            {/* DeepSeek API Section */}
            <div className="bg-card-dark/40 border border-white/5 rounded-2xl p-5 space-y-4 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-2">
                    <span className="material-symbols-outlined text-primary">psychology</span>
                    <h3 className="font-bold text-slate-200 uppercase tracking-wider text-sm">DeepSeek AI 配置</h3>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1.5 ml-1">API KEY</label>
                        <input
                            type="password"
                            value={deepseekKey}
                            onChange={(e) => setDeepseekKey(e.target.value)}
                            className="w-full bg-bg-dark/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50 transition-colors"
                            placeholder="输入您的 DeepSeek API Key"
                        />
                    </div>
                    <button
                        onClick={verifyDeepSeek}
                        className="w-full py-3 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-bold uppercase tracking-widest transition-all border border-white/5 active:scale-[0.98]"
                    >
                        验证 DeepSeek 接口
                    </button>
                </div>
            </div>

            {/* Status Message */}
            {status.type !== 'idle' && (
                <div className={`p-4 rounded-xl text-xs font-medium animate-in zoom-in-95 duration-300 border ${status.type === 'loading' ? 'bg-primary/10 border-primary/20 text-primary' :
                    status.type === 'success' ? 'bg-success/10 border-success/20 text-success' :
                        'bg-danger/10 border-danger/20 text-danger'
                    }`}>
                    <div className="flex items-center gap-2 mb-1">
                        {status.type === 'loading' && <span className="size-3 border-2 border-current border-t-transparent rounded-full animate-spin"></span>}
                        {status.message}
                    </div>
                    {status.details && (
                        <div className="mt-2 text-[10px] opacity-70 break-all bg-black/10 p-2 rounded-lg font-mono">
                            {status.details}
                        </div>
                    )}
                </div>
            )}

            {/* Save Button */}
            <button
                onClick={saveKeys}
                className="w-full py-4 bg-binance text-bg-dark rounded-2xl font-black uppercase tracking-[0.2em] shadow-lg shadow-binance/20 hover:shadow-binance/40 active:scale-[0.97] transition-all"
            >
                保存全部配置
            </button>

            <div className="pt-4 text-center">
                <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest leading-relaxed">
                    您的 API 秘钥将加密保存在本地设备<br />不会上传至任何第三方服务器
                </p>
            </div>
        </div>
    );
};

export default Settings;
