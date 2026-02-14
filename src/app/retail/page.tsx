"use client";

import { useEffect, useState, useCallback } from "react";

interface Tenant {
  id: number;
  developmentId: number;
  tenantName: string;
  category: string | null;
  areaSF: number | null;
}

interface Development {
  id: number;
  name: string;
  tenants: Tenant[];
}

export default function RetailPage() {
  const [devs, setDevs] = useState<Development[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sfMin, setSfMin] = useState("");
  const [sfMax, setSfMax] = useState("");
  const [editingTenant, setEditingTenant] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{ tenantName: string; areaSF: string }>({ tenantName: "", areaSF: "" });
  const [addingTo, setAddingTo] = useState<number | null>(null);
  const [newTenant, setNewTenant] = useState({ tenantName: "", areaSF: "" });

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

  async function saveTenant(id: number) {
    await fetch(`/api/retail/tenants/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantName: editForm.tenantName, areaSF: editForm.areaSF || null }),
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
      body: JSON.stringify({ tenantName: newTenant.tenantName, areaSF: newTenant.areaSF || null }),
    });
    setAddingTo(null);
    setNewTenant({ tenantName: "", areaSF: "" });
    fetchData();
  }

  function startEdit(t: Tenant) {
    setEditingTenant(t.id);
    setEditForm({ tenantName: t.tenantName, areaSF: t.areaSF ? String(t.areaSF) : "" });
  }

  // Cross-location map
  const tenantLocations = new Map<string, string[]>();
  for (const d of devs) {
    for (const t of d.tenants) {
      const key = t.tenantName.toLowerCase().trim();
      if (!tenantLocations.has(key)) tenantLocations.set(key, []);
      tenantLocations.get(key)!.push(d.name);
    }
  }

  const totalTenants = devs.reduce((s, d) => s + d.tenants.length, 0);
  const inputClass = "bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Retail Tenants</h1>
        <p className="text-zinc-400 text-sm mt-1">Tenant tracking across Saskatoon retail developments · {totalTenants} tenants</p>
      </div>

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
              <div className="px-5 py-4 border-b border-zinc-700 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-white">{d.name}</h2>
                  <span className="text-zinc-500 text-xs">{d.tenants.length}</span>
                </div>
                <button onClick={() => { setAddingTo(addingTo === d.id ? null : d.id); }}
                  className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors">
                  + Add
                </button>
              </div>

              {addingTo === d.id && (
                <div className="px-5 py-3 bg-zinc-900/50 border-b border-zinc-700 flex flex-wrap gap-2 items-center">
                  <input placeholder="Tenant name" value={newTenant.tenantName}
                    onChange={e => setNewTenant({ ...newTenant, tenantName: e.target.value })}
                    className={inputClass + " w-48"} />
                  <input type="number" placeholder="SF" value={newTenant.areaSF}
                    onChange={e => setNewTenant({ ...newTenant, areaSF: e.target.value })}
                    className={inputClass + " w-24"} />
                  <button onClick={() => addTenant(d.id)} className="px-3 py-2 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg">Save</button>
                  <button onClick={() => setAddingTo(null)} className="px-3 py-2 text-xs text-zinc-400 hover:text-white">Cancel</button>
                </div>
              )}

              <div className="divide-y divide-zinc-700/50">
                {d.tenants.map(t => {
                  const otherLocations = (tenantLocations.get(t.tenantName.toLowerCase().trim()) || []).filter(n => n !== d.name);
                  return (
                    <div key={t.id} className="px-5 py-3 hover:bg-zinc-800/80 transition-colors">
                      {editingTenant === t.id ? (
                        <div className="flex flex-wrap gap-2 items-center">
                          <input value={editForm.tenantName} onChange={e => setEditForm({ ...editForm, tenantName: e.target.value })}
                            className={inputClass + " w-48"} />
                          <input type="number" placeholder="SF" value={editForm.areaSF}
                            onChange={e => setEditForm({ ...editForm, areaSF: e.target.value })}
                            className={inputClass + " w-24"} />
                          <button onClick={() => saveTenant(t.id)} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded">Save</button>
                          <button onClick={() => setEditingTenant(null)} className="px-3 py-1.5 text-xs text-zinc-400">Cancel</button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span className="text-sm font-medium text-white">{t.tenantName}</span>
                            {t.areaSF && <span className="text-xs text-zinc-500 font-mono">{t.areaSF.toLocaleString()} SF</span>}
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
