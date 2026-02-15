"use client";

import { useEffect, useState, useCallback } from "react";
import CompEditModal from "@/components/CompEditModal";

interface Comp {
  id: number | string;
  type: string;
  propertyType: string | null;
  investmentType: string | null;
  leaseType: string | null;
  propertyName: string | null;
  address: string;
  unit: string | null;
  city: string | null;
  province: string | null;
  landlord: string | null;
  tenant: string | null;
  portfolio: string | null;
  saleDate: string | null;
  isRenewal: boolean | null;
  leaseStart: string | null;
  leaseExpiry: string | null;
  termMonths: number | null;
  netRentPSF: number | null;
  annualRent: number | null;
  rentSteps: string | null;
  areaSF: number | null;
  officeSF: number | null;
  ceilingHeight: number | null;
  loadingDocks: number | null;
  driveInDoors: number | null;
  landAcres: number | null;
  landSF: number | null;
  yearBuilt: number | null;
  zoning: string | null;
  numBuildings: number | null;
  numStories: number | null;
  constructionClass: string | null;
  operatingCost: number | null;
  improvementAllowance: string | null;
  freeRentPeriod: string | null;
  fixturingPeriod: string | null;
  comments: string | null;
  source: string | null;
  researchedUnavailable: number | null;
  researchedAt: string | null;
  researchedBy: number | null;
  researchedExpired: boolean;
  isResearched: boolean;
  isAutoResearched: boolean;
  isRetailTenant?: boolean;
  retailTenantId?: number;
}

const PROPERTY_TYPES = ["All", "Retail", "Industrial", "Office", "Investment", "Land", "Other", "Unknown"];

function fmtDate(d: string | null) {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtRent(n: number | null) {
  if (n == null) return "—";
  return "$" + n.toFixed(2) + "/SF";
}

function fmtAnnual(n: number | null) {
  if (n == null) return "—";
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 }) + "/yr";
}

function fmtNum(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString("en-US");
}

function fmtSF(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString("en-US") + " SF";
}

function fmtD(d: string | null) {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtP(n: number | null) { return n != null ? "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : ""; }
function fmtPSF2(n: number | null) { return n != null ? "$" + n.toFixed(2) + "/SF" : ""; }
function fmtN(n: number | null) { return n != null ? n.toLocaleString("en-US") : ""; }

function parseRentSteps(s: string | null): string {
  if (!s) return "";
  try {
    const steps = JSON.parse(s);
    if (Array.isArray(steps)) return steps.map((st: { month?: number; rentPSF?: number }) => `Mo ${st.month}: ${fmtPSF2(st.rentPSF ?? null)}`).join("; ");
  } catch {}
  return s;
}

function getLeaseColumns(detailed: boolean) {
  const basic = ["Address", "City", "Tenant", "Landlord", "Type", "Net Rent/SF", "Annual Rent", "Size (SF)", "Lease Start", "Lease Expiry", "Term", "Operating Cost", "Comments"];
  if (!detailed) return basic;
  return [...basic, "Renewal", "Lease Type", "Rent Steps", "Improvement Allowance", "Free Rent", "Fixturing Period", "Property Name", "Year Built", "Zoning", "Construction", "Ceiling Height", "Loading Docks", "Drive-In Doors", "Office SF", "Land Acres", "Land SF", "Source"];
}

function getLeaseRow(r: Comp, detailed: boolean): string[] {
  const basic = [
    r.address + (r.unit ? ` ${r.unit}` : ""), r.city || "Saskatoon", r.tenant || "", r.landlord || "",
    r.propertyType || "", fmtPSF2(r.netRentPSF), fmtP(r.annualRent), fmtN(r.areaSF),
    fmtD(r.leaseStart), fmtD(r.leaseExpiry), r.termMonths ? `${r.termMonths}mo` : "",
    r.operatingCost != null ? fmtPSF2(r.operatingCost) : "", r.comments || "",
  ];
  if (!detailed) return basic;
  return [...basic,
    r.isRenewal ? "Yes" : "", r.leaseType || "", parseRentSteps(r.rentSteps),
    r.improvementAllowance || "", r.freeRentPeriod || "", r.fixturingPeriod || "",
    r.propertyName || "", r.yearBuilt?.toString() || "", r.zoning || "",
    r.constructionClass || "", r.ceilingHeight ? r.ceilingHeight + " ft" : "",
    r.loadingDocks?.toString() || "", r.driveInDoors?.toString() || "",
    fmtN(r.officeSF), r.landAcres?.toString() || "", fmtN(r.landSF),
    r.source || "",
  ];
}

function buildLeaseHTML(selected: Comp[], detailed = false): string {
  const headers = getLeaseColumns(detailed);
  const th = headers.map(h => `<th style="border:1px solid #ccc;padding:6px 10px;background:#f5f5f5;font-weight:bold;text-align:left;font-size:13px">${h}</th>`).join("");
  const rows = selected.map(r => {
    const cells = getLeaseRow(r, detailed);
    return `<tr>${cells.map(c => `<td style="border:1px solid #ccc;padding:6px 10px;font-size:13px">${c}</td>`).join("")}</tr>`;
  }).join("");
  return `<table style="border-collapse:collapse;font-family:Arial,sans-serif"><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table>`;
}

function buildLeasePlain(selected: Comp[], detailed = false): string {
  const header = getLeaseColumns(detailed).join("\t");
  const rows = selected.map(r => getLeaseRow(r, detailed).join("\t"));
  return header + "\n" + rows.join("\n");
}

interface LeasesPageProps {
  embedded?: boolean;
  embeddedSearch?: string;
  embeddedPropertyType?: string;
  embeddedCity?: string;
  embeddedSizeMin?: string;
  embeddedSizeMax?: string;
  embeddedDateFrom?: string;
  embeddedSource?: string;
}

export default function LeasesPage({ embedded, embeddedSearch, embeddedPropertyType, embeddedCity, embeddedSizeMin, embeddedSizeMax, embeddedDateFrom, embeddedSource }: LeasesPageProps = {}) {
  const [data, setData] = useState<Comp[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [propertyType, setPropertyType] = useState("All");
  const [city, setCity] = useState("All");
  const [cities, setCities] = useState<{ city: string; count: number }[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sizeMin, setSizeMin] = useState("");
  const [sizeMax, setSizeMax] = useState("");
  const [sortBy, setSortBy] = useState("sale_date");
  const [sortDir, setSortDir] = useState("desc");
  const [expanded, setExpanded] = useState<number | string | null>(null);
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  const [copied, setCopied] = useState(false);
  const [showCopyMenu, setShowCopyMenu] = useState(false);
  const [editing, setEditing] = useState<Comp | null>(null);
  const [creating, setCreating] = useState(false);
  const [researchFilter, setResearchFilter] = useState<"all" | "researched" | "unresearched">("all");
  const limit = 50;

  // When embedded, use parent filter values
  const effectiveSearch = embedded ? (embeddedSearch || "") : search;
  const effectivePropertyType = embedded ? (embeddedPropertyType || "All") : propertyType;
  const effectiveCity = embedded ? (embeddedCity || "All") : city;
  const effectiveSizeMin = embedded ? (embeddedSizeMin || "") : sizeMin;
  const effectiveSizeMax = embedded ? (embeddedSizeMax || "") : sizeMax;
  const effectiveDateFrom = embedded ? (embeddedDateFrom || "") : dateFrom;
  const effectiveSource = embedded ? (embeddedSource || "All") : "All";

  useEffect(() => {
    fetch("/api/comps/cities").then(r => r.json()).then(setCities).catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ type: "Lease", page: String(page), limit: String(limit), sortBy, sortDir });
    if (effectiveSearch) params.set("search", effectiveSearch);
    if (effectivePropertyType !== "All") params.set("propertyType", effectivePropertyType);
    if (effectiveCity !== "All") params.set("city", effectiveCity);
    if (effectiveDateFrom) params.set("dateFrom", effectiveDateFrom);
    if (effectiveSource === "transfer") { params.set("source", "transfer"); }
    else if (effectiveSource === "not-transfer") { params.set("excludeSource", "transfer"); }
    else if (effectiveSource !== "All") { params.set("source", effectiveSource); }
    if (dateTo) params.set("dateTo", dateTo);
    if (effectiveSizeMin) params.set("sizeMin", effectiveSizeMin);
    if (effectiveSizeMax) params.set("sizeMax", effectiveSizeMax);
    if (researchFilter === "researched") params.set("researchedOnly", "true");
    if (researchFilter === "unresearched") params.set("hideResearched", "true");
    try {
      const res = await fetch(`/api/comps?${params}`);
      const json = await res.json();
      setData(json.data || []);
      setTotal(json.total || 0);
    } finally {
      setLoading(false);
    }
  }, [page, effectiveSearch, effectivePropertyType, effectiveCity, effectiveDateFrom, dateTo, effectiveSizeMin, effectiveSizeMax, sortBy, sortDir, researchFilter, effectiveSource]);

  useEffect(() => {
    const t = setTimeout(fetchData, 200);
    return () => clearTimeout(t);
  }, [fetchData]);

  function toggleSort(col: string) {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("desc"); }
    setPage(0);
  }

  function toggleSelect(id: string | number, e: React.MouseEvent) {
    e.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (selected.size === data.length) setSelected(new Set());
    else setSelected(new Set(data.map(r => r.id)));
  }

  async function copyComps(detailed = false) {
    const selectedComps = data.filter(r => selected.has(r.id));
    if (selectedComps.length === 0) return;
    const html = buildLeaseHTML(selectedComps, detailed);
    const plain = buildLeasePlain(selectedComps, detailed);
    const blob = new Blob([html], { type: "text/html" });
    const plainBlob = new Blob([plain], { type: "text/plain" });
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": blob,
        "text/plain": plainBlob,
      }),
    ]);
    setShowCopyMenu(false);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function SortIcon({ col }: { col: string }) {
    if (sortBy !== col) return null;
    return <span className="ml-1 text-blue-400">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  async function handleSave(updates: Record<string, unknown>) {
    if (!editing) return;
    await fetch(`/api/comps/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    setEditing(null);
    fetchData();
  }

  async function handleDelete() {
    if (!editing) return;
    await fetch(`/api/comps/${editing.id}`, { method: "DELETE" });
    setEditing(null);
    fetchData();
  }

  async function handleCreate(fields: Record<string, unknown>) {
    await fetch("/api/comps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...fields, type: "Lease" }),
    });
    setCreating(false);
    fetchData();
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      {!embedded && (
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Lease Transactions</h1>
          <p className="text-zinc-400 text-sm mt-1">{total.toLocaleString()} Lease Transactions</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setCreating(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Add Comp
          </button>
        {selected.size > 0 && (
          <div className="relative">
            <button onClick={() => setShowCopyMenu(!showCopyMenu)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
              {copied ? "✓ Copied!" : `Copy ${selected.size} Comp${selected.size > 1 ? "s" : ""}`}
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
            </button>
            {showCopyMenu && (
              <div className="absolute right-0 top-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-20 min-w-[180px]">
                <button onClick={() => copyComps(false)} className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-zinc-700 rounded-t-lg transition-colors">
                  Copy Basic
                  <span className="block text-[11px] text-zinc-400">Key fields only</span>
                </button>
                <button onClick={() => copyComps(true)} className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-zinc-700 rounded-b-lg transition-colors border-t border-zinc-700">
                  Copy Detailed
                  <span className="block text-[11px] text-zinc-400">All fields incl. lease terms &amp; specs</span>
                </button>
              </div>
            )}
          </div>
        )}
        </div>
      </div>
      )}

      {embedded && (
        <div className="flex items-center justify-between">
          <p className="text-zinc-400 text-sm">{total.toLocaleString()} Lease Transactions</p>
          <div className="flex items-center gap-3">
            <button onClick={() => setCreating(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Add Comp
            </button>
            {selected.size > 0 && (
              <div className="relative">
                <button onClick={() => setShowCopyMenu(!showCopyMenu)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                  {copied ? "✓ Copied!" : `Copy ${selected.size} Comp${selected.size > 1 ? "s" : ""}`}
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                </button>
                {showCopyMenu && (
                  <div className="absolute right-0 top-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-20 min-w-[180px]">
                    <button onClick={() => copyComps(false)} className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-zinc-700 rounded-t-lg transition-colors">
                      Copy Basic
                      <span className="block text-[11px] text-zinc-400">Key fields only</span>
                    </button>
                    <button onClick={() => copyComps(true)} className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-zinc-700 rounded-b-lg transition-colors border-t border-zinc-700">
                      Copy Detailed
                      <span className="block text-[11px] text-zinc-400">All fields incl. lease terms &amp; specs</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filter Bar */}
      {!embedded && (
      <div className="bg-zinc-800 rounded-xl p-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-zinc-400 mb-1 block">Search</label>
          <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="Address, tenant, landlord..."
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">City</label>
          <select value={city} onChange={e => { setCity(e.target.value); setPage(0); }}
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50">
            <option value="All">All Cities</option>
            {cities.map(c => <option key={c.city} value={c.city}>{c.city} ({c.count})</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Property Type</label>
          <select value={propertyType} onChange={e => { setPropertyType(e.target.value); setPage(0); }}
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50">
            {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Date From</label>
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(0); }}
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Date To</label>
          <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(0); }}
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Size Min (SF)</label>
          <input type="number" value={sizeMin} onChange={e => { setSizeMin(e.target.value); setPage(0); }}
            placeholder="0" className="w-28 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Size Max (SF)</label>
          <input type="number" value={sizeMax} onChange={e => { setSizeMax(e.target.value); setPage(0); }}
            placeholder="∞" className="w-28 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
        </div>
        <div className="flex items-center gap-1 self-end pb-1">
          <select value={researchFilter} onChange={e => { setResearchFilter(e.target.value as "all" | "researched" | "unresearched"); setPage(0); }}
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500/50">
            <option value="all">All Comps</option>
            <option value="researched">Researched Only</option>
            <option value="unresearched">Unresearched Only</option>
          </select>
        </div>
      </div>
      )}

      {loading ? (
        <div className="text-zinc-400 p-8 text-center">Loading...</div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-800 text-left text-zinc-400 text-xs uppercase tracking-wider">
                  <th className="px-3 py-3 w-10">
                    <input type="checkbox" checked={selected.size === data.length && data.length > 0} onChange={selectAll}
                      className="rounded border-zinc-600 bg-zinc-900 text-blue-500 focus:ring-blue-500/50" />
                  </th>
                  <th className="px-3 py-3 cursor-pointer hover:text-white" onClick={() => toggleSort("address")}>Address<SortIcon col="address" /></th>
                  <th className="px-3 py-3 cursor-pointer hover:text-white" onClick={() => toggleSort("city")}>City<SortIcon col="city" /></th>
                  <th className="px-3 py-3">Tenant</th>
                  <th className="px-3 py-3">Landlord</th>
                  <th className="px-3 py-3 cursor-pointer hover:text-white" onClick={() => toggleSort("property_type")}>Type<SortIcon col="property_type" /></th>
                  <th className="px-3 py-3 cursor-pointer hover:text-white text-right" onClick={() => toggleSort("net_rent_psf")}>Rent/SF<SortIcon col="net_rent_psf" /></th>
                  <th className="px-3 py-3 cursor-pointer hover:text-white text-right" onClick={() => toggleSort("area_sf")}>Size<SortIcon col="area_sf" /></th>
                  <th className="px-3 py-3 text-center w-10">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.map(r => (
                  <LeaseRow key={r.id} r={r} expanded={expanded === r.id}
                    isSelected={selected.has(r.id)}
                    onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
                    onSelect={(e) => toggleSelect(r.id, e)}
                    onEdit={() => setEditing(r)}
                    onRefresh={fetchData} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {data.map(r => (
              <div key={r.id} className={`bg-zinc-800 rounded-xl p-4 border ${selected.has(r.id) ? "border-blue-500" : "border-zinc-700"}`}>
                <div className="flex items-start gap-3">
                  <input type="checkbox" checked={selected.has(r.id)}
                    onChange={(e) => toggleSelect(r.id, e as unknown as React.MouseEvent)}
                    className="mt-1 rounded border-zinc-600 bg-zinc-900 text-blue-500 focus:ring-blue-500/50" />
                  <div className="flex-1" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-medium text-white text-sm">{r.address}{r.unit ? ` ${r.unit}` : ""}</p>
                        <p className="text-xs text-zinc-400">{r.city || "Saskatoon"}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`inline-block w-2.5 h-2.5 rounded-full ${r.isResearched ? "bg-emerald-500" : "bg-red-500"}`} />
                        <span className="px-2 py-0.5 rounded text-xs bg-zinc-600 text-zinc-200">{r.propertyType || "—"}</span>
                      </div>
                    </div>
                    <div className="mt-2 text-xs space-y-1">
                      <p className="text-zinc-400"><span className="text-zinc-500">Tenant:</span> {r.tenant || "—"}</p>
                      <p className="text-zinc-400"><span className="text-zinc-500">Landlord:</span> {r.landlord || "—"}</p>
                    </div>
                    <div className="flex justify-between text-sm mt-2">
                      <span className="font-mono text-white">{fmtRent(r.netRentPSF)}</span>
                      <span className="text-zinc-400">{fmtSF(r.areaSF)}</span>
                    </div>
                    {expanded === r.id && <ExpandedDetail r={r} onEdit={() => setEditing(r)} onRefresh={fetchData} />}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 hover:bg-zinc-700 disabled:opacity-40">Previous</button>
              <span className="text-sm text-zinc-400">Page {page + 1} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 hover:bg-zinc-700 disabled:opacity-40">Next</button>
            </div>
          )}
        </>
      )}

      {editing && (
        <CompEditModal
          comp={editing as unknown as Record<string, unknown>}
          type="Lease"
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setEditing(null)}
        />
      )}

      {creating && (
        <CompEditModal
          comp={{}}
          type="Lease"
          onSave={handleCreate}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

function LeaseRow({ r, expanded, isSelected, onToggle, onSelect, onEdit, onRefresh }: { r: Comp; expanded: boolean; isSelected: boolean; onToggle: () => void; onSelect: (e: React.MouseEvent) => void; onEdit?: () => void; onRefresh: () => void }) {
  return (
    <>
      <tr className={`border-b border-zinc-700 ${isSelected ? "bg-blue-500/10" : "bg-zinc-900"} hover:bg-zinc-800 cursor-pointer transition-colors`}>
        <td className="px-3 py-3" onClick={onSelect}>
          <input type="checkbox" checked={isSelected} readOnly
            className="rounded border-zinc-600 bg-zinc-900 text-blue-500 focus:ring-blue-500/50 pointer-events-none" />
        </td>
        <td className="px-3 py-3 text-white font-medium" onClick={onToggle}>{r.address}{r.unit ? ` ${r.unit}` : ""}</td>
        <td className="px-3 py-3 text-zinc-300" onClick={onToggle}>{r.city || "—"}</td>
        <td className="px-3 py-3 text-zinc-300 max-w-[180px] truncate" onClick={onToggle}>{r.tenant || "—"}</td>
        <td className="px-3 py-3 text-zinc-300 max-w-[180px] truncate" onClick={onToggle}>{r.landlord || "—"}</td>
        <td className="px-3 py-3" onClick={onToggle}><span className="px-2 py-0.5 rounded text-xs bg-zinc-600 text-zinc-200">{r.propertyType || "—"}</span></td>
        <td className="px-3 py-3 text-right font-mono text-white" onClick={onToggle}>{fmtRent(r.netRentPSF)}</td>
        <td className="px-3 py-3 text-right text-zinc-300" onClick={onToggle}>{fmtSF(r.areaSF)}</td>
        <td className="px-3 py-3 text-center" onClick={onToggle}>
          <span className={`inline-block w-2.5 h-2.5 rounded-full ${r.isResearched ? "bg-emerald-500" : "bg-red-500"}`} title={r.isResearched ? "Researched" : "Not researched"} />
        </td>
      </tr>
      {expanded && (
        <tr className="bg-zinc-800/50">
          <td colSpan={9} className="px-6 py-4">
            <ExpandedDetail r={r} onEdit={onEdit} onRefresh={onRefresh} />
          </td>
        </tr>
      )}
    </>
  );
}

function ExpandedDetail({ r, onEdit, onRefresh }: { r: Comp; onEdit?: () => void; onRefresh?: () => void }) {
  async function toggleResearched(e: React.MouseEvent) {
    e.stopPropagation();
    await fetch(`/api/comps/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ researchedUnavailable: r.researchedUnavailable === 1 ? false : true }),
    });
    onRefresh?.();
  }

  let rentSteps: { rate: number | null; annual: number | null; date: string | null }[] = [];
  try {
    if (r.rentSteps) rentSteps = JSON.parse(r.rentSteps);
  } catch { /* ignore */ }

  return (
    <div className="mt-3 pt-3 border-t border-zinc-700 space-y-4">
      <div className="flex justify-end gap-2">
        {r.retailTenantId && (
          <span className="px-3 py-1.5 text-xs text-purple-400 bg-purple-900/30 rounded-lg">🏪 From Retail Rent Roll</span>
        )}
        <button onClick={toggleResearched}
          className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors">
          {r.researchedUnavailable === 1 ? "Unflag Researched" : "Mark Unavailable"}
        </button>
        <button onClick={(e) => { e.stopPropagation(); onEdit?.(); }}
          className="px-3 py-1.5 text-sm bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg transition-colors flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
          Edit
        </button>
      </div>
      <div>
        <h4 className="text-xs uppercase text-zinc-500 font-semibold mb-2">Property Details</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Detail label="Property Name" value={r.propertyName || "—"} />
          <Detail label="Property Type" value={r.propertyType || "—"} />
          <Detail label="Lease Type" value={r.leaseType || "—"} />
          <Detail label="City" value={r.city || "—"} />
          <Detail label="Zoning" value={r.zoning || "—"} />
          <Detail label="Year Built" value={r.yearBuilt ? String(r.yearBuilt) : "—"} />
          <Detail label="Construction Class" value={r.constructionClass || "—"} />
          <Detail label="Portfolio" value={r.portfolio || "—"} />
        </div>
      </div>
      <div>
        <h4 className="text-xs uppercase text-zinc-500 font-semibold mb-2">Building / Land</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Detail label="Leasable Area" value={fmtSF(r.areaSF)} />
          <Detail label="Office Area" value={fmtSF(r.officeSF)} />
          <Detail label="Land Size (Acres)" value={r.landAcres != null ? fmtNum(r.landAcres) : "—"} />
          <Detail label="Land Size (SF)" value={fmtSF(r.landSF)} />
          <Detail label="Ceiling Height" value={r.ceilingHeight != null ? r.ceilingHeight + " ft" : "—"} />
          <Detail label="Loading Docks" value={r.loadingDocks != null ? String(r.loadingDocks) : "—"} />
          <Detail label="Drive-In Doors" value={r.driveInDoors != null ? String(r.driveInDoors) : "—"} />
          <Detail label="# Buildings" value={r.numBuildings != null ? String(r.numBuildings) : "—"} />
          <Detail label="# Stories" value={r.numStories != null ? String(r.numStories) : "—"} />
        </div>
      </div>
      <div>
        <h4 className="text-xs uppercase text-zinc-500 font-semibold mb-2">Lease Terms</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Detail label="Lease Start" value={fmtDate(r.leaseStart)} />
          <Detail label="Lease Expiry" value={fmtDate(r.leaseExpiry)} />
          <Detail label="Term" value={r.termMonths ? `${r.termMonths} months (${Math.round(r.termMonths / 12)} years)` : "—"} />
          <Detail label="Renewal" value={r.isRenewal ? "Yes" : "—"} />
          <Detail label="Net Rent/SF/yr" value={fmtRent(r.netRentPSF)} />
          <Detail label="Annual Rent" value={fmtAnnual(r.annualRent)} />
          <Detail label="Operating Cost" value={r.operatingCost != null ? `$${r.operatingCost.toFixed(2)}/SF` : "—"} />
          <Detail label="Improvement Allowance" value={r.improvementAllowance || "—"} />
          <Detail label="Free Rent Period" value={r.freeRentPeriod || "—"} />
          <Detail label="Fixturing Period" value={r.fixturingPeriod || "—"} />
        </div>
      </div>
      {rentSteps.length > 0 && (
        <div>
          <h4 className="text-xs uppercase text-zinc-500 font-semibold mb-2">Rent Steps</h4>
          <div className="bg-zinc-900 rounded-lg p-3">
            <div className="grid grid-cols-3 gap-2 text-xs text-zinc-500 mb-2">
              <span>Rate/SF</span><span>Annual</span><span>Effective Date</span>
            </div>
            {rentSteps.map((s, i) => (
              <div key={i} className="grid grid-cols-3 gap-2 text-sm text-zinc-200 py-1 border-t border-zinc-800">
                <span>{s.rate != null ? fmtRent(s.rate) : "—"}</span>
                <span>{s.annual != null ? fmtAnnual(s.annual) : "—"}</span>
                <span>{fmtDate(s.date)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div>
        <h4 className="text-xs uppercase text-zinc-500 font-semibold mb-2">Meta</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Detail label="Source" value={r.source === "compfolio" ? "CompFolio" : r.source || "—"} />
        </div>
      </div>
      <div>
        <h4 className="text-xs uppercase text-zinc-500 font-semibold mb-2">Comments</h4>
        <p className="text-zinc-300 text-sm">{r.comments || "—"}</p>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <span className="text-zinc-500 text-xs">{label}</span>
      <p className="text-zinc-200 mt-0.5">{value}</p>
    </div>
  );
}
