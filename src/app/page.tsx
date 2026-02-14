"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Stats {
  counts: {
    companies: number;
    people: number;
    properties: number;
    transactions: number;
    permits: number;
    watchlist: number;
    unreadAlerts: number;
  };
  totals: {
    transactionValue: number;
    permitValue: number;
  };
  recentTransactions: Array<{
    id: number;
    transferDate: string;
    price: number;
    grantor: string;
    grantee: string;
    transactionType: string;
    propertyId: number;
  }>;
  recentPermits: Array<{
    id: number;
    permitNumber: string;
    address: string;
    applicant: string;
    estimatedValue: number;
    issueDate: string;
    workType: string;
  }>;
  recentAlerts: Array<{
    id: number;
    title: string;
    description: string;
    alertType: string;
    isRead: boolean;
    createdAt: string;
  }>;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

const statConfig = [
  { key: "companies", label: "Companies", color: "from-blue-500/20 to-blue-600/5", border: "border-blue-500/20", text: "text-blue-400", icon: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" /></svg>
  )},
  { key: "people", label: "People", color: "from-violet-500/20 to-violet-600/5", border: "border-violet-500/20", text: "text-violet-400", icon: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
  )},
  { key: "properties", label: "Properties", color: "from-emerald-500/20 to-emerald-600/5", border: "border-emerald-500/20", text: "text-emerald-400", icon: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h7.5V10.75M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3l-1.5.545m0 6.205l3 1m1.5.5l-1.5-.5M6.75 7.364V3h-3v18m3-13.636l10.5-3.819" /></svg>
  )},
  { key: "transactions", label: "Transactions", color: "from-amber-500/20 to-amber-600/5", border: "border-amber-500/20", text: "text-amber-400", icon: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>
  )},
];

function StatCard({ label, value, color, border, text, icon }: {
  label: string; value: string | number; color: string; border: string; text: string; icon: React.ReactNode;
}) {
  return (
    <div className={`bg-gradient-to-br ${color} border ${border} rounded-xl p-5 hover:scale-[1.02] transition-transform`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-muted text-sm font-medium">{label}</span>
        <span className={`${text} opacity-80`}>{icon}</span>
      </div>
      <p className="text-3xl font-bold text-foreground tracking-tight">{value}</p>
    </div>
  );
}

function AlertIcon({ type }: { type: string }) {
  if (type === "price_change" || type === "transaction") return (
    <div className="w-8 h-8 rounded-full bg-success/15 text-success flex items-center justify-center flex-shrink-0">
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    </div>
  );
  if (type === "permit") return (
    <div className="w-8 h-8 rounded-full bg-warning/15 text-warning flex items-center justify-center flex-shrink-0">
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-5.1-5.1m0 0L11.42 4.96m-5.1 5.11h13.26" /></svg>
    </div>
  );
  return (
    <div className="w-8 h-8 rounded-full bg-accent/15 text-accent flex items-center justify-center flex-shrink-0">
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats").then((r) => r.json()).then(setStats);
  }, []);

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const { counts, totals } = stats;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Dashboard</h1>
        <p className="text-muted text-sm mt-1">Saskatoon commercial real estate intelligence overview</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statConfig.map((s) => (
          <StatCard
            key={s.key}
            label={s.label}
            value={counts[s.key as keyof typeof counts]}
            color={s.color}
            border={s.border}
            text={s.text}
            icon={s.icon}
          />
        ))}
      </div>

      {/* Secondary stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Permits" value={counts.permits} color="from-orange-500/20 to-orange-600/5" border="border-orange-500/20" text="text-orange-400" icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-5.1-5.1m0 0L11.42 4.96m-5.1 5.11h13.26" /></svg>
        } />
        <StatCard label="Watchlist" value={counts.watchlist} color="from-pink-500/20 to-pink-600/5" border="border-pink-500/20" text="text-pink-400" icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        } />
        <StatCard label="Transaction Vol." value={fmt(totals.transactionValue)} color="from-cyan-500/20 to-cyan-600/5" border="border-cyan-500/20" text="text-cyan-400" icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>
        } />
        <StatCard label="Permit Value" value={fmt(totals.permitValue)} color="from-teal-500/20 to-teal-600/5" border="border-teal-500/20" text="text-teal-400" icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" /></svg>
        } />
      </div>

      {/* Alerts - prominent */}
      {counts.unreadAlerts > 0 && (
        <div className="bg-gradient-to-r from-danger/10 via-card to-card border border-danger/30 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-danger/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-danger animate-pulse" />
              <h2 className="font-semibold text-foreground">
                Alerts
              </h2>
              <span className="px-2 py-0.5 text-xs bg-danger/20 text-danger rounded-full font-medium">
                {counts.unreadAlerts} new
              </span>
            </div>
          </div>
          <div className="divide-y divide-card-border">
            {stats.recentAlerts.slice(0, 5).map((alert) => (
              <div key={alert.id} className={`px-5 py-3.5 flex items-start gap-3 ${!alert.isRead ? "bg-danger/[0.03]" : ""}`}>
                <AlertIcon type={alert.alertType} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{alert.title}</p>
                  <p className="text-xs text-muted mt-0.5">{alert.description}</p>
                  <p className="text-xs text-muted/60 mt-1">{new Date(alert.createdAt).toLocaleDateString()}</p>
                </div>
                {!alert.isRead && <div className="w-2 h-2 rounded-full bg-danger mt-1.5 flex-shrink-0" />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity Timeline */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Recent Activity</h2>
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-px bg-card-border" />
          
          <div className="space-y-0">
            {/* Transactions */}
            {stats.recentTransactions.slice(0, 4).map((tx) => (
              <div key={`tx-${tx.id}`} className="relative pl-11 py-3 group">
                <div className="absolute left-[9px] top-4 w-[14px] h-[14px] rounded-full bg-success/20 border-2 border-success group-hover:scale-125 transition-transform" />
                <div className="bg-card border border-card-border rounded-lg p-4 hover:border-card-hover hover:bg-card-hover/50">
                  <div className="flex justify-between items-start">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-0.5 rounded bg-success/15 text-success font-medium">Transaction</span>
                        <span className="text-xs text-muted">{tx.transferDate}</span>
                      </div>
                      <p className="text-sm font-medium text-foreground mt-1.5 truncate">
                        {tx.grantee || "Unknown"} ← {tx.grantor || "Unknown"}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-success ml-3 whitespace-nowrap font-mono">
                      {tx.price ? fmt(tx.price) : "N/A"}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            {/* Permits */}
            {stats.recentPermits.slice(0, 4).map((p) => (
              <div key={`permit-${p.id}`} className="relative pl-11 py-3 group">
                <div className="absolute left-[9px] top-4 w-[14px] h-[14px] rounded-full bg-warning/20 border-2 border-warning group-hover:scale-125 transition-transform" />
                <div className="bg-card border border-card-border rounded-lg p-4 hover:border-card-hover hover:bg-card-hover/50">
                  <div className="flex justify-between items-start">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-0.5 rounded bg-warning/15 text-warning font-medium">Permit</span>
                        <span className="text-xs text-muted">{p.issueDate}</span>
                      </div>
                      <p className="text-sm font-medium text-foreground mt-1.5 truncate">
                        {p.permitNumber} — {p.address}
                      </p>
                      <p className="text-xs text-muted mt-0.5">{p.applicant} · {p.workType}</p>
                    </div>
                    <span className="text-sm font-semibold text-warning ml-3 whitespace-nowrap font-mono">
                      {p.estimatedValue ? fmt(p.estimatedValue) : "N/A"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Search CTA */}
      <div className="bg-gradient-to-br from-accent/10 via-card to-card border border-accent/20 rounded-xl p-8 text-center">
        <p className="text-muted mb-4">Search companies, people, and properties</p>
        <Link
          href="/search"
          className="inline-flex items-center gap-2 px-6 py-3 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium shadow-lg shadow-accent/20 hover:shadow-accent/30 transition-all hover:scale-[1.02]"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
          Open Search
        </Link>
      </div>
    </div>
  );
}
