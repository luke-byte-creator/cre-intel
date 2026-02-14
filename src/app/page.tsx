"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fmtCurrency } from "@/lib/format";

interface QuarterlySale { quarter: string; count: number; volume: number; }
interface QuarterlyPermit { quarter: string; count: number; value: number; }

interface Stats {
  counts: {
    companies: number;
    people: number;
    properties: number;
    sales: number;
    leases: number;
    permits: number;
    activeDeals: number;
    newInquiries: number;
  };
  totals: {
    saleValue: number;
    permitValue: number;
  };
  recentSales: Array<{
    id: number;
    address: string;
    city: string;
    sale_date: string;
    sale_price: number;
    seller: string;
    purchaser: string;
    property_type: string;
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
  quarterlySales: QuarterlySale[];
  quarterlyPermits: QuarterlyPermit[];
}

const fmt = fmtCurrency;

function StatCard({ label, value, color, border, text, icon }: {
  label: string; value: string | number; color: string; border: string; text: string; icon: React.ReactNode;
}) {
  return (
    <div className={`bg-gradient-to-br ${color} border ${border} rounded-xl p-5 hover:scale-[1.02] transition-transform`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-zinc-400 text-sm font-medium">{label}</span>
        <span className={`${text} opacity-80`}>{icon}</span>
      </div>
      <p className="text-3xl font-bold text-white tracking-tight">{value}</p>
    </div>
  );
}

function MiniBarChart({ data, color, isCurrency = true }: { data: { label: string; value: number }[]; color: string; isCurrency?: boolean }) {
  const max = Math.max(...data.map(d => d.value), 1);
  const fmtVal = (v: number) => {
    if (!isCurrency) return String(v);
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
    return `$${v}`;
  };
  return (
    <div className="flex items-end gap-2 h-28">
      {data.map((d) => (
        <div key={d.label} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-xs text-zinc-400 font-mono">{fmtVal(d.value)}</span>
          <div className="w-full rounded-t" style={{ height: `${Math.max((d.value / max) * 80, 4)}px`, backgroundColor: color }} />
          <span className="text-[10px] text-zinc-500">{d.label}</span>
        </div>
      ))}
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
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const { counts, totals } = stats;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Dashboard</h1>
        <p className="text-zinc-400 text-sm mt-1">Saskatoon commercial real estate intelligence overview</p>
      </div>

      {/* Primary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Sale Comps" value={counts.sales.toLocaleString()} color="from-blue-500/20 to-blue-600/5" border="border-blue-500/20" text="text-blue-400" icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>
        } />
        <StatCard label="Lease Comps" value={counts.leases.toLocaleString()} color="from-emerald-500/20 to-emerald-600/5" border="border-emerald-500/20" text="text-emerald-400" icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
        } />
        <StatCard label="Companies" value={counts.companies.toLocaleString()} color="from-violet-500/20 to-violet-600/5" border="border-violet-500/20" text="text-violet-400" icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" /></svg>
        } />
        <StatCard label="People" value={counts.people.toLocaleString()} color="from-amber-500/20 to-amber-600/5" border="border-amber-500/20" text="text-amber-400" icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
        } />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Commercial Permits" value={counts.permits.toLocaleString()} color="from-orange-500/20 to-orange-600/5" border="border-orange-500/20" text="text-orange-400" icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" /></svg>
        } />
        <StatCard label="Active Deals" value={counts.activeDeals} color="from-pink-500/20 to-pink-600/5" border="border-pink-500/20" text="text-pink-400" icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" /></svg>
        } />
        <StatCard label="Sale Volume (3mo)" value={fmt(totals.saleValue)} color="from-cyan-500/20 to-cyan-600/5" border="border-cyan-500/20" text="text-cyan-400" icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>
        } />
        <StatCard label="Permit Value (3mo)" value={fmt(totals.permitValue)} color="from-teal-500/20 to-teal-600/5" border="border-teal-500/20" text="text-teal-400" icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        } />
      </div>

      {/* Charts */}
      {stats.quarterlySales && stats.quarterlySales.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Sale Volume <span className="text-zinc-400 font-normal">(quarterly)</span></h3>
            <MiniBarChart
              data={[...stats.quarterlySales].reverse().slice(-6).map(m => ({ label: m.quarter.replace(/^\d{2}/, "'"), value: m.volume }))}
              color="#22c55e"
            />
          </div>
          <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Permit Value <span className="text-zinc-400 font-normal">(quarterly)</span></h3>
            <MiniBarChart
              data={[...(stats.quarterlyPermits || [])].reverse().slice(-6).map(m => ({ label: m.quarter.replace(/^\d{2}/, "'"), value: m.value }))}
              color="#f59e0b"
            />
          </div>
          <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Sale Count <span className="text-zinc-400 font-normal">(quarterly)</span></h3>
            <MiniBarChart
              data={[...stats.quarterlySales].reverse().slice(-6).map(m => ({ label: m.quarter.replace(/^\d{2}/, "'"), value: m.count }))}
              color="#3b82f6"
              isCurrency={false}
            />
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Recent Activity</h2>
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-px bg-zinc-700" />
          <div className="space-y-0">
            {stats.recentSales.slice(0, 5).map((tx) => (
              <div key={`sale-${tx.id}`} className="relative pl-11 py-3 group">
                <div className="absolute left-[9px] top-4 w-[14px] h-[14px] rounded-full bg-blue-500/20 border-2 border-blue-500 group-hover:scale-125 transition-transform" />
                <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 hover:border-zinc-600">
                  <div className="flex justify-between items-start">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-0.5 rounded bg-blue-500/15 text-blue-400 font-medium">Sale</span>
                        <span className="text-xs text-zinc-400">{tx.sale_date}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300">{tx.property_type}</span>
                      </div>
                      <p className="text-sm font-medium text-white mt-1.5">{tx.address}</p>
                      <p className="text-xs text-zinc-400 mt-0.5">{tx.seller || "—"} → {tx.purchaser || "—"}</p>
                    </div>
                    <span className="text-sm font-semibold text-blue-400 ml-3 whitespace-nowrap font-mono">
                      {tx.sale_price ? fmt(tx.sale_price) : "N/A"}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            {stats.recentPermits.slice(0, 3).map((p) => (
              <div key={`permit-${p.id}`} className="relative pl-11 py-3 group">
                <div className="absolute left-[9px] top-4 w-[14px] h-[14px] rounded-full bg-amber-500/20 border-2 border-amber-500 group-hover:scale-125 transition-transform" />
                <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 hover:border-zinc-600">
                  <div className="flex justify-between items-start">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 font-medium">Permit</span>
                        <span className="text-xs text-zinc-400">{p.issueDate}</span>
                      </div>
                      <p className="text-sm font-medium text-white mt-1.5">{p.permitNumber} — {p.address}</p>
                      <p className="text-xs text-zinc-400 mt-0.5">{p.applicant} · {p.workType}</p>
                    </div>
                    <span className="text-sm font-semibold text-amber-400 ml-3 whitespace-nowrap font-mono">
                      {p.estimatedValue ? fmt(p.estimatedValue) : "N/A"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Link href="/sales" className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 text-center hover:border-blue-500/50 transition-colors">
          <p className="text-sm font-medium text-white">Sale Transactions</p>
          <p className="text-xs text-zinc-400 mt-1">{counts.sales.toLocaleString()} comps</p>
        </Link>
        <Link href="/leases" className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 text-center hover:border-emerald-500/50 transition-colors">
          <p className="text-sm font-medium text-white">Lease Transactions</p>
          <p className="text-xs text-zinc-400 mt-1">{counts.leases.toLocaleString()} comps</p>
        </Link>
        <Link href="/search" className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 text-center hover:border-violet-500/50 transition-colors">
          <p className="text-sm font-medium text-white">Search</p>
          <p className="text-xs text-zinc-400 mt-1">Companies, people, comps</p>
        </Link>
        <Link href="/pipeline" className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 text-center hover:border-pink-500/50 transition-colors">
          <p className="text-sm font-medium text-white">Pipeline</p>
          <p className="text-xs text-zinc-400 mt-1">{counts.activeDeals} active deals</p>
        </Link>
      </div>
    </div>
  );
}
