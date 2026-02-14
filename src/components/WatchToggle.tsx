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
      {watched ? "👁 Watching" : "👁 Watch"}
    </button>
  );
}
