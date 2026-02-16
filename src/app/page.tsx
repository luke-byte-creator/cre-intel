"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

/* ── Types ── */
interface LeaderboardEntry {
  userId: number;
  name: string;
  earned: number;
}

interface CompResult {
  id: number;
  type: string;
  address: string;
  saleDate: string | null;
  salePrice: number | null;
  netRentPSF: number | null;
  seller: string | null;
  purchaser: string | null;
  tenant: string | null;
  landlord: string | null;
  propertyType: string | null;
}

interface SearchResults {
  companies?: Array<{ id: number; name: string; entityNumber: string; type: string; status: string; _score: number; director: string | null; lastMove: { type: string; date: string; price: number } | null }>;
  people?: Array<{ id: number; fullName: string; address: string; _score: number; companyName: string | null }>;
  properties?: Array<{ id: number; address: string; propertyType: string; neighbourhood: string; city: string; _score: number }>;
}

interface WatchlistItem {
  id: number;
  entityType: string;
  entityId: number;
  label: string;
  notes: string | null;
  createdAt: string;
  entity: Record<string, unknown>;
}

type SearchTab = "all" | "companies" | "people" | "properties" | "comps";

const SEARCH_TABS: { value: SearchTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "companies", label: "Companies" },
  { value: "people", label: "People" },
  { value: "properties", label: "Properties" },
  { value: "comps", label: "Transactions" },
];

/* ── Leaderboard ── */
function Leaderboard({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-white mb-3">🏆 Weekly Contributions</h2>
      <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl overflow-hidden">
        {entries.length > 0 ? (
          <div className="divide-y divide-zinc-700/50">
            {entries.map((entry, i) => (
              <div key={entry.userId} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <span className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold ${
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
  );
}

/* ── Quick Watch Button ── */
function QuickWatch({ entityType, entityId, label, watched, onWatched }: {
  entityType: string; entityId: number; label: string; watched: Set<string>; onWatched: (key: string) => void;
}) {
  const key = `${entityType}:${entityId}`;
  const isWatched = watched.has(key);
  const [saving, setSaving] = useState(false);

  const handleWatch = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isWatched || saving) return;
    setSaving(true);
    try {
      await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, entityId, label }),
      });
      onWatched(key);
    } finally {
      setSaving(false);
    }
  };

  return (
    <button
      onClick={handleWatch}
      disabled={isWatched || saving}
      className={`flex-shrink-0 px-2 py-1 rounded text-xs transition-colors ${
        isWatched
          ? "text-emerald-400 cursor-default"
          : "text-zinc-500 hover:text-amber-400 hover:bg-amber-500/10"
      }`}
      title={isWatched ? "Watching" : "Add to watchlist"}
    >
      {isWatched ? "✓ Watching" : saving ? "…" : "⊕ Watch"}
    </button>
  );
}

/* ── Search Section ── */
function SearchSection({ watchedKeys, onWatched }: { watchedKeys: Set<string>; onWatched: (key: string) => void }) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<SearchTab>("all");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [comps, setComps] = useState<CompResult[]>([]);
  const [compsTotal, setCompsTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults(null); setComps([]); setCounts({}); return; }
    setLoading(true);
    try {
      // Always fetch all types for counts
      const [res, compsRes] = await Promise.all([
        fetch(`/api/search?q=${encodeURIComponent(q)}&type=all&limit=25`),
        fetch(`/api/comps?search=${encodeURIComponent(q)}&limit=25`),
      ]);
      const data = await res.json();
      setResults(data);
      const cd = await compsRes.json();
      setComps(cd.data || []);
      setCompsTotal(cd.total || 0);
      const cc = (data.companies?.length || 0);
      const pc = (data.people?.length || 0);
      const prc = (data.properties?.length || 0);
      const tc = (cd.total || 0);
      setCounts({
        all: cc + pc + prc + tc,
        companies: cc,
        people: pc,
        properties: prc,
        comps: tc,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { search(query); }, 250);
    return () => clearTimeout(timer);
  }, [query, search]);

  const showCompanies = tab === "all" || tab === "companies";
  const showPeople = tab === "all" || tab === "people";
  const showProperties = tab === "all" || tab === "properties";
  const showComps = tab === "all" || tab === "comps";

  const hasResults = query.length >= 2;
  const companiesList = results?.companies || [];
  const peopleList = results?.people || [];
  const propertiesList = results?.properties || [];

  return (
    <div>
      <h2 className="text-lg font-semibold text-white mb-3">🔍 Search</h2>

      {/* Search Input */}
      <div className="relative mb-3">
        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input type="text" value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search companies, people, properties, transactions..."
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-12 pr-4 py-3 text-white placeholder:text-zinc-500" />
        {loading && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-3 flex-wrap">
        {SEARCH_TABS.map(t => (
          <button key={t.value} onClick={() => setTab(t.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors ${
              tab === t.value
                ? "bg-blue-600 text-white"
                : "bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600"
            }`}>
            {t.label}
            {counts[t.value] != null && hasResults && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === t.value ? "bg-white/20" : "bg-zinc-700"}`}>
                {counts[t.value]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Results */}
      {hasResults ? (
        <div className="space-y-3">
          {/* Companies */}
          {showCompanies && companiesList.length > 0 && (
            <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl overflow-hidden">
              {tab === "all" && (
                <div className="px-5 py-2 border-b border-zinc-700/50 bg-zinc-800/80">
                  <span className="text-xs font-medium text-blue-400 uppercase tracking-wider">Companies ({companiesList.length})</span>
                </div>
              )}
              <div className="divide-y divide-zinc-700/50">
                {companiesList.map(c => (
                  <div key={c.id} className="flex items-center hover:bg-zinc-800 transition-colors">
                    <Link href={`/companies/${c.id}`} className="flex-1 px-5 py-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-white">{c.name}</p>
                          <p className="text-xs text-zinc-500 mt-0.5">{c.director || "No director on file"}</p>
                        </div>
                        {c.lastMove && (
                          <span className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${
                            c.lastMove.type === "Purchase" ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
                          }`}>
                            {c.lastMove.type} · {c.lastMove.price >= 1_000_000 ? `$${(c.lastMove.price / 1_000_000).toFixed(1)}M` : `$${(c.lastMove.price / 1_000).toFixed(0)}K`} · {c.lastMove.date}
                          </span>
                        )}
                      </div>
                    </Link>
                    <div className="pr-3">
                      <QuickWatch entityType="company" entityId={c.id} label={c.name} watched={watchedKeys} onWatched={onWatched} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* People */}
          {showPeople && peopleList.length > 0 && (
            <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl overflow-hidden">
              {tab === "all" && (
                <div className="px-5 py-2 border-b border-zinc-700/50 bg-zinc-800/80">
                  <span className="text-xs font-medium text-violet-400 uppercase tracking-wider">People ({peopleList.length})</span>
                </div>
              )}
              <div className="divide-y divide-zinc-700/50">
                {peopleList.map(p => (
                  <div key={p.id} className="flex items-center hover:bg-zinc-800 transition-colors">
                    <Link href={`/people/${p.id}`} className="flex-1 px-5 py-3">
                      <p className="text-sm font-medium text-white">{p.fullName}</p>
                      {p.companyName && <p className="text-xs text-zinc-500 mt-0.5">{p.companyName}</p>}
                    </Link>
                    <div className="pr-3">
                      <QuickWatch entityType="person" entityId={p.id} label={p.fullName} watched={watchedKeys} onWatched={onWatched} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Properties */}
          {showProperties && propertiesList.length > 0 && (
            <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl overflow-hidden">
              {tab === "all" && (
                <div className="px-5 py-2 border-b border-zinc-700/50 bg-zinc-800/80">
                  <span className="text-xs font-medium text-emerald-400 uppercase tracking-wider">Properties ({propertiesList.length})</span>
                </div>
              )}
              <div className="divide-y divide-zinc-700/50">
                {propertiesList.map(p => (
                  <div key={p.id} className="flex items-center hover:bg-zinc-800 transition-colors">
                    <Link href={`/properties/${p.id}`} className="flex-1 px-5 py-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-white">{p.address}</p>
                          <p className="text-xs text-zinc-500 mt-0.5">{p.neighbourhood} · {p.city}</p>
                        </div>
                        {p.propertyType && (
                          <span className="text-xs px-2.5 py-1 rounded-full bg-blue-500/15 text-blue-400 font-medium">{p.propertyType}</span>
                        )}
                      </div>
                    </Link>
                    <div className="pr-3">
                      <QuickWatch entityType="property" entityId={p.id} label={p.address} watched={watchedKeys} onWatched={onWatched} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Transactions */}
          {showComps && comps.length > 0 && (
            <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl overflow-hidden">
              {tab === "all" && (
                <div className="px-5 py-2 border-b border-zinc-700/50 bg-zinc-800/80">
                  <span className="text-xs font-medium text-amber-400 uppercase tracking-wider">Transactions ({compsTotal})</span>
                </div>
              )}
              <div className="divide-y divide-zinc-700/50">
                {comps.map(c => (
                  <Link key={c.id} href={c.type === "Sale" ? "/sales" : "/leases"} className="block px-5 py-3 hover:bg-zinc-800 transition-colors">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.type === "Sale" ? "bg-blue-500/15 text-blue-400" : "bg-green-500/15 text-green-400"}`}>{c.type}</span>
                          <p className="text-sm font-medium text-white">{c.address}</p>
                        </div>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {c.type === "Sale" ? `${c.seller || "?"} → ${c.purchaser || "?"}` : `${c.tenant || "?"} • ${c.landlord || "?"}`}
                        </p>
                      </div>
                      <div className="text-right">
                        {c.type === "Sale" && c.salePrice && (
                          <span className="text-sm font-mono text-white">${c.salePrice.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
                        )}
                        {c.type === "Lease" && c.netRentPSF && (
                          <span className="text-sm font-mono text-white">${c.netRentPSF.toFixed(2)}/SF</span>
                        )}
                        {c.saleDate && (
                          <p className="text-xs text-zinc-500">{new Date(c.saleDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" })}</p>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
                {compsTotal > 25 && (
                  <p className="px-5 py-3 text-center text-xs text-zinc-500">Showing 25 of {compsTotal} — refine your search</p>
                )}
              </div>
            </div>
          )}

          {/* No results at all */}
          {hasResults && (counts.all || 0) === 0 && !loading && (
            <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-6 text-center">
              <p className="text-zinc-500 text-sm">No results found for &ldquo;{query}&rdquo;</p>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-8">
          <p className="text-zinc-500 text-sm">Type at least 2 characters to search</p>
        </div>
      )}
    </div>
  );
}

/* ── Watchlist Section ── */
function WatchlistSection() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/watchlist")
      .then(r => r.json())
      .then(data => { setItems(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const remove = async (id: number) => {
    await fetch(`/api/watchlist/${id}`, { method: "DELETE" });
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const filtered = filter === "all" ? items : items.filter(i => i.entityType === filter);

  const entityIcon = (type: string) => {
    const cls = "w-4 h-4";
    switch (type) {
      case "company": return <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" /></svg>;
      case "person": return <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>;
      case "property": return <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h7.5V10.75M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3l-1.5.545m0 6.205l3 1m1.5.5l-1.5-.5M6.75 7.364V3h-3v18m3-13.636l10.5-3.819" /></svg>;
      default: return null;
    }
  };

  const entityLink = (item: WatchlistItem) => {
    switch (item.entityType) {
      case "company": return `/companies/${item.entityId}`;
      case "person": return `/people/${item.entityId}`;
      case "property": return `/properties/${item.entityId}`;
      default: return "#";
    }
  };

  const entityDetail = (item: WatchlistItem) => {
    const e = item.entity;
    if (item.entityType === "company") return (e.status as string) || (e.type as string) || "";
    if (item.entityType === "person") return (e.address as string) || "";
    if (item.entityType === "property") return `${(e.propertyType as string) || ""} · ${(e.city as string) || ""}`;
    return "";
  };

  if (loading) return <div className="text-zinc-500 text-sm py-4">Loading watchlist...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-white">📌 Watchlist</h2>
        <span className="text-xs text-zinc-500">{items.length} item{items.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-3">
        {["all", "company", "person", "property"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f ? "bg-accent/15 text-accent" : "text-zinc-500 hover:text-white hover:bg-zinc-800"
            }`}>
            {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            <span className="ml-1 text-xs opacity-60">
              ({f === "all" ? items.length : items.filter(i => i.entityType === f).length})
            </span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-8 text-center">
          <p className="text-zinc-400 text-sm">
            {items.length === 0
              ? "No items on your watchlist yet. Add entities from their profile pages."
              : "No items in this category."}
          </p>
        </div>
      ) : (
        <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl overflow-hidden divide-y divide-zinc-700/50">
          {filtered.map(item => (
            <div key={item.id} className="flex items-center justify-between px-4 py-3 hover:bg-zinc-800/80 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-zinc-500 flex-shrink-0">{entityIcon(item.entityType)}</span>
                <div className="min-w-0">
                  <Link href={entityLink(item)} className="text-sm text-accent hover:underline font-medium truncate block">
                    {item.label || `${item.entityType} #${item.entityId}`}
                  </Link>
                  <p className="text-zinc-500 text-xs mt-0.5 truncate">
                    {item.entityType.charAt(0).toUpperCase() + item.entityType.slice(1)}
                    {entityDetail(item) ? ` · ${entityDetail(item)}` : ""}
                  </p>
                </div>
              </div>
              <button onClick={() => remove(item.id)} className="text-zinc-600 hover:text-red-400 text-sm flex-shrink-0 ml-3 transition-colors" title="Remove">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Due Today ── */
function DueTodaySection() {
  const [items, setItems] = useState<Array<{ id: number; contactName: string; dueDate: string; note: string | null; dealTenantName: string | null; dealPropertyAddress: string | null }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/followups?status=pending")
      .then(r => r.json())
      .then((data: Array<{ id: number; contactName: string; dueDate: string; note: string | null; status: string; dealTenantName: string | null; dealPropertyAddress: string | null }>) => {
        const today = new Date().toISOString().slice(0, 10);
        const urgent = data.filter(f => f.dueDate <= today).slice(0, 5);
        setItems(urgent);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading || items.length === 0) return null;

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-white">📌 Due Today</h2>
        <Link href="/followups" className="text-xs text-accent hover:text-accent/80 transition">View all →</Link>
      </div>
      <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl divide-y divide-zinc-700/50 overflow-hidden">
        {items.map(f => (
          <div key={f.id} className="px-5 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white">{f.contactName}</p>
                {f.dealTenantName && <p className="text-xs text-zinc-500 mt-0.5">{f.dealTenantName}{f.dealPropertyAddress ? ` · ${f.dealPropertyAddress}` : ""}</p>}
                {f.note && <p className="text-xs text-zinc-400 mt-0.5">{f.note}</p>}
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${f.dueDate < today ? "bg-red-500/15 text-red-400" : "bg-accent/15 text-accent"}`}>
                {f.dueDate < today ? "Overdue" : "Today"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Dashboard ── */
export default function Dashboard() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [watchedKeys, setWatchedKeys] = useState<Set<string>>(new Set());
  const [watchlistVersion, setWatchlistVersion] = useState(0);

  useEffect(() => {
    fetch("/api/credits/leaderboard")
      .then(r => r.json())
      .then(d => setLeaderboard(d.leaderboard || []))
      .catch(() => {});
  }, []);

  // Load watched keys for quick-watch state
  useEffect(() => {
    fetch("/api/watchlist")
      .then(r => r.json())
      .then((items: WatchlistItem[]) => {
        setWatchedKeys(new Set(items.map(i => `${i.entityType}:${i.entityId}`)));
      })
      .catch(() => {});
  }, [watchlistVersion]);

  const handleWatched = (key: string) => {
    setWatchedKeys(prev => new Set([...prev, key]));
    setWatchlistVersion(v => v + 1); // refresh watchlist section
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Dashboard</h1>
      </div>
      <DueTodaySection />
      <Leaderboard entries={leaderboard} />
      <SearchSection watchedKeys={watchedKeys} onWatched={handleWatched} />
      <WatchlistSection key={watchlistVersion} />
    </div>
  );
}
