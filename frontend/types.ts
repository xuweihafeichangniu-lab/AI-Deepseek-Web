
export interface Asset {
  symbol: string;
  balance: number;
  price: number;
  change24h: number;
  profit?: number;
}

export interface TechnicalData {
  currentPrice: number;
  ma7: number;
  ma25: number;
  ma99: number;
  boll: {
    up: number;
    mb: number;
    dn: number;
  };
  fibonacci: {
    level0: number;
    level382: number;
    level50: number;
    level618: number;
    level100: number;
  };
}

export enum TradingStep {
  SETUP = 'SETUP',
  DATA_COLLECTION = 'DATA_COLLECTION',
  AI_ANALYSIS = 'AI_ANALYSIS',
  EXECUTION = 'EXECUTION'
}

export interface TradeConfig {
  symbol: string;
  timeframe: string;
}
