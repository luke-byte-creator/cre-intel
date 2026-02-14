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

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div className="bg-card border border-card-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-muted text-sm">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
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
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted text-sm mt-1">Saskatoon commercial real estate intelligence overview</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Companies" value={counts.companies} icon="🏢" />
        <StatCard label="People" value={counts.people} icon="👤" />
        <StatCard label="Properties" value={counts.properties} icon="🏠" />
        <StatCard label="Transactions" value={counts.transactions} icon="📋" />
        <StatCard label="Permits" value={counts.permits} icon="🔨" />
        <StatCard label="Watchlist" value={counts.watchlist} icon="👁" />
        <StatCard label="Transaction Volume" value={fmt(totals.transactionValue)} icon="💰" />
        <StatCard label="Permit Value" value={fmt(totals.permitValue)} icon="📐" />
      </div>

      {/* Alerts */}
      {counts.unreadAlerts > 0 && (
        <div className="bg-card border border-card-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-card-border flex items-center justify-between">
            <h2 className="font-semibold text-foreground">
              Alerts
              <span className="ml-2 px-2 py-0.5 text-xs bg-danger/20 text-danger rounded-full">
                {counts.unreadAlerts} new
              </span>
            </h2>
          </div>
          <div className="divide-y divide-card-border">
            {stats.recentAlerts.slice(0, 5).map((alert) => (
              <div key={alert.id} className={`px-5 py-3 ${!alert.isRead ? "bg-accent/5" : ""}`}>
                <p className="text-sm font-medium text-foreground">{alert.title}</p>
                <p className="text-xs text-muted mt-0.5">{alert.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Two-column: Recent Transactions + Recent Permits */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent Transactions */}
        <div className="bg-card border border-card-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-card-border">
            <h2 className="font-semibold text-foreground">Recent Transactions</h2>
          </div>
          <div className="divide-y divide-card-border">
            {stats.recentTransactions.map((tx) => (
              <div key={tx.id} className="px-5 py-3">
                <div className="flex justify-between items-start">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {tx.grantee || "Unknown buyer"}
                    </p>
                    <p className="text-xs text-muted mt-0.5">
                      from {tx.grantor || "Unknown seller"} · {tx.transferDate}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-success ml-3 whitespace-nowrap">
                    {tx.price ? fmt(tx.price) : "N/A"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Permits */}
        <div className="bg-card border border-card-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-card-border">
            <h2 className="font-semibold text-foreground">Recent Permits</h2>
          </div>
          <div className="divide-y divide-card-border">
            {stats.recentPermits.map((p) => (
              <div key={p.id} className="px-5 py-3">
                <div className="flex justify-between items-start">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {p.permitNumber} — {p.address}
                    </p>
                    <p className="text-xs text-muted mt-0.5">
                      {p.applicant} · {p.workType} · {p.issueDate}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-warning ml-3 whitespace-nowrap">
                    {p.estimatedValue ? fmt(p.estimatedValue) : "N/A"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Search CTA */}
      <div className="bg-card border border-card-border rounded-xl p-6 text-center">
        <p className="text-muted mb-3">Search companies, people, and properties</p>
        <Link
          href="/search"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors"
        >
          🔍 Open Search
        </Link>
      </div>
    </div>
  );
}
