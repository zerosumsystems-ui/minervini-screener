/**
 * Chart API Route
 * POST /api/chart
 * Fetches OHLCV bars for a single symbol from Databento
 */

import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

interface ChartRequest {
  apiKey: string;
  symbol: string;
}

interface BarData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  try {
    const body: ChartRequest = await request.json();

    if (!body.apiKey || !body.symbol) {
      return NextResponse.json(
        { success: false, error: "Missing apiKey or symbol" },
        { status: 400 }
      );
    }

    const end = new Date();
    const start = new Date(end.getTime() - 120 * 24 * 60 * 60 * 1000);

    const formData = new URLSearchParams();
    formData.append("dataset", "XNAS.ITCH");
    formData.append("symbols", body.symbol);
    formData.append("schema", "ohlcv-1d");
    formData.append("start", formatDate(start));
    formData.append("end", formatDate(end));
    formData.append("stype_in", "raw_symbol");
    formData.append("encoding", "json");

    const credentials = Buffer.from(`${body.apiKey}:`).toString("base64");

    const response = await fetch(
      "https://hist.databento.com/v0/timeseries.get_range",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { success: false, error: `Databento error: ${response.status} ${errorText}` },
        { status: 500 }
      );
    }

    const text = await response.text();
    const lines = text.split("\n").filter((line) => line.trim().length > 0);
    const bars: BarData[] = [];

    for (const line of lines) {
      try {
        const record = JSON.parse(line);
        const ts = record.ts_event;
        const date = new Date(Math.floor(ts / 1_000_000));
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, "0");
        const day = String(date.getUTCDate()).padStart(2, "0");

        bars.push({
          date: `${year}-${month}-${day}`,
          open: record.open / 1e9,
          high: record.high / 1e9,
          low: record.low / 1e9,
          close: record.close / 1e9,
          volume: record.volume,
        });
      } catch {
        continue;
      }
    }

    bars.sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      success: true,
      symbol: body.symbol,
      bars,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}
