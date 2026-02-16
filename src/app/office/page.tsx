"use client";

import { useEffect, useState, useCallback } from "react";
import { fmtCurrency } from "@/lib/format";

interface Unit {
  id: number;
  buildingId: number;
  floor: string;
  suite: string | null;
  areaSF: number | null;
  tenantName: string | null;
  isVacant: number;
  isSublease: number;
  listingAgent: string | null;
  notes: string | null;
  verifiedDate: string | null;
}

interface Building {
  id: number;
  address: string;
  streetNumber: string | null;
  neighborhood: string | null;
  buildingName: string | null;
  buildingClass: string | null;
  floors: number | null;
  yearBuilt: number | null;
  totalSF: number | null;
  contiguousBlock: number | null;
  directVacantSF: number | null;
  subleaseSF: number | null;
  totalVacantSF: number | null;
  totalAvailableSF: number | null;
  vacancyRate: number | null;
  netAskingRate: number | null;
  opCost: number | null;
  grossRate: number | null;
  listingAgent: string | null;
  parkingType: string | null;
  parkingRatio: string | null;
  owner: string | null;
  parcelNumber: string | null;
  comments: string | null;
}

type SortKey = "totalSF" | "vacancyRate" | "netAskingRate" | "grossRate" | "buildingName" | "buildingClass" | "floors" | "yearBuilt";
type SortDir = "asc" | "desc";

const CLASS_COLORS: Record<string, string> = {
  AA: "bg-blue-500/20 text-blue-300",
  A: "bg-emerald-500/20 text-emerald-300",
  B: "bg-amber-500/20 text-amber-300",
  C: "bg-zinc-500/20 text-zinc-300",
};

export default function OfficePage() {
  const [data, setData] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("totalSF");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [editingUnit, setEditingUnit] = useState<number | null>(null);
  const [unitForm, setUnitForm] = useState<Partial<Unit>>({});
  const [addingUnit, setAddingUnit] = useState(false);
  const [newUnit, setNewUnit] = useState<Partial<Unit>>({ floor: "", tenantName: "", areaSF: null, isVacant: 1 });

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ sortBy, sortDir });
    if (search) params.set("search", search);
    if (classFilter) params.set("class", classFilter);
    const res = await fetch(`/api/office?${params}`);
    const json = await res.json();
    setData(json.data);
    setLoading(false);
  }, [sortBy, sortDir, search, classFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function loadUnits(buildingId: number) {
    setUnitsLoading(true);
    const res = await fetch(`/api/office/${buildingId}`);
    const json = await res.json();
    setUnits(json.units || []);
    setUnitsLoading(false);
  }

  async function toggleExpand(id: number) {
    if (expanded === id) {
      setExpanded(null);
      setEditingUnit(null);
      setAddingUnit(false);
    } else {
      setExpanded(id);
      setEditingUnit(null);
      setAddingUnit(false);
      await loadUnits(id);
    }
  }

  function toggleSort(key: SortKey) {
    if (sortBy === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(key); setSortDir(key === "buildingName" ? "asc" : "desc"); }
  }

  async function saveUnit(unitId: number) {
    await fetch(`/api/office/units/${unitId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(unitForm),
    });
    setEditingUnit(null);
    if (expanded) await loadUnits(expanded);
  }

  async function deleteUnit(unitId: number) {
    if (!confirm("Delete this unit?")) return;
    await fetch(`/api/office/units/${unitId}`, { method: "DELETE" });
    if (expanded) await loadUnits(expanded);
  }

  async function addUnit() {
    if (!expanded || !newUnit.floor) return;
    await fetch(`/api/office/${expanded}/units`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newUnit),
    });
    setAddingUnit(false);
    setNewUnit({ floor: "", tenantName: "", areaSF: null, isVacant: 1 });
    await loadUnits(expanded);
  }

  function startEdit(u: Unit) {
    setEditingUnit(u.id);
    setUnitForm({ floor: u.floor, suite: u.suite, areaSF: u.areaSF, tenantName: u.tenantName, isVacant: u.isVacant, isSublease: u.isSublease, listingAgent: u.listingAgent, notes: u.notes, verifiedDate: u.verifiedDate });
  }

  const arrow = (key: SortKey) => sortBy === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  // Summary stats
  const totalBuildings = data.length;
  const totalSF = data.reduce((s, b) => s + (b.totalSF || 0), 0);
  const totalVacant = data.reduce((s, b) => s + (b.totalVacantSF || 0), 0);
  const avgVacancy = totalSF ? ((totalVacant / totalSF) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Office Inventory</h1>
        <p className="text-zinc-400 text-sm mt-1">Downtown Saskatoon CBD office buildings</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-white">{totalBuildings}</p>
          <p className="text-xs text-zinc-400">Buildings</p>
        </div>
        <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-white">{(totalSF / 1_000_000).toFixed(1)}M</p>
          <p className="text-xs text-zinc-400">Total SF</p>
        </div>
        <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-white">{(totalVacant / 1_000).toFixed(0)}K</p>
          <p className="text-xs text-zinc-400">Vacant SF</p>
        </div>
        <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-white">{avgVacancy}%</p>
          <p className="text-xs text-zinc-400">Vacancy Rate</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input type="text" placeholder="Search building, address, owner..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white w-64 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
        <select value={classFilter} onChange={e => setClassFilter(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50">
          <option value="">All Classes</option>
          <option value="AA">Class AA</option>
          <option value="A">Class A</option>
          <option value="B">Class B</option>
          <option value="C">Class C</option>
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
            <table className="data-table">
              <thead>
                <tr>
                  <th className="cursor-pointer hover:text-white" onClick={() => toggleSort("buildingName")}>Building{arrow("buildingName")}</th>
                  <th className="cursor-pointer hover:text-white" onClick={() => toggleSort("buildingClass")}>Class{arrow("buildingClass")}</th>
                  <th className="cursor-pointer hover:text-white text-right" onClick={() => toggleSort("totalSF")}>Total SF{arrow("totalSF")}</th>
                  <th className="cursor-pointer hover:text-white text-right" onClick={() => toggleSort("vacancyRate")}>Vacancy{arrow("vacancyRate")}</th>
                  <th className="cursor-pointer hover:text-white text-right" onClick={() => toggleSort("netAskingRate")}>Net Ask{arrow("netAskingRate")}</th>
                  <th className="cursor-pointer hover:text-white text-right" onClick={() => toggleSort("grossRate")}>Gross{arrow("grossRate")}</th>
                  <th className="cursor-pointer hover:text-white text-right" onClick={() => toggleSort("floors")}>Floors{arrow("floors")}</th>
                  <th className="cursor-pointer hover:text-white text-right" onClick={() => toggleSort("yearBuilt")}>Built{arrow("yearBuilt")}</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                {data.map(b => (
                  <BuildingRow key={b.id} b={b} expanded={expanded === b.id} onToggle={() => toggleExpand(b.id)}
                    units={expanded === b.id ? units : []} unitsLoading={unitsLoading && expanded === b.id}
                    editingUnit={editingUnit} unitForm={unitForm} setUnitForm={setUnitForm}
                    onStartEdit={startEdit} onSaveUnit={saveUnit} onDeleteUnit={deleteUnit}
                    onCancelEdit={() => setEditingUnit(null)}
                    addingUnit={addingUnit && expanded === b.id} newUnit={newUnit} setNewUnit={setNewUnit}
                    onAddUnit={addUnit} onToggleAdd={() => setAddingUnit(!addingUnit)} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {data.map(b => (
              <div key={b.id} className="bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden">
                <div className="p-4 cursor-pointer" onClick={() => toggleExpand(b.id)}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-white font-medium">{b.buildingName || b.address}</p>
                      <p className="text-zinc-400 text-xs mt-0.5">{b.address}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${CLASS_COLORS[b.buildingClass || ""] || "bg-zinc-600 text-zinc-300"}`}>
                      {b.buildingClass || "—"}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                    <div><span className="text-zinc-500">SF</span><p className="text-white">{b.totalSF?.toLocaleString() || "—"}</p></div>
                    <div><span className="text-zinc-500">Vacancy</span><p className="text-white">{b.vacancyRate != null ? b.vacancyRate.toFixed(1) + "%" : "—"}</p></div>
                    <div><span className="text-zinc-500">Gross</span><p className="text-white">{b.grossRate ? "$" + b.grossRate.toFixed(2) : "—"}</p></div>
                  </div>
                </div>
                {expanded === b.id && (
                  <div className="border-t border-zinc-700 p-4">
                    <StackingPlan units={units} loading={unitsLoading}
                      editingUnit={editingUnit} unitForm={unitForm} setUnitForm={setUnitForm}
                      onStartEdit={startEdit} onSaveUnit={saveUnit} onDeleteUnit={deleteUnit}
                      onCancelEdit={() => setEditingUnit(null)}
                      addingUnit={addingUnit} newUnit={newUnit} setNewUnit={setNewUnit}
                      onAddUnit={addUnit} onToggleAdd={() => setAddingUnit(!addingUnit)} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function BuildingRow({ b, expanded, onToggle, units, unitsLoading, editingUnit, unitForm, setUnitForm, onStartEdit, onSaveUnit, onDeleteUnit, onCancelEdit, addingUnit, newUnit, setNewUnit, onAddUnit, onToggleAdd }: {
  b: Building; expanded: boolean; onToggle: () => void;
  units: Unit[]; unitsLoading: boolean;
  editingUnit: number | null; unitForm: Partial<Unit>; setUnitForm: (f: Partial<Unit>) => void;
  onStartEdit: (u: Unit) => void; onSaveUnit: (id: number) => void; onDeleteUnit: (id: number) => void; onCancelEdit: () => void;
  addingUnit: boolean; newUnit: Partial<Unit>; setNewUnit: (u: Partial<Unit>) => void; onAddUnit: () => void; onToggleAdd: () => void;
}) {
  return (
    <>
      <tr className="cursor-pointer transition-colors" onClick={onToggle}>
        <td>
          <p className="text-foreground font-medium">{b.buildingName || b.address}</p>
          {b.buildingName && <p className="text-muted-dim text-xs">{b.streetNumber ? `${b.streetNumber} ` : ""}{b.address}</p>}
        </td>
        <td className="px-4 py-3">
          <span className={`text-xs px-2 py-0.5 rounded-full ${CLASS_COLORS[b.buildingClass || ""] || "bg-zinc-600 text-zinc-300"}`}>
            {b.buildingClass || "—"}
          </span>
        </td>
        <td className="text-right text-foreground font-mono">{b.totalSF?.toLocaleString() || "—"}</td>
        <td className="text-right">
          <span className={b.vacancyRate && b.vacancyRate > 20 ? "text-red-400" : b.vacancyRate && b.vacancyRate > 10 ? "text-amber-400" : "text-emerald-400"}>
            {b.vacancyRate != null ? b.vacancyRate.toFixed(1) + "%" : "—"}
          </span>
        </td>
        <td className="text-right text-muted font-mono">{b.netAskingRate ? "$" + b.netAskingRate.toFixed(2) : "—"}</td>
        <td className="text-right text-muted font-mono">{b.grossRate ? "$" + b.grossRate.toFixed(2) : "—"}</td>
        <td className="text-right text-muted">{b.floors || "—"}</td>
        <td className="text-right text-muted">{b.yearBuilt || "—"}</td>
        <td className="text-muted text-xs max-w-[200px] truncate">{b.owner || "—"}</td>
      </tr>
      {expanded && (
        <tr className="bg-zinc-800/30">
          <td colSpan={9} className="px-6 py-4">
            {/* Building details */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
              <div><span className="text-zinc-500 text-xs">Contiguous Block</span><p className="text-white">{b.contiguousBlock?.toLocaleString() || "—"} SF</p></div>
              <div><span className="text-zinc-500 text-xs">Direct Vacant</span><p className="text-white">{b.directVacantSF?.toLocaleString() || "—"} SF</p></div>
              <div><span className="text-zinc-500 text-xs">Sublease</span><p className="text-white">{b.subleaseSF?.toLocaleString() || "—"} SF</p></div>
              <div><span className="text-zinc-500 text-xs">Total Available</span><p className="text-white">{b.totalAvailableSF?.toLocaleString() || "—"} SF</p></div>
              <div><span className="text-zinc-500 text-xs">Op Cost</span><p className="text-white">{b.opCost ? "$" + b.opCost.toFixed(2) + "/SF" : "—"}</p></div>
              <div><span className="text-zinc-500 text-xs">Listing Agent</span><p className="text-white text-xs">{b.listingAgent || "—"}</p></div>
              <div><span className="text-zinc-500 text-xs">Parking</span><p className="text-white text-xs">{b.parkingType || "—"} {b.parkingRatio ? `(${b.parkingRatio})` : ""}</p></div>
              <div><span className="text-zinc-500 text-xs">Parcel</span><p className="text-white text-xs font-mono">{b.parcelNumber || "—"}</p></div>
            </div>

            {/* Stacking Plan */}
            <StackingPlan units={units} loading={unitsLoading}
              editingUnit={editingUnit} unitForm={unitForm} setUnitForm={setUnitForm}
              onStartEdit={onStartEdit} onSaveUnit={onSaveUnit} onDeleteUnit={onDeleteUnit}
              onCancelEdit={onCancelEdit}
              addingUnit={addingUnit} newUnit={newUnit} setNewUnit={setNewUnit}
              onAddUnit={onAddUnit} onToggleAdd={onToggleAdd} />
          </td>
        </tr>
      )}
    </>
  );
}

function StackingPlan({ units, loading, editingUnit, unitForm, setUnitForm, onStartEdit, onSaveUnit, onDeleteUnit, onCancelEdit, addingUnit, newUnit, setNewUnit, onAddUnit, onToggleAdd }: {
  units: Unit[]; loading: boolean;
  editingUnit: number | null; unitForm: Partial<Unit>; setUnitForm: (f: Partial<Unit>) => void;
  onStartEdit: (u: Unit) => void; onSaveUnit: (id: number) => void; onDeleteUnit: (id: number) => void; onCancelEdit: () => void;
  addingUnit: boolean; newUnit: Partial<Unit>; setNewUnit: (u: Partial<Unit>) => void; onAddUnit: () => void; onToggleAdd: () => void;
}) {
  if (loading) return <div className="text-zinc-400 text-sm py-4">Loading units...</div>;

  // Sort units: numeric floors descending (top floor first), then alpha
  const sorted = [...units].sort((a, b) => {
    const aNum = parseInt(a.floor);
    const bNum = parseInt(b.floor);
    if (!isNaN(aNum) && !isNaN(bNum)) return bNum - aNum;
    if (!isNaN(aNum)) return -1;
    if (!isNaN(bNum)) return 1;
    return a.floor.localeCompare(b.floor);
  });

  const inputClass = "bg-zinc-900 border border-zinc-600 rounded px-2 py-1 text-sm text-white w-full focus:outline-none focus:ring-1 focus:ring-blue-500/50";

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs uppercase text-zinc-500 font-semibold">Stacking Plan</h4>
        <button onClick={onToggleAdd}
          className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors">
          + Add Unit
        </button>
      </div>

      {addingUnit && (
        <div className="bg-zinc-900 border border-blue-500/30 rounded-lg p-3 mb-3 grid grid-cols-2 md:grid-cols-5 gap-2">
          <input placeholder="Floor/Suite" value={newUnit.floor || ""} onChange={e => setNewUnit({ ...newUnit, floor: e.target.value })} className={inputClass} />
          <input placeholder="Tenant" value={newUnit.tenantName || ""} onChange={e => setNewUnit({ ...newUnit, tenantName: e.target.value })} className={inputClass} />
          <input type="number" placeholder="SF" value={newUnit.areaSF || ""} onChange={e => setNewUnit({ ...newUnit, areaSF: e.target.value ? Number(e.target.value) : null })} className={inputClass} />
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" checked={!!newUnit.isVacant} onChange={e => setNewUnit({ ...newUnit, isVacant: e.target.checked ? 1 : 0 })} className="rounded" />
            Vacant
          </label>
          <div className="flex gap-2">
            <button onClick={onAddUnit} className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded">Save</button>
            <button onClick={onToggleAdd} className="px-3 py-1 text-xs text-zinc-400 hover:text-white rounded">Cancel</button>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="text-zinc-500 text-sm py-2">No units recorded yet</p>
      ) : (
        <div className="space-y-1">
          {sorted.map(u => (
            <div key={u.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${u.isVacant ? "bg-red-500/5 border border-red-500/20" : "bg-zinc-800/50 border border-zinc-700/50"}`}>
              {editingUnit === u.id ? (
                <div className="flex-1 grid grid-cols-2 md:grid-cols-6 gap-2">
                  <input value={unitForm.floor || ""} onChange={e => setUnitForm({ ...unitForm, floor: e.target.value })} placeholder="Floor" className={inputClass} />
                  <input value={unitForm.tenantName || ""} onChange={e => setUnitForm({ ...unitForm, tenantName: e.target.value })} placeholder="Tenant" className={inputClass} />
                  <input type="number" value={unitForm.areaSF || ""} onChange={e => setUnitForm({ ...unitForm, areaSF: e.target.value ? Number(e.target.value) : null })} placeholder="SF" className={inputClass} />
                  <label className="flex items-center gap-1.5 text-xs text-zinc-300">
                    <input type="checkbox" checked={!!unitForm.isVacant} onChange={e => setUnitForm({ ...unitForm, isVacant: e.target.checked ? 1 : 0 })} />
                    Vacant
                  </label>
                  <input value={unitForm.notes || ""} onChange={e => setUnitForm({ ...unitForm, notes: e.target.value })} placeholder="Notes" className={inputClass} />
                  <div className="flex gap-1">
                    <button onClick={() => onSaveUnit(u.id)} className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded">Save</button>
                    <button onClick={onCancelEdit} className="px-2 py-1 text-xs text-zinc-400 hover:text-white">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <span className="w-16 font-mono text-zinc-300 text-xs font-bold">{u.floor}</span>
                  <span className={`flex-1 ${u.isVacant ? "text-red-400 italic" : "text-white"}`}>
                    {u.isVacant ? "Vacant" : u.tenantName || "—"}
                    {u.isSublease ? <span className="ml-2 text-xs text-amber-400">(sublease)</span> : null}
                  </span>
                  <span className="text-zinc-400 font-mono text-xs w-20 text-right">{u.areaSF?.toLocaleString() || "—"} SF</span>
                  {u.verifiedDate && <span className="text-zinc-600 text-xs">✓ {u.verifiedDate}</span>}
                  <button onClick={(e) => { e.stopPropagation(); onStartEdit(u); }}
                    className="text-zinc-500 hover:text-white transition-colors p-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); onDeleteUnit(u.id); }}
                    className="text-zinc-500 hover:text-red-400 transition-colors p-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
