"use client";

import { useEffect, useState, useCallback } from "react";

interface Tenant {
  id: number;
  developmentId: number;
  tenantName: string;
  category: string | null;
  comment: string | null;
  status: string;
}

interface Development {
  id: number;
  name: string;
  area: string | null;
  address: string | null;
  notes: string | null;
  tenants: Tenant[];
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500/20 text-emerald-300",
  prospect: "bg-blue-500/20 text-blue-300",
  rejected: "bg-red-500/20 text-red-300",
  closed: "bg-zinc-500/20 text-zinc-400",
};

const AREA_COLORS: Record<string, string> = {
  West: "bg-amber-500/20 text-amber-300",
  South: "bg-violet-500/20 text-violet-300",
  East: "bg-blue-500/20 text-blue-300",
  Central: "bg-emerald-500/20 text-emerald-300",
};

export default function RetailPage() {
  const [devs, setDevs] = useState<Development[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [area, setArea] = useState("");
  const [status, setStatus] = useState("");
  const [editingTenant, setEditingTenant] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<Tenant>>({});
  const [addingTo, setAddingTo] = useState<number | null>(null);
  const [newTenant, setNewTenant] = useState({ tenantName: "", comment: "", status: "active" });

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (area) params.set("area", area);
    if (status) params.set("status", status);
    const res = await fetch(`/api/retail?${params}`);
    const json = await res.json();
    setDevs(json.data);
    setLoading(false);
  }, [search, area, status]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function saveTenant(id: number) {
    await fetch(`/api/retail/tenants/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
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
    await fetch(`/api/retail/${devId}/tenants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newTenant),
    });
    setAddingTo(null);
    setNewTenant({ tenantName: "", comment: "", status: "active" });
    fetchData();
  }

  function startEdit(t: Tenant) {
    setEditingTenant(t.id);
    setEditForm({ tenantName: t.tenantName, comment: t.comment, status: t.status, category: t.category });
  }

  // Compute cross-location tenant map for the "where else" feature
  const tenantLocations = new Map<string, string[]>();
  for (const d of devs) {
    for (const t of d.tenants) {
      const key = t.tenantName.toLowerCase().trim();
      if (!tenantLocations.has(key)) tenantLocations.set(key, []);
      tenantLocations.get(key)!.push(d.name);
    }
  }

  const totalTenants = devs.reduce((s, d) => s + d.tenants.length, 0);
  const uniqueTenants = new Set(devs.flatMap(d => d.tenants.map(t => t.tenantName.toLowerCase().trim()))).size;
  const inputClass = "bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Retail Tenants</h1>
        <p className="text-zinc-400 text-sm mt-1">Tenant tracking across Saskatoon retail developments</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-white">{devs.length}</p>
          <p className="text-xs text-zinc-400">Developments</p>
        </div>
        <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-white">{totalTenants}</p>
          <p className="text-xs text-zinc-400">Tenant Entries</p>
        </div>
        <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-white">{uniqueTenants}</p>
          <p className="text-xs text-zinc-400">Unique Tenants</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input type="text" placeholder="Search tenants..."
          value={search} onChange={e => setSearch(e.target.value)}
          className={inputClass + " w-64"} />
        <select value={area} onChange={e => setArea(e.target.value)} className={inputClass}>
          <option value="">All Areas</option>
          <option value="West">West</option>
          <option value="South">South</option>
          <option value="East">East</option>
          <option value="Central">Central</option>
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)} className={inputClass}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="prospect">Prospect</option>
          <option value="rejected">Rejected</option>
          <option value="closed">Closed/OOB</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          {devs.map(d => (
            <div key={d.id} className="bg-zinc-800/50 border border-zinc-700 rounded-xl overflow-hidden">
              {/* Development Header */}
              <div className="px-5 py-4 border-b border-zinc-700 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-white">{d.name}</h2>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${AREA_COLORS[d.area || ""] || "bg-zinc-600 text-zinc-300"}`}>
                    {d.area || "—"}
                  </span>
                  <span className="text-zinc-500 text-xs">{d.tenants.length} tenants</span>
                </div>
                <button onClick={() => { setAddingTo(addingTo === d.id ? null : d.id); }}
                  className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors">
                  + Add
                </button>
              </div>

              {/* Add Tenant */}
              {addingTo === d.id && (
                <div className="px-5 py-3 bg-zinc-900/50 border-b border-zinc-700 flex flex-wrap gap-2">
                  <input placeholder="Tenant name" value={newTenant.tenantName}
                    onChange={e => setNewTenant({ ...newTenant, tenantName: e.target.value })}
                    className={inputClass + " w-48"} />
                  <input placeholder="Comment" value={newTenant.comment}
                    onChange={e => setNewTenant({ ...newTenant, comment: e.target.value })}
                    className={inputClass + " w-48"} />
                  <select value={newTenant.status} onChange={e => setNewTenant({ ...newTenant, status: e.target.value })} className={inputClass}>
                    <option value="active">Active</option>
                    <option value="prospect">Prospect</option>
                    <option value="rejected">Rejected</option>
                    <option value="closed">Closed</option>
                  </select>
                  <button onClick={() => addTenant(d.id)} className="px-3 py-2 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg">Save</button>
                  <button onClick={() => setAddingTo(null)} className="px-3 py-2 text-xs text-zinc-400 hover:text-white">Cancel</button>
                </div>
              )}

              {/* Tenant List */}
              <div className="divide-y divide-zinc-700/50">
                {d.tenants.map(t => {
                  const otherLocations = (tenantLocations.get(t.tenantName.toLowerCase().trim()) || []).filter(n => n !== d.name);
                  return (
                    <div key={t.id} className="px-5 py-3 hover:bg-zinc-800/80 transition-colors">
                      {editingTenant === t.id ? (
                        <div className="flex flex-wrap gap-2 items-center">
                          <input value={editForm.tenantName || ""} onChange={e => setEditForm({ ...editForm, tenantName: e.target.value })}
                            className={inputClass + " w-48"} />
                          <input value={editForm.comment || ""} onChange={e => setEditForm({ ...editForm, comment: e.target.value })}
                            placeholder="Comment" className={inputClass + " w-48"} />
                          <select value={editForm.status || "active"} onChange={e => setEditForm({ ...editForm, status: e.target.value })} className={inputClass}>
                            <option value="active">Active</option>
                            <option value="prospect">Prospect</option>
                            <option value="rejected">Rejected</option>
                            <option value="closed">Closed</option>
                          </select>
                          <button onClick={() => saveTenant(t.id)} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded">Save</button>
                          <button onClick={() => setEditingTenant(null)} className="px-3 py-1.5 text-xs text-zinc-400">Cancel</button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_COLORS[t.status] || STATUS_COLORS.active} whitespace-nowrap`}>
                              {t.status}
                            </span>
                            <span className={`text-sm font-medium ${t.status === "closed" ? "text-zinc-500 line-through" : "text-white"}`}>
                              {t.tenantName}
                            </span>
                            {t.comment && <span className="text-zinc-500 text-xs truncate">{t.comment}</span>}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {otherLocations.length > 0 && (
                              <span className="text-xs text-zinc-500" title={`Also at: ${otherLocations.join(", ")}`}>
                                📍 +{otherLocations.length}
                              </span>
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
