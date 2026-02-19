/**
 * Databento API Client
 * Handles historical OHLCV data fetching from Databento
 */

import { Bar } from './screener';

export const CURATED_UNIVERSE = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'AVGO', 'NFLX', 'AMD',
  'ADBE', 'INTU', 'NOW', 'AMAT', 'LRCX', 'ASML', 'QCOM', 'CRWD', 'PANW', 'ORCL',
  'SHOP', 'UBER', 'COIN', 'SNOW', 'DDOG', 'NET', 'ARM', 'SMCI', 'MELI', 'COST',
  'ISRG', 'REGN', 'LULU', 'TTD', 'MSTR', 'HOOD', 'DUOL', 'MNST', 'FTNT', 'ON',
]

/**
 * Format date as YYYYMMDD string
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Convert nanosecond timestamp (string or number) to date string (YYYY-MM-DD)
 */
function tsToDateString(ts: string | number): string {
  const tsNum = Number(ts);
  const date = new Date(Math.floor(tsNum / 1_000_000)); // Convert nanoseconds to ms
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Create Basic auth header for Databento
 */
function createAuthHeader(apiKey: string): string {
  const credentials = Buffer.from(`${apiKey}:`).toString('base64');
  return `Basic ${credentials}`;
}

/**
 * Parse a single NDJSON record from Databento EQUS.SUMMARY response
 * Records have nested hd (header) and string values for prices
 */
function parseRecord(line: string): Bar | null {
  try {
    const record = JSON.parse(line);
    // EQUS.SUMMARY format: ts_event is in hd (header) object, values are strings
    const ts = record.hd?.ts_event || record.ts_event;
    if (!ts) return null;

    return {
      date: tsToDateString(ts),
      open: Number(record.open) / 1e9,
      high: Number(record.high) / 1e9,
      low: Number(record.low) / 1e9,
      close: Number(record.close) / 1e9,
      volume: Number(record.volume),
    };
  } catch {
    return null;
  }
}

/**
 * Fetch OHLCV bars for a single symbol from Databento
 */
async function fetchSingleSymbol(
  apiKey: string,
  symbol: string,
  start: string,
  end: string
): Promise<Bar[]> {
  const formData = new URLSearchParams();
  formData.append('dataset', 'EQUS.SUMMARY');
  formData.append('symbols', symbol);
  formData.append('schema', 'ohlcv-1d');
  formData.append('start', start);
  formData.append('end', end);
  formData.append('stype_in', 'raw_symbol');
  formData.append('encoding', 'json');

  const response = await fetch('https://hist.databento.com/v0/timeseries.get_range', {
    method: 'POST',
    headers: {
      'Authorization': createAuthHeader(apiKey),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
  });

  if (!response.ok) {
    console.warn(`Databento error for ${symbol}: ${response.status}`);
    return [];
  }

  const text = await response.text();
  const lines = text.split('\n').filter((line) => line.trim().length > 0);
  const bars: Bar[] = [];

  for (const line of lines) {
    const bar = parseRecord(line);
    if (bar) bars.push(bar);
  }

  bars.sort((a, b) => a.date.localeCompare(b.date));
  return bars;
}

/**
 * Fetch OHLCV bars from Databento
 * Fetches each symbol individually (EQUS.SUMMARY doesn't include symbol in records)
 * Uses parallel requests with concurrency limit
 */
export async function fetchBars(
  apiKey: string,
  symbols: string[],
  start: string,
  end: string
): Promise<Record<string, Bar[]>> {
  const result: Record<string, Bar[]> = {};
  const concurrency = 40;

  for (let i = 0; i < symbols.length; i += concurrency) {
    const batch = symbols.slice(i, Math.min(i + concurrency, symbols.length));
    const promises = batch.map(symbol => fetchSingleSymbol(apiKey, symbol, start, end));
    const results = await Promise.allSettled(promises);

    results.forEach((r, idx) => {
      if (r.status === 'fulfilled' && r.value.length > 0) {
        result[batch[idx]] = r.value;
      }
    });
  }

  return result;
}

/**
 * Fetch QQQ benchmark data
 */
export async function fetchBenchmark(
  apiKey: string,
  start: string,
  end: string
): Promise<Bar[]> {
  const bars = await fetchSingleSymbol(apiKey, 'QQQ', start, end);
  return bars;
}

/**
 * Get date range for last N days of trading
 * Defaults to 1 year of data
 */
export function getDateRange(tradingDaysBack: number = 252): {
  start: string;
  end: string;
} {
  const end = new Date(); end.setDate(end.getDate() + 1); // +1 because Databento end date is exclusive
  // Approximate: each year has ~252 trading days
  const start = new Date(end.getTime() - (tradingDaysBack / 252) * 365.25 * 24 * 60 * 60 * 1000);

  return {
    start: formatDate(start),
    end: formatDate(end),
  };
}
