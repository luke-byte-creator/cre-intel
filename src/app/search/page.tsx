"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface SearchResults {
  companies?: Array<{ id: number; name: string; entityNumber: string; type: string; status: string; _score: number }>;
  people?: Array<{ id: number; fullName: string; address: string; _score: number }>;
  properties?: Array<{ id: number; address: string; propertyType: string; neighbourhood: string; city: string; _score: number }>;
}

type FilterType = "all" | "companies" | "people" | "properties";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (q: string, type: FilterType) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&type=${type}`);
      const data = await res.json();
      setResults(data);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      search(query, filter);
    }, 200);
    return () => clearTimeout(timer);
  }, [query, filter, search]);

  const totalResults =
    (results?.companies?.length || 0) +
    (results?.people?.length || 0) +
    (results?.properties?.length || 0);

  const filters: { value: FilterType; label: string }[] = [
    { value: "all", label: "All" },
    { value: "companies", label: "Companies" },
    { value: "people", label: "People" },
    { value: "properties", label: "Properties" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Search</h1>
        <p className="text-muted text-sm mt-1">Fuzzy search across all entities</p>
      </div>

      {/* Search Input */}
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted">🔍</span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search companies, people, properties..."
          autoFocus
          className="w-full bg-card border border-card-border rounded-xl pl-12 pr-4 py-3.5 text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-all"
        />
        {loading && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f.value
                ? "bg-accent text-white"
                : "bg-card border border-card-border text-muted hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Results count */}
      {results && (
        <p className="text-sm text-muted">
          {totalResults} result{totalResults !== 1 ? "s" : ""}
          {query && ` for "${query}"`}
        </p>
      )}

      {/* Results */}
      <div className="space-y-6">
        {/* Companies */}
        {results?.companies && results.companies.length > 0 && (
          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-card-border">
              <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">
                🏢 Companies ({results.companies.length})
              </h2>
            </div>
            <div className="divide-y divide-card-border">
              {results.companies.map((c) => (
                <Link
                  key={c.id}
                  href={`/companies/${c.id}`}
                  className="block px-5 py-3 hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">{c.name}</p>
                      <p className="text-xs text-muted mt-0.5">
                        {c.entityNumber} · {c.type}
                      </p>
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        c.status === "Active"
                          ? "bg-success/20 text-success"
                          : "bg-danger/20 text-danger"
                      }`}
                    >
                      {c.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* People */}
        {results?.people && results.people.length > 0 && (
          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-card-border">
              <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">
                👤 People ({results.people.length})
              </h2>
            </div>
            <div className="divide-y divide-card-border">
              {results.people.map((p) => (
                <Link
                  key={p.id}
                  href={`/people/${p.id}`}
                  className="block px-5 py-3 hover:bg-white/5 transition-colors"
                >
                  <p className="text-sm font-medium text-foreground">{p.fullName}</p>
                  {p.address && (
                    <p className="text-xs text-muted mt-0.5">{p.address}</p>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Properties */}
        {results?.properties && results.properties.length > 0 && (
          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-card-border">
              <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">
                🏠 Properties ({results.properties.length})
              </h2>
            </div>
            <div className="divide-y divide-card-border">
              {results.properties.map((p) => (
                <Link
                  key={p.id}
                  href={`/properties/${p.id}`}
                  className="block px-5 py-3 hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">{p.address}</p>
                      <p className="text-xs text-muted mt-0.5">
                        {p.neighbourhood} · {p.city}
                      </p>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-accent/20 text-accent">
                      {p.propertyType}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {results && totalResults === 0 && query && (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">🔍</p>
            <p className="text-muted">No results found for &ldquo;{query}&rdquo;</p>
            <p className="text-muted text-sm mt-1">Try a different search term or filter</p>
          </div>
        )}
      </div>
    </div>
  );
}
