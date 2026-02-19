/**  
 * Minervini SEPA Stock Screener Core Logic
 * Ported from Python implementation
 */

// Constants
export const MIN_PRICE = 10;
export const MIN_ADV_SHARES = 500000;
export const MA200_RISE_DAYS = 21;
export const DIST_52W_LOW = 1.30;
export const MAX_52W_HIGH = 0.75;
export const RS_MIN_PCT = 70;
export const RS_IDEAL_PCT = 90;
// TEST REPLACEMENTexport const VCP_ATR_RATIO = 0.70;
export const VCP_VOL_RATIO = 0.80;
export const VCP_RANGE_MAX = 0.08;
export const VCP_NEAR_HIGH = 0.88;
export const BO_PIVOT_BARS = 10;
export const BO_VOL_MULT = 1.40;

export interface Bar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ScreenerResult {
  symbol: string;
  price: number;
  rs: number;
  grade: string;
  passesTemplate: boolean;
  passesVcp: boolean;
  passesBreakout: boolean;
  passesLiquidity: boolean;
  distance52wLow: number;
  distance52wHigh: number;
  ma50: number;
  ma150: number;
  ma200: number;
  atr: number;
}

/**
 * Calculate Simple Moving Average
 */
export function sma(data: Bar[], period: number): number | null {
  if (data.length < period) return null;
  const sum = data.slice(-period).reduce((acc, bar) => acc + bar.close, 0);
  return sum / period;
}

/**
 * Calculate SMA at specific index
 */
export function smaAt(data: Bar[], period: number, index: number): number | null {
  if (index + 1 < period) return null;
  const sum = data.slice(index - period + 1, index + 1).reduce((acc, bar) => acc + bar.close, 0);
  return sum / period;
}

/**
 * Calculate Average True Range
 */
export function calcAtr(data: Bar[], period: number): number | null {
  if (data.length < period) return null;

  const tr: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const high = data[i].high;
    const low = data[i].low;
    const prevClose = i > 0 ? data[i - 1].close : data[i].close;

    const trValue = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    tr.push(trValue);
  }

  const atr = tr.slice(-period).reduce((acc, val) => acc + val, 0) / period;
  return atr;
}

/**
 * Calculate IBD RS Score
 * Weighted average of quarterly outperformance vs benchmark: 40/20/20/20
 */
export function ibdRs(stockData: Bar[], benchmarkData: Bar[]): number {
  if (stockData.length < 60 || benchmarkData.length < 60) return 0;

  const stockRets: number[] = [];
  const benchRets: number[] = [];

  // Calculate returns for both
  for (let i = 1; i < Math.min(stockData.length, benchmarkData.length); i++) {
    const stockRet = (stockData[i].close - stockData[i - 1].close) / stockData[i - 1].close;
    const benchRet = (benchmarkData[i].close - benchmarkData[i - 1].close) / benchmarkData[i - 1].close;

    stockRets.push(stockRet);
    benchRets.push(benchRet);
  }

  // Get last 252 trading days (1 year)
  const recent = Math.min(252, stockRets.length);

  // Q1 (most recent), Q2, Q3, Q4
  const q1End = recent;
  const q1Start = Math.max(0, recent - 63); // ~63 trading days per quarter
  const q2Start = Math.max(0, q1Start - 63);
  const q3Start = Math.max(0, q2Start - 63);
  const q4Start = Math.max(0, q3Start - 63);

  const calculateQuarterlyPerformance = (start: number, end: number): number => {
    if (start >= end) return 0;

    const stockQ = stockRets
      .slice(stockRets.length - end, stockRets.length - start)
      .reduce((a, b) => a + b, 0);
    const benchQ = benchRets
      .slice(benchRets.length - end, benchRets.length - start)
      .reduce((a, b) => a + b, 0);

    const outperformance = stockQ - benchQ;
    return Math.max(0, Math.min(100, 50 + outperformance * 500)); // Scale to 0-100
  };

  const q1 = calculateQuarterlyPerformance(q1Start, q1End);
  const q2 = calculateQuarterlyPerformance(q2Start, q2Start + 63);
  const q3 = calculateQuarterlyPerformance(q3Start, q3Start + 63);
  const q4 = calculateQuarterlyPerformance(q4Start, q4Start + 63);

  // Weighted average: 40/20/20/20
  const rs = (q1 * 0.4 + q2 * 0.2 + q3 * 0.2 + q4 * 0.2) / 100;
  return Math.round(rs * 100) / 100;
}

/**
 * Check if stock passes liquidity requirements
 */
export function passesLiquidity(
  data: Bar[],
  price: number,
  avgVolume50: number
): boolean {
  if (price < MIN_PRICE) return false;

  const adv = price * avgVolume50;
  return adv >= MIN_ADV_SHARES;
}

/**
 * Check Minervini Trend Template (9 criteria)
 */
export function checkTrendTemplate(data: Bar[]): boolean {
  if (data.length < 200) return false;

  const price = data[data.length - 1].close;
  const ma50 = sma(data, 50);
  const ma150 = sma(data, 150);
  const ma200 = sma(data, 200);

  if (!ma50 || !ma150 || !ma200) return false;

  // 1. Price > MA50
  if (price <= ma50) return false;

  // 2. Price > MA150
  if (price <= ma150) return false;

  // 3. Price > MA200
  if (price <= ma200) return false;

  // 4. MA150 > MA200
  if (ma150 <= ma200) return false;

  // 5. MA50 > MA150
  if (ma50 <= ma150) return false;

  // 6. MA50 > MA200
  if (ma50 <= ma200) return false;

  // 7. MA200 rising over 21 days
  const ma200_21days_ago = smaAt(data, 200, data.length - 1 - MA200_RISE_DAYS);
  if (!ma200_21days_ago || ma200 <= ma200_21days_ago) return false;

  // 8. Find 52-week high/low
  const oneYearAgo = data.length - 252;
  const high52w = Math.max(
    ...data.slice(Math.max(0, oneYearAgo)).map((bar) => bar.high)
  );
  const low52w = Math.min(
    ...data.slice(Math.max(0, oneYearAgo)).map((bar) => bar.low)
  );

  // 8. Price >= 30% above 52-week low
  if (price < low52w * DIST_52W_LOW) return false;

  // 9. Price within 25% of 52-week high (0.75 to 1.0)
  if (price / high52w < MAX_52W_HIGH || price / high52w > 1.0) return false;

  return true;
}

/**
 * Check if stock passes VCP (Volatility Contraction Pattern)
 */
export function checkVcp(data: Bar[]): boolean {
  if (data.length < 65) return false;

  const price = data[data.length - 1].close;
  const atr = calcAtr(data, 20);
  const avgVol50 = sma(data.map((d) => ({ ...d, close: d.volume })), 50);

  if (!atr || !avgVol50) return false;

  // 1. ATR contracting: recent ATR < historical ATR * ratio
  const historicalAtr = calcAtr(data, 20);
  if (!historicalAtr) return false;

  const recentData = data.slice(-20);
  const recentAtr = calcAtr(recentData, 20);
  if (!recentAtr || recentAtr >= historicalAtr * VCP_ATR_RATIO) return false;

  // 2. Volume dry-up: recent volume < 50-day avg * ratio
  const currentVol = data[data.length - 1].volume;
  if (currentVol >= avgVol50 * VCP_VOL_RATIO) return false;

  // 3. Tight 10-day range
  const last10 = data.slice(-10);
  const range10d = (Math.max(...last10.map((b) => b.high)) -
                    Math.min(...last10.map((b) => b.low))) / price;
  if (range10d > VCP_RANGE_MAX) return false;

  // 4. Near 60-day high
  const high60d = Math.max(...data.slice(-60).map((b) => b.high));
  if (price < high60d * VCP_NEAR_HIGH) return false;

  // 5. No new 52-week low recently (last 10 days)
  const low52w = Math.min(...data.slice(-252).map((b) => b.low));
  const recentLow = Math.min(...data.slice(-10).map((b) => b.low));
  if (recentLow <= low52w * 1.01) return false;

  // 6. Bonus: Bollinger Band squeeze (optional, simplified)
  // This is a bonus criterion, so not required

  return true;
}

/**
 * Check if stock is breaking out
 * Returns breakout grade: 'A', 'B', 'C', or null
 */
export function checkBreakout(data: Bar[]): string | null {
  if (data.length < BO_PIVOT_BARS + 1) return null;

  const currentPrice = data[data.length - 1].close;
  const currentVolume = data[data.length - 1].volume;

  // Find pivot high (highest high of prior BO_PIVOT_BARS bars)
  const priorBars = data.slice(-BO_PIVOT_BARS - 1, -1);
  const pivotHigh = Math.max(...priorBars.map((b) => b.high));

  // Calculate 50-day average volume
  const avgVol50 = sma(data.map((d) => ({ ...d, close: d.volume })), 50);
  if (!avgVol50) return null;

  // Check if above pivot high with volume
  if (currentPrice <= pivotHigh) return null;
  if (currentVolume < avgVol50 * BO_VOL_MULT) return null;

  // Grade based on how far above pivot
  const percentAbove = (currentPrice - pivotHigh) / pivotHigh;

  if (percentAbove >= 0.04) return 'A'; // 4%+ above pivot
  if (percentAbove >= 0.02) return 'B'; // 2-4% above pivot
  return 'C'; // Less than 2% above pivot
}

/**
 * Run the full screener pipeline for a single stock
 */
export function runPipeline(
  symbol: string,
  data: Bar[],
  benchmarkData: Bar[]
): ScreenerResult | null {
  if (data.length < 200) return null;

  const price = data[data.length - 1].close;

  // Check liquidity
  const avgVol50 = sma(data.map((d) => ({ ...d, close: d.volume })), 50);
  if (!avgVol50 || !passesLiquidity(data, price, avgVol50)) return null;

  // Calculate metrics
  const ma50 = sma(data, 50);
  const ma150 = sma(data, 150);
  const ma200 = sma(data, 200);
  const atr = calcAtr(data, 14);

  if (!ma50 || !ma150 || !ma200 || !atr) return null;

  // Find 52-week high/low
  const oneYearAgo = data.length - 252;
  const high52w = Math.max(
    ...data.slice(Math.max(0, oneYearAgo)).map((bar) => bar.high)
  );
  const low52w = Math.min(
    ...data.slice(Math.max(0, oneYearAgo)).map((bar) => bar.low)
  );

  const distance52wLow = price / low52w;
  const distance52wHigh = price / high52w;

  // Calculate RS
  const rs = ibdRs(data, benchmarkData);

  // Check pattern criteria
  const passesTemplate = checkTrendTemplate(data);
  const passesVcp = checkVcp(data);
  const breakoutGrade = checkBreakout(data);
  const passesBreakout = breakoutGrade !== null;

  return {
    symbol,
    price: Math.round(price * 100) / 100,
    rs: Math.round(rs),
    grade: breakoutGrade || 'N/A',
    passesTemplate,
    passesVcp,
    passesBreakout,
    passesLiquidity: true,
    distance52wLow: Math.round(distance52wLow * 100) / 100,
    distance52wHigh: Math.round(distance52wHigh * 100) / 100,
    ma50: Math.round(ma50 * 100) / 100,
    ma150: Math.round(ma150 * 100) / 100,
    ma200: Math.round(ma200 * 100) / 100,
    atr: Math.round(atr * 100) / 100,
  };
}
