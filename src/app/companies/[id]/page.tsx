"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ProfileHeader, ProfileTabs, DetailGrid } from "@/components/ProfileLayout";

interface CompanyData {
  company: Record<string, string | number | null>;
  people: { id: number; fullName: string; role: string; title: string; startDate: string }[];
  transactions: Record<string, string | number | null>[];
  permits: Record<string, string | number | null>[];
}

interface WatchStatus { watched: boolean; watchId: number | null; }

export default function CompanyProfile() {
  const { id } = useParams();
  const [data, setData] = useState<CompanyData | null>(null);
  const [watchStatus, setWatchStatus] = useState<WatchStatus>({ watched: false, watchId: null });
  const [tab, setTab] = useState("details");

  useEffect(() => {
    fetch(`/api/companies/${id}`).then((r) => r.json()).then(setData);
    fetch(`/api/watchlist/check?entityType=company&entityId=${id}`).then((r) => r.json()).then(setWatchStatus);
  }, [id]);

  if (!data) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const c = data.company;
  const fmt = (v: number | string | null | undefined) =>
    v != null ? Number(v).toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }) : "—";

  const statusBadge = c.status === "Active"
    ? { text: c.status as string, color: "bg-success/15 text-success" }
    : { text: (c.status as string) || "Unknown", color: "bg-danger/15 text-danger" };

  const tabs = [
    { id: "details", label: "Details" },
    { id: "people", label: "People", count: data.people.length },
    { id: "transactions", label: "Transactions", count: data.transactions.length },
    { id: "permits", label: "Permits", count: data.permits.length },
  ];

  return (
    <div className="space-y-6">
      <ProfileHeader
        icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" /></svg>}
        title={c.name as string}
        subtitle={`${c.type} · Entity #${c.entityNumber}`}
        badge={statusBadge}
        entityType="company"
        entityId={Number(id)}
        entityLabel={c.name as string}
        watched={watchStatus.watched}
        watchId={watchStatus.watchId}
      />

      <ProfileTabs tabs={tabs} activeTab={tab} onTabChange={setTab} />

      <div className="mt-4">
        {tab === "details" && (
          <DetailGrid items={[
            ["Name", c.name],
            ["Type", c.type],
            ["Status", c.status],
            ["Entity Number", c.entityNumber],
            ["Jurisdiction", c.jurisdiction],
            ["Registration Date", c.registrationDate],
            ["Registered Agent", c.registeredAgent],
            ["Registered Address", c.registeredAddress],
          ]} />
        )}

        {tab === "people" && (
          data.people.length === 0 ? (
            <div className="bg-card border border-card-border rounded-xl p-8 text-center text-muted text-sm">No associated people</div>
          ) : (
            <div className="bg-card border border-card-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-card-border">
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold">Name</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold">Role</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold">Title</th>
                </tr></thead>
                <tbody>
                  {data.people.map((p, i) => (
                    <tr key={p.id} className={`border-b border-card-border/50 last:border-0 hover:bg-accent/[0.04] ${i % 2 ? "bg-card/30" : ""}`}>
                      <td className="px-4 py-2.5"><Link href={`/people/${p.id}`} className="text-accent hover:underline font-medium">{p.fullName}</Link></td>
                      <td className="px-4 py-2.5 text-muted">{p.role || "—"}</td>
                      <td className="px-4 py-2.5 text-muted">{p.title || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {tab === "transactions" && (
          data.transactions.length === 0 ? (
            <div className="bg-card border border-card-border rounded-xl p-8 text-center text-muted text-sm">No transactions</div>
          ) : (
            <div className="bg-card border border-card-border rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-card-border">
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold">Date</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold">Type</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold">Grantor</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold">Grantee</th>
                  <th className="px-4 py-3 text-right text-xs uppercase tracking-wider text-muted font-semibold">Price</th>
                </tr></thead>
                <tbody>
                  {data.transactions.map((t, i) => (
                    <tr key={i} className={`border-b border-card-border/50 last:border-0 hover:bg-accent/[0.04] ${i % 2 ? "bg-card/30" : ""}`}>
                      <td className="px-4 py-2.5 whitespace-nowrap">{(t.transferDate as string) || "—"}</td>
                      <td className="px-4 py-2.5">{(t.transactionType as string) || "—"}</td>
                      <td className="px-4 py-2.5">{(t.grantor as string) || "—"}</td>
                      <td className="px-4 py-2.5">{(t.grantee as string) || "—"}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{fmt(t.price as number)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {tab === "permits" && (
          data.permits.length === 0 ? (
            <div className="bg-card border border-card-border rounded-xl p-8 text-center text-muted text-sm">No permits</div>
          ) : (
            <div className="bg-card border border-card-border rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-card-border">
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold">Permit #</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold">Date</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold">Description</th>
                  <th className="px-4 py-3 text-right text-xs uppercase tracking-wider text-muted font-semibold">Value</th>
                </tr></thead>
                <tbody>
                  {data.permits.map((p, i) => (
                    <tr key={i} className={`border-b border-card-border/50 last:border-0 hover:bg-accent/[0.04] ${i % 2 ? "bg-card/30" : ""}`}>
                      <td className="px-4 py-2.5 font-mono">{(p.permitNumber as string) || "—"}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">{(p.issueDate as string) || "—"}</td>
                      <td className="px-4 py-2.5 max-w-xs truncate">{(p.description as string) || "—"}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{fmt(p.estimatedValue as number)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
}
