"use client";

import { useEffect, useState, useCallback, useRef } from "react";

interface Tenant {
  id: number;
  developmentId: number;
  tenantName: string;
  category: string | null;
  comment: string | null;
  status: string | null;
  areaSF: number | null;
  unitSuite: string | null;
  netRentPSF: number | null;
  annualRent: number | null;
  leaseStart: string | null;
  leaseExpiry: string | null;
  termMonths: number | null;
  rentSteps: string | null;
  leaseType: string | null;
  operatingCosts: number | null;
}

interface Development {
  id: number;
  name: string;
  area: string | null;
  address: string | null;
  tenants: Tenant[];
}

interface RentStep {
  month: string;
  rent: string;
}

type EditForm = {
  tenantName: string;
  areaSF: string;
  unitSuite: string;
  netRentPSF: string;
  annualRent: string;
  leaseStart: string;
  leaseExpiry: string;
  termMonths: string;
  rentSteps: string;
  leaseType: string;
  operatingCosts: string;
  comment: string;
  status: string;
};

const emptyForm: EditForm = {
  tenantName: "", areaSF: "", unitSuite: "", netRentPSF: "", annualRent: "",
  leaseStart: "", leaseExpiry: "", termMonths: "", rentSteps: "", leaseType: "",
  operatingCosts: "", comment: "", status: "active",
};

function parseRentSteps(raw: string | null): RentStep[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return [];
}

function serializeRentSteps(steps: RentStep[]): string {
  const valid = steps.filter(s => s.month && s.rent);
  return valid.length > 0 ? JSON.stringify(valid) : "";
}

function addMonthsExpiry(start: string, months: number): string {
  const d = new Date(start + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

function monthsDiff(start: string, end: string): number {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + (e.getDate() >= s.getDate() ? 0 : 0) + 1;
}

function autoCalc(form: EditForm, field: string): EditForm {
  const f = { ...form };
  const num = (v: string) => v ? parseFloat(v) : null;

  // netRentPSF × areaSF → annualRent
  if (field === "netRentPSF" || field === "areaSF") {
    const rent = num(f.netRentPSF);
    const area = num(f.areaSF);
    if (rent && area) f.annualRent = String(Math.round(rent * area * 100) / 100);
  }
  // annualRent ÷ areaSF → netRentPSF
  if (field === "annualRent") {
    const annual = num(f.annualRent);
    const area = num(f.areaSF);
    if (annual && area) f.netRentPSF = String(Math.round((annual / area) * 100) / 100);
  }
  // leaseStart + termMonths → leaseExpiry
  if (field === "leaseStart" || field === "termMonths") {
    const term = num(f.termMonths);
    if (f.leaseStart && term && term > 0) f.leaseExpiry = addMonthsExpiry(f.leaseStart, term);
  }
  // leaseExpiry + leaseStart → termMonths
  if (field === "leaseExpiry") {
    if (f.leaseStart && f.leaseExpiry) {
      const m = monthsDiff(f.leaseStart, f.leaseExpiry);
      if (m > 0) f.termMonths = String(m);
    }
  }
  return f;
}

function expiryStatus(expiry: string | null): "red" | "amber" | "green" | null {
  if (!expiry) return null;
  const now = new Date();
  const exp = new Date(expiry + "T00:00:00");
  const diffMs = exp.getTime() - now.getTime();
  const diffMonths = diffMs / (1000 * 60 * 60 * 24 * 30.44);
  if (diffMonths < 0) return "red";
  if (diffMonths < 6) return "red";
  if (diffMonths < 12) return "amber";
  return "green";
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function fmtRent(n: number | null) {
  if (n == null) return "—";
  return "$" + n.toFixed(2) + "/SF";
}

function RequiredStar() {
  return <span className="text-red-400 ml-0.5">*</span>;
}

export default function RetailPage() {
  const [devs, setDevs] = useState<Development[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sfMin, setSfMin] = useState("");
  const [sfMax, setSfMax] = useState("");
  const [editingTenant, setEditingTenant] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EditForm>(emptyForm);
  const [addingTo, setAddingTo] = useState<number | null>(null);
  const [newTenant, setNewTenant] = useState<EditForm>(emptyForm);
  const [showLocations, setShowLocations] = useState<number | null>(null);
  const [showAddCenter, setShowAddCenter] = useState(false);
  const [newCenter, setNewCenter] = useState({ name: "", area: "", address: "" });
  const [editingDev, setEditingDev] = useState<number | null>(null);
  const [editDevForm, setEditDevForm] = useState({ name: "", area: "", address: "" });

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (sfMin) params.set("sfMin", sfMin);
    if (sfMax) params.set("sfMax", sfMax);
    const res = await fetch(`/api/retail?${params}`);
    const json = await res.json();
    setDevs(json.data);
    setLoading(false);
  }, [search, sfMin, sfMax]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Cross-location map
  const tenantLocations = new Map<string, string[]>();
  for (const d of devs) {
    for (const t of d.tenants) {
      const key = t.tenantName.toLowerCase().trim();
      if (!tenantLocations.has(key)) tenantLocations.set(key, []);
      const locs = tenantLocations.get(key)!;
      if (!locs.includes(d.name)) locs.push(d.name);
    }
  }

  const allTenantNames = [...new Set(devs.flatMap(d => d.tenants.map(t => t.tenantName)))].sort();

  // Expiry tracking
  const allTenants = devs.flatMap(d => d.tenants);
  const now = new Date();
  const sixMonths = new Date(now); sixMonths.setMonth(sixMonths.getMonth() + 6);
  const twelveMonths = new Date(now); twelveMonths.setMonth(twelveMonths.getMonth() + 12);
  const expiring6 = allTenants.filter(t => {
    if (!t.leaseExpiry) return false;
    const exp = new Date(t.leaseExpiry + "T00:00:00");
    return exp >= now && exp <= sixMonths;
  });
  const expiring12 = allTenants.filter(t => {
    if (!t.leaseExpiry) return false;
    const exp = new Date(t.leaseExpiry + "T00:00:00");
    return exp > sixMonths && exp <= twelveMonths;
  });
  const expired = allTenants.filter(t => {
    if (!t.leaseExpiry) return false;
    return new Date(t.leaseExpiry + "T00:00:00") < now;
  });

  async function saveTenant(id: number) {
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(editForm)) {
      payload[k] = v === "" ? null : v;
    }
    await fetch(`/api/retail/tenants/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setEditingTenant(null);
    fetchData();
  }

  async function deleteTenant(id: number) {
    await fetch(`/api/retail/tenants/${id}`, { method: "DELETE" });
    fetchData();
  }

  async function addTenant(devId: number) {
    if (!newTenant.tenantName) return;
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(newTenant)) {
      payload[k] = v === "" ? null : v;
    }
    await fetch(`/api/retail/${devId}/tenants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setAddingTo(null);
    setNewTenant({ ...emptyForm });
    fetchData();
  }

  function startEdit(t: Tenant) {
    setEditingTenant(t.id);
    setEditForm({
      tenantName: t.tenantName,
      areaSF: t.areaSF != null ? String(t.areaSF) : "",
      unitSuite: t.unitSuite || "",
      netRentPSF: t.netRentPSF != null ? String(t.netRentPSF) : "",
      annualRent: t.annualRent != null ? String(t.annualRent) : "",
      leaseStart: t.leaseStart || "",
      leaseExpiry: t.leaseExpiry || "",
      termMonths: t.termMonths != null ? String(t.termMonths) : "",
      rentSteps: t.rentSteps || "",
      leaseType: t.leaseType || "",
      operatingCosts: t.operatingCosts != null ? String(t.operatingCosts) : "",
      comment: t.comment || "",
      status: t.status || "active",
    });
  }

  async function addCenter() {
    if (!newCenter.name.trim()) return;
    await fetch("/api/retail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newCenter),
    });
    setShowAddCenter(false);
    setNewCenter({ name: "", area: "", address: "" });
    fetchData();
  }

  async function saveDevEdit(devId: number) {
    await fetch(`/api/retail/${devId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editDevForm),
    });
    setEditingDev(null);
    fetchData();
  }

  function startDevEdit(d: Development) {
    setEditingDev(d.id);
    setEditDevForm({ name: d.name, area: d.area || "", address: d.address || "" });
  }

  const totalTenants = devs.reduce((s, d) => s + d.tenants.length, 0);
  const inputClass = "bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Retail Tenants</h1>
          <p className="text-zinc-400 text-sm mt-1">Tenant tracking across Saskatoon retail developments · {totalTenants} tenants</p>
        </div>
        <button onClick={() => setShowAddCenter(!showAddCenter)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors">
          {showAddCenter ? "Cancel" : "+ Add Center"}
        </button>
      </div>

      {showAddCenter && (
        <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-zinc-400 mb-1 block">Center Name *</label>
              <input value={newCenter.name} onChange={e => setNewCenter({ ...newCenter, name: e.target.value })}
                placeholder="e.g. Saskatoon West" className={inputClass + " w-full"} />
            </div>
            <div className="w-32">
              <label className="text-xs text-zinc-400 mb-1 block">Area</label>
              <input value={newCenter.area} onChange={e => setNewCenter({ ...newCenter, area: e.target.value })}
                placeholder="e.g. West" className={inputClass + " w-full"} />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-zinc-400 mb-1 block">Address</label>
              <input value={newCenter.address} onChange={e => setNewCenter({ ...newCenter, address: e.target.value })}
                placeholder="Address" className={inputClass + " w-full"} />
            </div>
          </div>
          <button onClick={addCenter} disabled={!newCenter.name.trim()}
            className="px-4 py-2 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium disabled:opacity-50">
            Create Center
          </button>
        </div>
      )}

      {/* Expiry Tracking Summary */}
      {(expired.length > 0 || expiring6.length > 0 || expiring12.length > 0) && (
        <div className="flex flex-wrap gap-3">
          {expired.length > 0 && (
            <div className="bg-red-900/30 border border-red-800/50 rounded-xl px-4 py-3 flex items-center gap-2">
              <span className="text-red-400 text-lg">⚠</span>
              <div>
                <p className="text-red-300 text-sm font-semibold">{expired.length} expired lease{expired.length !== 1 ? "s" : ""}</p>
                <p className="text-red-400/70 text-xs">Past expiry date</p>
              </div>
            </div>
          )}
          {expiring6.length > 0 && (
            <div className="bg-red-900/20 border border-red-700/40 rounded-xl px-4 py-3 flex items-center gap-2">
              <span className="text-red-400 text-lg">🔴</span>
              <div>
                <p className="text-red-300 text-sm font-semibold">{expiring6.length} expiring in &lt;6 months</p>
                <p className="text-red-400/70 text-xs">Urgent renewal needed</p>
              </div>
            </div>
          )}
          {expiring12.length > 0 && (
            <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl px-4 py-3 flex items-center gap-2">
              <span className="text-amber-400 text-lg">🟡</span>
              <div>
                <p className="text-amber-300 text-sm font-semibold">{expiring12.length} expiring in 6–12 months</p>
                <p className="text-amber-400/70 text-xs">Plan renewal discussions</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input type="text" placeholder="Search tenants..."
          value={search} onChange={e => setSearch(e.target.value)}
          className={inputClass + " w-64"} />
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400">SF Range</span>
          <input type="number" placeholder="Min" value={sfMin} onChange={e => setSfMin(e.target.value)}
            className={inputClass + " w-24"} />
          <span className="text-zinc-500">–</span>
          <input type="number" placeholder="Max" value={sfMax} onChange={e => setSfMax(e.target.value)}
            className={inputClass + " w-24"} />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          {devs.map(d => (
            <div key={d.id} className="bg-zinc-800/50 border border-zinc-700 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-zinc-700">
                {editingDev === d.id ? (
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="flex-1 min-w-[180px]">
                      <label className="text-xs text-zinc-400 mb-1 block">Name</label>
                      <input value={editDevForm.name} onChange={e => setEditDevForm({ ...editDevForm, name: e.target.value })}
                        className={inputClass + " w-full"} />
                    </div>
                    <div className="w-28">
                      <label className="text-xs text-zinc-400 mb-1 block">Area</label>
                      <input value={editDevForm.area} onChange={e => setEditDevForm({ ...editDevForm, area: e.target.value })}
                        className={inputClass + " w-full"} />
                    </div>
                    <div className="flex-1 min-w-[180px]">
                      <label className="text-xs text-zinc-400 mb-1 block">Address</label>
                      <input value={editDevForm.address} onChange={e => setEditDevForm({ ...editDevForm, address: e.target.value })}
                        className={inputClass + " w-full"} />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => saveDevEdit(d.id)} className="px-3 py-2 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg">Save</button>
                      <button onClick={() => setEditingDev(null)} className="px-3 py-2 text-xs text-zinc-400 hover:text-white">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <h2 className="text-lg font-semibold text-white">{d.name}</h2>
                      <span className="text-zinc-500 text-xs">{d.tenants.length}</span>
                      {d.area && <span className="text-xs text-zinc-500 bg-zinc-700 px-2 py-0.5 rounded">{d.area}</span>}
                      <button onClick={() => startDevEdit(d)} className="text-zinc-600 hover:text-zinc-300 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
                      </button>
                    </div>
                    <button onClick={() => { setAddingTo(addingTo === d.id ? null : d.id); setNewTenant({ ...emptyForm }); }}
                      className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors">
                      + Add
                    </button>
                  </div>
                )}
              </div>

              {addingTo === d.id && (
                <div className="px-5 py-4 bg-zinc-900/50 border-b border-zinc-700">
                  <TenantForm
                    form={newTenant}
                    setForm={setNewTenant}
                    allTenantNames={allTenantNames}
                    inputClass={inputClass}
                    onSave={() => addTenant(d.id)}
                    onCancel={() => setAddingTo(null)}
                  />
                </div>
              )}

              <div className="divide-y divide-zinc-700/50">
                {d.tenants.map(t => {
                  const otherLocations = (tenantLocations.get(t.tenantName.toLowerCase().trim()) || []).filter(n => n !== d.name);
                  const expSt = expiryStatus(t.leaseExpiry);
                  return (
                    <div key={t.id} className="px-5 py-3 hover:bg-zinc-800/80 transition-colors">
                      {editingTenant === t.id ? (
                        <div className="py-2">
                          <TenantForm
                            form={editForm}
                            setForm={setEditForm}
                            allTenantNames={allTenantNames}
                            inputClass={inputClass}
                            onSave={() => saveTenant(t.id)}
                            onCancel={() => setEditingTenant(null)}
                          />
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0 flex-1 flex-wrap">
                            <span className="text-sm font-medium text-white">{t.tenantName}</span>
                            {t.unitSuite && <span className="text-xs text-zinc-500">#{t.unitSuite}</span>}
                            {t.areaSF != null && <span className="text-xs text-zinc-500 font-mono">{t.areaSF.toLocaleString()} SF</span>}
                            {t.netRentPSF != null && <span className="text-xs text-emerald-400 font-mono">{fmtRent(t.netRentPSF)}</span>}
                            {t.annualRent != null && <span className="text-xs text-zinc-400 font-mono">${t.annualRent.toLocaleString()}/yr</span>}
                            {t.leaseExpiry && (
                              <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                                expSt === "red" ? "bg-red-900/40 text-red-400" :
                                expSt === "amber" ? "bg-amber-900/40 text-amber-400" :
                                "text-zinc-500"
                              }`}>
                                Exp {fmtDate(t.leaseExpiry)}
                              </span>
                            )}
                            {t.leaseType && <span className="text-xs text-zinc-500 bg-zinc-700 px-1.5 py-0.5 rounded">{t.leaseType}</span>}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 relative">
                            {otherLocations.length > 0 && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setShowLocations(showLocations === t.id ? null : t.id); }}
                                className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-blue-500/10"
                              >
                                📍 +{otherLocations.length}
                              </button>
                            )}
                            {showLocations === t.id && otherLocations.length > 0 && (
                              <div className="absolute right-0 top-8 z-20 bg-zinc-900 border border-zinc-600 rounded-lg shadow-xl py-2 px-3 min-w-[200px]"
                                onClick={e => e.stopPropagation()}>
                                <p className="text-xs text-zinc-400 mb-1.5 font-medium">Also at:</p>
                                {otherLocations.map(loc => (
                                  <p key={loc} className="text-sm text-white py-0.5">{loc}</p>
                                ))}
                              </div>
                            )}
                            <button onClick={() => startEdit(t)} className="text-zinc-500 hover:text-white p-1">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
                            </button>
                            <button onClick={() => deleteTenant(t.id)} className="text-zinc-500 hover:text-red-400 p-1">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TenantForm({ form, setForm, allTenantNames, inputClass, onSave, onCancel }: {
  form: EditForm;
  setForm: (f: EditForm) => void;
  allTenantNames: string[];
  inputClass: string;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [steps, setSteps] = useState<RentStep[]>(() => parseRentSteps(form.rentSteps));

  function handleBlur(field: string) {
    setForm(autoCalc(form, field));
  }

  function set(field: keyof EditForm, value: string) {
    setForm({ ...form, [field]: value });
  }

  function addStep() {
    const updated = [...steps, { month: "", rent: "" }];
    setSteps(updated);
    setForm({ ...form, rentSteps: serializeRentSteps(updated) });
  }

  function updateStep(idx: number, field: keyof RentStep, value: string) {
    const updated = [...steps];
    updated[idx] = { ...updated[idx], [field]: value };
    setSteps(updated);
    setForm({ ...form, rentSteps: serializeRentSteps(updated) });
  }

  function removeStep(idx: number) {
    const updated = steps.filter((_, i) => i !== idx);
    setSteps(updated);
    setForm({ ...form, rentSteps: serializeRentSteps(updated) });
  }

  return (
    <div className="space-y-3">
      {/* Row 1: Name, Unit, Status, Lease Type */}
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="text-xs text-zinc-400 mb-1 block">Tenant Name<RequiredStar /></label>
          <AutocompleteInput
            value={form.tenantName}
            onChange={v => set("tenantName", v)}
            suggestions={allTenantNames}
            placeholder="Tenant name"
            className={inputClass + " w-full"}
          />
        </div>
        <div className="w-24">
          <label className="text-xs text-zinc-400 mb-1 block">Unit/Suite</label>
          <input value={form.unitSuite} onChange={e => set("unitSuite", e.target.value)}
            placeholder="#" className={inputClass + " w-full"} />
        </div>
        <div className="w-28">
          <label className="text-xs text-zinc-400 mb-1 block">Status</label>
          <select value={form.status} onChange={e => set("status", e.target.value)}
            className={inputClass + " w-full"}>
            <option value="active">Active</option>
            <option value="vacant">Vacant</option>
            <option value="pending">Pending</option>
          </select>
        </div>
        <div className="w-36">
          <label className="text-xs text-zinc-400 mb-1 block">Lease Type</label>
          <select value={form.leaseType} onChange={e => set("leaseType", e.target.value)}
            className={inputClass + " w-full"}>
            <option value="">—</option>
            <option value="Net">Net</option>
            <option value="Gross">Gross</option>
            <option value="Modified Gross">Modified Gross</option>
            <option value="Land Lease">Land Lease</option>
          </select>
        </div>
      </div>

      {/* Row 2: Financials */}
      <div className="flex flex-wrap gap-2 items-end">
        <div className="w-28">
          <label className="text-xs text-zinc-400 mb-1 block">Area SF<RequiredStar /></label>
          <input type="number" value={form.areaSF} onChange={e => set("areaSF", e.target.value)}
            onBlur={() => handleBlur("areaSF")} placeholder="SF" className={inputClass + " w-full"} />
        </div>
        <div className="w-28">
          <label className="text-xs text-zinc-400 mb-1 block">Net Rent/SF<RequiredStar /></label>
          <input type="number" step="0.01" value={form.netRentPSF} onChange={e => set("netRentPSF", e.target.value)}
            onBlur={() => handleBlur("netRentPSF")} placeholder="$/SF" className={inputClass + " w-full"} />
        </div>

        {/* Rent Steps — right after net rent */}
        <div className="flex-1 min-w-[250px]">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-zinc-400">Rent Steps</label>
            <button onClick={addStep} className="text-[10px] text-blue-400 hover:text-blue-300">+ Add Step</button>
          </div>
          {steps.length === 0 ? (
            <p className="text-[10px] text-zinc-600 italic py-1">No steps — base rent applies for full term</p>
          ) : (
            <div className="space-y-1">
              {steps.map((step, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <span className="text-[10px] text-zinc-500">Mo</span>
                  <input type="number" value={step.month} onChange={e => updateStep(idx, "month", e.target.value)}
                    placeholder="36" className={inputClass + " w-16 !py-1 !px-2 !text-xs"} />
                  <span className="text-zinc-600 text-xs">→</span>
                  <span className="text-[10px] text-zinc-500">$</span>
                  <input type="number" value={step.rent} onChange={e => updateStep(idx, "rent", e.target.value)}
                    placeholder="22" className={inputClass + " w-16 !py-1 !px-2 !text-xs"} />
                  <span className="text-[10px] text-zinc-500">/SF</span>
                  <button onClick={() => removeStep(idx)} className="text-zinc-600 hover:text-red-400 text-xs">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Row 3: More financials */}
      <div className="flex flex-wrap gap-2 items-end">
        <div className="w-32">
          <label className="text-xs text-zinc-400 mb-1 block">Annual Rent<RequiredStar /></label>
          <input type="number" step="0.01" value={form.annualRent} onChange={e => set("annualRent", e.target.value)}
            onBlur={() => handleBlur("annualRent")} placeholder="$/yr" className={inputClass + " w-full"} />
        </div>
        <div className="w-32">
          <label className="text-xs text-zinc-400 mb-1 block">Operating Costs</label>
          <input type="number" step="0.01" value={form.operatingCosts} onChange={e => set("operatingCosts", e.target.value)}
            placeholder="$/SF/yr" className={inputClass + " w-full"} />
        </div>
      </div>

      {/* Row 4: Dates */}
      <div className="flex flex-wrap gap-2 items-end">
        <div className="w-36">
          <label className="text-xs text-zinc-400 mb-1 block">Lease Start<RequiredStar /></label>
          <input type="date" value={form.leaseStart} onChange={e => set("leaseStart", e.target.value)}
            onBlur={() => handleBlur("leaseStart")} className={inputClass + " w-full"} />
        </div>
        <div className="w-36">
          <label className="text-xs text-zinc-400 mb-1 block">Lease Expiry<RequiredStar /></label>
          <input type="date" value={form.leaseExpiry} onChange={e => set("leaseExpiry", e.target.value)}
            onBlur={() => handleBlur("leaseExpiry")} className={inputClass + " w-full"} />
        </div>
        <div className="w-28">
          <label className="text-xs text-zinc-400 mb-1 block">Term (mo)</label>
          <input type="number" value={form.termMonths} onChange={e => set("termMonths", e.target.value)}
            onBlur={() => handleBlur("termMonths")} placeholder="Months" className={inputClass + " w-full"} />
        </div>
      </div>

      {/* Row 5: Comment */}
      <div>
        <label className="text-xs text-zinc-400 mb-1 block">Comment</label>
        <input value={form.comment} onChange={e => set("comment", e.target.value)}
          placeholder="Notes..." className={inputClass + " w-full"} />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button onClick={onSave} className="px-4 py-2 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium">Save</button>
        <button onClick={onCancel} className="px-4 py-2 text-xs text-zinc-400 hover:text-white">Cancel</button>
      </div>
    </div>
  );
}

function AutocompleteInput({ value, onChange, suggestions, placeholder, className }: {
  value: string; onChange: (v: string) => void; suggestions: string[]; placeholder: string; className: string;
}) {
  const [open, setOpen] = useState(false);
  const [filtered, setFiltered] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value.length < 2) { setFiltered([]); setOpen(false); return; }
    const lower = value.toLowerCase();
    const matches = suggestions.filter(s =>
      s.toLowerCase().includes(lower) && s.toLowerCase() !== lower
    ).slice(0, 8);
    setFiltered(matches);
    setOpen(matches.length > 0);
  }, [value, suggestions]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <input type="text" value={value} onChange={e => onChange(e.target.value)}
        onFocus={() => { if (filtered.length > 0) setOpen(true); }}
        placeholder={placeholder} className={className} />
      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 bg-zinc-900 border border-zinc-600 rounded-lg shadow-xl overflow-hidden min-w-[200px]">
          {filtered.map(s => (
            <button key={s} onClick={() => { onChange(s); setOpen(false); }}
              className="block w-full text-left px-3 py-2 text-sm text-white hover:bg-zinc-700 transition-colors">
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
