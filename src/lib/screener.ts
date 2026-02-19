/**
 * Minervini SEPA Stock Screener Core Logic
 * Implements Mark Minervini's Trend Template, VCP, and Breakout criteria
 * from "Trade Like a Stock Market Wizard"
 */

// Constants - Minervini's SEPA criteria thresholds
export const MIN_PRICE = 10;
export const MIN_ADV_DOLLARS = 20_000_000; // $20M minimum avg daily dollar volume
export const MA200_RISE_DAYS = 22; // ~1 month of trading days
export const DIST_52W_LOW = 1.25; // Price at least 25% above 52-week low
export const MAX_DIST_52W_HIGH = 0.75; // Price within 25% of 52-week high
export const VCP_ATR_RATIO = 0.75;
export const VCP_VOL_RATIO = 0.80;
export const VCP_RANGE_MAX = 0.08;
export const VCP_NEAR_HIGH = 0.85;
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
  rs: number;           // Will be set to percentile rank 1-99 after batch processing
  rawRs: number;        // Raw relative strength value before ranking
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
  templateCriteria: number; // How many of 8 trend template criteria pass (0-8)
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
  if (index + 1 < period || index >= data.length) return null;
  const sum = data.slice(index - period + 1, index + 1).reduce((acc, bar) => acc + bar.close, 0);
  return sum / period;
}

/**
 * Calculate Average True Range
 */
export function calcAtr(data: Bar[], period: number): number | null {
  if (data.length < period + 1) return null;
  const tr: number[] = [];
  for (let i = 1; i < data.length; i++) {
    const high = data[i].high;
    const low = data[i].low;
    const prevClose = data[i - 1].close;
    const trValue = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    tr.push(trValue);
  }
  const atr = tr.slice(-period).reduce((acc, val) => acc + val, 0) / period;
  return atr;
}

/**
 * Calculate average volume over N periods
 */
function avgVolume(data: Bar[], period: number): number | null {
  if (data.length < period) return null;
  return data.slice(-period).reduce((acc, bar) => acc + bar.volume, 0) / period;
}

/**
 * Calculate raw relative strength vs benchmark
 * Returns a raw score (not percentile ranked) - higher is better
 *
 * Uses IBD-style weighted quarterly performance:
 * Most recent quarter weighted 2x (40%), other 3 quarters 20% each
 * Measures cumulative return vs benchmark for each quarter
 */
export function calculateRawRs(stockData: Bar[], benchmarkData: Bar[]): number {
  if (stockData.length < 60 || benchmarkData.length < 60) return 0;

  // Align data by date
  const benchMap = new Map<string, Bar>();
  for (const bar of benchmarkData) {
    benchMap.set(bar.date, bar);
  }

  // Get aligned pairs
  const aligned: { stock: Bar; bench: Bar }[] = [];
  for (const bar of stockData) {
    const benchBar = benchMap.get(bar.date);
    if (benchBar) {
      aligned.push({ stock: bar, bench: benchBar });
    }
  }

  if (aligned.length < 60) return 0;

  // Calculate cumulative returns for quarters
  const len = aligned.length;

  const calcReturn = (data: { stock: Bar; bench: Bar }[], start: number, end: number) => {
    if (start >= end || start < 0) return { stockRet: 0, benchRet: 0 };
    const stockStart = data[start].stock.close;
    const stockEnd = data[end - 1].stock.close;
    const benchStart = data[start].bench.close;
    const benchEnd = data[end - 1].bench.close;
    return {
      stockRet: (stockEnd - stockStart) / stockStart,
      benchRet: (benchEnd - benchStart) / benchStart,
    };
  };

  // Define quarters (most recent first)
  const q1End = len;
  const q1Start = Math.max(0, len - 63);
  const q2End = q1Start;
  const q2Start = Math.max(0, q2End - 63);
  const q3End = q2Start;
  const q3Start = Math.max(0, q3End - 63);
  const q4End = q3Start;
  const q4Start = Math.max(0, q4End - 63);

  const q1 = calcReturn(aligned, q1Start, q1End);
  const q2 = calcReturn(aligned, q2Start, q2End);
  const q3 = calcReturn(aligned, q3Start, q3End);
  const q4 = calcReturn(aligned, q4Start, q4End);

  // Calculate outperformance for each quarter
  const q1Out = q1.stockRet - q1.benchRet;
  const q2Out = q2.stockRet - q2.benchRet;
  const q3Out = q3.stockRet - q3.benchRet;
  const q4Out = q4.stockRet - q4.benchRet;

  // Weighted score: 40% most recent quarter, 20% each for the rest
  const rawScore = q1Out * 0.4 + q2Out * 0.2 + q3Out * 0.2 + q4Out * 0.2;

  return rawScore;
}

/**
 * Convert raw RS scores to percentile ranks (1-99)
 * This mimics IBD's RS Rating which is a percentile rank
 */
export function assignPercentileRanks(results: ScreenerResult[]): void {
  if (results.length === 0) return;

  // Sort by rawRs ascending
  const sorted = [...results].sort((a, b) => a.rawRs - b.rawRs);

  // Assign percentile ranks
  for (let i = 0; i < sorted.length; i++) {
    const percentile = Math.round(((i + 1) / sorted.length) * 99);
    sorted[i].rs = Math.max(1, Math.min(99, percentile));
  }
}

/**
 * Check if stock passes liquidity requirements
 */
export function passesLiquidity(
  data: Bar[],
  price: number,
  avgVol50: number
): boolean {
  if (price < MIN_PRICE) return false;
  const adv = price * avgVol50;
  return adv >= MIN_ADV_DOLLARS;
}

/**
 * Check Minervini Trend Template (8 criteria from "Trade Like a Stock Market Wizard")
 * Returns number of criteria passed and whether all pass
 */
export function checkTrendTemplate(data: Bar[]): { passes: boolean; criteriaCount: number } {
  const result = { passes: false, criteriaCount: 0 };

  if (data.length < 200) return result;

  const price = data[data.length - 1].close;
  const ma50 = sma(data, 50);
  const ma150 = sma(data, 150);
  const ma200 = sma(data, 200);

  if (!ma50 || !ma150 || !ma200) return result;

  // 1. Current price above both the 150-day and 200-day MA
  if (price > ma150 && price > ma200) result.criteriaCount++;

  // 2. The 150-day MA is above the 200-day MA
  if (ma150 > ma200) result.criteriaCount++;

  // 3. The 200-day MA is trending up for at least 1 month (22 trading days)
  const ma200_ago = smaAt(data, 200, data.length - 1 - MA200_RISE_DAYS);
  if (ma200_ago && ma200 > ma200_ago) result.criteriaCount++;

  // 4. The 50-day MA is above both the 150-day and 200-day MA
  if (ma50 > ma150 && ma50 > ma200) result.criteriaCount++;

  // 5. The current price is above the 50-day MA
  if (price > ma50) result.criteriaCount++;

  // 6. The current price is at least 25% above the 52-week low
  const oneYearData = data.slice(Math.max(0, data.length - 252));
  const low52w = Math.min(...oneYearData.map((bar) => bar.low));
  if (price >= low52w * DIST_52W_LOW) result.criteriaCount++;

  // 7. The current price is within 25% of the 52-week high
  const high52w = Math.max(...oneYearData.map((bar) => bar.high));
  const pctOf52wHigh = price / high52w;
  if (pctOf52wHigh >= MAX_DIST_52W_HIGH) result.criteriaCount++;

  // 8. The RS rating is no less than 70 (this will be checked after percentile ranking)
  // We skip this here since RS requires batch processing
  // Instead count it as criteria 8 in the route after ranking

  // Minervini requires all 7 structural criteria to pass (RS checked separately)
  result.passes = result.criteriaCount >= 7;

  return result;
}

/**
 * Check if stock passes VCP (Volatility Contraction Pattern)
 * Looks for tightening price action with volume dry-up
 */
export function checkVcp(data: Bar[]): boolean {
  if (data.length < 65) return false;

  const price = data[data.length - 1].close;
  const atr14 = calcAtr(data, 14);
  const avgVol50 = avgVolume(data, 50);

  if (!atr14 || !avgVol50) return false;

  // 1. ATR contracting: compare recent vs longer-term ATR
  const longerData = data.slice(-60);
  const longerAtr = calcAtr(longerData, 14);
  const recentData = data.slice(-20);
  const recentAtr = calcAtr(recentData, 14);

  if (!longerAtr || !recentAtr) return false;
  if (recentAtr >= longerAtr * VCP_ATR_RATIO) return false;

  // 2. Volume dry-up: recent 5-day avg volume < 50-day avg * ratio
  const recentAvgVol = avgVolume(data, 5);
  if (!recentAvgVol || recentAvgVol >= avgVol50 * VCP_VOL_RATIO) return false;

  // 3. Tight recent range: 10-day range < 8% of price
  const last10 = data.slice(-10);
  const range10d = (Math.max(...last10.map((b) => b.high)) - Math.min(...last10.map((b) => b.low))) / price;
  if (range10d > VCP_RANGE_MAX) return false;

  // 4. Price near 60-day high (within 15%)
  const high60d = Math.max(...data.slice(-60).map((b) => b.high));
  if (price < high60d * VCP_NEAR_HIGH) return false;

  // 5. Not making new 52-week lows
  const low52w = Math.min(...data.slice(-252).map((b) => b.low));
  const recentLow = Math.min(...data.slice(-10).map((b) => b.low));
  if (recentLow <= low52w * 1.02) return false;

  return true;
}

/**
 * Check if stock is breaking out of a consolidation
 * Returns breakout grade: 'A', 'B', 'C', or null
 */
export function checkBreakout(data: Bar[]): string | null {
  if (data.length < BO_PIVOT_BARS + 5) return null;

  const today = data[data.length - 1];
  const currentPrice = today.close;
  const currentVolume = today.volume;

  // Find pivot high (highest high of prior BO_PIVOT_BARS bars, excluding today)
  const priorBars = data.slice(-BO_PIVOT_BARS - 1, -1);
  const pivotHigh = Math.max(...priorBars.map((b) => b.high));

  // Calculate 50-day average volume
  const avgVol50 = avgVolume(data, 50);
  if (!avgVol50) return null;

  // Price must close above the pivot high
  if (currentPrice <= pivotHigh) return null;

  // Volume must be above average * multiplier
  if (currentVolume < avgVol50 * BO_VOL_MULT) return null;

  // Verify it's actually coming out of a base (not already extended)
  // Check that the stock was consolidating in the prior 20 bars
  const last20 = data.slice(-21, -1);
  const range20 = (Math.max(...last20.map(b => b.high)) - Math.min(...last20.map(b => b.low))) / currentPrice;
  if (range20 > 0.25) return null; // Too wide a range = not a proper base

  // Grade based on how far above pivot and volume surge
  const percentAbove = (currentPrice - pivotHigh) / pivotHigh;
  const volumeRatio = currentVolume / avgVol50;

  if (percentAbove >= 0.03 && volumeRatio >= 2.0) return 'A'; // Strong breakout
  if (percentAbove >= 0.02 && volumeRatio >= 1.5) return 'B'; // Good breakout
  return 'C'; // Marginal breakout
}

/**
 * Assign letter grades based on overall quality
 * A = Breakout + Template + High RS
 * B = Template + VCP + Good RS
 * C = Template only or partial
 */
function assignGrade(result: ScreenerResult): string {
  if (result.passesBreakout && result.passesTemplate && result.rs >= 80) return 'A';
  if (result.passesBreakout && result.passesTemplate) return 'B';
  if (result.passesTemplate && result.passesVcp && result.rs >= 70) return 'B';
  if (result.passesTemplate && result.rs >= 70) return 'C';
  if (result.passesTemplate) return 'D';
  return 'N/A';
}

/**
 * Run the full screener pipeline for a single stock
 * Note: RS will be raw score - must call assignPercentileRanks() after batch processing
 */
export function runPipeline(
  symbol: string,
  data: Bar[],
  benchmarkData: Bar[]
): ScreenerResult | null {
  if (data.length < 200) return null;

  const price = data[data.length - 1].close;

  // Check liquidity
  const avgVol50 = avgVolume(data, 50);
  if (!avgVol50 || !passesLiquidity(data, price, avgVol50)) return null;

  // Calculate metrics
  const ma50 = sma(data, 50);
  const ma150 = sma(data, 150);
  const ma200 = sma(data, 200);
  const atr = calcAtr(data, 14);

  if (!ma50 || !ma150 || !ma200 || !atr) return null;

  // Find 52-week high/low
  const oneYearData = data.slice(Math.max(0, data.length - 252));
  const high52w = Math.max(...oneYearData.map((bar) => bar.high));
  const low52w = Math.min(...oneYearData.map((bar) => bar.low));

  const distance52wLow = price / low52w;
  const distance52wHigh = price / high52w;

  // Calculate raw RS (will be converted to percentile later)
  const rawRs = calculateRawRs(data, benchmarkData);

  // Check pattern criteria
  const templateResult = checkTrendTemplate(data);
  const passesVcp = templateResult.passes && checkVcp(data);
  const breakoutGrade = checkBreakout(data);
  const passesBreakout = breakoutGrade !== null;

  return {
    symbol,
    price: Math.round(price * 100) / 100,
    rs: 0, // Will be set by assignPercentileRanks()
    rawRs,
    grade: 'N/A', // Will be set by assignGrade() after RS ranking
    passesTemplate: templateResult.passes,
    passesVcp,
    passesBreakout,
    passesLiquidity: true,
    distance52wLow: Math.round(distance52wLow * 100) / 100,
    distance52wHigh: Math.round(distance52wHigh * 100) / 100,
    ma50: Math.round(ma50 * 100) / 100,
    ma150: Math.round(ma150 * 100) / 100,
    ma200: Math.round(ma200 * 100) / 100,
    atr: Math.round(atr * 100) / 100,
    templateCriteria: templateResult.criteriaCount,
  };
}

/**
 * Post-process results after all stocks have been screened
 * - Assigns percentile RS ranks
 * - Re-evaluates trend template with RS criterion
 * - Assigns final grades
 */
export function postProcessResults(results: ScreenerResult[]): void {
  // Step 1: Assign percentile RS ranks
  assignPercentileRanks(results);

  // Step 2: Update template pass with RS criterion (Minervini requires RS >= 70)
  for (const result of results) {
    // If structural template passes but RS < 70, downgrade
    if (result.passesTemplate && result.rs < 70) {
      result.passesTemplate = false;
    }
    // Also re-check VCP (requires template to pass)
    if (result.passesVcp && !result.passesTemplate) {
      result.passesVcp = false;
    }
  }

  // Step 3: Assign grades
  for (const result of results) {
    result.grade = assignGrade(result);
  }
}
