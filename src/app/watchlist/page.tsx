"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface WatchlistItem {
  id: number;
  entityType: string;
  entityId: number;
  label: string;
  notes: string | null;
  createdAt: string;
  entity: Record<string, unknown>;
}

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/watchlist")
      .then((r) => r.json())
      .then((data) => {
        setItems(data);
        setLoading(false);
      });
  }, []);

  useEffect(() => { load(); }, [load]);

  const remove = async (id: number) => {
    await fetch(`/api/watchlist/${id}`, { method: "DELETE" });
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const filtered = filter === "all" ? items : items.filter((i) => i.entityType === filter);

  const entityIcon = (type: string) => {
    switch (type) {
      case "company": return "🏢";
      case "person": return "👤";
      case "property": return "🏠";
      default: return "📌";
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

  if (loading) return <div className="text-muted p-8">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Watchlist</h1>
          <p className="text-muted text-sm mt-1">{items.length} item{items.length !== 1 ? "s" : ""} being monitored</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {["all", "company", "person", "property"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? "bg-accent/15 text-accent"
                : "text-muted hover:text-foreground hover:bg-white/5"
            }`}
          >
            {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            {f === "all"
              ? ` (${items.length})`
              : ` (${items.filter((i) => i.entityType === f).length})`}
          </button>
        ))}
      </div>

      {/* Items */}
      {filtered.length === 0 ? (
        <div className="bg-card border border-card-border rounded-xl p-12 text-center">
          <p className="text-4xl mb-4">👁</p>
          <p className="text-foreground font-medium mb-2">No items on your watchlist</p>
          <p className="text-muted text-sm">Add entities from their profile pages using the Watch button</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="bg-card border border-card-border rounded-xl p-4 flex items-center justify-between gap-4 hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xl flex-shrink-0">{entityIcon(item.entityType)}</span>
                <div className="min-w-0">
                  <Link href={entityLink(item)} className="text-accent hover:underline font-medium truncate block">
                    {item.label || `${item.entityType} #${item.entityId}`}
                  </Link>
                  <p className="text-muted text-xs mt-0.5 truncate">
                    {item.entityType.charAt(0).toUpperCase() + item.entityType.slice(1)}
                    {entityDetail(item) ? ` · ${entityDetail(item)}` : ""}
                    {" · Added " + new Date(item.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <button
                onClick={() => remove(item.id)}
                className="text-muted hover:text-danger text-sm flex-shrink-0 transition-colors"
                title="Remove from watchlist"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
