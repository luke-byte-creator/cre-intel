"use client";

import { useEffect, useState, useCallback } from "react";
import CompEditModal from "@/components/CompEditModal";

interface Comp {
  id: number;
  type: string;
  propertyType: string | null;
  investmentType: string | null;
  propertyName: string | null;
  address: string;
  unit: string | null;
  city: string | null;
  province: string | null;
  seller: string | null;
  purchaser: string | null;
  saleDate: string | null;
  salePrice: number | null;
  pricePSF: number | null;
  pricePerAcre: number | null;
  capRate: number | null;
  noi: number | null;
  stabilizedNOI: number | null;
  stabilizedCapRate: number | null;
  vacancyRate: number | null;
  pricePerUnit: number | null;
  opexRatio: number | null;
  numUnits: number | null;
  areaSF: number | null;
  officeSF: number | null;
  ceilingHeight: number | null;
  loadingDocks: number | null;
  driveInDoors: number | null;
  yearBuilt: number | null;
  zoning: string | null;
  landAcres: number | null;
  landSF: number | null;
  numBuildings: number | null;
  numStories: number | null;
  constructionClass: string | null;
  comments: string | null;
  source: string | null;
  rollNumber: string | null;
  pptDescriptor: string | null;
  armsLength: boolean | null;
  portfolio: string | null;
  researchedUnavailable: number | null;
  researchedAt: string | null;
  researchedBy: number | null;
  researchedExpired: boolean;
  isResearched: boolean;
  isAutoResearched: boolean;
}

const PROPERTY_TYPES = ["All", "Land", "Investment", "Retail", "Industrial", "Office", "Other", "Unknown"];

function fmtDate(d: string | null) {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtPrice(n: number | null) {
  if (n == null) return "—";
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtPricePSF(n: number | null) {
  if (n == null) return "—";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "/SF";
}

function fmtCap(n: number | null) {
  if (n == null) return "—";
  return n.toFixed(2) + "%";
}

function fmtNum(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString("en-US");
}

function fmtSF(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString("en-US") + " SF";
}

function sourceLabel(s: string | null) {
  if (!s) return "—";
  if (s === "compfolio") return "CompFolio";
  if (s === "transfer-2018-2022") return "Transfer List 2018–2022";
  if (s === "transfer-2023-2025") return "Transfer List 2023–2025";
  return s;
}

function buildCompHTML(selected: Comp[]): string {
  const headers = ["Address", "City", "Date", "Vendor", "Purchaser", "Price", "Price/SF", "Size (SF)", "Property Type", "Cap Rate", "NOI", "Comments"];
  const th = headers.map(h => `<th style="border:1px solid #ccc;padding:6px 10px;background:#f5f5f5;font-weight:bold;text-align:left;font-size:13px">${h}</th>`).join("");
  const rows = selected.map(r => {
    const cells = [
      r.address + (r.unit ? ` ${r.unit}` : ""),
      r.city || "Saskatoon",
      r.saleDate ? new Date(r.saleDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "",
      r.seller || "",
      r.purchaser || "",
      r.salePrice != null ? "$" + r.salePrice.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "",
      r.pricePSF != null ? "$" + r.pricePSF.toFixed(2) + "/SF" : "",
      r.areaSF != null ? r.areaSF.toLocaleString("en-US") : "",
      r.propertyType || "",
      r.capRate != null ? r.capRate.toFixed(2) + "%" : "",
      r.noi != null ? "$" + r.noi.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "",
      r.comments || "",
    ];
    return `<tr>${cells.map(c => `<td style="border:1px solid #ccc;padding:6px 10px;font-size:13px">${c}</td>`).join("")}</tr>`;
  }).join("");
  return `<table style="border-collapse:collapse;font-family:Arial,sans-serif"><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table>`;
}

function buildCompPlain(selected: Comp[]): string {
  const header = "Address\tCity\tDate\tVendor\tPurchaser\tPrice\tPrice/SF\tSize (SF)\tProperty Type\tCap Rate\tNOI\tComments";
  const rows = selected.map(r => [
    r.address + (r.unit ? ` ${r.unit}` : ""),
    r.city || "Saskatoon",
    r.saleDate ? new Date(r.saleDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "",
    r.seller || "",
    r.purchaser || "",
    r.salePrice != null ? "$" + r.salePrice.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "",
    r.pricePSF != null ? "$" + r.pricePSF.toFixed(2) + "/SF" : "",
    r.areaSF != null ? r.areaSF.toLocaleString("en-US") : "",
    r.propertyType || "",
    r.capRate != null ? r.capRate.toFixed(2) + "%" : "",
    r.noi != null ? "$" + r.noi.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "",
    r.comments || "",
  ].join("\t"));
  return header + "\n" + rows.join("\n");
}

export default function SalesPage() {
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
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [sizeMin, setSizeMin] = useState("");
  const [sizeMax, setSizeMax] = useState("");
  const [sortBy, setSortBy] = useState("sale_date");
  const [sortDir, setSortDir] = useState("desc");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState<Comp | null>(null);
  const [creating, setCreating] = useState(false);
  const [researchFilter, setResearchFilter] = useState<"all" | "researched" | "unresearched">("all");
  const limit = 50;

  useEffect(() => {
    fetch("/api/comps/cities").then(r => r.json()).then(setCities).catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ type: "Sale", page: String(page), limit: String(limit), sortBy, sortDir });
    if (search) params.set("search", search);
    if (propertyType !== "All") params.set("propertyType", propertyType);
    if (city !== "All") params.set("city", city);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (priceMin) params.set("priceMin", priceMin);
    if (priceMax) params.set("priceMax", priceMax);
    if (sizeMin) params.set("sizeMin", sizeMin);
    if (sizeMax) params.set("sizeMax", sizeMax);
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
  }, [page, search, propertyType, city, dateFrom, dateTo, priceMin, priceMax, sizeMin, sizeMax, sortBy, sortDir, researchFilter]);

  useEffect(() => {
    const t = setTimeout(fetchData, 200);
    return () => clearTimeout(t);
  }, [fetchData]);

  function toggleSort(col: string) {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("desc"); }
    setPage(0);
  }

  function toggleSelect(id: number, e: React.MouseEvent) {
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

  async function copyComps() {
    const selectedComps = data.filter(r => selected.has(r.id));
    if (selectedComps.length === 0) return;
    const html = buildCompHTML(selectedComps);
    const plain = buildCompPlain(selectedComps);
    const blob = new Blob([html], { type: "text/html" });
    const plainBlob = new Blob([plain], { type: "text/plain" });
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": blob,
        "text/plain": plainBlob,
      }),
    ]);
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
      body: JSON.stringify({ ...fields, type: "Sale" }),
    });
    setCreating(false);
    fetchData();
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Sale Transactions</h1>
          <p className="text-zinc-400 text-sm mt-1">{total.toLocaleString()} Sale Transactions</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setCreating(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Add Comp
          </button>
        {selected.size > 0 && (
          <button onClick={copyComps}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
            {copied ? (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                Copied!
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" /></svg>
                Copy {selected.size} Comp{selected.size > 1 ? "s" : ""} to Clipboard
              </>
            )}
          </button>
        )}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-zinc-800 rounded-xl p-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-zinc-400 mb-1 block">Search</label>
          <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="Address, vendor, purchaser..."
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
          <label className="text-xs text-zinc-400 mb-1 block">Price Min</label>
          <input type="number" value={priceMin} onChange={e => { setPriceMin(e.target.value); setPage(0); }}
            placeholder="0" className="w-28 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Price Max</label>
          <input type="number" value={priceMax} onChange={e => { setPriceMax(e.target.value); setPage(0); }}
            placeholder="∞" className="w-28 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
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
                  <th className="px-3 py-3 cursor-pointer hover:text-white" onClick={() => toggleSort("sale_date")}>Date<SortIcon col="sale_date" /></th>
                  <th className="px-3 py-3 cursor-pointer hover:text-white" onClick={() => toggleSort("address")}>Address<SortIcon col="address" /></th>
                  <th className="px-3 py-3 cursor-pointer hover:text-white" onClick={() => toggleSort("city")}>City<SortIcon col="city" /></th>
                  <th className="px-3 py-3">Vendor</th>
                  <th className="px-3 py-3">Purchaser</th>
                  <th className="px-3 py-3 cursor-pointer hover:text-white text-right" onClick={() => toggleSort("sale_price")}>Price<SortIcon col="sale_price" /></th>
                  <th className="px-3 py-3 cursor-pointer hover:text-white" onClick={() => toggleSort("property_type")}>Type<SortIcon col="property_type" /></th>
                  <th className="px-3 py-3 text-center w-10">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.map(r => (
                  <CompRow key={r.id} r={r} expanded={expanded === r.id}
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
                      <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 mt-1 ${r.isResearched ? "bg-emerald-500" : "bg-red-500"}`} title={r.isResearched ? "Researched" : "Not researched"} />
                      <span className="px-2 py-0.5 rounded text-xs bg-zinc-600 text-zinc-200 shrink-0">{r.propertyType || "—"}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-400">{fmtDate(r.saleDate)}</span>
                      <span className="font-mono text-white">{fmtPrice(r.salePrice)}</span>
                    </div>
                    <div className="mt-2 text-xs space-y-1">
                      <p className="text-zinc-400"><span className="text-zinc-500">Vendor:</span> {r.seller || "—"}</p>
                      <p className="text-zinc-400"><span className="text-zinc-500">Purchaser:</span> {r.purchaser || "—"}</p>
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
          type="Sale"
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setEditing(null)}
        />
      )}

      {creating && (
        <CompEditModal
          comp={{}}
          type="Sale"
          onSave={handleCreate}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

function CompRow({ r, expanded, isSelected, onToggle, onSelect, onEdit, onRefresh }: { r: Comp; expanded: boolean; isSelected: boolean; onToggle: () => void; onSelect: (e: React.MouseEvent) => void; onEdit: () => void; onRefresh: () => void }) {
  return (
    <>
      <tr className={`border-b border-zinc-700 ${isSelected ? "bg-blue-500/10" : "bg-zinc-900"} hover:bg-zinc-800 cursor-pointer transition-colors`}>
        <td className="px-3 py-3" onClick={onSelect}>
          <input type="checkbox" checked={isSelected} readOnly
            className="rounded border-zinc-600 bg-zinc-900 text-blue-500 focus:ring-blue-500/50 pointer-events-none" />
        </td>
        <td className="px-3 py-3 whitespace-nowrap text-zinc-300" onClick={onToggle}>{fmtDate(r.saleDate)}</td>
        <td className="px-3 py-3 text-white font-medium" onClick={onToggle}>{r.address}{r.unit ? ` ${r.unit}` : ""}</td>
        <td className="px-3 py-3 text-zinc-300" onClick={onToggle}>{r.city || "—"}</td>
        <td className="px-3 py-3 text-zinc-300 max-w-[180px] truncate" onClick={onToggle}>{r.seller || "—"}</td>
        <td className="px-3 py-3 text-zinc-300 max-w-[180px] truncate" onClick={onToggle}>{r.purchaser || "—"}</td>
        <td className="px-3 py-3 text-right font-mono text-white" onClick={onToggle}>{fmtPrice(r.salePrice)}</td>
        <td className="px-3 py-3" onClick={onToggle}><span className="px-2 py-0.5 rounded text-xs bg-zinc-600 text-zinc-200">{r.propertyType || "—"}</span></td>
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

function ExpandedDetail({ r, onEdit, onRefresh }: { r: Comp; onEdit: () => void; onRefresh?: () => void }) {
  async function toggleResearched(e: React.MouseEvent) {
    e.stopPropagation();
    await fetch(`/api/comps/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ researchedUnavailable: r.researchedUnavailable === 1 ? false : true }),
    });
    onRefresh?.();
  }

  return (
    <div className="mt-3 pt-3 border-t border-zinc-700 space-y-4">
      <div className="flex justify-end gap-2">
        <button onClick={toggleResearched}
          className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors">
          {r.researchedUnavailable === 1 ? "Unflag Researched" : "Mark Unavailable"}
        </button>
        <button onClick={(e) => { e.stopPropagation(); onEdit(); }}
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
          {r.investmentType && <Detail label="Investment Type" value={r.investmentType} />}
          <Detail label="PPT Descriptor" value={r.pptDescriptor || "—"} />
          <Detail label="City" value={r.city || "—"} />
          <Detail label="Zoning" value={r.zoning || "—"} />
          <Detail label="Year Built" value={r.yearBuilt ? String(r.yearBuilt) : "—"} />
          <Detail label="Construction Class" value={r.constructionClass || "—"} />
        </div>
      </div>
      <div>
        <h4 className="text-xs uppercase text-zinc-500 font-semibold mb-2">Building / Land</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Detail label="Building Area" value={fmtSF(r.areaSF)} />
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
        <h4 className="text-xs uppercase text-zinc-500 font-semibold mb-2">Sale / Financial</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Detail label="Sale Price" value={fmtPrice(r.salePrice)} />
          <Detail label="Price/SF" value={fmtPricePSF(r.pricePSF)} />
          <Detail label="Price/Acre" value={r.pricePerAcre != null ? fmtPrice(r.pricePerAcre) : "—"} />
          <Detail label="Cap Rate" value={fmtCap(r.capRate)} />
          <Detail label="NOI" value={fmtPrice(r.noi)} />
          <Detail label="Stabilized Cap Rate" value={fmtCap(r.stabilizedCapRate)} />
          <Detail label="Stabilized NOI" value={fmtPrice(r.stabilizedNOI)} />
          <Detail label="Price/Unit" value={r.pricePerUnit != null ? fmtPrice(r.pricePerUnit) : "—"} />
          <Detail label="Vacancy Rate" value={fmtCap(r.vacancyRate)} />
          <Detail label="OPEX Ratio" value={r.opexRatio != null ? fmtCap(r.opexRatio) : "—"} />
          <Detail label="# Units" value={r.numUnits != null ? String(r.numUnits) : "—"} />
        </div>
      </div>
      <div>
        <h4 className="text-xs uppercase text-zinc-500 font-semibold mb-2">Meta</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Detail label="Roll #" value={r.rollNumber || "—"} />
          <Detail label="Arms Length" value={r.armsLength ? "Yes" : "—"} />
          <Detail label="Portfolio" value={r.portfolio || "—"} />
          <Detail label="Source" value={sourceLabel(r.source)} />
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
