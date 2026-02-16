"use client";

import React, { useState, useEffect, useCallback } from "react";
import CompEditModal from "@/components/CompEditModal";
import { track } from "@/lib/track";

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
  landlord: string | null;
  tenant: string | null;
  saleDate: string | null;
  salePrice: number | null;
  pricePSF: number | null;
  pricePerAcre: number | null;
  netRentPSF: number | null;
  annualRent: number | null;
  areaSF: number | null;
  officeSF: number | null;
  ceilingHeight: number | null;
  loadingDocks: number | null;
  driveInDoors: number | null;
  landAcres: number | null;
  landSF: number | null;
  yearBuilt: number | null;
  zoning: string | null;
  capRate: number | null;
  noi: number | null;
  leaseStart: string | null;
  leaseExpiry: string | null;
  termMonths: number | null;
  comments: string | null;
  source: string | null;
  rollNumber: string | null;
  pptDescriptor: string | null;
  armsLength: boolean | null;
  portfolio: string | null;
  constructionClass: string | null;
  numUnits: number | null;
  numBuildings: number | null;
  numStories: number | null;
  vacancyRate: number | null;
  pricePerUnit: number | null;
  opexRatio: number | null;
  stabilizedNOI: number | null;
  stabilizedCapRate: number | null;
  isRenewal: boolean | null;
  rentSteps: string | null;
  leaseType: string | null;
  improvementAllowance: string | null;
  freeRentPeriod: string | null;
  fixturingPeriod: string | null;
  operatingCost: number | null;
  researchedUnavailable: number | null;
  researchedAt: string | null;
  researchedBy: number | null;
  isResearched?: boolean;
  isAutoResearched?: boolean;
  researchedExpired?: boolean;
}

const PROPERTY_TYPES = ["All", "Retail", "Office", "Industrial", "Multifamily", "Land", "Investment", "Other"];
const DATE_RANGES = [
  { label: "All time", value: "all" },
  { label: "Last 1 year", value: "1" },
  { label: "Last 2 years", value: "2" },
  { label: "Last 3 years", value: "3" },
  { label: "Last 5 years", value: "5" },
];

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtPrice(n: number | null) {
  if (n == null) return "—";
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}
function fmtPSF(n: number | null) {
  if (n == null) return "—";
  return "$" + n.toFixed(2) + "/SF";
}
function fmtNum(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString("en-US");
}
function fmtCap(n: number | null) {
  if (n == null) return "—";
  return n.toFixed(2) + "%";
}

export default function TransactionsPage() {
  const [type, setType] = useState<"Sale" | "Lease">("Sale");
  const [search, setSearch] = useState("");
  const [propertyType, setPropertyType] = useState("All");
  const [city, setCity] = useState("All");
  const [cities, setCities] = useState<{ city: string; count: number }[]>([]);
  const [dateRange, setDateRange] = useState("all");
  const [researchFilter, setResearchFilter] = useState<"all" | "researched" | "unresearched" | "transfer">("all");
  const [sourceFilter, setSourceFilter] = useState("All");
  const [sortField, setSortField] = useState("saleDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [comps, setComps] = useState<Comp[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);
  const [editingComp, setEditingComp] = useState<Comp | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 50;

  useEffect(() => {
    fetch("/api/comps/cities").then(r => r.json()).then(setCities).catch(() => {});
  }, []);

  const fetchComps = useCallback(async () => {
    setLoading(true);
    // Map frontend sort fields to API column names
    const sortColMap: Record<string, string> = {
      saleDate: "sale_date", salePrice: "sale_price", pricePSF: "price_psf",
      address: "address", city: "city", areaSF: "area_sf",
      netRentPSF: "net_rent_psf", leaseStart: "lease_start", leaseExpiry: "lease_expiry",
    };
    const params = new URLSearchParams({
      type,
      page: String(page - 1), // API is 0-indexed
      limit: String(pageSize),
      sortBy: sortColMap[sortField] || "sale_date",
      sortDir,
    });
    if (search) params.set("search", search);
    if (propertyType !== "All") params.set("propertyType", propertyType);
    if (city !== "All") params.set("city", city);
    if (dateRange !== "all") {
      const years = parseInt(dateRange);
      const cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - years);
      params.set("dateFrom", cutoff.toISOString().split("T")[0]);
    }
    if (researchFilter === "researched") params.set("researchedOnly", "true");
    else if (researchFilter === "unresearched") params.set("hideResearched", "true");
    if (researchFilter === "transfer") params.set("source", "transfer");
    else if (sourceFilter !== "All") params.set("source", sourceFilter);

    try {
      const res = await fetch(`/api/comps?${params}`);
      const json = await res.json();
      setComps(json.data || json);
      setTotal(json.total || (json.data || json).length);
    } catch {
      setComps([]);
      setTotal(0);
    }
    setLoading(false);
  }, [type, page, sortField, sortDir, search, propertyType, city, dateRange, researchFilter, sourceFilter]);

  useEffect(() => {
    fetchComps();
  }, [fetchComps]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [type, search, propertyType, city, dateRange, researchFilter, sourceFilter]);

  function handleSort(field: string) {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  function toggleSelect(id: number) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === comps.length) setSelected(new Set());
    else setSelected(new Set(comps.map(r => r.id)));
  }

  function copySelected(detailed = false) {
    const sel = comps.filter(r => selected.has(r.id));
    if (!sel.length) return;
    let header: string;
    let rows: string[];
    if (type === "Sale") {
      if (detailed) {
        header = "Address\tCity\tProperty Type\tProperty Name\tInvestment Type\tSale Date\tSale Price\tPrice/SF\tPrice/Acre\tPrice/Unit\tVendor\tPurchaser\tArms Length\tPortfolio\tCap Rate\tNOI\tStabilized Cap Rate\tStabilized NOI\tVacancy Rate\tOPEX Ratio\t# Units\tBuilding Area (SF)\tOffice Area (SF)\tLand (Acres)\tLand (SF)\tYear Built\tZoning\tConstruction Class\tCeiling Height\tLoading Docks\tDrive-In Doors\t# Buildings\t# Stories\tRoll Number\tSource\tComments";
        rows = sel.map(r => [
          r.address + (r.unit ? ` ${r.unit}` : ""), r.city || "", r.propertyType || "", r.propertyName || "",
          r.investmentType || "", r.saleDate ? fmtDate(r.saleDate) : "", r.salePrice != null ? fmtPrice(r.salePrice) : "",
          r.pricePSF != null ? fmtPSF(r.pricePSF) : "", r.pricePerAcre != null ? fmtPrice(r.pricePerAcre) : "",
          r.pricePerUnit != null ? fmtPrice(r.pricePerUnit) : "", r.seller || "", r.purchaser || "",
          r.armsLength != null ? (r.armsLength ? "Yes" : "No") : "", r.portfolio || "",
          r.capRate != null ? fmtCap(r.capRate) : "", r.noi != null ? fmtPrice(r.noi) : "",
          r.stabilizedCapRate != null ? fmtCap(r.stabilizedCapRate) : "", r.stabilizedNOI != null ? fmtPrice(r.stabilizedNOI) : "",
          r.vacancyRate != null ? r.vacancyRate.toFixed(1) + "%" : "", r.opexRatio != null ? r.opexRatio.toFixed(1) + "%" : "",
          r.numUnits?.toString() || "", r.areaSF != null ? fmtNum(r.areaSF) : "", r.officeSF != null ? fmtNum(r.officeSF) : "",
          r.landAcres?.toString() || "", r.landSF != null ? fmtNum(r.landSF) : "", r.yearBuilt?.toString() || "",
          r.zoning || "", r.constructionClass || "", r.ceilingHeight ? r.ceilingHeight + " ft" : "",
          r.loadingDocks?.toString() || "", r.driveInDoors?.toString() || "", r.numBuildings?.toString() || "",
          r.numStories?.toString() || "", r.rollNumber || "", r.source || "", r.comments || "",
        ].join("\t"));
      } else {
        header = "Address\tCity\tDate\tPrice\tPrice/SF\tSize (SF)\tProperty Type\tVendor\tPurchaser\tSource";
        rows = sel.map(r => [
          r.address + (r.unit ? ` ${r.unit}` : ""), r.city || "", r.saleDate ? fmtDate(r.saleDate) : "",
          r.salePrice != null ? fmtPrice(r.salePrice) : "", r.pricePSF != null ? fmtPSF(r.pricePSF) : "",
          r.areaSF != null ? fmtNum(r.areaSF) : "", r.propertyType || "", r.seller || "", r.purchaser || "",
          r.source || "",
        ].join("\t"));
      }
    } else {
      if (detailed) {
        header = "Address\tCity\tProperty Type\tProperty Name\tTenant\tLandlord\tLease Type\tRenewal\tLease Start\tLease Expiry\tTerm (months)\tNet Rent/SF/yr\tAnnual Rent\tOperating Cost/SF\tTI Allowance\tFree Rent\tFixturing Period\tRent Steps\tBuilding Area (SF)\tOffice Area (SF)\tLand (Acres)\tLand (SF)\tYear Built\tZoning\tConstruction Class\tCeiling Height\tLoading Docks\tDrive-In Doors\t# Buildings\t# Stories\tRoll Number\tSource\tComments";
        rows = sel.map(r => {
          let steps = "";
          try { const p = JSON.parse(r.rentSteps || "[]"); steps = p.map((s: any) => `${s.date || s.year || ""}: ${s.rate || s.rentPSF || ""}`).join("; "); } catch { steps = r.rentSteps || ""; }
          return [
            r.address + (r.unit ? ` ${r.unit}` : ""), r.city || "", r.propertyType || "", r.propertyName || "",
            r.tenant || "", r.landlord || "", r.leaseType || "",
            r.isRenewal != null ? (r.isRenewal ? "Yes" : "No") : "",
            r.leaseStart ? fmtDate(r.leaseStart) : "", r.leaseExpiry ? fmtDate(r.leaseExpiry) : "",
            r.termMonths?.toString() || "", r.netRentPSF != null ? fmtPSF(r.netRentPSF) : "",
            r.annualRent != null ? fmtPrice(r.annualRent) : "", r.operatingCost != null ? fmtPSF(r.operatingCost) : "",
            r.improvementAllowance || "", r.freeRentPeriod || "", r.fixturingPeriod || "", steps,
            r.areaSF != null ? fmtNum(r.areaSF) : "", r.officeSF != null ? fmtNum(r.officeSF) : "",
            r.landAcres?.toString() || "", r.landSF != null ? fmtNum(r.landSF) : "", r.yearBuilt?.toString() || "",
            r.zoning || "", r.constructionClass || "", r.ceilingHeight ? r.ceilingHeight + " ft" : "",
            r.loadingDocks?.toString() || "", r.driveInDoors?.toString() || "", r.numBuildings?.toString() || "",
            r.numStories?.toString() || "", r.rollNumber || "", r.source || "", r.comments || "",
          ].join("\t");
        });
      } else {
        header = "Address\tCity\tTenant\tRent/SF\tSize (SF)\tLease Start\tExpiry\tProperty Type\tLandlord\tSource";
        rows = sel.map(r => [
          r.address + (r.unit ? ` ${r.unit}` : ""), r.city || "", r.tenant || "",
          r.netRentPSF != null ? fmtPSF(r.netRentPSF) : "", r.areaSF != null ? fmtNum(r.areaSF) : "",
          r.leaseStart ? fmtDate(r.leaseStart) : "", r.leaseExpiry ? fmtDate(r.leaseExpiry) : "",
          r.propertyType || "", r.landlord || "", r.source || "",
        ].join("\t"));
      }
    }
    const text = header + "\n" + rows.join("\n");
    const thCells = header.split("\t").map(h => `<th style="border:1px solid #ccc;padding:6px 10px;background:#f5f5f5;font-weight:bold;text-align:left;font-size:13px">${h}</th>`).join("");
    const htmlRows = rows.map(row => {
      const cells = row.split("\t").map(c => `<td style="border:1px solid #ccc;padding:6px 10px;font-size:13px">${c}</td>`).join("");
      return `<tr>${cells}</tr>`;
    }).join("");
    const html = `<table style="border-collapse:collapse;font-family:Arial,sans-serif"><thead><tr>${thCells}</tr></thead><tbody>${htmlRows}</tbody></table>`;
    const blob = new Blob([html], { type: "text/html" });
    const textBlob = new Blob([text], { type: "text/plain" });
    navigator.clipboard.write([new ClipboardItem({ "text/html": blob, "text/plain": textBlob })]);
    setCopied(true);
    track("copy", "comps", { count: sel.length, type });
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleFlagUnavailable(compId: number) {
    try {
      await fetch(`/api/comps/${compId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ researchedUnavailable: 1 }),
      });
      track("edit", "comps", { action: "flag_unavailable", compId });
      fetchComps();
    } catch {}
  }

  const SortIcon = ({ field }: { field: string }) => (
    <span className="ml-1 text-[10px] opacity-50">{sortField === field ? (sortDir === "asc" ? "▲" : "▼") : ""}</span>
  );

  const selectCls = "bg-card border border-card-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent";
  const totalPages = Math.ceil(total / pageSize);

  // Determine research status display
  function researchDot(comp: Comp) {
    if (comp.isResearched || comp.researchedUnavailable) {
      return <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" title="Researched" />;
    }
    return <span className="w-2 h-2 rounded-full bg-red-500/60 inline-block" title="Unresearched" />;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-foreground">Transactions</h1>
        <div className="flex rounded-lg overflow-hidden border border-card-border">
          {(["Sale", "Lease"] as const).map(t => (
            <button key={t} onClick={() => setType(t)}
              className={`px-5 py-2 text-sm font-medium transition-all ${type === t ? "bg-accent text-white" : "bg-card text-muted hover:text-foreground"}`}
            >{t === "Sale" ? "Sales" : "Leases"}</button>
          ))}
        </div>
        <span className="text-sm text-muted ml-auto">{total.toLocaleString()} records</span>
      </div>

      {/* Filters */}
      <div className="bg-card border border-card-border rounded-xl p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="col-span-2 sm:col-span-3 lg:col-span-6">
            <input type="text" placeholder="Search address, vendor, purchaser, tenant..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted/50 focus:outline-none focus:ring-1 focus:ring-accent" />
          </div>
          <div>
            <label className="block text-[10px] text-muted mb-1 font-medium uppercase tracking-wider">Property Type</label>
            <select value={propertyType} onChange={e => setPropertyType(e.target.value)} className={selectCls + " w-full"}>
              {PROPERTY_TYPES.map(pt => <option key={pt} value={pt}>{pt}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-muted mb-1 font-medium uppercase tracking-wider">City</label>
            <select value={city} onChange={e => setCity(e.target.value)} className={selectCls + " w-full"}>
              <option value="All">All Cities</option>
              {cities.map(c => <option key={c.city} value={c.city}>{c.city} ({c.count})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-muted mb-1 font-medium uppercase tracking-wider">Date Range</label>
            <select value={dateRange} onChange={e => setDateRange(e.target.value)} className={selectCls + " w-full"}>
              {DATE_RANGES.map(dr => <option key={dr.value} value={dr.value}>{dr.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-muted mb-1 font-medium uppercase tracking-wider">Research Status</label>
            <select value={researchFilter} onChange={e => { setResearchFilter(e.target.value as any); track("filter", "comps", { filter: "research", value: e.target.value }); }} className={selectCls + " w-full"}>
              <option value="all">All</option>
              <option value="researched">Researched Only</option>
              <option value="unresearched">Unresearched Only</option>
              <option value="transfer">Transfer List Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3">
          <button onClick={() => copySelected(false)}
            className="bg-accent/15 text-accent hover:bg-accent/25 px-4 py-2 rounded-lg text-sm font-medium transition">
            {copied ? "✓ Copied!" : `Copy ${selected.size} Selected`}
          </button>
          <button onClick={() => copySelected(true)}
            className="bg-purple-500/15 text-purple-400 hover:bg-purple-500/25 px-4 py-2 rounded-lg text-sm font-medium transition">
            Detailed Copy
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-card border border-card-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-muted text-sm">Loading…</div>
        ) : comps.length === 0 ? (
          <div className="p-12 text-center text-muted text-sm">No records match your filters.</div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-card-border bg-card-hover/50">
                    <th className="w-8 px-3 py-3">
                      <input type="checkbox" checked={selected.size === comps.length && comps.length > 0}
                        onChange={toggleAll} className="accent-accent" />
                    </th>
                    <th className="text-left px-3 py-3 font-medium text-muted text-xs cursor-pointer select-none" onClick={() => handleSort("address")}>
                      Address<SortIcon field="address" />
                    </th>
                    <th className="text-left px-3 py-3 font-medium text-muted text-xs cursor-pointer select-none" onClick={() => handleSort("city")}>
                      City<SortIcon field="city" />
                    </th>
                    {type === "Sale" ? (
                      <>
                        <th className="text-left px-3 py-3 font-medium text-muted text-xs cursor-pointer select-none" onClick={() => handleSort("saleDate")}>
                          Date<SortIcon field="saleDate" />
                        </th>
                        <th className="text-right px-3 py-3 font-medium text-muted text-xs cursor-pointer select-none" onClick={() => handleSort("salePrice")}>
                          Price<SortIcon field="salePrice" />
                        </th>
                        <th className="text-right px-3 py-3 font-medium text-muted text-xs cursor-pointer select-none" onClick={() => handleSort("pricePSF")}>
                          $/SF<SortIcon field="pricePSF" />
                        </th>
                      </>
                    ) : (
                      <>
                        <th className="text-left px-3 py-3 font-medium text-muted text-xs">Tenant</th>
                        <th className="text-right px-3 py-3 font-medium text-muted text-xs cursor-pointer select-none" onClick={() => handleSort("netRentPSF")}>
                          Rent/SF<SortIcon field="netRentPSF" />
                        </th>
                      </>
                    )}
                    <th className="text-right px-3 py-3 font-medium text-muted text-xs cursor-pointer select-none" onClick={() => handleSort("areaSF")}>
                      Size SF<SortIcon field="areaSF" />
                    </th>
                    <th className="text-left px-3 py-3 font-medium text-muted text-xs">Type</th>
                    {type === "Sale" ? (
                      <>
                        <th className="text-left px-3 py-3 font-medium text-muted text-xs">Vendor</th>
                        <th className="text-left px-3 py-3 font-medium text-muted text-xs">Purchaser</th>
                      </>
                    ) : (
                      <>
                        <th className="text-left px-3 py-3 font-medium text-muted text-xs cursor-pointer select-none" onClick={() => handleSort("leaseStart")}>
                          Start<SortIcon field="leaseStart" />
                        </th>
                        <th className="text-left px-3 py-3 font-medium text-muted text-xs cursor-pointer select-none" onClick={() => handleSort("leaseExpiry")}>
                          Expiry<SortIcon field="leaseExpiry" />
                        </th>
                      </>
                    )}
                    <th className="text-center px-3 py-3 font-medium text-muted text-xs w-10" title="Research Status">⬤</th>
                  </tr>
                </thead>
                <tbody>
                  {comps.map(r => (
                    <React.Fragment key={r.id}>
                      <tr className={`border-b border-card-border/50 hover:bg-card-hover/30 cursor-pointer transition-colors ${expanded === r.id ? "bg-card-hover/20" : ""}`}>
                        <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} className="accent-accent" />
                        </td>
                        <td className="px-3 py-2.5 font-medium text-foreground" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                          {r.address}{r.unit ? ` ${r.unit}` : ""}
                        </td>
                        <td className="px-3 py-2.5 text-muted" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>{r.city || "—"}</td>
                        {type === "Sale" ? (
                          <>
                            <td className="px-3 py-2.5 text-muted" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>{fmtDate(r.saleDate)}</td>
                            <td className="px-3 py-2.5 text-right text-foreground" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>{fmtPrice(r.salePrice)}</td>
                            <td className="px-3 py-2.5 text-right text-muted" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>{fmtPSF(r.pricePSF)}</td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2.5 text-muted truncate max-w-[150px]" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>{r.tenant || "—"}</td>
                            <td className="px-3 py-2.5 text-right text-foreground" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>{fmtPSF(r.netRentPSF)}</td>
                          </>
                        )}
                        <td className="px-3 py-2.5 text-right text-muted" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>{fmtNum(r.areaSF)}</td>
                        <td className="px-3 py-2.5 text-muted" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>{r.propertyType || "—"}</td>
                        {type === "Sale" ? (
                          <>
                            <td className="px-3 py-2.5 text-muted truncate max-w-[120px]" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>{r.seller || "—"}</td>
                            <td className="px-3 py-2.5 text-muted truncate max-w-[120px]" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>{r.purchaser || "—"}</td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2.5 text-muted" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>{fmtDate(r.leaseStart)}</td>
                            <td className="px-3 py-2.5 text-muted" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>{fmtDate(r.leaseExpiry)}</td>
                          </>
                        )}
                        <td className="px-3 py-2.5 text-center" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>{researchDot(r)}</td>
                      </tr>
                      {expanded === r.id && (
                        <tr className="bg-card-hover/10">
                          <td colSpan={type === "Sale" ? 11 : 10} className="px-6 py-4">
                            <ExpandedDetail comp={r} type={type} onEdit={() => setEditingComp(r)} onFlagUnavailable={handleFlagUnavailable} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-card-border">
              {comps.map(r => (
                <div key={r.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} className="accent-accent mt-1" />
                    <div className="flex-1 min-w-0" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-foreground text-sm truncate flex-1">{r.address}{r.unit ? ` ${r.unit}` : ""}</p>
                        {researchDot(r)}
                      </div>
                      <p className="text-xs text-muted">{r.city} · {r.propertyType || "—"} · {fmtNum(r.areaSF)} SF</p>
                      {type === "Sale" ? (
                        <p className="text-xs text-muted mt-1">{fmtDate(r.saleDate)} · {fmtPrice(r.salePrice)} · {fmtPSF(r.pricePSF)}</p>
                      ) : (
                        <p className="text-xs text-muted mt-1">{r.tenant || "—"} · {fmtPSF(r.netRentPSF)} · {fmtDate(r.leaseExpiry)}</p>
                      )}
                      {expanded === r.id && (
                        <div className="mt-3 pt-3 border-t border-card-border">
                          <ExpandedDetail comp={r} type={type} onEdit={() => setEditingComp(r)} onFlagUnavailable={handleFlagUnavailable} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-card-border">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                  className="text-sm text-muted hover:text-foreground disabled:opacity-30 transition">← Previous</button>
                <span className="text-xs text-muted">Page {page} of {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                  className="text-sm text-muted hover:text-foreground disabled:opacity-30 transition">Next →</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Edit Modal */}
      {editingComp && (
        <CompEditModal
          comp={editingComp as unknown as Record<string, unknown>}
          type={type}
          onClose={() => setEditingComp(null)}
          onSave={() => { setEditingComp(null); fetchComps(); }}
        />
      )}
    </div>
  );
}

const SALE_KEY_FIELDS = new Set(['propertyType', 'saleDate', 'salePrice', 'areaSF', 'landAcres', 'seller', 'purchaser']);
const LEASE_KEY_FIELDS = new Set(['propertyType', 'tenant', 'areaSF', 'landlord', 'leaseStart', 'leaseExpiry', 'netRentPSF', 'annualRent']);

function formatRentSteps(raw: string | null): string {
  if (!raw) return "—";
  try {
    const steps = JSON.parse(raw);
    if (Array.isArray(steps)) {
      return steps.map((s: { rate?: number; annual?: number; date?: string }, i: number) => {
        const date = s.date ? fmtDate(s.date) : `Step ${i + 1}`;
        const rate = s.rate != null ? `$${s.rate.toFixed(2)}/SF` : "";
        const annual = s.annual != null ? `($${s.annual.toLocaleString()}/yr)` : "";
        return `${date}: ${rate} ${annual}`.trim();
      }).join("\n");
    }
  } catch {}
  return raw;
}

function ExpandedDetail({ comp: r, type, onEdit, onFlagUnavailable }: { comp: Comp; type: string; onEdit: () => void; onFlagUnavailable: (id: number) => void }) {
  const [requestingInfo, setRequestingInfo] = useState(false);
  const [emailDraft, setEmailDraft] = useState<{ subject: string; body: string } | null>(null);
  const [emailCopied, setEmailCopied] = useState(false);
  const keyFields = type === "Sale" ? SALE_KEY_FIELDS : LEASE_KEY_FIELDS;

  // Show all fields always — empty ones show "—" so users know what's available
  // Key fields get a colored indicator so users know what earns credits
  const Field = ({ label, value, fieldKey }: { label: string; value: string | null | undefined; fieldKey?: string }) => {
    const isKey = fieldKey ? keyFields.has(fieldKey) : false;
    const isEmpty = !value || value === "—";
    return (
      <div>
        <span className="text-[10px] text-muted uppercase tracking-wider">
          {label}
          {isKey && <span className={`ml-1 ${isEmpty ? "text-amber-400" : "text-emerald-400"}`} title={isEmpty ? "Key field — fill to earn credit" : "Key field ✓"}>★</span>}
        </span>
        <p className={`text-sm ${isEmpty ? (isKey ? "text-amber-400/40" : "text-muted/40") : "text-foreground"}`}>{value || "—"}</p>
      </div>
    );
  };

  const rentStepsFormatted = type === "Lease" ? formatRentSteps(r.rentSteps) : null;

  return (
    <div>
      {/* Key Info */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-6 gap-y-2.5 mb-4">
        <div className="col-span-full">
          <span className="text-[10px] font-semibold text-muted/60 uppercase tracking-widest">Property</span>
        </div>
        <Field label="Address" value={r.address + (r.unit ? ` ${r.unit}` : "")} />
        <Field label="City" value={r.city} />
        <Field label="Property Type" fieldKey="propertyType" value={r.propertyType} />
        <Field label="Property Name" value={r.propertyName} />
        <Field label="Investment Type" value={r.investmentType} />
      </div>

      {type === "Sale" ? (
        <>
          {/* Sale Details */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-6 gap-y-2.5 mb-4">
            <div className="col-span-full">
              <span className="text-[10px] font-semibold text-muted/60 uppercase tracking-widest">Transaction</span>
            </div>
            <Field label="Sale Date" fieldKey="saleDate" value={fmtDate(r.saleDate)} />
            <Field label="Sale Price" fieldKey="salePrice" value={fmtPrice(r.salePrice)} />
            <Field label="Price/SF" value={fmtPSF(r.pricePSF)} />
            <Field label="Price/Acre" value={r.pricePerAcre != null ? fmtPrice(r.pricePerAcre) : "—"} />
            <Field label="Price/Unit" value={r.pricePerUnit != null ? fmtPrice(r.pricePerUnit) : "—"} />
            <Field label="Vendor" fieldKey="seller" value={r.seller} />
            <Field label="Purchaser" fieldKey="purchaser" value={r.purchaser} />
            <Field label="Arms Length" value={r.armsLength != null ? (r.armsLength ? "Yes" : "No") : "—"} />
            <Field label="Portfolio" value={r.portfolio} />
          </div>

          {/* Investment Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-6 gap-y-2.5 mb-4">
            <div className="col-span-full">
              <span className="text-[10px] font-semibold text-muted/60 uppercase tracking-widest">Investment</span>
            </div>
            <Field label="Cap Rate" value={r.capRate != null ? fmtCap(r.capRate) : "—"} />
            <Field label="NOI" value={r.noi != null ? fmtPrice(r.noi) : "—"} />
            <Field label="Stabilized Cap Rate" value={r.stabilizedCapRate != null ? fmtCap(r.stabilizedCapRate) : "—"} />
            <Field label="Stabilized NOI" value={r.stabilizedNOI != null ? fmtPrice(r.stabilizedNOI) : "—"} />
            <Field label="Vacancy Rate" value={r.vacancyRate != null ? r.vacancyRate.toFixed(1) + "%" : "—"} />
            <Field label="OPEX Ratio" value={r.opexRatio != null ? r.opexRatio.toFixed(1) + "%" : "—"} />
            <Field label="# Units" value={r.numUnits?.toString() || "—"} />
          </div>
        </>
      ) : (
        <>
          {/* Lease Details */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-6 gap-y-2.5 mb-4">
            <div className="col-span-full">
              <span className="text-[10px] font-semibold text-muted/60 uppercase tracking-widest">Lease</span>
            </div>
            <Field label="Tenant" fieldKey="tenant" value={r.tenant} />
            <Field label="Landlord" fieldKey="landlord" value={r.landlord} />
            <Field label="Lease Type" value={r.leaseType} />
            <Field label="Renewal" value={r.isRenewal != null ? (r.isRenewal ? "Yes" : "No") : "—"} />
            <Field label="Lease Start" fieldKey="leaseStart" value={fmtDate(r.leaseStart)} />
            <Field label="Lease Expiry" fieldKey="leaseExpiry" value={fmtDate(r.leaseExpiry)} />
            <Field label="Term (months)" value={r.termMonths?.toString() || "—"} />
          </div>

          {/* Rent */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-6 gap-y-2.5 mb-4">
            <div className="col-span-full">
              <span className="text-[10px] font-semibold text-muted/60 uppercase tracking-widest">Rent</span>
            </div>
            <Field label="Net Rent/SF/yr" fieldKey="netRentPSF" value={fmtPSF(r.netRentPSF)} />
            <Field label="Annual Rent" fieldKey="annualRent" value={r.annualRent != null ? fmtPrice(r.annualRent) : "—"} />
            <Field label="Operating Cost/SF" value={r.operatingCost != null ? fmtPSF(r.operatingCost) : "—"} />
            <Field label="TI Allowance" value={r.improvementAllowance || "—"} />
            <Field label="Free Rent" value={r.freeRentPeriod || "—"} />
            <Field label="Fixturing Period" value={r.fixturingPeriod || "—"} />
            {rentStepsFormatted && rentStepsFormatted !== "—" ? (
              <div className="col-span-2">
                <span className="text-[10px] text-muted uppercase tracking-wider">Rent Steps</span>
                <div className="text-sm text-foreground space-y-0.5 mt-0.5">
                  {rentStepsFormatted.split("\n").map((step, i) => (
                    <p key={i} className="text-sm">{step}</p>
                  ))}
                </div>
              </div>
            ) : (
              <Field label="Rent Steps" value="—" />
            )}
          </div>
        </>
      )}

      {/* Building */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-6 gap-y-2.5 mb-4">
        <div className="col-span-full">
          <span className="text-[10px] font-semibold text-muted/60 uppercase tracking-widest">Building</span>
        </div>
        <Field label="Building Area (SF)" fieldKey="areaSF" value={r.areaSF != null ? fmtNum(r.areaSF) : "—"} />
        <Field label="Office Area (SF)" value={r.officeSF != null ? fmtNum(r.officeSF) : "—"} />
        <Field label="Land (Acres)" fieldKey="landAcres" value={r.landAcres?.toString() || "—"} />
        <Field label="Land (SF)" value={r.landSF != null ? fmtNum(r.landSF) : "—"} />
        <Field label="Year Built" value={r.yearBuilt?.toString() || "—"} />
        <Field label="Zoning" value={r.zoning || "—"} />
        <Field label="Construction Class" value={r.constructionClass || "—"} />
        <Field label="Ceiling Height" value={r.ceilingHeight ? r.ceilingHeight + " ft" : "—"} />
        <Field label="Loading Docks" value={r.loadingDocks?.toString() || "—"} />
        <Field label="Drive-In Doors" value={r.driveInDoors?.toString() || "—"} />
        <Field label="# Buildings" value={r.numBuildings?.toString() || "—"} />
        <Field label="# Stories" value={r.numStories?.toString() || "—"} />
      </div>

      {/* Reference */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-6 gap-y-2.5 mb-4">
        <div className="col-span-full">
          <span className="text-[10px] font-semibold text-muted/60 uppercase tracking-widest">Reference</span>
        </div>
        <Field label="Roll Number" value={r.rollNumber || "—"} />
        <Field label="PPT Descriptor" value={r.pptDescriptor || "—"} />
        <Field label="Source" value={r.source || "—"} />
      </div>

      {/* Comments */}
      <div className="mb-4">
        <span className="text-[10px] text-muted uppercase tracking-wider">Comments</span>
        <p className={`text-sm ${r.comments ? "text-foreground" : "text-muted/40"}`}>{r.comments || "—"}</p>
      </div>

      <div className="pt-3 border-t border-card-border flex items-center gap-4 flex-wrap">
        <button onClick={onEdit} className="text-xs text-accent hover:text-accent/80 font-medium transition">Edit Comp</button>
        <button
          onClick={async () => {
            if (emailDraft) { setEmailDraft(null); return; }
            setRequestingInfo(true);
            const missingFields = Array.from(keyFields).filter(f => {
              const v = (r as any)[f];
              return v === null || v === undefined || v === "" || v === 0;
            });
            try {
              const compData = {
                address: r.address, unit: r.unit, city: r.city, propertyType: r.propertyType,
                propertyName: r.propertyName, seller: r.seller, purchaser: r.purchaser,
                landlord: r.landlord, tenant: r.tenant, saleDate: r.saleDate,
                salePrice: r.salePrice, pricePSF: r.pricePSF, areaSF: r.areaSF,
                netRentPSF: r.netRentPSF, annualRent: r.annualRent,
                leaseStart: r.leaseStart, leaseExpiry: r.leaseExpiry,
                capRate: r.capRate, noi: r.noi,
              };
              const res = await fetch("/api/comps/request-info", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ comp: compData, type, missingFields }),
              });
              if (res.ok) {
                const data = await res.json();
                setEmailDraft(data);
              }
            } catch {}
            setRequestingInfo(false);
            track("request_info", "comps", { compId: r.id, type });
          }}
          disabled={requestingInfo}
          className="text-xs text-purple-400 hover:text-purple-300 font-medium transition flex items-center gap-1.5 disabled:opacity-50"
        >
          {requestingInfo ? "Generating..." : emailDraft ? "Hide Email" : "✉ Request Info"}
        </button>
        {r.isResearched ? (
          <span className="text-xs text-emerald-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            Researched
            {r.researchedUnavailable === 1 && <span className="text-muted">(flagged unavailable{r.researchedAt ? ` · expires ${fmtDate(new Date(new Date(r.researchedAt).getTime() + 365*24*60*60*1000).toISOString().split("T")[0])}` : ""})</span>}
          </span>
        ) : (
          <button
            onClick={() => onFlagUnavailable(r.id)}
            className="text-xs text-amber-400 hover:text-amber-300 font-medium transition flex items-center gap-1.5"
          >
            <span className="w-2 h-2 rounded-full bg-red-500/60 inline-block" />
            Flag as Unavailable (12mo)
          </button>
        )}
      </div>

      {/* Generated Email Draft */}
      {emailDraft && (
        <div className="mt-3 p-4 bg-white/[0.03] border border-card-border rounded-lg space-y-3">
          <div>
            <span className="text-[10px] text-muted uppercase tracking-wider">Subject</span>
            <p className="text-sm text-foreground font-medium">{emailDraft.subject}</p>
          </div>
          <div>
            <span className="text-[10px] text-muted uppercase tracking-wider">Body</span>
            <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">{emailDraft.body}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(`Subject: ${emailDraft.subject}\n\n${emailDraft.body}`);
                setEmailCopied(true);
                setTimeout(() => setEmailCopied(false), 2000);
              }}
              className="text-xs bg-accent/15 text-accent hover:bg-accent/25 px-3 py-1.5 rounded-md font-medium transition"
            >
              {emailCopied ? "✓ Copied!" : "Copy Email"}
            </button>
            <button
              onClick={() => {
                const mailto = `mailto:?subject=${encodeURIComponent(emailDraft.subject)}&body=${encodeURIComponent(emailDraft.body)}`;
                window.open(mailto);
              }}
              className="text-xs bg-purple-500/15 text-purple-400 hover:bg-purple-500/25 px-3 py-1.5 rounded-md font-medium transition"
            >
              Open in Email Client
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
