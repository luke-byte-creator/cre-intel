"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ProfileHeader, ProfileTabs, DetailGrid } from "@/components/ProfileLayout";

interface PropertyData {
  property: Record<string, string | number | null>;
  transactions: Record<string, string | number | null>[];
  permits: Record<string, string | number | null>[];
  comps: Record<string, string | number | null>[];
}

interface WatchStatus { watched: boolean; watchId: number | null; }

export default function PropertyProfile() {
  const { id } = useParams();
  const [data, setData] = useState<PropertyData | null>(null);
  const [watchStatus, setWatchStatus] = useState<WatchStatus>({ watched: false, watchId: null });
  const [tab, setTab] = useState("details");

  useEffect(() => {
    fetch(`/api/properties/${id}`).then((r) => r.json()).then(setData);
    fetch(`/api/watchlist/check?entityType=property&entityId=${id}`).then((r) => r.json()).then(setWatchStatus);
  }, [id]);

  if (!data) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const pr = data.property;
  const label = (pr.address as string) || `Property #${id}`;
  const fmt = (v: number | string | null | undefined) =>
    v != null ? Number(v).toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }) : "—";

  const tabs = [
    { id: "details", label: "Details" },
    { id: "transactions", label: "Transactions", count: (data.comps || []).length },
    { id: "permits", label: "Permits", count: data.permits.length },
  ];

  return (
    <div className="space-y-6">
      <ProfileHeader
        icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h7.5V10.75M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3l-1.5.545m0 6.205l3 1m1.5.5l-1.5-.5M6.75 7.364V3h-3v18m3-13.636l10.5-3.819" /></svg>}
        title={label}
        subtitle={`${pr.propertyType as string || "Property"} · ${pr.city as string || ""}${pr.neighbourhood ? ` · ${pr.neighbourhood}` : ""}`}
        badge={pr.propertyType ? { text: pr.propertyType as string, color: "bg-accent/15 text-accent" } : undefined}
        entityType="property"
        entityId={Number(id)}
        entityLabel={label}
        watched={watchStatus.watched}
        watchId={watchStatus.watchId}
      />

      <ProfileTabs tabs={tabs} activeTab={tab} onTabChange={setTab} />

      <div className="mt-4">
        {tab === "details" && (
          <DetailGrid items={[
            ["Address", pr.address],
            ["Property Type", pr.propertyType],
            ["Neighbourhood", pr.neighbourhood],
            ["City", pr.city],
            ["Province", pr.province],
            ["Parcel ID", pr.parcelId],
            ["Legal Description", pr.legalDescription],
          ]} />
        )}

        {tab === "transactions" && (
          (data.comps || []).length === 0 ? (
            <div className="bg-card border border-card-border rounded-xl p-8 text-center text-muted text-sm">No transactions</div>
          ) : (
            <div className="bg-card border border-card-border rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-card-border">
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold">Type</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold">Date</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold">Parties</th>
                  <th className="px-4 py-3 text-right text-xs uppercase tracking-wider text-muted font-semibold">Price / Rent</th>
                </tr></thead>
                <tbody>
                  {data.comps.map((c, i) => {
                    const isSale = c.type === "Sale";
                    const parties = isSale
                      ? `${c.seller || "—"} → ${c.purchaser || "—"}`
                      : `${c.landlord || "—"} → ${c.tenant || "—"}`;
                    const value = isSale
                      ? fmt(c.salePrice as number)
                      : c.netRentPSF ? `$${Number(c.netRentPSF).toFixed(2)}/sf` : fmt(c.annualRent as number);
                    return (
                      <tr key={i} className={`border-b border-card-border/50 last:border-0 hover:bg-accent/[0.04] ${i % 2 ? "bg-card/30" : ""}`}>
                        <td className="px-4 py-2.5">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${isSale ? "bg-blue-500/15 text-blue-400" : "bg-emerald-500/15 text-emerald-400"}`}>
                            {c.type as string}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">{(c.saleDate as string) || "—"}</td>
                        <td className="px-4 py-2.5">{parties}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{value}</td>
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
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold">Date</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold">Work Type</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted font-semibold">Description</th>
                  <th className="px-4 py-3 text-right text-xs uppercase tracking-wider text-muted font-semibold">Value</th>
                </tr></thead>
                <tbody>
                  {data.permits.map((p, i) => (
                    <tr key={i} className={`border-b border-card-border/50 last:border-0 hover:bg-accent/[0.04] ${i % 2 ? "bg-card/30" : ""}`}>
                      <td className="px-4 py-2.5 font-mono">{(p.permitNumber as string) || "—"}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">{(p.issueDate as string) || "—"}</td>
                      <td className="px-4 py-2.5">{(p.workType as string) || "—"}</td>
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
