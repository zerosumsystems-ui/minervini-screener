/**
 * Databento API Client
 * Handles historical OHLCV data fetching from Databento
 */

import { Bar } from './screener';

export const CURATED_UNIVERSE = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'INTC', 'CSCO', 'CMCSA',
  'NFLX', 'PYPL', 'ADBE', 'INTU', 'NOW', 'AMAT', 'LRCX', 'ASML', 'QCOM', 'AMD',
  'AVGO', 'MU', 'SNPS', 'MCHP', 'CDNS', 'NXPI', 'MRVL', 'PSTG', 'CRWD', 'ZS',
  'OKTA', 'DDOG', 'NET', 'FTNT', 'ORCL', 'SHOP', 'UBER', 'DASH', 'RBLX', 'CHWY',
  'ABNB', 'LYFT', 'ROKU', 'COIN', 'MDB', 'SNOW', 'TWLO', 'ZM', 'WDAY', 'VEEV',
  'DKNG', 'PENN', 'MSTR', 'RIOT', 'MARA', 'HOOD', 'CLSK', 'CPRT', 'UPST', 'BILL',
  'SMCI', 'PANW', 'MNST', 'TEAM', 'TTD', 'TOST', 'DUOL', 'ARM', 'ON', 'MELI',
  'LULU', 'COST', 'PDD', 'JD', 'BIDU', 'REGN', 'GILD', 'ILMN', 'ISRG', 'MRNA',
  'BIIB', 'AMGN', 'ADP', 'SBUX', 'MDLZ', 'ADI', 'KLAC', 'KDP', 'CTAS', 'EXC',
  'XEL', 'EA', 'VRSK', 'ANSS', 'IDXX', 'TTWO', 'FAST', 'FANG', 'ODFL', 'GEHC',
];

interface DatabentoRecord {
  ts_event: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  symbol?: string;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function tsToDateString(ts: number): string {
  const date = new Date(Math.floor(ts / 1_000_000));
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createAuthHeader(apiKey: string): string {
  const credentials = Buffer.from(`${apiKey}:`).toString('base64');
  return `Basic ${credentials}`;
}

export async function fetchBars(
  apiKey: string,
  symbols: string[],
  start: string,
  end: string
): Promise<Record<string, Bar[]>> {
  const result: Record<string, Bar[]> = {};
  const batchSize = 500;
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, Math.min(i + batchSize, symbols.length));
    const batchResult = await fetchBarsBatch(apiKey, batch, start, end);
    Object.assign(result, batchResult);
  }
  return result;
}

async function fetchBarsBatch(
  apiKey: string,
  symbols: string[],
  start: string,
  end: string
): Promise<Record<string, Bar[]>> {
  const symbolString = symbols.join(',');
  const formData = new URLSearchParams();
  formData.append('dataset', 'XNAS.ITCH');
  formData.append('symbols', symbolString);
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
    throw new Error(`Databento API error: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  const lines = text.split('\n').filter((line) => line.trim().length > 0);
  const result: Record<string, Bar[]> = {};

  for (const line of lines) {
    try {
      const record: DatabentoRecord = JSON.parse(line);
      const symbol = (record.symbol || 'UNKNOWN').trim();
      if (!result[symbol]) result[symbol] = [];
      result[symbol].push({
        date: tsToDateString(record.ts_event),
        open: record.open / 1e9,
        high: record.high / 1e9,
        low: record.low / 1e9,
        close: record.close / 1e9,
        volume: record.volume,
      });
    } catch (e) {
      console.warn('Failed to parse Databento record:', line);
    }
  }

  for (const symbol in result) {
    result[symbol].sort((a, b) => a.date.localeCompare(b.date));
  }
  return result;
}

export async function fetchBenchmark(
  apiKey: string,
  start: string,
  end: string
): Promise<Bar[]> {
  const result = await fetchBars(apiKey, ['QQQ'], start, end);
  let bars = result['QQQ'] || [];
  if (bars.length === 0) {
    const key = Object.keys(result).find(k => k.trim().startsWith('QQQ'));
    if (key) bars = result[key];
  }
  bars.sort((a, b) => a.date.localeCompare(b.date));
  return bars;
}

export function getDateRange(tradingDaysBack: number = 252): {
  start: string;
  end: string;
} {
  const end = new Date();
  const start = new Date(end.getTime() - (tradingDaysBack / 252) * 365.25 * 24 * 60 * 60 * 1000);
  return {
    start: formatDate(start),
    end: formatDate(end),
  };
}
