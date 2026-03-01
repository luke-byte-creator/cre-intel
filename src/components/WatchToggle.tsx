"use client";

import { useState } from "react";

interface WatchToggleProps {
  entityType: "company" | "person" | "property";
  entityId: number;
  entityLabel: string;
  initialWatched?: boolean;
  watchId?: number | null;
}

export default function WatchToggle({ entityType, entityId, entityLabel, initialWatched = false, watchId: initialWatchId = null }: WatchToggleProps) {
  const [watched, setWatched] = useState(initialWatched);
  const [watchId, setWatchId] = useState<number | null>(initialWatchId);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    setLoading(true);
    try {
      if (watched && watchId) {
        await fetch(`/api/watchlist/${watchId}`, { method: "DELETE" });
        setWatched(false);
        setWatchId(null);
      } else {
        const res = await fetch("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entityType, entityId, label: entityLabel }),
        });
        const data = await res.json();
        setWatched(true);
        setWatchId(data.id);
      }
    } catch (e) {
      console.error("Watch toggle failed", e);
    }
    setLoading(false);
  };

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
        watched
          ? "bg-accent/15 text-accent border-accent/30 hover:bg-accent/25"
          : "bg-card text-muted border-card-border hover:text-foreground hover:bg-white/5"
      } disabled:opacity-50`}
    >
      <svg className="w-4 h-4" fill={watched ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
      </svg>
      {watched ? "Watching" : "Watch"}
    </button>
  );
}
