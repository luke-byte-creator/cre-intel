"use client";

import { useEffect, useState, useCallback } from "react";

interface CellData {
  value: number | null;
  isAuto: boolean;
  isOverride: boolean;
  isForecast: boolean;
}

type StatsData = Record<string, Record<string, Record<number, CellData>>>;

interface LeaderboardEntry {
  userId: number;
  name: string;
  earned: number;
}

const YEARS = [2024, 2025, 2026];

const METRIC_LABELS: Record<string, string> = {
  inventory_sf: "Total Inventory (SF)",
  occupied_sf: "Occupied Space (SF)",
  vacant_sf: "Vacant Space (SF)",
  vacancy_rate: "Vacancy Rate (%)",
  class_a_net_rent: "Class A Net Asking Rent ($/SF)",
  avg_net_rent: "Avg Net Asking Rent ($/SF)",
  absorption: "Net Absorption (SF)",
  new_supply: "New Supply (SF)",
  avg_sale_psf: "Avg Sale Price ($/SF)",
  avg_cap_rate: "Avg Cap Rate (%)",
  avg_lease_rate: "Avg Net Lease Rate ($/SF)",
  sale_comp_count: "Sale Comps Tracked",
  tracked_tenants: "Tracked Tenants",
  active_tenants: "Active Tenants",
  closed_tenants: "Closed/Vacant Tenants",
  avg_rent: "Avg Net Rent ($/SF)",
  total_buildings: "Total Buildings",
  total_units: "Total Units",
};

const SECTIONS: {
  key: string;
  label: string;
  color: string;
  borderColor: string;
  metrics: string[];
}[] = [
  {
    key: "office_downtown",
    label: "Office — Downtown CBD",
    color: "blue",
    borderColor: "border-blue-500/30",
    metrics: ["inventory_sf", "occupied_sf", "vacant_sf", "vacancy_rate", "class_a_net_rent", "avg_net_rent", "absorption", "new_supply"],
  },
  {
    key: "office_suburban",
    label: "Office — Suburban",
    color: "cyan",
    borderColor: "border-cyan-500/30",
    metrics: ["inventory_sf", "occupied_sf", "vacant_sf", "vacancy_rate", "class_a_net_rent", "avg_net_rent", "absorption", "new_supply"],
  },
  {
    key: "industrial",
    label: "Industrial",
    color: "amber",
    borderColor: "border-amber-500/30",
    metrics: ["inventory_sf", "avg_sale_psf", "avg_cap_rate", "avg_lease_rate", "sale_comp_count", "absorption", "new_supply", "vacancy_rate"],
  },
];

function formatValue(metric: string, value: number | null): string {
  if (value === null || value === undefined) return "—";
  if (metric.includes("_sf") && !metric.includes("psf") && !metric.includes("rent") && !metric.includes("rate")) {
    return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  if (metric.includes("rate")) return `${value.toFixed(2)}%`;
  if (metric.includes("rent") || metric.includes("psf")) return `$${value.toFixed(2)}`;
  if (metric.includes("count") || metric.includes("tenants") || metric.includes("buildings") || metric.includes("units")) {
    return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function MetricCell({
  cell,
  metric,
  category,
  year,
  onSave,
}: {
  cell: CellData | undefined;
  metric: string;
  category: string;
  year: number;
  onSave: (category: string, metric: string, year: number, value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState("");

  const value = cell?.value ?? null;
  const isAuto = cell?.isAuto ?? false;
  const isForecast = cell?.isForecast ?? false;

  const handleSave = () => {
    onSave(category, metric, year, inputVal);
    setEditing(false);
  };

  if (editing) {
    return (
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <input
            type="text"
            className="w-24 bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") setEditing(false);
            }}
            autoFocus
          />
          <button onClick={handleSave} className="text-emerald-400 hover:text-emerald-300 text-xs">✓</button>
          <button onClick={() => setEditing(false)} className="text-zinc-500 hover:text-zinc-300 text-xs">✕</button>
        </div>
      </td>
    );
  }

  const hasValue = value !== null;

  return (
    <td
      className={`px-3 py-2 text-sm text-right group cursor-pointer hover:bg-zinc-700/50 ${
        isForecast ? "italic text-zinc-400" : isAuto ? "text-blue-300" : "text-zinc-200"
      }`}
      onClick={() => {
        setInputVal(value !== null ? String(value) : "");
        setEditing(true);
      }}
    >
      <span className="inline-flex items-center gap-1.5">
        {hasValue ? formatValue(metric, value) : <span className="text-zinc-600">—</span>}
        {isAuto && !cell?.isOverride && (
          <span className="text-[10px] text-blue-500/60 opacity-0 group-hover:opacity-100 transition-opacity" title="Auto-calculated">⚡</span>
        )}
        {cell?.isOverride && (
          <span className="text-[10px] text-amber-500/60" title="Manual override">✎</span>
        )}
        {!hasValue && (
          <span className="text-[10px] text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity">click to edit</span>
        )}
      </span>
    </td>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<StatsData>({});
  const [loading, setLoading] = useState(true);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  const fetchData = useCallback(() => {
    fetch(`/api/market-stats?years=${YEARS.join(",")}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d.data || {});
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
    fetch("/api/credits/leaderboard")
      .then((r) => r.json())
      .then((d) => setLeaderboard(d.leaderboard || []))
      .catch(() => {});
  }, [fetchData]);

  const handleSave = async (category: string, metric: string, year: number, value: string) => {
    await fetch("/api/market-stats", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category,
        metric,
        year,
        value: value === "" ? null : value,
        isForecast: year > 2025,
      }),
    });
    fetchData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Market Statistics</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Saskatoon CRE market snapshot · <span className="text-blue-400">Blue</span> = auto-calculated · <span className="italic text-zinc-400">Italic</span> = forecast · Click any cell to edit
        </p>
      </div>

      <div className="space-y-6">
        {SECTIONS.map((section) => {
          const catData = data[section.key] || {};

          return (
            <div key={section.key} className={`bg-zinc-800/50 border ${section.borderColor} rounded-xl overflow-hidden`}>
              <div className="px-5 py-3 border-b border-zinc-700/50">
                <h2 className="text-base font-semibold text-white">{section.label}</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-zinc-700/50">
                      <th className="text-left px-5 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wider w-64">Metric</th>
                      {YEARS.map((yr) => (
                        <th key={yr} className="text-right px-3 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wider w-36">
                          {yr}{yr > 2025 ? "F" : ""}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-700/30">
                    {section.metrics.map((metric) => (
                      <tr key={metric} className="hover:bg-zinc-700/20 transition-colors">
                        <td className="px-5 py-2 text-sm text-zinc-300">{METRIC_LABELS[metric] || metric}</td>
                        {YEARS.map((yr) => (
                          <MetricCell
                            key={yr}
                            cell={catData[metric]?.[yr]}
                            metric={metric}
                            category={section.key}
                            year={yr}
                            onSave={handleSave}
                          />
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

      {/* Leaderboard */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-3">Top Contributors This Week</h2>
        <div className="bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden">
          {leaderboard.length > 0 ? (
            <div className="divide-y divide-zinc-700">
              {leaderboard.map((entry, i) => (
                <div key={entry.userId} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${
                      i === 0 ? "bg-amber-500/20 text-amber-400" : i === 1 ? "bg-zinc-400/20 text-zinc-300" : i === 2 ? "bg-orange-500/20 text-orange-400" : "bg-zinc-700 text-zinc-400"
                    }`}>{i + 1}</span>
                    <span className="text-sm text-white font-medium">{entry.name}</span>
                  </div>
                  <span className="text-sm font-bold text-emerald-400">+{entry.earned}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-4 text-sm text-zinc-500">No contributions yet this week.</div>
          )}
        </div>
      </div>
    </div>
  );
}
