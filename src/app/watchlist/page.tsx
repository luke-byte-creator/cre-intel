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
    const cls = "w-5 h-5";
    switch (type) {
      case "company": return <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" /></svg>;
      case "person": return <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>;
      case "property": return <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h7.5V10.75M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3l-1.5.545m0 6.205l3 1m1.5.5l-1.5-.5M6.75 7.364V3h-3v18m3-13.636l10.5-3.819" /></svg>;
      default: return <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>;
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
          <svg className="w-12 h-12 mx-auto mb-4 text-muted opacity-40" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
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
                <span className="text-muted flex-shrink-0">{entityIcon(item.entityType)}</span>
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
