"use client";

import { Fragment, useEffect, useState, useMemo, useCallback } from "react";

interface Building {
  address: string;
  id: string | null;
  city: string;
  postalCode: string | null;
  areaSF: number | null;
  neighborhood: string | null;
  permitDate: string | null;
  addition: string | null;
  businessName: string | null;
  businessDesc: string | null;
  siteId: number | null;
  gradeSF: number | null;
  upperSF: number | null;
  citySF: number | null;
}

type SortKey = keyof Building;
type SortDir = "asc" | "desc";

const SIZE_RANGES = [
  { label: "All Sizes", min: 0, max: Infinity },
  { label: "< 5,000 SF", min: 0, max: 5000 },
  { label: "5,000 – 25,000 SF", min: 5000, max: 25000 },
  { label: "25,000 – 100,000 SF", min: 25000, max: 100000 },
  { label: "100,000+ SF", min: 100000, max: Infinity },
];

function fmtSF(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString() + " SF";
}

export default function InventoryTab() {
  const [data, setData] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [sizeRange, setSizeRange] = useState(0);
  const [occupancy, setOccupancy] = useState<"all" | "vacant" | "occupied">("all");
  const [sortKey, setSortKey] = useState<SortKey>("areaSF");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editBuilding, setEditBuilding] = useState<Building | null>(null);
  const [editForm, setEditForm] = useState<Partial<Building>>({});
  const [saving, setSaving] = useState(false);
  const PAGE_SIZE = 50;

  useEffect(() => {
    fetch("/data/inventory.json")
      .then((r) => r.json())
      .then((d: Building[]) => {
        setData(d);
        setLoading(false);
      });
  }, []);

  const neighborhoods = useMemo(() => {
    const set = new Set<string>();
    data.forEach((b) => b.neighborhood && set.add(b.neighborhood));
    return Array.from(set).sort();
  }, [data]);

  const filtered = useMemo(() => {
    let result = data;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (b) =>
          b.address.toLowerCase().includes(q) ||
          (b.businessName && b.businessName.toLowerCase().includes(q)) ||
          (b.businessDesc && b.businessDesc.toLowerCase().includes(q)) ||
          (b.id && b.id.toLowerCase().includes(q)) ||
          (b.postalCode && b.postalCode.toLowerCase().includes(q))
      );
    }

    if (neighborhood) {
      result = result.filter((b) => b.neighborhood === neighborhood);
    }

    const range = SIZE_RANGES[sizeRange];
    if (range.min > 0 || range.max < Infinity) {
      result = result.filter(
        (b) => b.areaSF != null && b.areaSF >= range.min && b.areaSF < range.max
      );
    }

    if (occupancy === "vacant") {
      result = result.filter((b) => !b.businessName);
    } else if (occupancy === "occupied") {
      result = result.filter((b) => !!b.businessName);
    }

    return result;
  }, [data, search, neighborhood, sizeRange, occupancy]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const paged = sorted.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir(key === "areaSF" ? "desc" : "asc");
      }
      setPage(0);
    },
    [sortKey]
  );

  const totalSF = useMemo(() => {
    return filtered.reduce((sum, b) => sum + (b.areaSF || 0), 0);
  }, [filtered]);

  const openEdit = (b: Building) => {
    setEditBuilding(b);
    setEditForm({
      businessName: b.businessName || "",
      businessDesc: b.businessDesc || "",
      areaSF: b.areaSF,
      neighborhood: b.neighborhood || "",
      postalCode: b.postalCode || "",
      permitDate: b.permitDate || "",
      gradeSF: b.gradeSF,
      upperSF: b.upperSF,
      citySF: b.citySF,
    });
  };

  const saveEdit = async () => {
    if (!editBuilding?.id) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/industrial/${encodeURIComponent(editBuilding.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        const updated = await res.json();
        setData((prev) =>
          prev.map((b) => (b.id === editBuilding.id ? { ...b, ...updated } : b))
        );
        setEditBuilding(null);
      }
    } finally {
      setSaving(false);
    }
  };

  const exportCSV = useCallback(() => {
    const cols = [
      "address", "id", "neighborhood", "areaSF", "businessName", "businessDesc",
      "city", "postalCode", "permitDate", "addition", "gradeSF", "upperSF", "citySF", "siteId",
    ] as const;
    const labels = [
      "Address", "ID", "Neighborhood", "Area SF", "Business Name", "Business Desc",
      "City", "Postal Code", "Permit Date", "Addition", "Grade SF", "Upper SF", "City SF", "Site ID",
    ];
    const header = labels.join(",");
    const rows = sorted.map((b) =>
      cols.map((k) => {
        const v = b[k];
        const s = v == null ? "" : String(v);
        return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(",")
    );
    const blob = new Blob([header + "\n" + rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "saskatoon-industrial-inventory.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [sorted]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          Industrial Inventory
        </h1>
        <p className="text-muted text-sm mt-1">
          Saskatoon Industrial Building Master Inventory: {data.length.toLocaleString()} buildings in 12 neighbourhoods
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/5 border border-blue-500/20 rounded-xl p-4">
          <p className="text-muted text-xs font-medium mb-1">Buildings</p>
          <p className="text-2xl font-bold text-foreground">{filtered.length.toLocaleString()}</p>
          {filtered.length !== data.length && (
            <p className="text-xs text-muted mt-0.5">of {data.length.toLocaleString()}</p>
          )}
        </div>
        <div className="bg-gradient-to-br from-emerald-500/20 to-emerald-600/5 border border-emerald-500/20 rounded-xl p-4">
          <p className="text-muted text-xs font-medium mb-1">Total SF</p>
          <p className="text-2xl font-bold text-foreground">{(totalSF / 1_000_000).toFixed(1)}M</p>
        </div>
        <div className="bg-gradient-to-br from-amber-500/20 to-amber-600/5 border border-amber-500/20 rounded-xl p-4">
          <p className="text-muted text-xs font-medium mb-1">Vacancy Rate</p>
          <p className="text-2xl font-bold text-foreground">
            {filtered.length > 0 ? ((filtered.filter((b) => !b.businessName).length / filtered.length) * 100).toFixed(2) : "0.00"}%
          </p>
          <p className="text-xs text-muted mt-0.5">
            {filtered.filter((b) => !b.businessName).length.toLocaleString()} vacant
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted"
            fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Search address, tenant, description..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="w-full bg-background border border-card-border rounded-lg pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent"
          />
        </div>

        <select
          value={neighborhood}
          onChange={(e) => { setNeighborhood(e.target.value); setPage(0); }}
          className="bg-card border border-card-border rounded-lg px-3 py-2 text-sm text-foreground cursor-pointer hover:border-muted focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="">All Neighborhoods</option>
          {neighborhoods.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>

        <select
          value={sizeRange}
          onChange={(e) => { setSizeRange(Number(e.target.value)); setPage(0); }}
          className="bg-card border border-card-border rounded-lg px-3 py-2 text-sm text-foreground cursor-pointer hover:border-muted focus:outline-none focus:ring-1 focus:ring-accent"
        >
          {SIZE_RANGES.map((r, i) => (
            <option key={i} value={i}>{r.label}</option>
          ))}
        </select>

        <select
          value={occupancy}
          onChange={(e) => { setOccupancy(e.target.value as "all" | "vacant" | "occupied"); setPage(0); }}
          className="bg-card border border-card-border rounded-lg px-3 py-2 text-sm text-foreground cursor-pointer hover:border-muted focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="all">All Occupancy</option>
          <option value="vacant">Vacant Only</option>
          <option value="occupied">Occupied Only</option>
        </select>

        <button
          onClick={exportCSV}
          className="bg-card border border-card-border rounded-lg px-3 py-2 text-sm text-muted hover:text-foreground hover:border-muted flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          CSV
        </button>

        <span className="text-xs text-muted ml-auto tabular-nums">
          {sorted.length.toLocaleString()} result{sorted.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-card-border max-h-[70vh] overflow-y-auto sticky-header">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-card-border">
              {([
                { key: "address" as SortKey, label: "Address" },
                { key: "neighborhood" as SortKey, label: "Neighborhood" },
                { key: "areaSF" as SortKey, label: "Area SF", align: "right" as const },
                { key: "businessName" as SortKey, label: "Tenant / Business" },
                { key: "permitDate" as SortKey, label: "Permit / Constructed" },
                { key: "postalCode" as SortKey, label: "Postal Code" },
              ]).map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={`px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted whitespace-nowrap cursor-pointer hover:text-foreground select-none ${
                    col.align === "right" ? "text-right" : "text-left"
                  }`}
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    {sortKey === col.key && (
                      <span className="text-accent">{sortDir === "asc" ? "↑" : "↓"}</span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted">
                  No buildings match your filters
                </td>
              </tr>
            ) : (
              paged.map((b, i) => {
                const rowKey = `${b.address}-${b.id || i}`;
                return (
                <Fragment key={rowKey}>
                  <tr
                    onClick={() => setExpanded(expanded === rowKey ? null : rowKey)}
                    className={`border-b border-card-border/50 last:border-0 cursor-pointer ${
                      i % 2 === 0 ? "bg-background" : "bg-card/30"
                    } hover:bg-accent/[0.04]`}
                  >
                    <td className="px-4 py-2.5 font-medium text-foreground whitespace-nowrap">
                      {b.address}
                    </td>
                    <td className="px-4 py-2.5 text-muted whitespace-nowrap">{b.neighborhood || "—"}</td>
                    <td className="px-4 py-2.5 text-right font-mono whitespace-nowrap">
                      {fmtSF(b.areaSF)}
                    </td>
                    <td className="px-4 py-2.5 text-muted max-w-[250px] truncate">
                      {b.businessName || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-muted whitespace-nowrap">{b.permitDate || "—"}</td>
                    <td className="px-4 py-2.5 text-muted whitespace-nowrap">{b.postalCode || "—"}</td>
                  </tr>
                  {expanded === rowKey && (
                    <tr className="bg-accent/[0.03]">
                      <td colSpan={6} className="px-6 py-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-muted text-xs font-medium mb-0.5">Building ID</p>
                            <p className="text-foreground">{b.id || "—"}</p>
                          </div>
                          <div>
                            <p className="text-muted text-xs font-medium mb-0.5">City</p>
                            <p className="text-foreground">{b.city}</p>
                          </div>
                          <div>
                            <p className="text-muted text-xs font-medium mb-0.5">Grade SF</p>
                            <p className="text-foreground font-mono">{fmtSF(b.gradeSF)}</p>
                          </div>
                          <div>
                            <p className="text-muted text-xs font-medium mb-0.5">Upper SF</p>
                            <p className="text-foreground font-mono">{fmtSF(b.upperSF)}</p>
                          </div>
                          <div>
                            <p className="text-muted text-xs font-medium mb-0.5">City SF (Total)</p>
                            <p className="text-foreground font-mono">{fmtSF(b.citySF)}</p>
                          </div>
                          <div>
                            <p className="text-muted text-xs font-medium mb-0.5">Site ID</p>
                            <p className="text-foreground">{b.siteId || "—"}</p>
                          </div>
                          <div>
                            <p className="text-muted text-xs font-medium mb-0.5">Addition</p>
                            <p className="text-foreground">{b.addition || "—"}</p>
                          </div>
                          <div>
                            <p className="text-muted text-xs font-medium mb-0.5">Postal Code</p>
                            <p className="text-foreground">{b.postalCode || "—"}</p>
                          </div>
                          {b.businessDesc && (
                            <div className="col-span-2 md:col-span-4">
                              <p className="text-muted text-xs font-medium mb-0.5">Business Description</p>
                              <p className="text-foreground">{b.businessDesc}</p>
                            </div>
                          )}
                        </div>
                        {b.id && (
                          <button
                            onClick={(e) => { e.stopPropagation(); openEdit(b); }}
                            className="mt-4 px-4 py-1.5 bg-accent/20 text-accent border border-accent/30 rounded-lg text-sm font-medium hover:bg-accent/30 transition-colors"
                          >
                            ✏️ Edit Building
                          </button>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <button
            disabled={currentPage === 0}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 rounded-lg bg-card border border-card-border text-muted hover:text-foreground hover:border-muted disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Prev
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let p: number;
              if (totalPages <= 5) p = i;
              else if (currentPage < 3) p = i;
              else if (currentPage > totalPages - 4) p = totalPages - 5 + i;
              else p = currentPage - 2 + i;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-8 h-8 rounded-lg text-xs font-medium ${
                    p === currentPage
                      ? "bg-accent text-white"
                      : "text-muted hover:text-foreground hover:bg-white/5"
                  }`}
                >
                  {p + 1}
                </button>
              );
            })}
          </div>
          <button
            disabled={currentPage >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 rounded-lg bg-card border border-card-border text-muted hover:text-foreground hover:border-muted disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
          >
            Next
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
      )}

      {/* Edit Modal */}
      {editBuilding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setEditBuilding(null)}>
          <div className="bg-card border border-card-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-card-border flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-foreground">Edit Building</h2>
                <p className="text-sm text-muted">{editBuilding.address}</p>
              </div>
              <button onClick={() => setEditBuilding(null)} className="text-muted hover:text-foreground text-xl">×</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Tenant / Business Name</label>
                <input
                  type="text"
                  value={editForm.businessName || ""}
                  onChange={(e) => setEditForm({ ...editForm, businessName: e.target.value })}
                  className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Business Description</label>
                <textarea
                  value={editForm.businessDesc || ""}
                  onChange={(e) => setEditForm({ ...editForm, businessDesc: e.target.value })}
                  rows={2}
                  className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Area SF</label>
                  <input
                    type="number"
                    value={editForm.areaSF ?? ""}
                    onChange={(e) => setEditForm({ ...editForm, areaSF: e.target.value ? Number(e.target.value) : null })}
                    className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Neighborhood</label>
                  <input
                    type="text"
                    value={editForm.neighborhood || ""}
                    onChange={(e) => setEditForm({ ...editForm, neighborhood: e.target.value })}
                    className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Postal Code</label>
                  <input
                    type="text"
                    value={editForm.postalCode || ""}
                    onChange={(e) => setEditForm({ ...editForm, postalCode: e.target.value })}
                    className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Permit / Constructed</label>
                  <input
                    type="text"
                    value={editForm.permitDate || ""}
                    onChange={(e) => setEditForm({ ...editForm, permitDate: e.target.value })}
                    className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Grade SF</label>
                  <input
                    type="number"
                    value={editForm.gradeSF ?? ""}
                    onChange={(e) => setEditForm({ ...editForm, gradeSF: e.target.value ? Number(e.target.value) : null })}
                    className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Upper SF</label>
                  <input
                    type="number"
                    value={editForm.upperSF ?? ""}
                    onChange={(e) => setEditForm({ ...editForm, upperSF: e.target.value ? Number(e.target.value) : null })}
                    className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">City SF</label>
                  <input
                    type="number"
                    value={editForm.citySF ?? ""}
                    onChange={(e) => setEditForm({ ...editForm, citySF: e.target.value ? Number(e.target.value) : null })}
                    className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-card-border flex items-center justify-between">
              <p className="text-xs text-muted">+1 credit for edit</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditBuilding(null)}
                  className="px-4 py-2 text-sm text-muted hover:text-foreground rounded-lg border border-card-border hover:border-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEdit}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
