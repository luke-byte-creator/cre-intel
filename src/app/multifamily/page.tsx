"use client";

import { useEffect, useState, useCallback } from "react";
import { fmtCurrency } from "@/lib/format";

interface Building {
  id: number;
  address: string;
  streetNumber: string | null;
  streetName: string | null;
  city: string | null;
  postal: string | null;
  buildingName: string | null;
  cmhcZone: string | null;
  region: string | null;
  units: number | null;
  zoning: string | null;
  yearBuilt: number | null;
  assessedValue: number | null;
  buildingOwner: string | null;
  parcelNumber: string | null;
  titleValue: number | null;
  titleTransferDate: string | null;
  propertyManager: string | null;
  managerContact: string | null;
  propertyOwner: string | null;
  ownerContact: string | null;
  ownerEmail: string | null;
  constructionClass: string | null;
  bachRentLow: number | null;
  bachRentHigh: number | null;
  bachSF: number | null;
  oneBedRentLow: number | null;
  oneBedRentHigh: number | null;
  oneBedSF: number | null;
  twoBedRentLow: number | null;
  twoBedRentHigh: number | null;
  twoBedSF: number | null;
  threeBedRentLow: number | null;
  threeBedRentHigh: number | null;
  threeBedSF: number | null;
  rentSource: string | null;
  contactInfo: number;
  contactDate: string | null;
  comments: string | null;
  isCondo: number;
  isSalesComp: number;
}

type SortKey = "units" | "assessedValue" | "address" | "buildingOwner" | "region" | "yearBuilt";

const REGION_COLORS: Record<string, string> = {
  East: "bg-blue-500/20 text-blue-300",
  North: "bg-emerald-500/20 text-emerald-300",
  West: "bg-amber-500/20 text-amber-300",
};

export default function MultifamilyPage() {
  const [data, setData] = useState<Building[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("");
  const [zone, setZone] = useState("");
  const [zones, setZones] = useState<{ zone: string; count: number }[]>([]);
  const [sortBy, setSortBy] = useState<SortKey>("units");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<Building>>({});
  const limit = 50;

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ sortBy, sortDir, page: String(page), limit: String(limit), hideCondo: "true" });
    if (search) params.set("search", search);
    if (region) params.set("region", region);
    if (zone) params.set("zone", zone);
    const res = await fetch(`/api/multi?${params}`);
    const json = await res.json();
    setData(json.data);
    setTotal(json.total);
    if (json.zones) setZones(json.zones);
    setLoading(false);
  }, [sortBy, sortDir, page, search, region, zone]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [search, region, zone, sortBy, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortBy === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(key); setSortDir(key === "address" || key === "buildingOwner" ? "asc" : "desc"); }
  }

  function startEdit(b: Building) {
    setEditing(b.id);
    setEditForm({ ...b });
  }

  async function saveEdit() {
    if (!editing) return;
    await fetch(`/api/multi/${editing}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    setEditing(null);
    fetchData();
  }

  async function deleteBuilding(id: number) {
    if (!confirm("Delete this building?")) return;
    await fetch(`/api/multi/${id}`, { method: "DELETE" });
    setExpanded(null);
    fetchData();
  }

  const arrow = (key: SortKey) => sortBy === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";
  const totalPages = Math.ceil(total / limit);

  // Summary
  const totalUnits = data.reduce((s, b) => s + (b.units || 0), 0);
  const totalAssessed = data.reduce((s, b) => s + (b.assessedValue || 0), 0);

  function fmtRent(low: number | null, high: number | null): string {
    if (low == null && high == null) return "—";
    if (low && high && low !== high) return `$${low.toFixed(0)}-$${high.toFixed(0)}`;
    return `$${(low || high || 0).toFixed(0)}`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Multifamily Inventory</h1>
        <p className="text-zinc-400 text-sm mt-1">Saskatoon apartment buildings · {total.toLocaleString()} properties</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-white">{total}</p>
          <p className="text-xs text-zinc-400">Buildings</p>
        </div>
        <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-white">{totalUnits.toLocaleString()}</p>
          <p className="text-xs text-zinc-400">Total Units (this page)</p>
        </div>
        <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-white">{fmtCurrency(totalAssessed)}</p>
          <p className="text-xs text-zinc-400">Assessed Value (this page)</p>
        </div>
        <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-white">{zones.length}</p>
          <p className="text-xs text-zinc-400">CMHC Zones</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input type="text" placeholder="Search address, owner, manager..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white w-64 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
        <select value={region} onChange={e => setRegion(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white">
          <option value="">All Regions</option>
          <option value="East">East</option>
          <option value="North">North</option>
          <option value="West">West</option>
        </select>
        <select value={zone} onChange={e => setZone(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white">
          <option value="">All CMHC Zones</option>
          {zones.map(z => <option key={z.zone} value={z.zone}>{z.zone} ({z.count})</option>)}
        </select>
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
                  <th className="px-4 py-3 cursor-pointer hover:text-white" onClick={() => toggleSort("region")}>Region{arrow("region")}</th>
                  <th className="px-4 py-3 cursor-pointer hover:text-white text-right" onClick={() => toggleSort("units")}>Units{arrow("units")}</th>
                  <th className="px-4 py-3 cursor-pointer hover:text-white text-right" onClick={() => toggleSort("yearBuilt")}>Built{arrow("yearBuilt")}</th>
                  <th className="px-4 py-3 cursor-pointer hover:text-white text-right" onClick={() => toggleSort("assessedValue")}>Assessed{arrow("assessedValue")}</th>
                  <th className="px-4 py-3 cursor-pointer hover:text-white" onClick={() => toggleSort("buildingOwner")}>Owner{arrow("buildingOwner")}</th>
                  <th className="px-4 py-3">Zoning</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {data.map(b => (
                  <MultiRow key={b.id} b={b} expanded={expanded === b.id}
                    onToggle={() => { setExpanded(expanded === b.id ? null : b.id); setEditing(null); }}
                    fmtRent={fmtRent}
                    onEdit={() => startEdit(b)} onDelete={() => deleteBuilding(b.id)} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {data.map(b => (
              <div key={b.id} className="bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden">
                <div className="p-4 cursor-pointer" onClick={() => { setExpanded(expanded === b.id ? null : b.id); setEditing(null); }}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-white font-medium text-sm">{b.address}</p>
                      <p className="text-zinc-400 text-xs mt-0.5">{b.buildingOwner || "—"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${REGION_COLORS[b.region || ""] || "bg-zinc-600 text-zinc-300"}`}>{b.region}</span>
                      <span className="text-white font-bold">{b.units || "—"} u</span>
                    </div>
                  </div>
                </div>
                {expanded === b.id && (
                  <div className="border-t border-zinc-700 p-4">
                    <ExpandedDetail b={b} fmtRent={fmtRent} onEdit={() => startEdit(b)} onDelete={() => deleteBuilding(b.id)} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 pt-4">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-300 hover:bg-zinc-700 disabled:opacity-30">← Prev</button>
              <span className="text-sm text-zinc-400">Page {page} of {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-300 hover:bg-zinc-700 disabled:opacity-30">Next →</button>
            </div>
          )}
        </>
      )}

      {/* Edit Modal */}
      {editing && editForm && (
        <EditModal form={editForm} setForm={setEditForm} onSave={saveEdit} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function MultiRow({ b, expanded, onToggle, fmtRent, onEdit, onDelete }: {
  b: Building; expanded: boolean; onToggle: () => void;
  fmtRent: (l: number | null, h: number | null) => string;
  onEdit: () => void; onDelete: () => void;
}) {
  return (
    <>
      <tr className="hover:bg-zinc-800/60 cursor-pointer transition-colors" onClick={onToggle}>
        <td className="px-4 py-3">
          <p className="text-white font-medium">{b.address}</p>
          {b.buildingName && b.buildingName !== "N/A" && <p className="text-zinc-500 text-xs">{b.buildingName}</p>}
        </td>
        <td className="px-4 py-3">
          <span className={`text-xs px-2 py-0.5 rounded-full ${REGION_COLORS[b.region || ""] || "bg-zinc-600 text-zinc-300"}`}>{b.region || "—"}</span>
        </td>
        <td className="px-4 py-3 text-right text-white font-bold">{b.units || "—"}</td>
        <td className="px-4 py-3 text-right text-zinc-400">{b.yearBuilt || "—"}</td>
        <td className="px-4 py-3 text-right text-zinc-300 font-mono">{b.assessedValue ? fmtCurrency(b.assessedValue) : "—"}</td>
        <td className="px-4 py-3 text-zinc-300 text-xs max-w-[200px] truncate">{b.buildingOwner || "—"}</td>
        <td className="px-4 py-3 text-zinc-500 text-xs">{b.zoning || "—"}</td>
      </tr>
      {expanded && (
        <tr className="bg-zinc-800/30">
          <td colSpan={7} className="px-6 py-4">
            <ExpandedDetail b={b} fmtRent={fmtRent} onEdit={onEdit} onDelete={onDelete} />
          </td>
        </tr>
      )}
    </>
  );
}

function ExpandedDetail({ b, fmtRent, onEdit, onDelete }: {
  b: Building; fmtRent: (l: number | null, h: number | null) => string;
  onEdit: () => void; onDelete: () => void;
}) {
  const hasRent = b.oneBedRentLow || b.twoBedRentLow || b.bachRentLow || b.threeBedRentLow;

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <button onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="px-3 py-1.5 text-sm bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg transition-colors flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
          Edit
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors">
          Delete
        </button>
      </div>

      {/* Property Info */}
      <div>
        <h4 className="text-xs uppercase text-zinc-500 font-semibold mb-2">Property Details</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div><span className="text-zinc-500 text-xs">CMHC Zone</span><p className="text-white">{b.cmhcZone || "—"}</p></div>
          <div><span className="text-zinc-500 text-xs">Zoning</span><p className="text-white">{b.zoning || "—"}</p></div>
          <div><span className="text-zinc-500 text-xs">Year Built</span><p className="text-white">{b.yearBuilt || "—"}</p></div>
          <div><span className="text-zinc-500 text-xs">Assessed Value</span><p className="text-emerald-400 font-mono">{b.assessedValue ? fmtCurrency(b.assessedValue) : "—"}</p></div>
          <div><span className="text-zinc-500 text-xs">Title Value</span><p className="text-white font-mono">{b.titleValue ? fmtCurrency(b.titleValue) : "—"}</p></div>
          <div><span className="text-zinc-500 text-xs">Title Transfer</span><p className="text-white">{b.titleTransferDate || "—"}</p></div>
          <div><span className="text-zinc-500 text-xs">Parcel #</span><p className="text-white font-mono text-xs">{b.parcelNumber || "—"}</p></div>
          <div><span className="text-zinc-500 text-xs">Construction</span><p className="text-white">{b.constructionClass || "—"}</p></div>
        </div>
      </div>

      {/* Contacts */}
      <div>
        <h4 className="text-xs uppercase text-zinc-500 font-semibold mb-2">Contacts</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="bg-zinc-900/50 rounded-lg p-3">
            <p className="text-zinc-500 text-xs mb-1">Building Owner</p>
            <p className="text-white font-medium">{b.buildingOwner || "—"}</p>
          </div>
          <div className="bg-zinc-900/50 rounded-lg p-3">
            <p className="text-zinc-500 text-xs mb-1">Property Owner</p>
            <p className="text-white">{b.propertyOwner || "—"}</p>
            {b.ownerContact && <p className="text-blue-400 text-xs mt-1">{b.ownerContact}</p>}
            {b.ownerEmail && <p className="text-blue-400 text-xs">{b.ownerEmail}</p>}
          </div>
          <div className="bg-zinc-900/50 rounded-lg p-3">
            <p className="text-zinc-500 text-xs mb-1">Property Manager</p>
            <p className="text-white">{b.propertyManager || "—"}</p>
            {b.managerContact && <p className="text-blue-400 text-xs mt-1">{b.managerContact}</p>}
          </div>
        </div>
      </div>

      {/* Rent Survey */}
      {hasRent && (
        <div>
          <h4 className="text-xs uppercase text-zinc-500 font-semibold mb-2">Rent Survey</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="bg-zinc-900/50 rounded-lg p-3">
              <p className="text-zinc-500 text-xs">Bachelor</p>
              <p className="text-white font-mono">{fmtRent(b.bachRentLow, b.bachRentHigh)}</p>
              {b.bachSF && <p className="text-zinc-500 text-xs">{b.bachSF} SF</p>}
            </div>
            <div className="bg-zinc-900/50 rounded-lg p-3">
              <p className="text-zinc-500 text-xs">1-Bedroom</p>
              <p className="text-white font-mono">{fmtRent(b.oneBedRentLow, b.oneBedRentHigh)}</p>
              {b.oneBedSF && <p className="text-zinc-500 text-xs">{b.oneBedSF} SF</p>}
            </div>
            <div className="bg-zinc-900/50 rounded-lg p-3">
              <p className="text-zinc-500 text-xs">2-Bedroom</p>
              <p className="text-white font-mono">{fmtRent(b.twoBedRentLow, b.twoBedRentHigh)}</p>
              {b.twoBedSF && <p className="text-zinc-500 text-xs">{b.twoBedSF} SF</p>}
            </div>
            <div className="bg-zinc-900/50 rounded-lg p-3">
              <p className="text-zinc-500 text-xs">3-Bedroom</p>
              <p className="text-white font-mono">{fmtRent(b.threeBedRentLow, b.threeBedRentHigh)}</p>
              {b.threeBedSF && <p className="text-zinc-500 text-xs">{b.threeBedSF} SF</p>}
            </div>
          </div>
          {b.rentSource && <p className="text-zinc-600 text-xs mt-2">Source: {b.rentSource}</p>}
        </div>
      )}

      {/* Comments */}
      {b.comments && (
        <div>
          <h4 className="text-xs uppercase text-zinc-500 font-semibold mb-1">Notes</h4>
          <p className="text-zinc-300 text-sm">{b.comments}</p>
        </div>
      )}

      {b.contactDate && <p className="text-zinc-600 text-xs">Last contacted: {b.contactDate}</p>}
    </div>
  );
}

function EditModal({ form, setForm, onSave, onClose }: {
  form: Partial<Building>; setForm: (f: Partial<Building>) => void; onSave: () => void; onClose: () => void;
}) {
  const inputClass = "w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50";

  const fields: { key: keyof Building; label: string; type?: string }[] = [
    { key: "address", label: "Address" },
    { key: "buildingName", label: "Building Name" },
    { key: "region", label: "Region" },
    { key: "cmhcZone", label: "CMHC Zone" },
    { key: "units", label: "Units", type: "number" },
    { key: "zoning", label: "Zoning" },
    { key: "yearBuilt", label: "Year Built", type: "number" },
    { key: "assessedValue", label: "Assessed Value", type: "number" },
    { key: "buildingOwner", label: "Building Owner" },
    { key: "propertyOwner", label: "Property Owner" },
    { key: "ownerContact", label: "Owner Contact" },
    { key: "ownerEmail", label: "Owner Email" },
    { key: "propertyManager", label: "Property Manager" },
    { key: "managerContact", label: "Manager Contact" },
    { key: "constructionClass", label: "Construction Class" },
    { key: "titleValue", label: "Title Value", type: "number" },
    { key: "parcelNumber", label: "Parcel #" },
    { key: "oneBedRentLow", label: "1-Bed Rent Low", type: "number" },
    { key: "oneBedRentHigh", label: "1-Bed Rent High", type: "number" },
    { key: "twoBedRentLow", label: "2-Bed Rent Low", type: "number" },
    { key: "twoBedRentHigh", label: "2-Bed Rent High", type: "number" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-zinc-900 border-b border-zinc-700 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold text-white">Edit Building</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-6 py-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {fields.map(f => (
            <div key={f.key}>
              <label className="text-xs text-zinc-400 mb-1 block">{f.label}</label>
              <input type={f.type || "text"}
                value={String(form[f.key] ?? "")}
                onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                className={inputClass} />
            </div>
          ))}
          <div className="md:col-span-2">
            <label className="text-xs text-zinc-400 mb-1 block">Comments</label>
            <textarea value={String(form.comments ?? "")} onChange={e => setForm({ ...form, comments: e.target.value })}
              rows={3} className={inputClass + " resize-none"} />
          </div>
        </div>
        <div className="sticky bottom-0 bg-zinc-900 border-t border-zinc-700 px-6 py-4 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-400 hover:text-white rounded-lg">Cancel</button>
          <button onClick={onSave} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium">Save Changes</button>
        </div>
      </div>
    </div>
  );
}
