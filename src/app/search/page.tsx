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
  annualRent: number | null;
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

type FilterType = "all" | "companies" | "people" | "properties";

const filterConfig: { value: FilterType; label: string; icon: React.ReactNode }[] = [
  { value: "all", label: "All", icon: null },
  { value: "companies", label: "Companies", icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" /></svg> },
  { value: "people", label: "People", icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg> },
  { value: "properties", label: "Properties", icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h7.5V10.75M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3l-1.5.545m0 6.205l3 1m1.5.5l-1.5-.5M6.75 7.364V3h-3v18m3-13.636l10.5-3.819" /></svg> },
];

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [comps, setComps] = useState<CompResult[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (q: string, type: FilterType) => {
    setLoading(true);
    try {
      const [res, compsRes] = await Promise.all([
        fetch(`/api/search?q=${encodeURIComponent(q)}&type=${type}`),
        q.length >= 2 ? fetch(`/api/comps?search=${encodeURIComponent(q)}&limit=10`) : Promise.resolve(null),
      ]);
      const data = await res.json();
      setResults(data);
      if (compsRes) {
        const cd = await compsRes.json();
        setComps(cd.data || []);
      } else {
        setComps([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { search(query, filter); }, 200);
    return () => clearTimeout(timer);
  }, [query, filter, search]);

  const totalResults = (results?.companies?.length || 0) + (results?.people?.length || 0) + (results?.properties?.length || 0) + comps.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Search</h1>
        <p className="text-muted text-sm mt-1">Fuzzy search across all entities</p>
      </div>

      {/* Search Input */}
      <div className="relative">
        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search companies, people, properties..."
          autoFocus
          className="w-full bg-card border border-card-border rounded-xl pl-12 pr-4 py-3.5 text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent shadow-lg shadow-black/10"
        />
        {loading && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {filterConfig.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 ${
              filter === f.value
                ? "bg-accent text-white shadow-md shadow-accent/20"
                : "bg-card border border-card-border text-muted hover:text-foreground hover:border-muted"
            }`}
          >
            {f.icon}
            {f.label}
          </button>
        ))}
      </div>

      {/* Results count */}
      {results && (
        <p className="text-sm text-muted">
          <span className="font-medium text-foreground">{totalResults}</span> result{totalResults !== 1 ? "s" : ""}
          {query && <> for <span className="text-accent">&ldquo;{query}&rdquo;</span></>}
        </p>
      )}

      {/* Results */}
      <div className="space-y-6">
        {results?.companies && results.companies.length > 0 && (
          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-card-border flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-blue-500/15 text-blue-400 flex items-center justify-center">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" /></svg>
              </div>
              <h2 className="text-sm font-semibold text-foreground">
                Companies
                <span className="ml-2 text-xs text-muted font-normal">({results.companies.length})</span>
              </h2>
            </div>
            <div className="divide-y divide-card-border/50">
              {results.companies.map((c) => (
                <Link key={c.id} href={`/companies/${c.id}`} className="block px-5 py-3.5 hover:bg-accent/[0.04]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">{c.name}</p>
                      <p className="text-xs text-muted mt-0.5">
                        {c.director || "No director on file"}
                      </p>
                    </div>
                    {c.lastMove && (
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${
                        c.lastMove.type === "Purchase" ? "bg-success/15 text-success" : "bg-amber-500/15 text-amber-400"
                      }`}>
                        {c.lastMove.type} · {c.lastMove.price >= 1_000_000 ? `$${(c.lastMove.price / 1_000_000).toFixed(1)}M` : c.lastMove.price >= 1_000 ? `$${(c.lastMove.price / 1_000).toFixed(0)}K` : `$${c.lastMove.price}`} · {c.lastMove.date}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {results?.people && results.people.length > 0 && (
          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-card-border flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-violet-500/15 text-violet-400 flex items-center justify-center">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
              </div>
              <h2 className="text-sm font-semibold text-foreground">
                People
                <span className="ml-2 text-xs text-muted font-normal">({results.people.length})</span>
              </h2>
            </div>
            <div className="divide-y divide-card-border/50">
              {results.people.map((p) => (
                <Link key={p.id} href={`/people/${p.id}`} className="block px-5 py-3.5 hover:bg-accent/[0.04]">
                  <p className="text-sm font-medium text-foreground">{p.fullName}</p>
                  {p.companyName && <p className="text-xs text-muted mt-0.5">{p.companyName}</p>}
                </Link>
              ))}
            </div>
          </div>
        )}

        {results?.properties && results.properties.length > 0 && (
          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-card-border flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h7.5V10.75M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3l-1.5.545m0 6.205l3 1m1.5.5l-1.5-.5M6.75 7.364V3h-3v18m3-13.636l10.5-3.819" /></svg>
              </div>
              <h2 className="text-sm font-semibold text-foreground">
                Properties
                <span className="ml-2 text-xs text-muted font-normal">({results.properties.length})</span>
              </h2>
            </div>
            <div className="divide-y divide-card-border/50">
              {results.properties.map((p) => (
                <Link key={p.id} href={`/properties/${p.id}`} className="block px-5 py-3.5 hover:bg-accent/[0.04]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">{p.address}</p>
                      <p className="text-xs text-muted mt-0.5">{p.neighbourhood} · {p.city}</p>
                    </div>
                    {p.propertyType && (
                      <span className="text-xs px-2.5 py-1 rounded-full bg-accent/15 text-accent font-medium">
                        {p.propertyType}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {comps.length > 0 && (
          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-card-border flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-amber-500/15 text-amber-400 flex items-center justify-center">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <h2 className="text-sm font-semibold text-foreground">
                Transactions
                <span className="ml-2 text-xs text-muted font-normal">({comps.length})</span>
              </h2>
            </div>
            <div className="divide-y divide-card-border/50">
              {comps.map((c) => (
                <Link key={c.id} href={c.type === "Sale" ? "/sales" : "/leases"} className="block px-5 py-3.5 hover:bg-accent/[0.04]">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.type === "Sale" ? "bg-blue-500/15 text-blue-400" : "bg-green-500/15 text-green-400"}`}>{c.type}</span>
                        <p className="text-sm font-medium text-foreground">{c.address}</p>
                      </div>
                      <p className="text-xs text-muted mt-0.5">
                        {c.type === "Sale" 
                          ? `${c.seller || "?"} → ${c.purchaser || "?"}`
                          : `${c.tenant || "?"} • ${c.landlord || "?"}`
                        }
                      </p>
                    </div>
                    <div className="text-right">
                      {c.type === "Sale" && c.salePrice && (
                        <span className="text-sm font-mono text-foreground">${c.salePrice.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
                      )}
                      {c.type === "Lease" && c.netRentPSF && (
                        <span className="text-sm font-mono text-foreground">${c.netRentPSF.toFixed(2)}/SF</span>
                      )}
                      {c.saleDate && (
                        <p className="text-xs text-muted">{new Date(c.saleDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" })}</p>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {results && totalResults === 0 && query && (
          <div className="text-center py-16">
            <svg className="w-12 h-12 mx-auto mb-3 text-muted opacity-40" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <p className="text-foreground font-medium">No results found</p>
            <p className="text-muted text-sm mt-1">Try a different search term or filter</p>
          </div>
        )}

        {results && totalResults === 0 && !query && (
          <div className="text-center py-16">
            <svg className="w-12 h-12 mx-auto mb-3 text-muted opacity-40" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <p className="text-foreground font-medium">Start typing to search</p>
            <p className="text-muted text-sm mt-1">Search across companies, people, and properties</p>
          </div>
        )}
      </div>
    </div>
  );
}
