"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { track } from "@/lib/track";

/* ── Types ── */
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

type SearchTab = "people" | "companies" | "properties" | "comps";

const SEARCH_TABS: { value: SearchTab; label: string }[] = [
  { value: "people", label: "People" },
  { value: "companies", label: "Companies" },
  { value: "properties", label: "Properties" },
  { value: "comps", label: "Transactions" },
];

const PAGE_SIZE = 40;

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

/* ── Search Page ── */
export default function SearchPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<SearchTab>("people");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [comps, setComps] = useState<CompResult[]>([]);
  const [compsTotal, setCompsTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [watchedKeys, setWatchedKeys] = useState<Set<string>>(new Set());

  // Browse mode state (no query — show all with pagination)
  const [browseData, setBrowseData] = useState<any[]>([]);
  const [browseTotal, setBrowseTotal] = useState(0);
  const [browsePage, setBrowsePage] = useState(0);
  const [browseLoading, setBrowseLoading] = useState(false);

  // Auth check
  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (!d.user) { router.replace("/login"); return; }
      setAuthed(true);
    }).catch(() => router.replace("/login"));
  }, [router]);

  // Load watched keys
  useEffect(() => {
    if (!authed) return;
    fetch("/api/watchlist")
      .then(r => r.json())
      .then((items: WatchlistItem[]) => {
        setWatchedKeys(new Set(items.map(i => `${i.entityType}:${i.entityId}`)));
      })
      .catch(() => {});
  }, [authed]);

  const handleWatched = (key: string) => {
    setWatchedKeys(prev => new Set([...prev, key]));
  };

  // Search mode (with query)
  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults(null); setComps([]); return; }
    setLoading(true);
    track("search", "search", { query: q, tab });
    try {
      const tabType = tab === "comps" ? "comps" : tab;
      if (tab === "comps") {
        const compsRes = await fetch(`/api/comps?search=${encodeURIComponent(q)}&limit=${PAGE_SIZE}`);
        const cd = await compsRes.json();
        setComps(cd.data || []);
        setCompsTotal(cd.total || 0);
        setResults(null);
      } else {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&type=${tabType}&limit=${PAGE_SIZE}`);
        const data = await res.json();
        setResults(data);
        setComps([]);
      }
    } finally {
      setLoading(false);
    }
  }, [tab]);

  // Browse mode (no query — paginated listing)
  const browse = useCallback(async (page: number) => {
    setBrowseLoading(true);
    try {
      const offset = page * PAGE_SIZE;
      const res = await fetch(`/api/search/browse?type=${tab}&limit=${PAGE_SIZE}&offset=${offset}`);
      const data = await res.json();
      setBrowseData(data.items || []);
      setBrowseTotal(data.total || 0);
    } finally {
      setBrowseLoading(false);
    }
  }, [tab]);

  // Trigger search or browse
  useEffect(() => {
    if (!authed) return;
    if (query.length >= 2) {
      const timer = setTimeout(() => { search(query); }, 250);
      return () => clearTimeout(timer);
    } else {
      setResults(null);
      setComps([]);
      browse(browsePage);
    }
  }, [query, tab, authed, search, browse, browsePage]);

  // Reset page when tab changes
  useEffect(() => { setBrowsePage(0); }, [tab]);

  if (authed === null) return <div className="text-zinc-500 text-sm py-8">Loading...</div>;

  const isSearchMode = query.length >= 2;
  const totalPages = Math.ceil(browseTotal / PAGE_SIZE);

  // Get the appropriate list for current tab in search mode
  const companiesList = results?.companies || [];
  const peopleList = results?.people || [];
  const propertiesList = results?.properties || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Search</h1>
        <p className="text-zinc-400 text-sm mt-1">Browse and search companies, people, properties, and transactions</p>
      </div>

      {/* Search Input */}
      <div className="relative">
        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input type="text" value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search or browse below..." autoFocus
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-12 pr-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50" />
        {(loading || browseLoading) && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {SEARCH_TABS.map(t => (
          <button key={t.value} onClick={() => setTab(t.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t.value
                ? "bg-blue-600 text-white"
                : "bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {isSearchMode ? (
        /* ── Search Results ── */
        <div className="space-y-3">
          {tab === "companies" && companiesList.length > 0 && (
            <CompaniesTable companies={companiesList} watchedKeys={watchedKeys} onWatched={handleWatched} onDeleted={(id) => setResults(prev => prev ? { ...prev, companies: prev.companies?.filter(c => c.id !== id) } : prev)} />
          )}
          {tab === "people" && peopleList.length > 0 && (
            <PeopleTable people={peopleList} watchedKeys={watchedKeys} onWatched={handleWatched} onDeleted={(id) => setResults(prev => prev ? { ...prev, people: prev.people?.filter(p => p.id !== id) } : prev)} />
          )}
          {tab === "properties" && propertiesList.length > 0 && (
            <PropertiesTable properties={propertiesList} watchedKeys={watchedKeys} onWatched={handleWatched} onDeleted={(id) => setResults(prev => prev ? { ...prev, properties: prev.properties?.filter(p => p.id !== id) } : prev)} />
          )}
          {tab === "comps" && comps.length > 0 && (
            <CompsTable comps={comps} total={compsTotal} onDeleted={(id) => setComps(prev => prev.filter(c => c.id !== id))} />
          )}
          {!loading && (
            (tab === "companies" && companiesList.length === 0) ||
            (tab === "people" && peopleList.length === 0) ||
            (tab === "properties" && propertiesList.length === 0) ||
            (tab === "comps" && comps.length === 0)
          ) && (
            <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-6 text-center">
              <p className="text-zinc-500 text-sm">No results found for &ldquo;{query}&rdquo;</p>
            </div>
          )}
        </div>
      ) : (
        /* ── Browse Mode ── */
        <div>
          {browseData.length > 0 && (
            <>
              {tab === "companies" && <CompaniesTable companies={browseData} watchedKeys={watchedKeys} onWatched={handleWatched} onDeleted={(id) => setBrowseData(prev => prev.filter(c => c.id !== id))} />}
              {tab === "people" && <PeopleTable people={browseData} watchedKeys={watchedKeys} onWatched={handleWatched} onDeleted={(id) => setBrowseData(prev => prev.filter(p => p.id !== id))} />}
              {tab === "properties" && <PropertiesTable properties={browseData} watchedKeys={watchedKeys} onWatched={handleWatched} onDeleted={(id) => setBrowseData(prev => prev.filter(p => p.id !== id))} />}
              {tab === "comps" && <CompsTable comps={browseData} total={browseTotal} onDeleted={(id) => setBrowseData(prev => prev.filter(c => c.id !== id))} />}
            </>
          )}
          {!browseLoading && browseData.length === 0 && (
            <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-6 text-center">
              <p className="text-zinc-500 text-sm">No {tab} found</p>
            </div>
          )}
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-zinc-500">
                Showing {browsePage * PAGE_SIZE + 1}–{Math.min((browsePage + 1) * PAGE_SIZE, browseTotal)} of {browseTotal}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setBrowsePage(p => Math.max(0, p - 1))}
                  disabled={browsePage === 0}
                  className="px-3 py-1.5 rounded-lg text-sm bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  ← Previous
                </button>
                <span className="px-3 py-1.5 text-sm text-zinc-500">
                  Page {browsePage + 1} of {totalPages}
                </span>
                <button
                  onClick={() => setBrowsePage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={browsePage >= totalPages - 1}
                  className="px-3 py-1.5 rounded-lg text-sm bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Delete Button ── */
function DeleteButton({ type, id, label, onDeleted }: { type: string; id: number; label: string; onDeleted: (id: number) => void }) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (deleting) return;
    if (!confirm(`Are you sure you want to delete "${label}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const urlMap: Record<string, string> = {
        person: `/api/people/${id}`,
        company: `/api/companies/${id}`,
        property: `/api/properties/${id}`,
        comp: `/api/comps/${id}`,
      };
      const res = await fetch(urlMap[type], { method: "DELETE" });
      if (res.ok) onDeleted(id);
      else alert("Failed to delete. It may have linked records.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <button onClick={handleDelete} disabled={deleting}
      className="flex-shrink-0 px-2 py-1 rounded text-xs text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
      title="Delete">
      {deleting ? "…" : "✕"}
    </button>
  );
}

/* ── Shared Table Components ── */

function CompaniesTable({ companies, watchedKeys, onWatched, onDeleted }: { companies: any[]; watchedKeys: Set<string>; onWatched: (k: string) => void; onDeleted?: (id: number) => void }) {
  return (
    <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl overflow-hidden">
      <div className="divide-y divide-zinc-700/50">
        {companies.map((c: any) => (
          <div key={c.id} className="flex items-center hover:bg-zinc-800 transition-colors">
            <Link href={`/companies/${c.id}`} className="flex-1 px-4 py-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">{c.name}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{c.director || c.entityNumber || ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  {c.latestActivity && (
                    <span className="text-xs text-zinc-500 whitespace-nowrap">{c.latestActivity}</span>
                  )}
                  {c.lastMove && (
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${
                      c.lastMove.type === "Purchase" ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
                    }`}>
                      {c.lastMove.type} · {c.lastMove.price >= 1_000_000 ? `$${(c.lastMove.price / 1_000_000).toFixed(1)}M` : `$${(c.lastMove.price / 1_000).toFixed(0)}K`} · {c.lastMove.date}
                    </span>
                  )}
                </div>
              </div>
            </Link>
            <div className="pr-3 flex items-center gap-1">
              <QuickWatch entityType="company" entityId={c.id} label={c.name} watched={watchedKeys} onWatched={onWatched} />
              {onDeleted && <DeleteButton type="company" id={c.id} label={c.name} onDeleted={onDeleted} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PeopleTable({ people, watchedKeys, onWatched, onDeleted }: { people: any[]; watchedKeys: Set<string>; onWatched: (k: string) => void; onDeleted: (id: number) => void }) {
  return (
    <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl overflow-hidden">
      <div className="divide-y divide-zinc-700/50">
        {people.map((p: any) => (
          <div key={p.id} className="flex items-center hover:bg-zinc-800 transition-colors">
            <Link href={`/people/${p.id}`} className="flex-1 px-4 py-2">
              <p className="text-sm font-medium text-white">{p.fullName}</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {p.email || p.phone
                  ? [p.email, p.phone].filter(Boolean).join(" · ")
                  : <span className="text-zinc-600">No contact information</span>}
              </p>
            </Link>
            <div className="pr-3 flex items-center gap-1">
              <QuickWatch entityType="person" entityId={p.id} label={p.fullName} watched={watchedKeys} onWatched={onWatched} />
              <DeleteButton type="person" id={p.id} label={p.fullName} onDeleted={onDeleted} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PropertiesTable({ properties, watchedKeys, onWatched, onDeleted }: { properties: any[]; watchedKeys: Set<string>; onWatched: (k: string) => void; onDeleted: (id: number) => void }) {
  return (
    <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl overflow-hidden">
      <div className="divide-y divide-zinc-700/50">
        {properties.map((p: any) => (
          <div key={p.id} className="flex items-center hover:bg-zinc-800 transition-colors">
            <Link href={`/properties/${p.id}`} className="flex-1 px-4 py-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">{p.address}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{p.neighbourhood} · {p.city}</p>
                </div>
                <div className="flex items-center gap-2">
                  {p.propertyType && (
                    <span className="text-xs px-2.5 py-1 rounded-full bg-blue-500/15 text-blue-400 font-medium">{p.propertyType}</span>
                  )}
                  {p.latestActivity && (
                    <span className="text-xs text-zinc-500 whitespace-nowrap">{p.latestActivity}</span>
                  )}
                </div>
              </div>
            </Link>
            <div className="pr-3 flex items-center gap-1">
              <QuickWatch entityType="property" entityId={p.id} label={p.address} watched={watchedKeys} onWatched={onWatched} />
              <DeleteButton type="property" id={p.id} label={p.address} onDeleted={onDeleted} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CompsTable({ comps, total, onDeleted, watchedKeys, onWatched }: { comps: any[]; total: number; onDeleted: (id: number) => void; watchedKeys?: Set<string>; onWatched?: (k: string) => void }) {
  return (
    <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl overflow-hidden">
      <div className="divide-y divide-zinc-700/50">
        {comps.map((c: any) => (
          <div key={c.id} className="flex items-center hover:bg-zinc-800 transition-colors">
            <Link href={c.type === "Sale" ? "/sales" : "/leases"} className="flex-1 px-4 py-2">
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
            <div className="pr-3">
              <DeleteButton type="comp" id={c.id} label={c.address || `${c.type} #${c.id}`} onDeleted={onDeleted} />
            </div>
          </div>
        ))}
        {total > comps.length && (
          <p className="px-5 py-3 text-center text-xs text-zinc-500">Showing {comps.length} of {total} — refine your search</p>
        )}
      </div>
    </div>
  );
}
