"use client";

import { useEffect, useState, useCallback } from "react";

type Tab = "overview" | "records" | "matches" | "unmatched-city" | "unmatched-ours";

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-CA").format(n);
}

export default function CityDataPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<any>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [matches, setMatches] = useState<any[]>([]);
  const [matchesTotal, setMatchesTotal] = useState(0);
  const [unmatchedCity, setUnmatchedCity] = useState<any[]>([]);
  const [unmatchedCityTotal, setUnmatchedCityTotal] = useState(0);
  const [unmatchedOurs, setUnmatchedOurs] = useState<any[]>([]);
  const [unmatchedOursTotal, setUnmatchedOursTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [useGroup, setUseGroup] = useState("");
  const [running, setRunning] = useState(false);

  const fetchStats = useCallback(async () => {
    const res = await fetch("/api/city-assessments/stats");
    setStats(await res.json());
  }, []);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "50" });
    if (search) params.set("search", search);
    if (useGroup) params.set("useGroup", useGroup);
    const res = await fetch(`/api/city-assessments?${params}`);
    const json = await res.json();
    setRecords(json.data);
    setRecordsTotal(json.total);
    setLoading(false);
  }, [page, search, useGroup]);

  const fetchMatches = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/city-assessments/matches?page=${page}&limit=50`);
    const json = await res.json();
    setMatches(json.data);
    setMatchesTotal(json.total);
    setLoading(false);
  }, [page]);

  const fetchUnmatchedCity = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/city-assessments?matched=no&page=${page}&limit=50`);
    const json = await res.json();
    setUnmatchedCity(json.data);
    setUnmatchedCityTotal(json.total);
    setLoading(false);
  }, [page]);

  const fetchUnmatchedOurs = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/city-assessments/unmatched-properties?page=${page}&limit=50`);
    const json = await res.json();
    setUnmatchedOurs(json.data);
    setUnmatchedOursTotal(json.total);
    setLoading(false);
  }, [page]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  useEffect(() => {
    setPage(1);
  }, [tab, search, useGroup]);

  useEffect(() => {
    if (tab === "records") fetchRecords();
    else if (tab === "matches") fetchMatches();
    else if (tab === "unmatched-city") fetchUnmatchedCity();
    else if (tab === "unmatched-ours") fetchUnmatchedOurs();
  }, [tab, page, fetchRecords, fetchMatches, fetchUnmatchedCity, fetchUnmatchedOurs]);

  const handleConfirm = async (id: number) => {
    await fetch(`/api/city-assessments/matches/${id}/confirm`, { method: "POST" });
    fetchMatches();
    fetchStats();
  };

  const handleReject = async (id: number) => {
    await fetch(`/api/city-assessments/matches/${id}/reject`, { method: "POST" });
    fetchMatches();
    fetchStats();
  };

  const handleMerge = async () => {
    if (!confirm("Merge all confirmed matches into properties?")) return;
    const res = await fetch("/api/city-assessments/merge", { method: "POST" });
    const json = await res.json();
    alert(`Merged ${json.merged} records`);
    fetchStats();
  };

  const handleRun = async () => {
    setRunning(true);
    try {
      await fetch("/api/scraped/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "city_assessments" }),
      });
      // Poll for completion
      const poll = setInterval(async () => {
        const res = await fetch("/api/city-assessments/stats");
        const s = await res.json();
        setStats(s);
        if (s.total > 0) {
          clearInterval(poll);
          setRunning(false);
          fetchStats();
        }
      }, 5000);
    } catch {
      setRunning(false);
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "records", label: "All Records" },
    { key: "matches", label: "Matches" },
    { key: "unmatched-city", label: "Unmatched City" },
    { key: "unmatched-ours", label: "Unmatched Ours" },
  ];

  const Pagination = ({ total, perPage = 50 }: { total: number; perPage?: number }) => {
    const pages = Math.ceil(total / perPage);
    if (pages <= 1) return null;
    return (
      <div className="flex items-center gap-2 mt-4">
        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
          className="px-3 py-1 rounded bg-white/5 hover:bg-white/10 disabled:opacity-30 text-sm">← Prev</button>
        <span className="text-sm text-white/50">Page {page} of {pages}</span>
        <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
          className="px-3 py-1 rounded bg-white/5 hover:bg-white/10 disabled:opacity-30 text-sm">Next →</button>
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">City Assessment Data</h1>
          <p className="text-sm text-white/50">Saskatoon property assessments from ArcGIS API</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleRun} disabled={running}
            className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-medium">
            {running ? "Running..." : "🔄 Refresh Data"}
          </button>
          <button onClick={handleMerge}
            className="px-4 py-2 rounded bg-green-700 hover:bg-green-600 text-sm font-medium">
            ✅ Merge Confirmed
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-white/10 pb-0">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium rounded-t transition ${
              tab === t.key ? "bg-white/10 text-white border-b-2 border-blue-500" : "text-white/50 hover:text-white/70"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === "overview" && stats && (
        <div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard label="Total City Records" value={fmtNum(stats.total)} />
            <StatCard label="Properties Matched" value={`${fmtNum(stats.totalMatched)} / ${fmtNum(stats.totalProperties)}`} />
            <StatCard label="Unmatched City" value={fmtNum(stats.unmatchedCity)} />
            <StatCard label="Unmatched Ours" value={fmtNum(stats.unmatchedProperties)} />
          </div>

          {stats.matchesByMethod?.length > 0 && (
            <div className="mb-8">
              <h3 className="text-lg font-semibold mb-3">Match Methods</h3>
              <div className="grid grid-cols-3 gap-3">
                {stats.matchesByMethod.map((m: any) => (
                  <div key={m.method} className="bg-white/5 rounded-lg p-3">
                    <div className="text-xs text-white/50 uppercase">{m.method}</div>
                    <div className="text-xl font-bold">{fmtNum(m.count)}</div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-4">
                {stats.matchesByMethod.map((m: any) => {
                  const pending = m.pending ?? m.count;
                  if (pending === 0) return null;
                  const colors: Record<string, string> = {
                    exact: 'bg-green-700 hover:bg-green-600',
                    normalized: 'bg-yellow-700 hover:bg-yellow-600',
                    fuzzy: 'bg-orange-700 hover:bg-orange-600',
                  };
                  return (
                    <button key={m.method}
                      onClick={async () => {
                        if (!confirm(`Bulk confirm all ${pending} ${m.method} matches?`)) return;
                        const res = await fetch('/api/city-assessments/matches/bulk-confirm', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ matchMethod: m.method }),
                        });
                        const json = await res.json();
                        alert(`Confirmed ${json.confirmed} ${m.method} matches`);
                        fetchStats();
                      }}
                      className={`px-4 py-2 rounded text-sm font-medium ${colors[m.method] || 'bg-white/10 hover:bg-white/20'}`}>
                      ✅ Bulk Confirm All {m.method.charAt(0).toUpperCase() + m.method.slice(1)} ({pending})
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <h3 className="text-lg font-semibold mb-3">By Property Use Group</h3>
          <div className="bg-white/5 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-white/10 text-white/50">
                <th className="text-left p-3">Group</th>
                <th className="text-right p-3">Count</th>
                <th className="text-right p-3">Total Assessed Value</th>
              </tr></thead>
              <tbody>
                {stats.byGroup?.map((g: any) => (
                  <tr key={g.group} className="border-b border-white/5 hover:bg-white/5">
                    <td className="p-3">{g.group}</td>
                    <td className="p-3 text-right">{fmtNum(g.count)}</td>
                    <td className="p-3 text-right">{fmt(g.totalValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* All Records Tab */}
      {tab === "records" && (
        <div>
          <div className="flex gap-3 mb-4">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search address..."
              className="px-3 py-2 rounded bg-white/5 border border-white/10 text-sm flex-1" />
            <select value={useGroup} onChange={e => setUseGroup(e.target.value)}
              className="px-3 py-2 rounded bg-white/5 border border-white/10 text-sm">
              <option value="">All Groups</option>
              {stats?.byGroup?.map((g: any) => (
                <option key={g.group} value={g.group}>{g.group} ({g.count})</option>
              ))}
            </select>
          </div>
          <div className="text-sm text-white/50 mb-2">{fmtNum(recordsTotal)} records</div>
          <div className="bg-white/5 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-white/10 text-white/50 text-xs">
                <th className="text-left p-2">Address</th>
                <th className="text-left p-2">Use</th>
                <th className="text-left p-2">Zoning</th>
                <th className="text-right p-2">Assessed</th>
                <th className="text-left p-2">Neighbourhood</th>
              </tr></thead>
              <tbody>
                {records.map(r => (
                  <tr key={r.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="p-2">{r.fullAddress}</td>
                    <td className="p-2 text-xs text-white/60">{r.propertyUseCode}</td>
                    <td className="p-2 text-xs">{r.zoningDesc}</td>
                    <td className="p-2 text-right">{fmt(r.assessedValue)}</td>
                    <td className="p-2 text-xs">{r.neighbourhood}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination total={recordsTotal} />
        </div>
      )}

      {/* Matches Tab */}
      {tab === "matches" && (
        <div>
          <div className="text-sm text-white/50 mb-2">{fmtNum(matchesTotal)} matches</div>
          <div className="space-y-2">
            {matches.map(({ match: m, city: c, property: p }) => (
              <div key={m.id} className="bg-white/5 rounded-lg p-3 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex gap-4 text-sm">
                    <div className="flex-1">
                      <div className="text-xs text-white/40 mb-1">Our Property</div>
                      <div className="font-medium">{p.address}</div>
                      <div className="text-xs text-white/50">{p.propertyType} • {p.neighbourhood}</div>
                    </div>
                    <div className="flex-1">
                      <div className="text-xs text-white/40 mb-1">City Record</div>
                      <div className="font-medium">{c.fullAddress}</div>
                      <div className="text-xs text-white/50">{c.propertyUseCode} • {c.zoningDesc} • {fmt(c.assessedValue)}</div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2 text-xs">
                    <span className={`px-2 py-0.5 rounded ${
                      m.matchMethod === 'exact' ? 'bg-green-900/50 text-green-300' :
                      m.matchMethod === 'normalized' ? 'bg-yellow-900/50 text-yellow-300' :
                      'bg-orange-900/50 text-orange-300'
                    }`}>{m.matchMethod} ({(m.confidence * 100).toFixed(0)}%)</span>
                    <span className={`px-2 py-0.5 rounded ${
                      m.status === 'confirmed' ? 'bg-green-900/50 text-green-300' :
                      m.status === 'rejected' ? 'bg-red-900/50 text-red-300' :
                      'bg-white/10 text-white/60'
                    }`}>{m.status}</span>
                  </div>
                </div>
                {m.status === 'pending' && (
                  <div className="flex gap-1">
                    <button onClick={() => handleConfirm(m.id)} className="px-2 py-1 rounded bg-green-700 hover:bg-green-600 text-xs">✓</button>
                    <button onClick={() => handleReject(m.id)} className="px-2 py-1 rounded bg-red-700 hover:bg-red-600 text-xs">✗</button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <Pagination total={matchesTotal} />
        </div>
      )}

      {/* Unmatched City Tab */}
      {tab === "unmatched-city" && (
        <div>
          <div className="text-sm text-white/50 mb-2">{fmtNum(unmatchedCityTotal)} city records with no match</div>
          <div className="bg-white/5 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-white/10 text-white/50 text-xs">
                <th className="text-left p-2">Address</th>
                <th className="text-left p-2">Use Group</th>
                <th className="text-right p-2">Assessed</th>
                <th className="text-left p-2">Neighbourhood</th>
              </tr></thead>
              <tbody>
                {unmatchedCity.map(r => (
                  <tr key={r.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="p-2">{r.fullAddress}</td>
                    <td className="p-2 text-xs">{r.propertyUseGroup}</td>
                    <td className="p-2 text-right">{fmt(r.assessedValue)}</td>
                    <td className="p-2 text-xs">{r.neighbourhood}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination total={unmatchedCityTotal} />
        </div>
      )}

      {/* Unmatched Ours Tab */}
      {tab === "unmatched-ours" && (
        <div>
          <div className="text-sm text-white/50 mb-2">{fmtNum(unmatchedOursTotal)} properties with no city match</div>
          <div className="bg-white/5 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-white/10 text-white/50 text-xs">
                <th className="text-left p-2">Address</th>
                <th className="text-left p-2">Type</th>
                <th className="text-left p-2">Neighbourhood</th>
                <th className="text-left p-2">City</th>
              </tr></thead>
              <tbody>
                {unmatchedOurs.map(r => (
                  <tr key={r.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="p-2">{r.address}</td>
                    <td className="p-2 text-xs">{r.propertyType}</td>
                    <td className="p-2 text-xs">{r.neighbourhood}</td>
                    <td className="p-2 text-xs">{r.city}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination total={unmatchedOursTotal} />
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/5 rounded-lg p-4">
      <div className="text-xs text-white/50 mb-1">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}
