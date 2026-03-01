"use client";

import { useState, useEffect, useCallback } from "react";

interface SuburbanListing {
  id: number;
  address: string;
  suite: string | null;
  squareFeet: number | null;
  askingRent: number | null;
  rentBasis: string | null;
  occupancyCost: number | null;
  askingPrice: number | null;
  listingType: string | null;
  broker: string | null;
  brokerageFirm: string | null;
  source: string | null;
  firstSeen: string | null;
  lastSeen: string | null;
  status: string | null;
}

function getCurrentQuarter() {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return { quarter: `Q${q}`, year: now.getFullYear() };
}

export default function SuburbanOfficeTab() {
  const [data, setData] = useState<SuburbanListing[]>([]);
  const [loading, setLoading] = useState(true);
  const current = getCurrentQuarter();
  const [selQuarter, setSelQuarter] = useState(current.quarter);
  const [selYear, setSelYear] = useState(current.year);
  const [viewAll, setViewAll] = useState(false);

  const fetchData = useCallback(async () => {
    const params = viewAll ? "?viewAll=true" : `?quarter=${selQuarter}&year=${selYear}`;
    const res = await fetch(`/api/office/suburban${params}`);
    const json = await res.json();
    setData(json.data || []);
    setLoading(false);
  }, [selQuarter, selYear, viewAll]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const quarters = ["Q1", "Q2", "Q3", "Q4"];
  const years = [2025, 2026, 2027];

  return (
    <div className="space-y-4">
      {/* Quarter Selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1">
          {quarters.map((q) => (
            <button key={q} onClick={() => { setSelQuarter(q); setViewAll(false); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                !viewAll && selQuarter === q ? "bg-accent text-white" : "bg-card-hover text-muted hover:text-foreground"
              }`}>{q}</button>
          ))}
        </div>
        <select value={selYear} onChange={(e) => { setSelYear(Number(e.target.value)); setViewAll(false); }}
          className="bg-card-hover border border-card-border rounded-lg px-2 py-1.5 text-xs text-foreground">
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <button onClick={() => setViewAll(!viewAll)}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            viewAll ? "bg-accent text-white" : "bg-card-hover text-muted hover:text-foreground"
          }`}>All Time</button>
        <span className="text-xs text-muted ml-auto">
          {viewAll ? "All listings" : `${selQuarter} ${selYear}`} · {data.length} listing{data.length !== 1 ? "s" : ""}
        </span>
      </div>

      {data.length === 0 ? (
        <div className="text-center py-16 text-muted">
          <p>No suburban office listings for this period.</p>
          <p className="text-sm mt-1">Release office listings from the Scraped Data page to populate this tab.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-white">{data.length}</p>
              <p className="text-xs text-zinc-400">Listings</p>
            </div>
            <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-white">{data.filter((d) => d.listingType === "lease").length}</p>
              <p className="text-xs text-zinc-400">For Lease</p>
            </div>
            <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-white">{data.filter((d) => d.listingType === "sale").length}</p>
              <p className="text-xs text-zinc-400">For Sale</p>
            </div>
            <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-white">
                {data.reduce((sum, d) => sum + (d.squareFeet || 0), 0).toLocaleString()}
              </p>
              <p className="text-xs text-zinc-400">Total SF</p>
            </div>
          </div>

          <div className="bg-card border border-card-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-card-hover border-b border-card-border">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Address</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider">SF</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider">Net Rent</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider">Occ Cost</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider">Gross</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Broker</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">First Seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-card-border">
                  {data.map((item) => {
                    const gross = (item.askingRent && item.occupancyCost) ? item.askingRent + item.occupancyCost : null;
                    return (
                      <tr key={item.id} className="hover:bg-card-hover">
                        <td className="px-4 py-3 text-sm font-medium text-foreground">
                          {item.address}
                          {item.suite && <span className="text-muted ml-1">Suite {item.suite}</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted text-right font-mono">
                          {item.squareFeet ? item.squareFeet.toLocaleString() : "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted text-right font-mono">
                          {item.askingRent ? `$${item.askingRent.toFixed(2)}` : "—"}
                          {item.rentBasis && <div className="text-[10px] text-muted/60">{item.rentBasis}</div>}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted text-right font-mono">
                          {item.occupancyCost ? `$${item.occupancyCost.toFixed(2)}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted text-right font-mono">
                          {gross ? `$${gross.toFixed(2)}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted capitalize">{item.listingType || "—"}</td>
                        <td className="px-4 py-3 text-sm text-muted">
                          {item.broker || "—"}
                          {item.brokerageFirm && <div className="text-xs text-muted/70">{item.brokerageFirm}</div>}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted">
                          {item.firstSeen ? new Date(item.firstSeen).toLocaleDateString("en-CA") : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
