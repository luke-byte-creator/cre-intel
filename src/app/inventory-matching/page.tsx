"use client";

import { useEffect, useState, useCallback } from "react";

type Tab = "office" | "multi";
type ViewMode = "pending" | "confirmed" | "unmatched";

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);
}

export default function InventoryMatchingPage() {
  const [tab, setTab] = useState<Tab>("office");
  const [view, setView] = useState<ViewMode>("pending");
  const [items, setItems] = useState<any[]>([]);
  const [unmatched, setUnmatched] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<any[]>([]);
  const [unmatchedCount, setUnmatchedCount] = useState(0);
  const [customSearch, setCustomSearch] = useState<{ [key: number]: string }>({});
  const [customResults, setCustomResults] = useState<{ [key: number]: any[] }>({});
  const [processed, setProcessed] = useState<Set<number>>(new Set());

  const tableName = tab === "office" ? "office_buildings" : "multi_buildings";

  const fetchMatches = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/inventory-matches?table=${tableName}&status=${view}&page=${page}&limit=20`);
    const json = await res.json();
    setItems(json.data || []);
    setTotal(json.total || 0);
    setStats(json.stats || []);
    setUnmatchedCount(json.unmatchedCount || 0);
    setLoading(false);
  }, [tableName, view, page]);

  const fetchUnmatched = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/inventory-matches/unmatched?table=${tableName}&page=${page}&limit=20`);
    const json = await res.json();
    setUnmatched(json.data || []);
    setTotal(json.total || 0);
    setLoading(false);
  }, [tableName, page]);

  useEffect(() => {
    setPage(1);
    setProcessed(new Set());
  }, [tab, view]);

  useEffect(() => {
    if (view === "unmatched") fetchUnmatched();
    else fetchMatches();
  }, [view, fetchMatches, fetchUnmatched]);

  const handleAction = async (matchId: number, action: "confirm" | "reject") => {
    await fetch("/api/inventory-matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId, action }),
    });
    setProcessed(prev => new Set([...prev, matchId]));
  };

  const handleBulkConfirm = async (method: string) => {
    if (!confirm(`Bulk confirm all ${method} matches for ${tab === "office" ? "Office" : "Multi"} buildings?`)) return;
    const res = await fetch("/api/inventory-matches/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: tableName, method }),
    });
    const json = await res.json();
    alert(`Confirmed ${json.confirmed} matches`);
    fetchMatches();
  };

  const handleSearch = async (invId: number) => {
    const q = customSearch[invId];
    if (!q || q.length < 2) return;
    const res = await fetch(`/api/city-assessments/search?q=${encodeURIComponent(q)}`);
    const json = await res.json();
    setCustomResults(prev => ({ ...prev, [invId]: json.data }));
  };

  const handleManualMatch = async (invId: number, caId: number) => {
    await fetch("/api/inventory-matches/unmatched", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: tableName, inventoryId: invId, cityAssessmentId: caId }),
    });
    setProcessed(prev => new Set([...prev, invId]));
  };

  const pendingCount = stats.find((s: any) => s.status === "pending")?.cnt || 0;
  const confirmedCount = stats.find((s: any) => s.status === "confirmed")?.cnt || 0;
  const pages = Math.ceil(total / 20);

  // Get unique methods from pending matches
  const pendingMethods = new Set<string>();
  if (view === "pending") {
    items.forEach(item => item.matches?.forEach((m: any) => pendingMethods.add(m.match_method)));
  }

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Inventory → City Assessment Matching</h1>
        <p className="text-sm text-white/50">Link office and multi-family buildings to official city assessment records</p>
      </div>

      {/* Table tabs */}
      <div className="flex gap-2 mb-4">
        {(["office", "multi"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded text-sm font-medium ${tab === t ? "bg-blue-600" : "bg-white/5 hover:bg-white/10 text-white/60"}`}>
            {t === "office" ? "🏢 Office Buildings (70)" : "🏘️ Multi Buildings (602)"}
          </button>
        ))}
      </div>

      {/* View mode + stats */}
      <div className="flex items-center gap-3 mb-4">
        {(["pending", "confirmed", "unmatched"] as ViewMode[]).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`px-3 py-1.5 rounded text-xs font-medium ${view === v ? "bg-white/15 text-white" : "bg-white/5 text-white/50 hover:text-white/70"}`}>
            {v === "pending" && `Pending (${pendingCount})`}
            {v === "confirmed" && `Confirmed (${confirmedCount})`}
            {v === "unmatched" && `Unmatched (${unmatchedCount})`}
          </button>
        ))}

        {view === "pending" && pendingMethods.size > 0 && (
          <div className="flex gap-2 ml-auto">
            {Array.from(pendingMethods).map(method => (
              <button key={method} onClick={() => handleBulkConfirm(method)}
                className="px-3 py-1.5 rounded bg-green-700/50 hover:bg-green-600 text-xs font-medium">
                ✅ Bulk Confirm {method}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-white/50 text-sm py-8 text-center">Loading...</div>
      ) : view === "unmatched" ? (
        /* Unmatched view */
        <div className="space-y-3">
          {unmatched.map((inv: any) => (
            <div key={inv.id} className={`bg-white/5 rounded-lg p-4 border border-white/10 ${processed.has(inv.id) ? "opacity-30" : ""}`}>
              <div className="font-medium">
                {inv.street_number ? `${inv.street_number} ${inv.address}` : inv.address}
                {inv.building_name && <span className="text-white/40 ml-2 text-sm">({inv.building_name})</span>}
              </div>
              {inv.property_owner && <div className="text-xs text-white/40">Owner: {inv.property_owner}</div>}
              <div className="mt-2 flex items-center gap-2">
                <input type="text" placeholder="Search city records..."
                  value={customSearch[inv.id] || ""}
                  onChange={e => setCustomSearch(prev => ({ ...prev, [inv.id]: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && handleSearch(inv.id)}
                  className="px-2 py-1 rounded bg-white/5 border border-white/10 text-xs w-48" />
                <button onClick={() => handleSearch(inv.id)} className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-xs">🔍</button>
              </div>
              {customResults[inv.id]?.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between bg-blue-900/10 rounded px-3 py-2 mt-1 hover:bg-blue-900/20">
                  <div className="flex-1">
                    <span className="text-sm">{c.full_address}</span>
                    <span className="text-xs text-white/40 ml-3">{c.property_use_group} · {c.neighbourhood} · {fmt(c.assessed_value)}</span>
                  </div>
                  <button onClick={() => handleManualMatch(inv.id, c.id)} disabled={processed.has(inv.id)}
                    className="px-3 py-1 rounded bg-green-700/50 hover:bg-green-600 text-xs font-medium ml-2 disabled:opacity-30">Match ✓</button>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        /* Pending / Confirmed view */
        <div className="space-y-3">
          {items.map(({ inventory: inv, matches }: any) => (
            <div key={inv.id} className="bg-white/5 rounded-lg p-4 border border-white/10">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="font-medium">
                    {inv.street_number ? `${inv.street_number} ${inv.address}` : inv.address}
                    {inv.building_name && <span className="text-white/40 ml-2 text-sm">({inv.building_name})</span>}
                  </div>
                  {inv.owner && <div className="text-xs text-white/40">Owner: {inv.owner}</div>}
                  {inv.property_owner && <div className="text-xs text-white/40">Owner: {inv.property_owner}</div>}
                  {inv.total_sf && <div className="text-xs text-white/40">SF: {Number(inv.total_sf).toLocaleString()}</div>}
                </div>
              </div>
              <div className="space-y-1">
                {matches.map((m: any) => (
                  <div key={m.match_id} className={`flex items-center justify-between rounded px-3 py-2 ${
                    m.status === "confirmed" ? "bg-green-900/10" : "bg-white/[0.03] hover:bg-white/[0.06]"
                  } ${processed.has(m.match_id) ? "opacity-30" : ""}`}>
                    <div className="flex-1">
                      <span className="text-sm">{m.full_address}</span>
                      <span className="text-xs text-white/40 ml-3">
                        {m.match_method} ({(m.confidence * 100).toFixed(0)}%) · {m.property_use_group} · {m.neighbourhood} · {fmt(m.assessed_value)}
                      </span>
                    </div>
                    {m.status === "pending" && (
                      <div className="flex gap-1 ml-2">
                        <button onClick={() => handleAction(m.match_id, "confirm")} disabled={processed.has(m.match_id)}
                          className="px-2 py-1 rounded bg-green-700/50 hover:bg-green-600 text-xs disabled:opacity-30">✓</button>
                        <button onClick={() => handleAction(m.match_id, "reject")} disabled={processed.has(m.match_id)}
                          className="px-2 py-1 rounded bg-red-900/50 hover:bg-red-800 text-xs disabled:opacity-30">✕</button>
                      </div>
                    )}
                    {m.status === "confirmed" && <span className="text-xs text-green-400 ml-2">✓ Confirmed</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center gap-2 mt-4">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="px-3 py-1 rounded bg-white/5 hover:bg-white/10 disabled:opacity-30 text-sm">← Prev</button>
          <span className="text-sm text-white/50">Page {page} of {pages}</span>
          <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
            className="px-3 py-1 rounded bg-white/5 hover:bg-white/10 disabled:opacity-30 text-sm">Next →</button>
        </div>
      )}
    </div>
  );
}
