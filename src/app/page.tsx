// @ts-nocheck
"use client";

import React, { useState, useMemo, useCallback } from "react";

const SYMBOLS = [
  "NVDA",
  "AAPL",
  "MSFT",
  "META",
  "GOOGL",
  "AMZN",
  "TSLA",
  "AVGO",
  "AMD",
  "CRWD",
  "PANW",
  "SMCI",
  "PLTR",
  "ARM",
  "AXON",
  "CAVA",
  "DECK",
  "HIMS",
  "DUOL",
  "ELF",
  "ONON",
  "CELH",
  "DDOG",
  "NET",
  "SNOW",
  "LLY",
  "COST",
  "CMG",
  "COIN",
  "NFLX",
];

const PRICE_MAP: Record<string, number> = {
  NVDA: 145.2, AAPL: 187.5, MSFT: 421.8, META: 562.3, GOOGL: 178.4,
  AMZN: 195.7, TSLA: 285.1, AVGO: 168.9, AMD: 145.6, CRWD: 382.4,
  PANW: 418.7, SMCI: 31.2, PLTR: 42.8, ARM: 165.3, AXON: 412.6,
  CAVA: 89.5, DECK: 782.3, HIMS: 29.4, DUOL: 31.8, ELF: 58.2,
  ONON: 24.7, CELH: 81.2, DDOG: 198.5, NET: 76.4, SNOW: 145.8,
  LLY: 892.1, COST: 934.5, CMG: 47.3, COIN: 193.2, NFLX: 287.4,
};

function generateDemoData(seed = 0) {
  const random = (min: number, max: number): number => {
    const rand = Math.sin(seed++) * 10000;
    return min + ((rand - Math.floor(rand)) * (max - min));
  };
  const breakoutSymbols = SYMBOLS.slice(0, 3);
  const vcpSymbols = SYMBOLS.slice(3, 9);
  const monitorSymbols = SYMBOLS.slice(9);
  const createStock = (symbol: string, stage: string) => {
    const basePrice = PRICE_MAP[symbol];
    return {
      id: symbol, symbol,
      price: parseFloat((basePrice + (random(-5, 5) * 0.5)).toFixed(2)),
      ttPass: stage !== "breakout",
      ttScore: Math.floor(random(3, 9)),
      ma50: parseFloat((basePrice * random(0.95, 1.02)).toFixed(2)),
      ma150: parseFloat((basePrice * random(0.9, 1.05)).toFixed(2)),
      ma200: parseFloat((basePrice * random(0.88, 1.08)).toFixed(2)),
      pctAboveLow: Math.round(random(20, 95)),
      pctBelowHigh: Math.round(random(5, 45)),
      rsPct: Math.round(random(55, 99)),
      vcpPass: stage === "vcp" || Math.random() > 0.5,
      atrRatio: parseFloat(random(0.3, 0.9).toFixed(2)),
      volRatio: parseFloat(random(0.3, 0.9).toFixed(2)),
      range10dPct: parseFloat(random(1, 12).toFixed(2)),
      bbSqueeze: Math.random() > 0.6,
      breakout: stage === "breakout",
      boQuality: stage === "breakout" ? ["A", "B"][Math.floor(random(0, 2))] : "none",
      pivot: parseFloat((basePrice * random(0.95, 1.05)).toFixed(2)),
      rvol: parseFloat(random(0.8, 2.5).toFixed(2)),
      priorityScore: Math.floor(random(3, 10)),
      stage,
    };
  };
  const stocks = [
    ...breakoutSymbols.map((s) => createStock(s, "breakout")),
    ...vcpSymbols.map((s) => createStock(s, "vcp")),
    ...monitorSymbols.map((s) => createStock(s, "monitor")),
  ];
  return stocks.sort((a, b) => b.priorityScore - a.priorityScore);
}

function MinerviniScreener() {
  const [data, setData] = useState(() => generateDemoData());
  const [activeTab, setActiveTab] = useState("breakout");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortColumn, setSortColumn] = useState("priorityScore");
  const [sortDirection, setSortDirection] = useState("desc");
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [toast, setToast] = useState("");
  const tabCounts = useMemo(() => {
    const breakouts = data.filter((s) => s.stage === "breakout").length;
    const vcp = data.filter((s) => s.stage === "vcp").length;
    const monitor = data.filter((s) => s.stage === "monitor").length;
    return { breakout: breakouts, vcp, monitor };
  }, [data]);
  const filteredData = useMemo(() => {
    let filtered = data.filter((s) => s.stage === activeTab);
    if (searchQuery) {
      const query = searchQuery.toUpperCase();
      filtered = filtered.filter((s) => s.symbol.includes(query));
    }
    filtered.sort((a, b) => {
      const aVal = (a as any)[sortColumn];
      const bVal = (b as any)[sortColumn];
      if (typeof aVal === "string") {
        return sortDirection === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
    });
    return filtered;
  }, [data, activeTab, searchQuery, sortColumn, sortDirection]);
  const selectedStock = useMemo(() => data.find((s) => s.id === selectedId), [data, selectedId]);
  const handleSort = useCallback((column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
  }, [sortColumn, sortDirection]);
  const handleDemo = () => {
    setData(generateDemoData(Date.now()));
    setSelectedId(null);
    setToast("Demo data regenerated");
    setTimeout(() => setToast(""), 2000);
  };
  const handleRunScreener = async () => {
    if (!apiKey) { setToast("Please enter an API key"); setTimeout(() => setToast(""), 2000); return; }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setToast("API connection coming soon \u2014 use demo data for now");
      setTimeout(() => setToast(""), 3000);
    }, 2000);
  };
  const getTabColumns = () => {
    switch (activeTab) {
      case "breakout":
        return [
          { key: "symbol", label: "Symbol", width: "w-20" },
          { key: "price", label: "Price", width: "w-24" },
          { key: "rsPct", label: "RS %", width: "w-20" },
          { key: "rvol", label: "RVOL", width: "w-20" },
          { key: "boQuality", label: "Grade", width: "w-20" },
          { key: "priorityScore", label: "Score", width: "w-20" },
        ];
      case "vcp":
        return [
          { key: "symbol", label: "Symbol", width: "w-20" },
          { key: "price", label: "Price", width: "w-24" },
          { key: "rsPct", label: "RS %", width: "w-20" },
          { key: "atrRatio", label: "ATR Ratio", width: "w-24" },
          { key: "volRatio", label: "Vol Ratio", width: "w-24" },
          { key: "range10dPct", label: "Range %", width: "w-20" },
          { key: "bbSqueeze", label: "BB", width: "w-16" },
          { key: "priorityScore", label: "Score", width: "w-20" },
        ];
      default:
        return [
          { key: "symbol", label: "Symbol", width: "w-20" },
          { key: "price", label: "Price", width: "w-24" },
          { key: "rsPct", label: "RS %", width: "w-20" },
          { key: "ttScore", label: "TT Score", width: "w-20" },
          { key: "pctBelowHigh", label: "%Below High", width: "w-24" },
          { key: "priorityScore", label: "Score", width: "w-20" },
        ];
    }
  };
  const formatValue = (val: any, key: string) => {
    if (key === "price") return `$${val.toFixed(2)}`;
    if (key === "rvol" || key === "atrRatio" || key === "volRatio") return val.toFixed(2);
    if (key === "range10dPct") return `${val.toFixed(1)}%`;
    if (key === "bbSqueeze") return val ? "\u2713" : "\u2014";
    return val;
  };
  const getRsColor = (rs: number) => {
    if (rs >= 90) return "text-yellow-400 font-semibold";
    if (rs >= 70) return "text-emerald-400 font-semibold";
    return "text-gray-400";
  };
  const getGradeColor = (grade: string) => {
    if (grade === "A") return "text-emerald-400 font-bold";
    if (grade === "B") return "text-amber-400 font-bold";
    if (grade === "C") return "text-red-400 font-bold";
    return "text-gray-500";
  };
  return (
    <div className="min-h-screen bg-[#030712] text-gray-100 font-sans">
      <div className="bg-gradient-to-b from-gray-900/80 to-transparent border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-white">Minervini</span>
              <span className="text-2xl font-bold text-yellow-400">SEPA</span>
            </div>
            <div className="flex items-center gap-3">
              <input type="password" placeholder="API Key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-100 placeholder-gray-500 w-40 focus:outline-none focus:border-gray-600" />
              <button onClick={handleRunScreener} disabled={loading} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-gray-900 font-semibold rounded transition disabled:opacity-50">
                {loading ? "Screening..." : "Run Screener"}
              </button>
              <button onClick={handleDemo} className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded transition">Demo</button>
            </div>
          </div>
          <div className="text-xs text-gray-500 font-mono">
            Ready \u2014 {tabCounts.breakout} breakouts \u00b7 {tabCounts.vcp} VCP \u00b7{" "}{tabCounts.monitor} monitoring
          </div>
          {toast && (<div className="mt-3 px-3 py-2 bg-blue-500/20 border border-blue-500/50 rounded text-blue-300 text-sm">{toast}</div>)}
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="mb-6 border-b border-gray-800">
          <div className="flex gap-2">
            {[
              { id: "breakout", label: "\ud83d\udd25 Breakouts", count: tabCounts.breakout },
              { id: "vcp", label: "\ud83c\udfaf VCP", count: tabCounts.vcp },
              { id: "monitor", label: "\ud83d\udcca Monitor", count: tabCounts.monitor },
            ].map((tab) => (
              <button key={tab.id} onClick={() => { setActiveTab(tab.id); setSelectedId(null); setSortColumn("priorityScore"); setSortDirection("desc"); }}
                className={`px-4 py-3 font-semibold text-sm border-b-2 transition ${activeTab === tab.id ? "border-emerald-400 text-emerald-400" : "border-transparent text-gray-500 hover:text-gray-300"}`}>
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
        </div>
        <div className="mb-4">
          <input type="text" placeholder="Search by symbol..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-100 placeholder-gray-500 w-48 focus:outline-none focus:border-gray-600" />
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-800/50 border-b border-gray-800">
              <tr>
                {getTabColumns().map((col) => (
                  <th key={col.key} onClick={() => handleSort(col.key)} className={`px-4 py-3 text-left font-semibold text-gray-400 cursor-pointer hover:text-gray-200 transition ${col.width}`}>
                    {col.label}
                    {sortColumn === col.key && (<span className="ml-1">{sortDirection === "asc" ? "\u2191" : "\u2193"}</span>)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredData.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">No stocks found</td></tr>
              ) : (
                filteredData.map((stock) => (
                  <tr key={stock.id} onClick={() => setSelectedId(stock.id)} className={`border-b border-gray-800 cursor-pointer transition ${selectedId === stock.id ? "bg-gray-800/60" : "hover:bg-gray-800/30"}`}>
                    {getTabColumns().map((col) => {
                      const val = (stock as Record<string, unknown>)[col.key];
                      let cellClass = "px-4 py-3 text-gray-200";
                      if (col.key === "price") cellClass += " font-mono text-right";
                      if (col.key === "rsPct") cellClass += ` font-mono ${getRsColor(val)}`;
                      if (col.key === "boQuality") cellClass += ` font-mono ${getGradeColor(val)}`;
                      if (["rvol", "atrRatio", "volRatio", "ttScore", "priorityScore"].includes(col.key)) cellClass += " font-mono text-right text-gray-300";
                      if (col.key === "bbSqueeze") cellClass += ` font-mono text-center ${val ? "text-emerald-400" : ""}`;
                      if (["range10dPct", "pctBelowHigh"].includes(col.key)) cellClass += " font-mono text-right text-gray-300";
                      return (<td key={col.key} className={cellClass}>{formatValue(val, col.key)}</td>);
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {selectedStock && (
          <div className="mt-6 p-6 bg-gray-900 border border-gray-800 rounded-lg">
            <div className="grid grid-cols-3 gap-8">
              <div>
                <div className="text-gray-500 text-xs uppercase tracking-wide mb-1">Symbol</div>
                <div className="text-3xl font-bold text-white mb-4">{selectedStock.symbol}</div>
                <div className="space-y-2 text-sm">
                  <div><span className="text-gray-500">Price:</span><span className="text-gray-100 ml-2 font-mono font-semibold">${selectedStock.price.toFixed(2)}</span></div>
                  <div><span className="text-gray-500">RS %:</span><span className={`ml-2 font-mono font-semibold ${getRsColor(selectedStock.rsPct)}`}>{selectedStock.rsPct}</span></div>
                </div>
              </div>
              <div>
                <div className="text-gray-500 text-xs uppercase tracking-wide mb-3">Setup Details</div>
                <div className="space-y-2 text-sm">
                  <div><span className="text-gray-500">Stage:</span><span className="text-gray-100 ml-2 font-semibold capitalize">{selectedStock.stage}</span></div>
                  {selectedStock.stage === "breakout" && (
                    <div><span className="text-gray-500">Grade:</span><span className={`ml-2 font-mono font-bold ${getGradeColor(selectedStock.boQuality)}`}>{selectedStock.boQuality}</span></div>
                  )}
                  <div><span className="text-gray-500">RVOL:</span><span className="text-gray-100 ml-2 font-mono">{selectedStock.rvol.toFixed(2)}x</span></div>
                  <div><span className="text-gray-500">Priority:</span><span className="text-amber-400 ml-2 font-mono font-semibold">{selectedStock.priorityScore}</span></div>
                </div>
              </div>
              <div>
                <div className="text-gray-500 text-xs uppercase tracking-wide mb-3">Key Metrics</div>
                <div className="space-y-2 text-sm">
                  <div><span className="text-gray-500">50MA:</span><span className="text-gray-100 ml-2 font-mono">${selectedStock.ma50.toFixed(2)}</span></div>
                  <div><span className="text-gray-500">200MA:</span><span className="text-gray-100 ml-2 font-mono">${selectedStock.ma200.toFixed(2)}</span></div>
                  <div><span className="text-gray-500">BB Squeeze:</span><span className={`ml-2 ${selectedStock.bbSqueeze ? "text-emerald-400 font-semibold" : "text-gray-500"}`}>{selectedStock.bbSqueeze ? "Yes" : "No"}</span></div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default MinerviniScreener;
