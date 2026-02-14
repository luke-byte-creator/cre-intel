"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import WatchToggle from "@/components/WatchToggle";

interface CompanyData {
  company: Record<string, string | number | null>;
  people: { id: number; fullName: string; role: string; title: string; startDate: string }[];
  transactions: Record<string, string | number | null>[];
  permits: Record<string, string | number | null>[];
}

interface WatchStatus {
  watched: boolean;
  watchId: number | null;
}

export default function CompanyProfile() {
  const { id } = useParams();
  const router = useRouter();
  const [data, setData] = useState<CompanyData | null>(null);
  const [watchStatus, setWatchStatus] = useState<WatchStatus>({ watched: false, watchId: null });

  useEffect(() => {
    fetch(`/api/companies/${id}`).then((r) => r.json()).then(setData);
    fetch(`/api/watchlist/check?entityType=company&entityId=${id}`).then((r) => r.json()).then(setWatchStatus);
  }, [id]);

  if (!data) return <div className="text-muted p-8">Loading...</div>;

  const c = data.company;
  const fmt = (v: number | string | null | undefined) =>
    v != null ? Number(v).toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }) : "—";

  return (
    <div className="space-y-6">
      <button onClick={() => router.back()} className="text-sm text-muted hover:text-foreground">← Back</button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{c.name as string}</h1>
          <p className="text-muted text-sm mt-1">
            {c.type} · {c.status} · Entity #{c.entityNumber}
          </p>
        </div>
        <WatchToggle entityType="company" entityId={Number(id)} entityLabel={c.name as string} initialWatched={watchStatus.watched} watchId={watchStatus.watchId} />
      </div>

      {/* Details */}
      <div className="bg-card border border-card-border rounded-xl p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        {[
          ["Jurisdiction", c.jurisdiction],
          ["Registration Date", c.registrationDate],
          ["Registered Agent", c.registeredAgent],
          ["Registered Address", c.registeredAddress],
        ].map(([label, val]) => (
          <div key={label as string}>
            <span className="text-muted">{label as string}</span>
            <p className="text-foreground mt-0.5">{(val as string) || "—"}</p>
          </div>
        ))}
      </div>

      {/* People */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3">People</h2>
        {data.people.length === 0 ? (
          <p className="text-muted text-sm">No associated people</p>
        ) : (
          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-card-border">
                  <th className="px-4 py-3 text-left text-muted font-medium">Name</th>
                  <th className="px-4 py-3 text-left text-muted font-medium">Role</th>
                  <th className="px-4 py-3 text-left text-muted font-medium">Title</th>
                </tr>
              </thead>
              <tbody>
                {data.people.map((p) => (
                  <tr key={p.id} className="border-b border-card-border last:border-0 hover:bg-white/5">
                    <td className="px-4 py-2.5">
                      <Link href={`/people/${p.id}`} className="text-accent hover:underline">{p.fullName}</Link>
                    </td>
                    <td className="px-4 py-2.5 text-muted">{p.role || "—"}</td>
                    <td className="px-4 py-2.5 text-muted">{p.title || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Transactions */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3">Transactions</h2>
        {data.transactions.length === 0 ? (
          <p className="text-muted text-sm">No transactions</p>
        ) : (
          <div className="bg-card border border-card-border rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-card-border">
                  <th className="px-4 py-3 text-left text-muted font-medium">Date</th>
                  <th className="px-4 py-3 text-left text-muted font-medium">Type</th>
                  <th className="px-4 py-3 text-left text-muted font-medium">Grantor</th>
                  <th className="px-4 py-3 text-left text-muted font-medium">Grantee</th>
                  <th className="px-4 py-3 text-right text-muted font-medium">Price</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((t, i) => (
                  <tr key={i} className="border-b border-card-border last:border-0 hover:bg-white/5">
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
        )}
      </div>

      {/* Permits */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3">Building Permits</h2>
        {data.permits.length === 0 ? (
          <p className="text-muted text-sm">No permits</p>
        ) : (
          <div className="bg-card border border-card-border rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-card-border">
                  <th className="px-4 py-3 text-left text-muted font-medium">Permit #</th>
                  <th className="px-4 py-3 text-left text-muted font-medium">Date</th>
                  <th className="px-4 py-3 text-left text-muted font-medium">Description</th>
                  <th className="px-4 py-3 text-right text-muted font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {data.permits.map((p, i) => (
                  <tr key={i} className="border-b border-card-border last:border-0 hover:bg-white/5">
                    <td className="px-4 py-2.5 font-mono">{(p.permitNumber as string) || "—"}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{(p.issueDate as string) || "—"}</td>
                    <td className="px-4 py-2.5 max-w-xs truncate">{(p.description as string) || "—"}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{fmt(p.estimatedValue as number)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
