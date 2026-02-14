"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ProfileHeader, ProfileTabs, DetailGrid } from "@/components/ProfileLayout";

interface Person {
  id: number;
  fullName: string;
  role: string;
  title: string;
  startDate: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
}

interface CompanyData {
  company: Record<string, string | number | null>;
  people: Person[];
  transactions: Record<string, string | number | null>[];
  permits: Record<string, string | number | null>[];
}

interface WatchStatus { watched: boolean; watchId: number | null; }

const typeBadgeColors: Record<string, string> = {
  Retail: "bg-blue-500/15 text-blue-400",
  Office: "bg-violet-500/15 text-violet-400",
  Industrial: "bg-amber-500/15 text-amber-400",
  Multifamily: "bg-emerald-500/15 text-emerald-400",
};

import { ContactField } from "@/components/ContactField";

export default function CompanyProfile() {
  const { id } = useParams();
  const [data, setData] = useState<CompanyData | null>(null);
  const [watchStatus, setWatchStatus] = useState<WatchStatus>({ watched: false, watchId: null });
  const [tab, setTab] = useState("details");
  const [expandedPerson, setExpandedPerson] = useState<number | null>(null);

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
  if (!c) return (
    <div className="flex items-center justify-center h-64 text-muted">Company not found</div>
  );
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
                    <>
                      <tr
                        key={p.id}
                        className={`border-b border-card-border/50 last:border-0 hover:bg-accent/[0.04] cursor-pointer ${i % 2 ? "bg-card/30" : ""}`}
                        onClick={() => setExpandedPerson(expandedPerson === p.id ? null : p.id)}
                      >
                        <td className="px-4 py-2.5">
                          <Link href={`/people/${p.id}`} className="text-accent hover:underline font-medium" onClick={(e) => e.stopPropagation()}>{p.fullName}</Link>
                        </td>
                        <td className="px-4 py-2.5 text-muted">{p.role || "—"}</td>
                        <td className="px-4 py-2.5 text-muted">{p.title || "—"}</td>
                      </tr>
                      {expandedPerson === p.id && (
                        <tr key={`${p.id}-contact`} className={i % 2 ? "bg-card/30" : ""}>
                          <td colSpan={3} className="px-4 pb-3 pt-0">
                            <div className="grid grid-cols-3 gap-4 pl-2 border-l-2 border-accent/20 ml-1">
                              <div>
                                <label className="text-[10px] uppercase tracking-wider text-muted/60 font-semibold">Email</label>
                                <ContactField personId={p.id} field="email" value={p.email} placeholder="Add email..." />
                              </div>
                              <div>
                                <label className="text-[10px] uppercase tracking-wider text-muted/60 font-semibold">Phone</label>
                                <ContactField personId={p.id} field="phone" value={p.phone} placeholder="Add phone..." />
                              </div>
                              <div>
                                <label className="text-[10px] uppercase tracking-wider text-muted/60 font-semibold">Notes</label>
                                <ContactField personId={p.id} field="notes" value={p.notes} placeholder="Add notes..." />
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
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
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold">Address</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold">Type</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold">Vendor</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold">Purchaser</th>
                  <th className="px-4 py-3 text-right text-xs uppercase tracking-wider text-muted font-semibold">Price</th>
                </tr></thead>
                <tbody>
                  {data.transactions.map((t, i) => {
                    const pType = (t.propertyType as string) || "Other";
                    const badgeColor = typeBadgeColors[pType] || "bg-gray-500/15 text-gray-400";
                    return (
                      <tr key={i} className={`border-b border-card-border/50 last:border-0 hover:bg-accent/[0.04] ${i % 2 ? "bg-card/30" : ""}`}>
                        <td className="px-4 py-2.5 whitespace-nowrap">{(t.transferDate as string) || "—"}</td>
                        <td className="px-4 py-2.5">{(t.propertyAddress as string) || "—"}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${badgeColor}`}>{pType}</span>
                        </td>
                        <td className="px-4 py-2.5">{(t.grantor as string) || "—"}</td>
                        <td className="px-4 py-2.5">{(t.grantee as string) || "—"}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{fmt(t.price as number)}</td>
                      </tr>
                    );
                  })}
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
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold">Address</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold">Date</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold">Description</th>
                  <th className="px-4 py-3 text-right text-xs uppercase tracking-wider text-muted font-semibold">Value</th>
                </tr></thead>
                <tbody>
                  {data.permits.map((p, i) => (
                    <tr key={i} className={`border-b border-card-border/50 last:border-0 hover:bg-accent/[0.04] ${i % 2 ? "bg-card/30" : ""}`}>
                      <td className="px-4 py-2.5 font-mono">{(p.permitNumber as string) || "—"}</td>
                      <td className="px-4 py-2.5">{(p.address as string) || "—"}</td>
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
