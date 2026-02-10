import { TechnicalData, TradeConfig } from "../types";
import { getAPI } from "../src/bridge-selector";

// Knowledge Base Loader
// Note: In a real electron app, fs might need to be accessed via IPC if contextIsolation is true.
// For now, we'll try to use the bridge or assume we can pass a context string.
// Since we can't easily read FS from renderer without bridge, we will keep it simple:
// We will ask the bridge to "getKnowledge" or better yet, we just hardcode the top rules for now 
// OR we add a new IPC handler 'get-knowledge' which is the best approach.

// Robust request wrapper with retry logic
const aiRequestWithRetry = async (args: any, retries: number = 2, delay: number = 2000): Promise<any> => {
  const api = getAPI();
  if (!api) throw new Error("AI Bridge Not Found");

  for (let i = 0; i <= retries; i++) {
    try {
      const res = await api.aiRequest(args);
      if (!res.error) return res;

      // AI requests might time out or have network issues
      const isRetryable = res.error.includes('Timeout') || res.error.includes('Network Error');
      if (!isRetryable || i === retries) return res;

      console.warn(`[AI Service] AI Request failed, retrying (${i + 1}/${retries})...`, res.error);
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    } catch (e: any) {
      if (i === retries) throw e;
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
  }
};

export const getAIAnalysis = async (config: TradeConfig, data: TechnicalData, position?: any, trendContext?: any, momentum?: any) => {
  const api = getAPI();
  if (!api) throw new Error("AI Bridge Not Found");

  // Fetch Knowledge Context from Backend
  let knowledgeContext = "";
  try {
    const kRes = await api.getKnowledge();
    if (kRes && kRes.content) {
      knowledgeContext = kRes.content;
    }
  } catch (e) {
    console.warn("Failed to load knowledge context", e);
  }

  const positionText = position
    ? `当前仓位：${position.side} ${position.size} ${position.symbol} @ $${position.entryPrice.toFixed(2)} (当前盈亏: ${position.pnl.toFixed(2)} USDT, ROE: ${position.roe.toFixed(2)}%)`
    : "当前无持仓";

  const trendText = trendContext
    ? `
    多周期趋势参考:
    - 15m (${trendContext.t15m.trend}): ${trendContext.t15m.isStrongReversal ? '🚨 强反转' : trendContext.t15m.engulfingPatten}
    - 1h  (${trendContext.t1h.trend}): ${trendContext.t1h.isStrongReversal ? '🚨 强反转' : trendContext.t1h.engulfingPatten}
    - 4h  (${trendContext.t4h.trend}): ${trendContext.t4h.isStrongReversal ? '🚨 强反转 (核心参考)' : trendContext.t4h.engulfingPatten}
    `
    : "多周期趋势数据不可用";

  const momentumText = (momentum && momentum.signal !== 'NONE')
    ? `
    🔥 动能监测 (${config.timeframe}):
    - 信号: ${momentum.signal}
    - 原因: ${momentum.reason}
    (⚠️ 请重点参考此动能信号，通常意味着短期爆发力)
    `
    : "动能监测: 无明显异常信号";

  const prompt = `
    你是一名顶级加密货币量化分析师。请根据以下数据对 ${config.symbol} (${config.timeframe}) 进行技术分析并给出操作建议：
    
    ${positionText}

    ${trendText}

    ${momentumText}

    ${(() => {
      const { currentPrice, ma7, ma99, boll } = data;
      let trendSignal = "⚪ 震荡或趋势不明";

      // Bullish: Price > MA7 AND (Price >= MB OR Price >= UP)
      if (currentPrice > ma7 && (currentPrice >= boll.mb || currentPrice >= boll.up)) {
        trendSignal = "🟢 看涨趋势 (价格在MA7之上 且 位于布林带中轨/上轨区域)";
      }
      // Bearish: Price < MA99 AND (Price <= MB OR Price <= DN)
      else if (currentPrice < ma99 && (currentPrice <= boll.mb || currentPrice <= boll.dn)) {
        trendSignal = "🔴 看跌趋势 (价格在MA99之下 且 位于布林带中轨/下轨区域)";
      }

      return `
    MA+布林带趋势判定:
    - 结论: ${trendSignal}
    (指令: 请基于此趋势判定，结合下方的斐波那契点位分析当前价格的支撑与阻力强度)
        `;
    })()}

    参考知识库 (ChartSchool):
    ${knowledgeContext ? knowledgeContext.substring(0, 20000) + "..." : "暂无知识库数据 (请确保后端已加载)"}

    技术指标 (15m/1h):
    - MA7: ${data.ma7.toFixed(2)}, MA25: ${data.ma25.toFixed(2)}, MA99: ${data.ma99.toFixed(2)}
    - 布林带: 上轨 ${data.boll.up.toFixed(2)}, 中轨 ${data.boll.mb.toFixed(2)}, 下轨 ${data.boll.dn.toFixed(2)}
    - 斐波那契回撤: 0.382(${data.fibonacci.level382.toFixed(2)}), 0.5(${data.fibonacci.level50.toFixed(2)}), 0.618(${data.fibonacci.level618.toFixed(2)})
    
    请输出严格的JSON格式（不要包含Markdown代码块符号）：
    {
      "signal": "BUY" | "SELL" | "HOLD" | "EXIT",
      "confidence": number (0-100),
      "reasoning": "简短的中文分析结论，包括为什么要持仓或离场",
      "targets": { "entry": number, "tp": number, "sl": number }
    }

  信号定义说明：
  - BUY: 开多仓（LONG）或继续持有多单
    - SELL: 开空仓（SHORT）或继续持有空单
      - EXIT: 无论当前持仓是多是空，立即平仓离场(用于止盈或反转离场)
        - HOLD: 保持现状，不做任何交易变动

  core instructions:
  1. ** 强反转优先(Strong Reversal) **: 
     - 重点关注 4h 和 1h 的 "🚨 强反转" 信号。如果 4h 强反转，必须 EXIT 或 反向。
     - 如果 1h 强反转且与 4h 方向相反，视为 "⚠ 潜在反转"，需减仓或收紧止损。
     - 绝对禁止逆着 4h 强反转方向加仓。

  2. ** 顺势加仓(Trend Following) **: 
     - 最佳做多机会: 4h UP + 1h UP + 15m 回调结束后转 UP。
     - 最佳做空机会: 4h DOWN + 1h DOWN + 15m 反弹结束后转 DOWN。
     - 只有在 4h/1h 趋势共振且无反转信号时，才考虑顺势加仓。

  3. ** 弱反转警示(Potential Reversal) **: 如果 15m/1h 频繁出现反转信号但 4h 未动，视为震荡，建议高抛低吸或观望。
  4. ** 止盈 **: 如果 ROE 超过 30 % 且趋势不明朗，请 EXIT。

  `;

  try {
    const aiPromise = aiRequestWithRetry({
      path: '/chat/completions',
      body: {
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "You are a professional crypto trading analyst. You allow output strictly in JSON format." },
          { role: "user", content: prompt }
        ],
        stream: false
      }
    });

    // Provide interim feedback if it takes too long
    const timeoutMsg = setTimeout(() => {
      console.warn("AI Analysis is taking longer than usual...");
    }, 15000);

    const res = await aiPromise;
    clearTimeout(timeoutMsg);

    if (res.error) throw new Error(res.error);
    const result = res.data;

    if (result.choices && result.choices.length > 0) {
      const content = result.choices[0].message.content;
      const jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(jsonStr);
    }

    return null;
  } catch (error: any) {
    console.error("AI Analysis Error:", error);
    // Return a structured error so the strategy loop can log it
    return { error: error.message || "Unknown AI Error" };
  }
};

export const getMarketReport = async (config: TradeConfig, data: TechnicalData): Promise<string | null> => {
  const api = getAPI();
  if (!api) throw new Error("AI Bridge Not Found");

  const prompt = `
    请作为一名资深加密货币分析师，为 ${config.symbol} (${config.timeframe}) 撰写一份详细的市场分析报告。
    
    技术数据参考：
    - 当前价格: MA7(${data.ma7.toFixed(2)}) / MA99(${data.ma99.toFixed(2)})
    - 布林带位置: 上轨${data.boll.up.toFixed(2)} / 下轨${data.boll.dn.toFixed(2)}
    - 斐波那契支撑/阻力: 0.618(${data.fibonacci.level618.toFixed(2)})
    
    报告要求：
    1. 使用 Markdown 格式。
    2. 包含以下章节：
       - **市场趋势概览** (基于均线和布林带)
       - **关键支撑与阻力位** (基于斐波那契)
       - **潜在风险提示**
       - **操作建议** (长线/短线)
    3. 语气专业、客观，字数控制在 300-500 字。
  `;

  try {
    const res = await aiRequestWithRetry({
      path: '/chat/completions',
      body: {
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "You are a crypto market analyst. You provide output in Markdown format." },
          { role: "user", content: prompt }
        ],
        stream: false
      }
    });

    if (res.error) throw new Error(res.error);
    const result = res.data;

    if (result.choices && result.choices.length > 0) {
      return result.choices[0].message.content;
    }

    return null;
  } catch (error) {
    console.error("AI Report Error:", error);
    return null;
  }
};
