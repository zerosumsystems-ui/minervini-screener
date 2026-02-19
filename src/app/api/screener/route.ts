/**
 * Screener API Route
 * POST /api/screener
 *
 * Runs the Minervini SEPA stock screener on the curated universe
 */

import { NextResponse } from 'next/server';
import {
  runPipeline,
  postProcessResults,
  ScreenerResult,
} from '@/lib/screener';
import {
  fetchBars,
  fetchBenchmark,
  CURATED_UNIVERSE,
  getDateRange,
} from '@/lib/databento';

export const maxDuration = 60;

interface ScreenerResponse {
  success: boolean;
  results?: ScreenerResult[];
  error?: string;
  timestamp?: string;
  resultsCount?: number;
}

export async function POST(): Promise<NextResponse<ScreenerResponse>> {
  try {
    const apiKey = process.env.DATABENTO_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'DATABENTO_API_KEY environment variable not set',
        },
        { status: 500 }
      );
    }

    // Get date range for last year
    const { start, end } = getDateRange(252);

    // Fetch benchmark (QQQ)
    let benchmarkData;
    try {
      benchmarkData = await fetchBenchmark(apiKey, start, end);
      if (benchmarkData.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: `No benchmark bars returned for QQQ (range: ${start}-${end})`,
          },
          { status: 500 }
        );
      }
    } catch (e) {
      console.error('Error fetching benchmark:', e);
      const errMsg = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        {
          success: false,
          error: `Benchmark fetch error: ${errMsg}`,
        },
        { status: 500 }
      );
    }

    // Fetch bars for curated universe
    let bars;
    try {
      bars = await fetchBars(apiKey, CURATED_UNIVERSE, start, end);
    } catch (e) {
      console.error('Error fetching bars:', e);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to fetch price data from Databento',
        },
        { status: 500 }
      );
    }

    // Run screener pipeline for each symbol
    const results: ScreenerResult[] = [];
    for (const symbol of CURATED_UNIVERSE) {
      const stockData = bars[symbol];
      if (!stockData || stockData.length === 0) {
        console.warn(`No data found for ${symbol}`);
        continue;
      }

      try {
        const result = runPipeline(symbol, stockData, benchmarkData);
        if (result) {
          results.push(result);
        }
      } catch (e) {
        console.error(`Error screening ${symbol}:`, e);
      }
    }

    // Post-process: assign RS percentile ranks, update template with RS, assign grades
    postProcessResults(results);

    // Sort results by RS score (highest first)
    results.sort((a, b) => b.rs - a.rs);

    return NextResponse.json({
      success: true,
      results,
      timestamp: new Date().toISOString(),
      resultsCount: results.length,
    });
  } catch (e) {
    console.error('Screener error:', e);
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json(
      {
        success: false,
        error: `Screener failed: ${errorMessage}`,
      },
      { status: 500 }
    );
  }
}
