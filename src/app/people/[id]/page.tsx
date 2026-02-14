"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import WatchToggle from "@/components/WatchToggle";

interface PersonData {
  person: Record<string, string | number | null>;
  companies: { id: number; name: string; role: string; title: string }[];
}

interface WatchStatus { watched: boolean; watchId: number | null; }

export default function PersonProfile() {
  const { id } = useParams();
  const router = useRouter();
  const [data, setData] = useState<PersonData | null>(null);
  const [watchStatus, setWatchStatus] = useState<WatchStatus>({ watched: false, watchId: null });

  useEffect(() => {
    fetch(`/api/people/${id}`).then((r) => r.json()).then(setData);
    fetch(`/api/watchlist/check?entityType=person&entityId=${id}`).then((r) => r.json()).then(setWatchStatus);
  }, [id]);

  if (!data) return <div className="text-muted p-8">Loading...</div>;

  const p = data.person;

  return (
    <div className="space-y-6">
      <button onClick={() => router.back()} className="text-sm text-muted hover:text-foreground">← Back</button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{p.fullName as string}</h1>
          <p className="text-muted text-sm mt-1">Person Profile</p>
        </div>
        <WatchToggle entityType="person" entityId={Number(id)} entityLabel={p.fullName as string} initialWatched={watchStatus.watched} watchId={watchStatus.watchId} />
      </div>

      <div className="bg-card border border-card-border rounded-xl p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        {[
          ["First Name", p.firstName],
          ["Last Name", p.lastName],
          ["Address", p.address],
        ].map(([label, val]) => (
          <div key={label as string}>
            <span className="text-muted">{label as string}</span>
            <p className="text-foreground mt-0.5">{(val as string) || "—"}</p>
          </div>
        ))}
      </div>

      {/* Company associations */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3">Company Associations</h2>
        {data.companies.length === 0 ? (
          <p className="text-muted text-sm">No company associations</p>
        ) : (
          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-card-border">
                  <th className="px-4 py-3 text-left text-muted font-medium">Company</th>
                  <th className="px-4 py-3 text-left text-muted font-medium">Role</th>
                  <th className="px-4 py-3 text-left text-muted font-medium">Title</th>
                </tr>
              </thead>
              <tbody>
                {data.companies.map((c) => (
                  <tr key={c.id} className="border-b border-card-border last:border-0 hover:bg-white/5">
                    <td className="px-4 py-2.5">
                      <Link href={`/companies/${c.id}`} className="text-accent hover:underline">{c.name}</Link>
                    </td>
                    <td className="px-4 py-2.5 text-muted">{c.role || "—"}</td>
                    <td className="px-4 py-2.5 text-muted">{c.title || "—"}</td>
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
