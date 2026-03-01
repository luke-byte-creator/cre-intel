"use client";

import { useEffect, useState, useCallback } from "react";
import { fmtCurrency } from "@/lib/format";

interface Permit {
  id: number;
  permitNumber: string;
  address: string;
  applicant: string;
  estimatedValue: number;
  issueDate: string;
  workType: string;
  description: string;
}

type SortKey = "estimatedValue" | "issueDate" | "address" | "applicant";
type SortDir = "asc" | "desc";

export default function PermitsPage() {
  const [data, setData] = useState<Permit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<SortKey>("estimatedValue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const limit = 50;

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      sortBy, sortDir,
      page: String(page), limit: String(limit),
    });
    if (search) params.set("search", search);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    const res = await fetch(`/api/permits?${params}`);
    const json = await res.json();
    setData(json.data);
    setTotal(json.total);
    setLoading(false);
  }, [sortBy, sortDir, page, search, dateFrom, dateTo]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [search, dateFrom, dateTo, sortBy, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortBy === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(key); setSortDir(key === "estimatedValue" ? "desc" : "asc"); }
  }

  const arrow = (key: SortKey) => sortBy === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Building Permits</h1>
        <p className="text-zinc-400 text-sm mt-1">Commercial permits ≥$350k · {total.toLocaleString()} records</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text" placeholder="Search address or applicant..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white w-64 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        />
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400">From</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400">To</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-400 border-b border-zinc-700">
                  <th className="px-4 py-3 cursor-pointer hover:text-white" onClick={() => toggleSort("address")}>Address{arrow("address")}</th>
                  <th className="px-4 py-3 cursor-pointer hover:text-white" onClick={() => toggleSort("applicant")}>Applicant{arrow("applicant")}</th>
                  <th className="px-4 py-3">Work Type</th>
                  <th className="px-4 py-3 cursor-pointer hover:text-white text-right" onClick={() => toggleSort("estimatedValue")}>Value{arrow("estimatedValue")}</th>
                  <th className="px-4 py-3 cursor-pointer hover:text-white" onClick={() => toggleSort("issueDate")}>Issue Date{arrow("issueDate")}</th>
                  <th className="px-4 py-3">Permit #</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {data.map(p => (
                  <>
                    <tr key={p.id} className="hover:bg-zinc-800/60 cursor-pointer transition-colors"
                      onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                      <td className="px-4 py-3 text-white font-medium">{p.address}</td>
                      <td className="px-4 py-3 text-zinc-300">{p.applicant || "—"}</td>
                      <td className="px-4 py-3 text-zinc-400">{p.workType || "—"}</td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-400">{fmtCurrency(p.estimatedValue)}</td>
                      <td className="px-4 py-3 text-zinc-300">{p.issueDate ? new Date(p.issueDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}</td>
                      <td className="px-4 py-3 text-zinc-500 font-mono text-xs">{p.permitNumber}</td>
                    </tr>
                    {expanded === p.id && (
                      <tr key={`exp-${p.id}`} className="bg-zinc-800/50">
                        <td colSpan={6} className="px-6 py-4">
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                            <div><span className="text-zinc-500 text-xs">Permit #</span><p className="text-white">{p.permitNumber}</p></div>
                            <div><span className="text-zinc-500 text-xs">Address</span><p className="text-white">{p.address}</p></div>
                            <div><span className="text-zinc-500 text-xs">Applicant</span><p className="text-white">{p.applicant || "—"}</p></div>
                            <div><span className="text-zinc-500 text-xs">Work Type</span><p className="text-white">{p.workType || "—"}</p></div>
                            <div><span className="text-zinc-500 text-xs">Estimated Value</span><p className="text-emerald-400 font-mono">{fmtCurrency(p.estimatedValue)}</p></div>
                            <div><span className="text-zinc-500 text-xs">Issue Date</span><p className="text-white">{p.issueDate || "—"}</p></div>
                            {p.description && <div className="col-span-full"><span className="text-zinc-500 text-xs">Description</span><p className="text-zinc-300">{p.description}</p></div>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {data.map(p => (
              <div key={p.id} className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 cursor-pointer"
                onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-white font-medium text-sm">{p.address}</p>
                    <p className="text-zinc-400 text-xs mt-1">{p.applicant || "—"} · {p.workType || "—"}</p>
                  </div>
                  <p className="text-emerald-400 font-mono text-sm">{fmtCurrency(p.estimatedValue)}</p>
                </div>
                <div className="flex justify-between mt-2">
                  <span className="text-zinc-500 text-xs">{p.issueDate || "—"}</span>
                  <span className="text-zinc-600 text-xs font-mono">{p.permitNumber}</span>
                </div>
                {expanded === p.id && p.description && (
                  <p className="text-zinc-300 text-xs mt-3 pt-3 border-t border-zinc-700">{p.description}</p>
                )}
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 pt-4">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-300 hover:bg-zinc-700 disabled:opacity-30">
                ← Prev
              </button>
              <span className="text-sm text-zinc-400">Page {page} of {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-300 hover:bg-zinc-700 disabled:opacity-30">
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
