"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import NovaPickCard from "@/components/NovaPickCard";
import PixelOffice from "@/components/PixelOffice";

/* ── Types ── */
interface LeaderboardEntry {
  userId: number;
  name: string;
  earned: number;
}

interface Activity {
  id: string;
  type: string;
  description: string;
  userName: string;
  timestamp: string;
  entityType: string | null;
  entityId: number | null;
  link: string | null;
}

/* ── Relative time ── */
function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ── Activity icon by type ── */
function activityIcon(type: string | null) {
  switch (type) {
    case "comp": case "sale": case "lease": return "💰";
    case "company": return "🏢";
    case "person": return "👤";
    case "property": return "🏠";
    case "inquiry": return "📥";
    case "deal": return "🤝";
    default: return "📝";
  }
}

/* ── Leaderboard ── */
function Leaderboard({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <div className="card-elevated p-5">
      <h2 className="section-header mb-4">Weekly Contributions</h2>
      {entries.length > 0 ? (
        <div className="divide-y divide-card-border/50">
          {entries.map((entry, i) => (
            <div key={entry.userId} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <span className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold ${
                  i === 0 ? "bg-amber-500/20 text-amber-400" : i === 1 ? "bg-zinc-400/20 text-zinc-300" : i === 2 ? "bg-orange-500/20 text-orange-400" : "bg-zinc-700 text-zinc-400"
                }`}>{i + 1}</span>
                <span className="text-sm text-foreground font-medium">{entry.name}</span>
              </div>
              <span className="text-sm font-bold text-emerald-400 bg-emerald-400/10 px-2.5 py-0.5 rounded-full">+{entry.earned}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-muted">No contributions yet this week.</div>
      )}
    </div>
  );
}

/* ── Activity Feed ── */
function ActivityFeed({ activities, loading }: { activities: Activity[]; loading: boolean }) {
  return (
    <div className="card-elevated p-5">
      <h2 className="section-header mb-4">Recent Activity</h2>
      {loading ? (
        <div className="py-8 text-center">
          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm text-muted">Loading activity...</p>
        </div>
      ) : activities.length > 0 ? (
        <div className="divide-y divide-card-border/50">
          {activities.map(a => {
            const content = (
              <div className="flex items-start gap-3 py-3">
                <span className="text-base mt-0.5 flex-shrink-0">{activityIcon(a.type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    <span className="font-medium text-foreground">{a.userName}</span>
                    <span className="text-muted mx-1.5">·</span>
                    <span className="text-muted">{a.description}</span>
                  </p>
                  <p className="text-xs text-muted-dim mt-0.5">{timeAgo(a.timestamp)}</p>
                </div>
                {a.link && (
                  <span className="text-xs text-muted flex-shrink-0 mt-1">→</span>
                )}
              </div>
            );

            return a.link ? (
              <Link key={a.id} href={a.link} className="block hover:bg-card-hover/50 rounded-lg -mx-2 px-2 transition-colors">
                {content}
              </Link>
            ) : (
              <div key={a.id}>{content}</div>
            );
          })}
        </div>
      ) : (
        <div className="py-8 text-center text-sm text-muted">No recent activity.</div>
      )}
    </div>
  );
}

/* ── Dashboard ── */
export default function Dashboard() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(true);

  useEffect(() => {
    fetch("/api/credits/leaderboard")
      .then(r => r.json())
      .then(d => setLeaderboard(d.leaderboard || []))
      .catch(() => {});

    fetch("/api/activity")
      .then(r => r.json())
      .then(d => { setActivities(d.activities || []); setLoadingActivity(false); })
      .catch(() => setLoadingActivity(false));
  }, []);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted mt-1">Team activity and contributions</p>
      </div>
      <NovaPickCard />
      {/* Nova HQ - Pixel Office with integrated leaderboard */}
      <div>
        <h2 className="text-lg font-bold text-foreground tracking-tight mb-3 flex items-center gap-2">
          <span className="text-base">🏢</span> Nova HQ
        </h2>
        <PixelOffice leaderboard={leaderboard} />
      </div>

      <ActivityFeed activities={activities} loading={loadingActivity} />
    </div>
  );
}
