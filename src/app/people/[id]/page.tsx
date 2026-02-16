"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ProfileHeader, ProfileTabs, DetailGrid } from "@/components/ProfileLayout";
import { ContactField } from "@/components/ContactField";

interface PersonTransaction {
  id: number;
  type: string;
  address: string;
  saleDate: string | null;
  salePrice: number | null;
  netRentPSF: number | null;
  seller: string | null;
  purchaser: string | null;
  landlord: string | null;
  tenant: string | null;
  propertyType: string | null;
  role: string;
}

interface PersonData {
  person: Record<string, string | number | null>;
  companies: { id: number; name: string; role: string; title: string }[];
  transactions: PersonTransaction[];
}

interface WatchStatus { watched: boolean; watchId: number | null; }

export default function PersonProfile() {
  const { id } = useParams();
  const [data, setData] = useState<PersonData | null>(null);
  const [watchStatus, setWatchStatus] = useState<WatchStatus>({ watched: false, watchId: null });
  const [tab, setTab] = useState("details");

  useEffect(() => {
    fetch(`/api/people/${id}`).then((r) => r.json()).then(setData);
    fetch(`/api/watchlist/check?entityType=person&entityId=${id}`).then((r) => r.json()).then(setWatchStatus);
  }, [id]);

  if (!data) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const p = data.person;
  const fmt = (v: number | string | null | undefined) =>
    v != null ? Number(v).toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }) : "—";

  const tabs = [
    { id: "details", label: "Details" },
    { id: "contact", label: "Contact" },
    { id: "companies", label: "Companies", count: data.companies.length },
    { id: "transactions", label: "Transactions", count: (data.transactions || []).length },
  ];

  return (
    <div className="space-y-6">
      <ProfileHeader
        icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>}
        title={p.fullName as string}
        subtitle="Person Profile"
        entityType="person"
        entityId={Number(id)}
        entityLabel={p.fullName as string}
        watched={watchStatus.watched}
        watchId={watchStatus.watchId}
      />

      <ProfileTabs tabs={tabs} activeTab={tab} onTabChange={setTab} />

      <div className="mt-4">
        {tab === "details" && (
          <DetailGrid items={[
            ["Full Name", p.fullName],
            ["First Name", p.firstName],
            ["Last Name", p.lastName],
            ["Address", p.address],
          ]} />
        )}

        {tab === "contact" && (
          <div className="bg-card border border-card-border rounded-xl p-6 space-y-5">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted/60 font-semibold">Email</label>
              <ContactField personId={Number(id)} field="email" value={p.email as string | null} placeholder="Add email..." />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted/60 font-semibold">Phone</label>
              <ContactField personId={Number(id)} field="phone" value={p.phone as string | null} placeholder="Add phone..." />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted/60 font-semibold">Notes</label>
              <ContactField personId={Number(id)} field="notes" value={p.notes as string | null} placeholder="Add notes..." />
            </div>
          </div>
        )}

        {tab === "companies" && (
          data.companies.length === 0 ? (
            <div className="bg-card border border-card-border rounded-xl p-8 text-center text-muted text-sm">No company associations</div>
          ) : (
            <div className="bg-card border border-card-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-card-border">
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold">Company</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold">Role</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold">Title</th>
                </tr></thead>
                <tbody>
                  {data.companies.map((c, i) => (
                    <tr key={c.id} className={`border-b border-card-border/50 last:border-0 hover:bg-accent/[0.04] ${i % 2 ? "bg-card/30" : ""}`}>
                      <td className="px-4 py-2.5"><Link href={`/companies/${c.id}`} className="text-accent hover:underline font-medium">{c.name}</Link></td>
                      <td className="px-4 py-2.5 text-muted">{c.role || "—"}</td>
                      <td className="px-4 py-2.5 text-muted">{c.title || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {tab === "transactions" && (
          (data.transactions || []).length === 0 ? (
            <div className="bg-card border border-card-border rounded-xl p-8 text-center text-muted text-sm">No transactions through associated companies</div>
          ) : (
            <div className="bg-card border border-card-border rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-card-border">
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold">Date</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold">Type</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold">Role</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold">Address</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold">Counterparty</th>
                  <th className="px-4 py-3 text-right text-xs uppercase tracking-wider text-muted font-semibold">Value</th>
                </tr></thead>
                <tbody>
                  {data.transactions.map((t, i) => {
                    const isSale = t.type === "Sale";
                    const counterparty = t.role === "Seller" ? t.purchaser :
                      t.role === "Purchaser" ? t.seller :
                      t.role === "Landlord" ? t.tenant : t.landlord;
                    const value = isSale && t.salePrice ? fmt(t.salePrice) :
                      !isSale && t.netRentPSF ? `$${t.netRentPSF.toFixed(2)}/SF` : "—";
                    return (
                      <tr key={t.id} className={`border-b border-card-border/50 last:border-0 hover:bg-accent/[0.04] ${i % 2 ? "bg-card/30" : ""}`}>
                        <td className="px-4 py-2.5 whitespace-nowrap">{t.saleDate || "—"}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${isSale ? "bg-blue-500/15 text-blue-400" : "bg-green-500/15 text-green-400"}`}>{t.type}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                            t.role === "Seller" || t.role === "Landlord" ? "bg-amber-500/15 text-amber-400" : "bg-emerald-500/15 text-emerald-400"
                          }`}>{t.role}</span>
                        </td>
                        <td className="px-4 py-2.5">{t.address || "—"}</td>
                        <td className="px-4 py-2.5">{counterparty || "—"}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{value}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
}
