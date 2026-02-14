"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

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

type TabType = "companies" | "people" | "properties" | "comps";

const TABS: { value: TabType; label: string; color: string }[] = [
  { value: "companies", label: "Companies", color: "bg-blue-500/15 text-blue-400" },
  { value: "people", label: "People", color: "bg-violet-500/15 text-violet-400" },
  { value: "properties", label: "Properties", color: "bg-emerald-500/15 text-emerald-400" },
  { value: "comps", label: "Transactions", color: "bg-amber-500/15 text-amber-400" },
];

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<TabType>("companies");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [comps, setComps] = useState<CompResult[]>([]);
  const [compsTotal, setCompsTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const search = useCallback(async (q: string, activeTab: TabType) => {
    if (q.length < 2) { setResults(null); setComps([]); setCounts({}); return; }
    setLoading(true);
    try {
      // Always fetch the active tab's data; also get counts for other tabs
      const apiType = activeTab === "comps" ? "companies" : activeTab;
      const [res, compsRes] = await Promise.all([
        fetch(`/api/search?q=${encodeURIComponent(q)}&type=${apiType}&limit=25`),
        fetch(`/api/comps?search=${encodeURIComponent(q)}&limit=25`),
      ]);
      const data = await res.json();
      setResults(data);
      const cd = await compsRes.json();
      setComps(cd.data || []);
      setCompsTotal(cd.total || 0);

      // Set counts
      setCounts({
        companies: data.companies?.length || 0,
        people: data.people?.length || 0,
        properties: data.properties?.length || 0,
        comps: cd.total || 0,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { search(query, tab); }, 250);
    return () => clearTimeout(timer);
  }, [query, tab, search]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Search</h1>
        <p className="text-zinc-400 text-sm mt-1">Search companies, people, properties, and transactions</p>
      </div>

      {/* Search Input */}
      <div className="relative">
        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input type="text" value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search companies, people, properties..." autoFocus
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-12 pr-4 py-3.5 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50" />
        {loading && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {TABS.map(t => (
          <button key={t.value} onClick={() => setTab(t.value)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors ${
              tab === t.value
                ? "bg-blue-600 text-white shadow-md"
                : "bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600"
            }`}>
            {t.label}
            {counts[t.value] != null && query.length >= 2 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === t.value ? "bg-white/20" : "bg-zinc-700"}`}>
                {counts[t.value]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Results */}
      {query.length < 2 ? (
        <div className="text-center py-16">
          <svg className="w-12 h-12 mx-auto mb-3 text-zinc-600" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <p className="text-white font-medium">Start typing to search</p>
          <p className="text-zinc-500 text-sm mt-1">Minimum 2 characters</p>
        </div>
      ) : (
        <div>
          {/* Companies */}
          {tab === "companies" && results?.companies && (
            <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl overflow-hidden">
              {results.companies.length === 0 ? (
                <p className="px-5 py-8 text-center text-zinc-500">No companies found</p>
              ) : (
                <div className="divide-y divide-zinc-700/50">
                  {results.companies.map(c => (
                    <Link key={c.id} href={`/companies/${c.id}`} className="block px-5 py-3.5 hover:bg-zinc-800 transition-colors">
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
                  ))}
                </div>
              )}
            </div>
          )}

          {/* People */}
          {tab === "people" && results?.people && (
            <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl overflow-hidden">
              {results.people.length === 0 ? (
                <p className="px-5 py-8 text-center text-zinc-500">No people found</p>
              ) : (
                <div className="divide-y divide-zinc-700/50">
                  {results.people.map(p => (
                    <Link key={p.id} href={`/people/${p.id}`} className="block px-5 py-3.5 hover:bg-zinc-800 transition-colors">
                      <p className="text-sm font-medium text-white">{p.fullName}</p>
                      {p.companyName && <p className="text-xs text-zinc-500 mt-0.5">{p.companyName}</p>}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Properties */}
          {tab === "properties" && results?.properties && (
            <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl overflow-hidden">
              {results.properties.length === 0 ? (
                <p className="px-5 py-8 text-center text-zinc-500">No properties found</p>
              ) : (
                <div className="divide-y divide-zinc-700/50">
                  {results.properties.map(p => (
                    <Link key={p.id} href={`/properties/${p.id}`} className="block px-5 py-3.5 hover:bg-zinc-800 transition-colors">
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
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Transactions */}
          {tab === "comps" && (
            <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl overflow-hidden">
              {comps.length === 0 ? (
                <p className="px-5 py-8 text-center text-zinc-500">No transactions found</p>
              ) : (
                <div className="divide-y divide-zinc-700/50">
                  {comps.map(c => (
                    <Link key={c.id} href={c.type === "Sale" ? "/sales" : "/leases"} className="block px-5 py-3.5 hover:bg-zinc-800 transition-colors">
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
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
