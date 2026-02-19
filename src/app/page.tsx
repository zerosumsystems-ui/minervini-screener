// @ts-nocheck
"use client";

import React, { useState, useMemo, useCallback } from "react";

interface ScreenerResult {
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

interface BarData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function MiniChart({ bars }: { bars: BarData[] }) {
  if (bars.length < 2) return <div className="text-gray-500 text-sm p-4">Not enough data</div>;
  const W = 700;
  const H = 200;
  const PAD = 30;
  const closes = bars.map((b) => b.close);
  const volumes = bars.map((b) => b.volume);
  const minP = Math.min(...closes) * 0.995;
  const maxP = Math.max(...closes) * 1.005;
  const maxV = Math.max(...volumes);
  const xStep = (W - PAD * 2) / (bars.length - 1);
  const yScale = (v: number) => PAD + ((maxP - v) / (maxP - minP)) * (H - PAD * 2);
  const pricePath = closes.map((c, i) => `${i === 0 ? "M" : "L"}${PAD + i * xStep},${yScale(c)}`).join(" ");
  const areaPath = pricePath + ` L${PAD + (closes.length - 1) * xStep},${H - PAD} L${PAD},${H - PAD} Z`;
  const ma20: (number | null)[] = closes.map((_, i) => {
    if (i < 19) return null;
    const slice = closes.slice(i - 19, i + 1);
    return slice.reduce((a, b) => a + b, 0) / 20;
  });
  const ma20Path = ma20
    .map((v, i) => (v !== null ? `${ma20.slice(0, i).some((x) => x !== null) ? "L" : "M"}${PAD + i * xStep},${yScale(v)}` : ""))
    .filter(Boolean)
    .join(" ");
  const last = closes[closes.length - 1];
  const first = closes[0];
  const change = ((last - first) / first * 100).toFixed(1);
  const isUp = last >= first;
  return (
    <div className="p-4">
      <div className="flex items-center gap-4 mb-2 text-xs text-gray-400">
        <span>Close: <span className="text-gray-100 font-mono">${last.toFixed(2)}</span></span>
        <span className={isUp ? "text-emerald-400" : "text-red-400"}>{isUp ? "+" : ""}{change}%</span>
        <span>High: <span className="font-mono">${Math.max(...closes).toFixed(2)}</span></span>
        <span>Low: <span className="font-mono">${Math.min(...closes).toFixed(2)}</span></span>
        <span className="text-gray-600">120 days</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 200 }}>
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={isUp ? "#10b981" : "#ef4444"} stopOpacity="0.3" />
            <stop offset="100%" stopColor={isUp ? "#10b981" : "#ef4444"} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const y = PAD + f * (H - PAD * 2);
          const price = maxP - f * (maxP - minP);
          return (
            <g key={f}>
              <line x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="#1f2937" strokeWidth="0.5" />
              <text x={PAD - 4} y={y + 3} textAnchor="end" fill="#6b7280" fontSize="8">${price.toFixed(0)}</text>
            </g>
          );
        })}
        {bars.map((b, i) => {
          const bH = (b.volume / maxV) * 30;
          return (
            <rect key={i} x={PAD + i * xStep - xStep * 0.3} y={H - PAD - bH} width={Math.max(xStep * 0.6, 1)} height={bH} fill="#374151" opacity="0.5" />
          );
        })}
        <path d={areaPath} fill="url(#areaGrad)" />
        <path d={pricePath} fill="none" stroke={isUp ? "#10b981" : "#ef4444"} strokeWidth="1.5" />
        {ma20Path && <path d={ma20Path} fill="none" stroke="#facc15" strokeWidth="1" strokeDasharray="3,2" opacity="0.6" />}
      </svg>
      <div className="flex gap-4 mt-1 text-[10px] text-gray-500">
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5" style={{ background: isUp ? "#10b981" : "#ef4444" }} /> Price</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 border-t border-dashed border-yellow-500" /> 20MA</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 bg-gray-700 opacity-50" /> Volume</span>
      </div>
    </div>
  );
}

function MinerviniScreener() {
  const [data, setData] = useState<ScreenerResult[]>([]);
  const [activeTab, setActiveTab] = useState("breakout");
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);
  const [chartBars, setChartBars] = useState<Record<string, BarData[]>>({});
  const [chartLoading, setChartLoading] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortColumn, setSortColumn] = useState("rs");
  const [sortDirection, setSortDirection] = useState("desc");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [ran, setRan] = useState(false);

  const categorized = useMemo(() => {
    const breakouts = data.filter((s) => s.passesBreakout);
    const vcp = data.filter((s) => s.passesVcp && !s.passesBreakout);
    const monitor = data.filter((s) => s.passesTemplate && !s.passesBreakout && !s.passesVcp);
    return { breakout: breakouts, vcp, monitor };
  }, [data]);

  const tabCounts = useMemo(() => ({
    breakout: categorized.breakout.length,
    vcp: categorized.vcp.length,
    monitor: categorized.monitor.length,
  }), [categorized]);

  const filteredData = useMemo(() => {
    let list = categorized[activeTab] || [];
    if (searchQuery) {
      const q = searchQuery.toUpperCase();
      list = list.filter((s) => s.symbol.includes(q));
    }
    list = [...list].sort((a, b) => {
      const aVal = (a as any)[sortColumn];
      const bVal = (b as any)[sortColumn];
      if (typeof aVal === "string") return sortDirection === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
    });
    return list;
  }, [categorized, activeTab, searchQuery, sortColumn, sortDirection]);

  const handleSort = useCallback((col: string) => {
    if (sortColumn === col) setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    else { setSortColumn(col); setSortDirection("desc"); }
  }, [sortColumn, sortDirection]);

  const handleRunScreener = async () => {
    setLoading(true);
    setToast("");
    try {
      const res = await fetch("/api/screener", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!json.success) {
        setToast(json.error || "Screener failed");
        setTimeout(() => setToast(""), 5000);
      } else {
        setData(json.results || []);
        setRan(true);
        setToast(`Screened ${json.resultsCount} stocks`);
        setTimeout(() => setToast(""), 3000);
      }
    } catch (e) {
      setToast("Network error \u2014 check your connection");
      setTimeout(() => setToast(""), 5000);
    }
    setLoading(false);
  };

  const handleRowClick = async (symbol: string) => {
    if (expandedSymbol === symbol) { setExpandedSymbol(null); return; }
    setExpandedSymbol(symbol);
    if (chartBars[symbol]) return;
    setChartLoading(symbol);
    try {
      const res = await fetch("/api/chart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      const json = await res.json();
      if (json.success && json.bars) {
        setChartBars((prev) => ({ ...prev, [symbol]: json.bars }));
      }
    } catch {
      // silent
    }
    setChartLoading(null);
  };

  const getTabColumns = () => {
    switch (activeTab) {
      case "breakout":
        return [
          { key: "symbol", label: "Symbol" },
          { key: "price", label: "Price" },
          { key: "rs", label: "RS" },
          { key: "grade", label: "Grade" },
          { key: "distance52wHigh", label: "% of 52w Hi" },
          { key: "atr", label: "ATR" },
        ];
      case "vcp":
        return [
          { key: "symbol", label: "Symbol" },
          { key: "price", label: "Price" },
          { key: "rs", label: "RS" },
          { key: "distance52wHigh", label: "% of 52w Hi" },
          { key: "ma50", label: "50MA" },
          { key: "atr", label: "ATR" },
        ];
      default:
        return [
          { key: "symbol", label: "Symbol" },
          { key: "price", label: "Price" },
          { key: "rs", label: "RS" },
          { key: "distance52wLow", label: "vs 52w Lo" },
          { key: "distance52wHigh", label: "% of 52w Hi" },
          { key: "ma50", label: "50MA" },
        ];
    }
  };

  const formatValue = (val: any, key: string) => {
    if (val === undefined || val === null) return "\u2014";
    if (key === "price" || key === "ma50" || key === "ma150" || key === "ma200") return `$${Number(val).toFixed(2)}`;
    if (key === "atr") return Number(val).toFixed(2);
    if (key === "distance52wHigh") return `${(Number(val) * 100).toFixed(0)}%`;
    if (key === "distance52wLow") return `${(Number(val) * 100).toFixed(0)}%`;
    if (key === "rs") return Number(val).toFixed(0);
    return String(val);
  };

  const getRsColor = (rs: number) => {
    if (rs >= 90) return "text-yellow-400 font-semibold";
    if (rs >= 70) return "text-emerald-400 font-semibold";
    return "text-gray-400";
  };

  const getGradeColor = (grade: string) => {
    if (grade === "A") return "text-emerald-400 font-bold";
    if (grade === "B") return "text-amber-400 font-bold";
    return "text-gray-500";
  };

  return (
    <div className="min-h-screen bg-[#030712] text-gray-100 font-sans">
      <div className="bg-gradient-to-b from-gray-900/80 to-transparent border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-white">Minervini</span>
              <span className="text-2xl font-bold text-yellow-400">SEPA</span>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handleRunScreener} disabled={loading}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-gray-900 font-semibold rounded transition disabled:opacity-50 min-w-[120px]">
                {loading ? "Screening..." : "Run Screener"}
              </button>
            </div>
          </div>
          {ran && (
            <div className="text-xs text-gray-500 font-mono">
              {data.length} results \u2014 {tabCounts.breakout} breakouts \u00b7 {tabCounts.vcp} VCP \u00b7 {tabCounts.monitor} trend template
            </div>
          )}
          {toast && (<div className="mt-3 px-3 py-2 bg-blue-500/20 border border-blue-500/50 rounded text-blue-300 text-sm">{toast}</div>)}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {!ran && !loading && (
          <div className="text-center py-20 text-gray-500">
            <div className="text-6xl mb-4">\ud83d\udcc8</div>
            <div className="text-xl mb-2">Hit Run Screener to scan ~100 NASDAQ stocks</div>
            <div className="text-sm">Screens ~100 liquid US stocks using Minervini SEPA criteria</div>
          </div>
        )}
        {loading && (
          <div className="text-center py-20">
            <div className="text-4xl mb-4 animate-pulse">\u23f3</div>
            <div className="text-gray-400">Fetching data from Databento and running screener...</div>
            <div className="text-gray-600 text-sm mt-1">This may take up to 60 seconds</div>
          </div>
        )}
        {ran && !loading && (
          <>
            <div className="mb-6 border-b border-gray-800">
              <div className="flex gap-2">
                {[
                  { id: "breakout", label: "\ud83d\udd25 Breakouts", count: tabCounts.breakout },
                  { id: "vcp", label: "\ud83c\udfaf VCP", count: tabCounts.vcp },
                  { id: "monitor", label: "\ud83d\udcca Trend Template", count: tabCounts.monitor },
                ].map((tab) => (
                  <button key={tab.id} onClick={() => { setActiveTab(tab.id); setExpandedSymbol(null); }}
                    className={`px-4 py-3 font-semibold text-sm border-b-2 transition ${activeTab === tab.id ? "border-emerald-400 text-emerald-400" : "border-transparent text-gray-500 hover:text-gray-300"}`}>
                    {tab.label} ({tab.count})
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-4">
              <input type="text" placeholder="Search symbol..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-100 placeholder-gray-500 w-48 focus:outline-none focus:border-gray-600" />
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-800/50 border-b border-gray-800">
                  <tr>
                    {getTabColumns().map((col) => (
                      <th key={col.key} onClick={() => handleSort(col.key)}
                        className="px-4 py-3 text-left font-semibold text-gray-400 cursor-pointer hover:text-gray-200 transition">
                        {col.label}
                        {sortColumn === col.key && (<span className="ml-1">{sortDirection === "asc" ? "\u2191" : "\u2193"}</span>)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredData.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">No stocks in this category</td></tr>
                  ) : (
                    filteredData.map((stock) => (
                      <React.Fragment key={stock.symbol}>
                        <tr onClick={() => handleRowClick(stock.symbol)}
                          className={`border-b border-gray-800 cursor-pointer transition ${expandedSymbol === stock.symbol ? "bg-gray-800/60" : "hover:bg-gray-800/30"}`}>
                          {getTabColumns().map((col) => {
                            const val = (stock as any)[col.key];
                            let cls = "px-4 py-3 text-gray-200";
                            if (col.key === "symbol") cls += " font-semibold text-white";
                            if (col.key === "price") cls += " font-mono";
                            if (col.key === "rs") cls += ` font-mono ${getRsColor(val)}`;
                            if (col.key === "grade") cls += ` font-mono ${getGradeColor(val)}`;
                            if (["ma50", "ma150", "ma200", "atr"].includes(col.key)) cls += " font-mono text-gray-300";
                            if (["distance52wHigh", "distance52wLow"].includes(col.key)) cls += " font-mono text-gray-300";
                            return (<td key={col.key} className={cls}>{formatValue(val, col.key)}</td>);
                          })}
                        </tr>
                        {expandedSymbol === stock.symbol && (
                          <tr className="bg-gray-900/80">
                            <td colSpan={getTabColumns().length} className="border-b border-gray-800">
                              <div className="grid grid-cols-[1fr_280px] gap-0">
                                <div>
                                  {chartLoading === stock.symbol && (
                                    <div className="p-4 text-gray-500 text-sm animate-pulse">Loading chart...</div>
                                  )}
                                  {chartBars[stock.symbol] && <MiniChart bars={chartBars[stock.symbol]} />}
                                  {!chartLoading && !chartBars[stock.symbol] && (
                                    <div className="p-4 text-gray-600 text-sm">No chart data</div>
                                  )}
                                </div>
                                <div className="border-l border-gray-800 p-4 text-sm space-y-2">
                                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Key Metrics</div>
                                  <div><span className="text-gray-500">Price:</span> <span className="text-white font-mono">${stock.price.toFixed(2)}</span></div>
                                  <div><span className="text-gray-500">RS:</span> <span className={`font-mono ${getRsColor(stock.rs)}`}>{stock.rs}</span></div>
                                  <div><span className="text-gray-500">Grade:</span> <span className={`font-mono ${getGradeColor(stock.grade)}`}>{stock.grade}</span></div>
                                  <div><span className="text-gray-500">50 MA:</span> <span className="text-gray-300 font-mono">${stock.ma50.toFixed(2)}</span></div>
                                  <div><span className="text-gray-500">150 MA:</span> <span className="text-gray-300 font-mono">${stock.ma150.toFixed(2)}</span></div>
                                  <div><span className="text-gray-500">200 MA:</span> <span className="text-gray-300 font-mono">${stock.ma200.toFixed(2)}</span></div>
                                  <div><span className="text-gray-500">ATR:</span> <span className="text-gray-300 font-mono">{stock.atr.toFixed(2)}</span></div>
                                  <div><span className="text-gray-500">vs 52w High:</span> <span className="text-gray-300 font-mono">{(stock.distance52wHigh * 100).toFixed(0)}%</span></div>
                                  <div><span className="text-gray-500">vs 52w Low:</span> <span className="text-gray-300 font-mono">{(stock.distance52wLow * 100).toFixed(0)}%</span></div>
                                  <div className="pt-1 border-t border-gray-800 mt-2">
                                    <span className="text-gray-500">Template:</span> <span className={stock.passesTemplate ? "text-emerald-400" : "text-gray-600"}>{stock.passesTemplate ? "\u2713 Pass" : "\u2717 Fail"}</span>
                                  </div>
                                  <div><span className="text-gray-500">VCP:</span> <span className={stock.passesVcp ? "text-emerald-400" : "text-gray-600"}>{stock.passesVcp ? "\u2713 Pass" : "\u2717 Fail"}</span></div>
                                  <div><span className="text-gray-500">Breakout:</span> <span className={stock.passesBreakout ? "text-emerald-400" : "text-gray-600"}>{stock.passesBreakout ? "\u2713 Pass" : "\u2717 Fail"}</span></div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default MinerviniScreener;
