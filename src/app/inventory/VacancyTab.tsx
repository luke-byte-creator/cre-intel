"use client";

import { useEffect, useState, useMemo, useCallback } from "react";

interface Vacancy {
  id: number;
  buildingId: number | null;
  address: string;
  availableSF: number | null;
  totalBuildingSF: number | null;
  askingRent: number | null;
  rentBasis: string | null;
  occupancyCost: number | null;
  listingBrokerage: string | null;
  listingType: string | null;
  quarterRecorded: string;
  yearRecorded: number;
  firstSeen: string | null;
  lastSeen: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string | null;
}

interface Stats {
  count: number;
  totalAvailableSF: number;
  totalInventorySF: number;
  vacancyRate: number;
}

const BROKERAGES = ["ICR", "Colliers", "CBRE", "Cushman & Wakefield", "Fortress", "Concord", "Other"];
const LISTING_TYPES = ["Lease", "Sale", "Sublease"];

function getCurrentQuarter() {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return { quarter: `Q${q}`, year: now.getFullYear(), label: `Q${q} ${now.getFullYear()}` };
}

function fmtSF(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString() + " SF";
}

type SortKey = "address" | "availableSF" | "askingRent" | "listingBrokerage" | "listingType" | "quarterRecorded";

export default function VacancyTab() {
  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [stats, setStats] = useState<Stats>({ count: 0, totalAvailableSF: 0, totalInventorySF: 0, vacancyRate: 0 });
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("address");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filterBrokerage, setFilterBrokerage] = useState("");

  const current = getCurrentQuarter();
  const [selQuarter, setSelQuarter] = useState(current.quarter);
  const [selYear, setSelYear] = useState(current.year);
  const [viewAll, setViewAll] = useState(false);

  const [form, setForm] = useState({
    address: "",
    availableSF: "",
    totalBuildingSF: "",
    listingBrokerage: "",
    listingType: "",
    notes: "",
    quarterRecorded: current.label,
    yearRecorded: current.year,
  });

  const fetchData = useCallback(async () => {
    const params = viewAll ? "?viewAll=true" : `?quarter=${selQuarter}&year=${selYear}`;
    const res = await fetch(`/api/industrial/vacancies${params}`);
    const data = await res.json();
    setVacancies(data.vacancies || []);
    setStats(data.stats || { count: 0, totalAvailableSF: 0, totalInventorySF: 0, vacancyRate: 0 });
    setLoading(false);
  }, [selQuarter, selYear, viewAll]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const sorted = useMemo(() => {
    let rows = vacancies;
    if (filterBrokerage) rows = rows.filter(v => v.listingBrokerage === filterBrokerage);
    return [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [vacancies, sortKey, sortDir, filterBrokerage]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "availableSF" ? "desc" : "asc"); }
  };

  const openAdd = () => {
    setEditId(null);
    setForm({
      address: "", availableSF: "", totalBuildingSF: "", listingBrokerage: "",
      listingType: "", notes: "", quarterRecorded: `${selQuarter} ${selYear}`, yearRecorded: selYear,
    });
    setShowForm(true);
  };

  const openEdit = (v: Vacancy) => {
    setEditId(v.id);
    setForm({
      address: v.address,
      availableSF: v.availableSF?.toString() || "",
      totalBuildingSF: v.totalBuildingSF?.toString() || "",
      listingBrokerage: v.listingBrokerage || "",
      listingType: v.listingType || "",
      notes: v.notes || "",
      quarterRecorded: v.quarterRecorded,
      yearRecorded: v.yearRecorded,
    });
    setShowForm(true);
  };

  const saveForm = async () => {
    if (!form.address.trim()) return;
    setSaving(true);
    const payload = {
      address: form.address,
      availableSF: form.availableSF ? Number(form.availableSF) : null,
      totalBuildingSF: form.totalBuildingSF ? Number(form.totalBuildingSF) : null,
      listingBrokerage: form.listingBrokerage || null,
      listingType: form.listingType || null,
      notes: form.notes || null,
      quarterRecorded: form.quarterRecorded,
      yearRecorded: form.yearRecorded,
    };

    if (editId) {
      await fetch(`/api/industrial/vacancies/${editId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
    } else {
      await fetch("/api/industrial/vacancies", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
    }
    setSaving(false);
    setShowForm(false);
    fetchData();
  };

  const deleteVacancy = async (id: number) => {
    if (!confirm("Delete this availability?")) return;
    await fetch(`/api/industrial/vacancies/${id}`, { method: "DELETE" });
    fetchData();
  };

  // Historical quarters summary
  const historicalSummary = useMemo(() => {
    if (!viewAll) return [];
    const groups: Record<string, { count: number; sf: number }> = {};
    vacancies.forEach(v => {
      const key = v.quarterRecorded;
      if (!groups[key]) groups[key] = { count: 0, sf: 0 };
      groups[key].count++;
      groups[key].sf += v.availableSF || 0;
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0])).map(([q, d]) => ({
      quarter: q, ...d,
      rate: stats.totalInventorySF > 0 ? ((d.sf / stats.totalInventorySF) * 100).toFixed(2) : "0.00",
    }));
  }, [vacancies, viewAll, stats.totalInventorySF]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const years = Array.from({ length: 5 }, (_, i) => current.year - 2 + i);
  const quarters = ["Q1", "Q2", "Q3", "Q4"];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/5 border border-purple-500/20 rounded-xl p-4">
          <p className="text-muted text-xs font-medium mb-1">Total Availabilities</p>
          <p className="text-2xl font-bold text-foreground">{stats.count}</p>
        </div>
        <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/5 border border-blue-500/20 rounded-xl p-4">
          <p className="text-muted text-xs font-medium mb-1">Total Available SF</p>
          <p className="text-2xl font-bold text-foreground">{stats.totalAvailableSF.toLocaleString()}</p>
        </div>
        <div className="bg-gradient-to-br from-amber-500/20 to-amber-600/5 border border-amber-500/20 rounded-xl p-4">
          <p className="text-muted text-xs font-medium mb-1">Vacancy Rate</p>
          <p className="text-2xl font-bold text-foreground">{stats.vacancyRate.toFixed(2)}%</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-500/20 to-emerald-600/5 border border-emerald-500/20 rounded-xl p-4">
          <p className="text-muted text-xs font-medium mb-1">Current Quarter</p>
          <p className="text-2xl font-bold text-foreground">{current.label}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <select value={selQuarter} onChange={e => { setSelQuarter(e.target.value); setViewAll(false); }}
          className="bg-card border border-card-border rounded-lg px-3 py-2 text-sm text-foreground cursor-pointer hover:border-muted focus:outline-none focus:ring-1 focus:ring-accent">
          {quarters.map(q => <option key={q} value={q}>{q}</option>)}
        </select>
        <select value={selYear} onChange={e => { setSelYear(Number(e.target.value)); setViewAll(false); }}
          className="bg-card border border-card-border rounded-lg px-3 py-2 text-sm text-foreground cursor-pointer hover:border-muted focus:outline-none focus:ring-1 focus:ring-accent">
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <button onClick={() => setViewAll(!viewAll)}
          className={`px-3 py-2 rounded-lg text-sm border ${viewAll ? "bg-accent/20 border-accent/40 text-accent" : "bg-card border-card-border text-muted hover:text-foreground hover:border-muted"}`}>
          {viewAll ? "Viewing All" : "View All Quarters"}
        </button>
        <select value={filterBrokerage} onChange={e => setFilterBrokerage(e.target.value)}
          className="bg-card border border-card-border rounded-lg px-3 py-2 text-sm text-foreground cursor-pointer hover:border-muted focus:outline-none focus:ring-1 focus:ring-accent">
          <option value="">All Brokerages</option>
          {BROKERAGES.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <button onClick={openAdd}
          className="ml-auto px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90">
          + Add Availability
        </button>
      </div>

      {/* Historical Summary */}
      {viewAll && historicalSummary.length > 0 && (
        <div className="space-y-1">
          {historicalSummary.map(h => (
            <p key={h.quarter} className="text-sm text-muted">
              <span className="text-foreground font-medium">{h.quarter}:</span> {h.count} availabilities, {h.sf.toLocaleString()} SF ({h.rate}%)
            </p>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-card-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-card-border">
              {([
                { key: "address" as SortKey, label: "Address" },
                { key: "availableSF" as SortKey, label: "Available SF", align: "right" as const },
                { key: "askingRent" as SortKey, label: "Net Rent", align: "right" as const },
                { key: "listingBrokerage" as SortKey, label: "Brokerage" },
                { key: "listingType" as SortKey, label: "Type" },
                { key: "quarterRecorded" as SortKey, label: "First Recorded" },
              ]).map(col => (
                <th key={col.key} onClick={() => handleSort(col.key)}
                  className={`px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted whitespace-nowrap cursor-pointer hover:text-foreground select-none ${col.align === "right" ? "text-right" : "text-left"}`}>
                  <span className="flex items-center gap-1">
                    {col.label}
                    {sortKey === col.key && <span className="text-accent">{sortDir === "asc" ? "↑" : "↓"}</span>}
                  </span>
                </th>
              ))}
              <th className="px-4 py-3 text-right text-xs uppercase tracking-wider text-muted">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-muted">No vacancies recorded for this period</td></tr>
            ) : sorted.map((v, i) => (
              <>
                <tr key={v.id} onClick={() => setExpanded(expanded === v.id ? null : v.id)}
                  className={`border-b border-card-border/50 cursor-pointer ${i % 2 === 0 ? "bg-background" : "bg-card/30"} hover:bg-accent/[0.04]`}>
                  <td className="px-4 py-2.5 font-medium text-foreground whitespace-nowrap">
                    {v.address}
                    {v.buildingId && <span className="ml-2 text-xs bg-accent/20 text-accent px-1.5 py-0.5 rounded">Matched</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">{fmtSF(v.availableSF)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    {v.askingRent ? `$${v.askingRent.toFixed(2)}` : "—"}
                    {v.occupancyCost ? <div className="text-[10px] text-muted/60">+${v.occupancyCost.toFixed(2)} occ</div> : null}
                  </td>
                  <td className="px-4 py-2.5 text-muted">{v.listingBrokerage || "—"}</td>
                  <td className="px-4 py-2.5 text-muted capitalize">{v.listingType || "—"}</td>
                  <td className="px-4 py-2.5 text-muted">{v.quarterRecorded}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={e => { e.stopPropagation(); openEdit(v); }}
                      className="text-muted hover:text-accent text-xs mr-2">Edit</button>
                    <button onClick={e => { e.stopPropagation(); deleteVacancy(v.id); }}
                      className="text-muted hover:text-red-400 text-xs">Delete</button>
                  </td>
                </tr>
                {expanded === v.id && (
                  <tr key={`${v.id}-detail`} className="bg-accent/[0.03]">
                    <td colSpan={7} className="px-6 py-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-muted text-xs font-medium mb-0.5">Total Building SF</p>
                          <p className="text-foreground font-mono">{fmtSF(v.totalBuildingSF)}</p>
                        </div>
                        <div>
                          <p className="text-muted text-xs font-medium mb-0.5">Building ID</p>
                          <p className="text-foreground">{v.buildingId || "—"}</p>
                        </div>
                        <div>
                          <p className="text-muted text-xs font-medium mb-0.5">Created</p>
                          <p className="text-foreground">{new Date(v.createdAt).toLocaleDateString()}</p>
                        </div>
                        {v.notes && (
                          <div className="col-span-2 md:col-span-4">
                            <p className="text-muted text-xs font-medium mb-0.5">Notes</p>
                            <p className="text-foreground">{v.notes}</p>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowForm(false)}>
          <div className="bg-card border border-card-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-card-border flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">{editId ? "Edit Availability" : "Add Availability"}</h2>
              <button onClick={() => setShowForm(false)} className="text-muted hover:text-foreground text-xl">×</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Address *</label>
                <input type="text" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
                  className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Available SF</label>
                  <input type="number" value={form.availableSF} onChange={e => setForm({ ...form, availableSF: e.target.value })}
                    className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Total Building SF</label>
                  <input type="number" value={form.totalBuildingSF} onChange={e => setForm({ ...form, totalBuildingSF: e.target.value })}
                    className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Listing Brokerage</label>
                  <select value={form.listingBrokerage} onChange={e => setForm({ ...form, listingBrokerage: e.target.value })}
                    className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent">
                    <option value="">Select...</option>
                    {BROKERAGES.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Listing Type</label>
                  <select value={form.listingType} onChange={e => setForm({ ...form, listingType: e.target.value })}
                    className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent">
                    <option value="">Select...</option>
                    {LISTING_TYPES.map(t => <option key={t} value={t.toLowerCase()}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Quarter</label>
                <select value={form.quarterRecorded} onChange={e => setForm({ ...form, quarterRecorded: e.target.value })}
                  className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent">
                  {(() => {
                    const now = new Date();
                    const y = now.getFullYear();
                    const options: string[] = [];
                    for (let yr = y - 1; yr <= y + 1; yr++) {
                      for (let q = 1; q <= 4; q++) {
                        options.push(`Q${q} ${yr}`);
                      }
                    }
                    return options.map(o => <option key={o} value={o}>{o}</option>);
                  })()}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Notes</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2}
                  className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent resize-none" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-card-border flex items-center justify-between">
              <p className="text-xs text-muted">+1 credit for {editId ? "edit" : "add"}</p>
              <div className="flex gap-2">
                <button onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm text-muted hover:text-foreground rounded-lg border border-card-border hover:border-muted">Cancel</button>
                <button onClick={saveForm} disabled={saving || !form.address.trim()}
                  className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50">
                  {saving ? "Saving..." : editId ? "Save Changes" : "Add"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
