/**
 * Screener API Route
 * POST /api/screener
 *
 * Runs the Minervini SEPA stock screener on the curated universe
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  runPipeline,
  ScreenerResult,
  RS_MIN_PCT,
  RS_IDEAL_PCT,
} from '@/lib/screener';
import {
  fetchBars,
  fetchBenchmark,
  CURATED_UNIVERSE,
  getDateRange,
} from '@/lib/databento';

export const maxDuration = 60;

interface ScreenerRequest {
  apiKey: string;
}

interface ScreenerResponse {
  success: boolean;
  results?: ScreenerResult[];
  error?: string;
  timestamp?: string;
  resultsCount?: number;
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<ScreenerResponse>> {
  try {
    const body: ScreenerRequest = await request.json();

    if (!body.apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing apiKey in request body',
        },
        { status: 400 }
      );
    }

    // Get date range for last year
    const { start, end } = getDateRange(252);

    // Fetch benchmark (SPY)
    let benchmarkData;
    try {
      benchmarkData = await fetchBenchmark(body.apiKey, start, end);
      if (benchmarkData.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'Failed to fetch benchmark data (SPY)',
          },
          { status: 500 }
        );
      }
    } catch (e) {
      console.error('Error fetching benchmark:', e);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to fetch benchmark data from Databento',
        },
        { status: 500 }
      );
    }

    // Fetch bars for curated universe
    let bars;
    try {
      bars = await fetchBars(body.apiKey, CURATED_UNIVERSE, start, end);
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

    // Run screener pipeline
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
        // Continue with next symbol on error
      }
    }

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
