"use client";

import React, { useState, useEffect } from "react";
import SalesPage from "@/app/sales/page";
import LeasesPage from "@/app/leases/page";

interface FindComp {
  id: number;
  type: string;
  propertyType: string | null;
  propertyName: string | null;
  address: string;
  unit: string | null;
  city: string | null;
  seller: string | null;
  purchaser: string | null;
  landlord: string | null;
  tenant: string | null;
  saleDate: string | null;
  salePrice: number | null;
  pricePSF: number | null;
  netRentPSF: number | null;
  annualRent: number | null;
  areaSF: number | null;
  leaseStart: string | null;
  leaseExpiry: string | null;
  termMonths: number | null;
  capRate: number | null;
  noi: number | null;
  yearBuilt: number | null;
  zoning: string | null;
  landAcres: number | null;
  landSF: number | null;
  comments: string | null;
  source: string | null;
  investmentType: string | null;
  constructionClass: string | null;
  ceilingHeight: number | null;
  loadingDocks: number | null;
  driveInDoors: number | null;
  numUnits: number | null;
  officeSF: number | null;
  vacancyRate: number | null;
  pricePerUnit: number | null;
  relevanceScore: number;
}

const PROPERTY_TYPES = ["All", "Retail", "Office", "Industrial", "Multifamily", "Land", "Investment", "Other"];
const SIZE_TOLERANCES = [
  { label: "±25%", value: "25" },
  { label: "±50%", value: "50" },
  { label: "±100%", value: "100" },
  { label: "Any", value: "any" },
];
const DATE_RANGES = [
  { label: "Last 1 year", value: "1" },
  { label: "Last 2 years", value: "2" },
  { label: "Last 3 years", value: "3" },
  { label: "Last 5 years", value: "5" },
  { label: "All time", value: "all" },
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

export default function TransactionsPage() {
  const [type, setType] = useState<"Sale" | "Lease">("Sale");
  // Find comps state
  const [fcPropertyType, setFcPropertyType] = useState("All");
  const [fcCity, setFcCity] = useState("All");
  const [cities, setCities] = useState<{ city: string; count: number }[]>([]);
  const [targetSF, setTargetSF] = useState("");
  const [sizeTolerance, setSizeTolerance] = useState("50");
  const [dateRange, setDateRange] = useState("3");
  const [fcSearch, setFcSearch] = useState("");
  const [researchFilter, setResearchFilter] = useState<"all" | "researched" | "unresearched">("all");
  const [fcResults, setFcResults] = useState<FindComp[]>([]);
  const [fcTotal, setFcTotal] = useState(0);
  const [fcLoading, setFcLoading] = useState(false);
  const [fcSearched, setFcSearched] = useState(false);
  const [fcExpanded, setFcExpanded] = useState<number | null>(null);
  const [fcSelected, setFcSelected] = useState<Set<number>>(new Set());
  const [fcCopied, setFcCopied] = useState(false);

  useEffect(() => {
    fetch("/api/comps/cities").then(r => r.json()).then(setCities).catch(() => {});
  }, []);

  async function handleSearch() {
    setFcLoading(true);
    setFcSearched(true);
    setFcSelected(new Set());
    const params = new URLSearchParams({
      type,
      propertyType: fcPropertyType,
      city: fcCity,
      targetSF: targetSF || "0",
      sizeTolerance,
      dateRange,
    });
    try {
      const res = await fetch(`/api/comps/find?${params}`);
      const json = await res.json();
      setFcResults(json.data || []);
      setFcTotal(json.total || 0);
    } catch {
      setFcResults([]);
      setFcTotal(0);
    }
    setFcLoading(false);
  }

  function toggleFcSelect(id: number) {
    setFcSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleFcAll() {
    if (fcSelected.size === fcResults.length) setFcSelected(new Set());
    else setFcSelected(new Set(fcResults.map(r => r.id)));
  }

  function copyFcSelected() {
    const sel = fcResults.filter(r => fcSelected.has(r.id));
    if (!sel.length) return;
    let header: string;
    let rows: string[];
    if (type === "Sale") {
      header = "Address\tCity\tDate\tPrice\tPrice/SF\tSize (SF)\tProperty Type\tVendor\tPurchaser\tRelevance";
      rows = sel.map(r => [
        r.address + (r.unit ? ` ${r.unit}` : ""), r.city || "", r.saleDate ? fmtDate(r.saleDate) : "",
        r.salePrice != null ? fmtPrice(r.salePrice) : "", r.pricePSF != null ? fmtPSF(r.pricePSF) : "",
        r.areaSF != null ? fmtNum(r.areaSF) : "", r.propertyType || "", r.seller || "", r.purchaser || "",
        Math.round(r.relevanceScore * 100) + "%",
      ].join("\t"));
    } else {
      header = "Address\tCity\tTenant\tRent/SF\tSize (SF)\tLease Start\tExpiry\tProperty Type\tRelevance";
      rows = sel.map(r => [
        r.address + (r.unit ? ` ${r.unit}` : ""), r.city || "", r.tenant || "",
        r.netRentPSF != null ? fmtPSF(r.netRentPSF) : "", r.areaSF != null ? fmtNum(r.areaSF) : "",
        r.leaseStart ? fmtDate(r.leaseStart) : "", r.leaseExpiry ? fmtDate(r.leaseExpiry) : "",
        r.propertyType || "", Math.round(r.relevanceScore * 100) + "%",
      ].join("\t"));
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
    setFcCopied(true);
    setTimeout(() => setFcCopied(false), 2000);
  }

  const selectCls = "bg-card border border-card-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent";
  const inputCls = "bg-card border border-card-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent w-full";

  return (
    <div className="space-y-6">
      {/* Header with type toggle on left */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex rounded-lg overflow-hidden border border-card-border">
          {(["Sale", "Lease"] as const).map(t => (
            <button key={t} onClick={() => { setType(t); setFcResults([]); setFcSearched(false); }}
              className={`px-5 py-2 text-sm font-medium transition-all ${type === t ? "bg-accent text-white" : "bg-card text-muted hover:text-foreground"}`}
            >{t === "Sale" ? "Sales" : "Leases"}</button>
          ))}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Transactions</h1>
        </div>
      </div>

      {/* Find Comps */}
      <div className="bg-card border border-card-border rounded-xl overflow-hidden">
        <div className="px-5 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              <div className="xl:col-span-full">
                <label className="block text-xs text-muted mb-1.5 font-medium">Search</label>
                <input type="text" placeholder="Address, vendor, purchaser, tenant..." value={fcSearch}
                  onChange={e => setFcSearch(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1.5 font-medium">Property Type</label>
                <select value={fcPropertyType} onChange={e => setFcPropertyType(e.target.value)} className={selectCls + " w-full"}>
                  {PROPERTY_TYPES.map(pt => <option key={pt} value={pt}>{pt}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted mb-1.5 font-medium">City</label>
                <select value={fcCity} onChange={e => setFcCity(e.target.value)} className={selectCls + " w-full"}>
                  <option value="All">All Cities</option>
                  {cities.map(c => <option key={c.city} value={c.city}>{c.city} ({c.count})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted mb-1.5 font-medium">Target Size (SF)</label>
                <input type="number" placeholder="e.g. 5000" value={targetSF}
                  onChange={e => setTargetSF(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1.5 font-medium">Size Tolerance</label>
                <select value={sizeTolerance} onChange={e => setSizeTolerance(e.target.value)} className={selectCls + " w-full"}>
                  {SIZE_TOLERANCES.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted mb-1.5 font-medium">Date Range</label>
                <select value={dateRange} onChange={e => setDateRange(e.target.value)} className={selectCls + " w-full"}>
                  {DATE_RANGES.map(dr => <option key={dr.value} value={dr.value}>{dr.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted mb-1.5 font-medium">Research Status</label>
                <select value={researchFilter} onChange={e => setResearchFilter(e.target.value as "all" | "researched" | "unresearched")} className={selectCls + " w-full"}>
                  <option value="all">All</option>
                  <option value="researched">Researched Only</option>
                  <option value="unresearched">Unresearched Only</option>
                </select>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button onClick={handleSearch} disabled={fcLoading}
                className="bg-accent hover:bg-accent/90 text-white font-medium px-6 py-2.5 rounded-lg text-sm transition-all disabled:opacity-50">
                {fcLoading ? "Searching…" : "Find Comps"}
              </button>
              {fcSearched && !fcLoading && (
                <span className="text-sm text-muted">
                  {fcResults.length} result{fcResults.length !== 1 ? "s" : ""}{fcTotal > 50 ? ` (showing top 50 of ${fcTotal})` : ""}
                </span>
              )}
            </div>

            {/* Find comps results */}
            {fcResults.length > 0 && (
              <div className="mt-4">
                <div className="flex items-center gap-3 mb-3">
                  <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
                    <input type="checkbox" checked={fcSelected.size === fcResults.length && fcResults.length > 0}
                      onChange={toggleFcAll} className="accent-accent" />
                    Select All
                  </label>
                  {fcSelected.size > 0 && (
                    <button onClick={copyFcSelected}
                      className="bg-accent/15 text-accent hover:bg-accent/25 px-3 py-1.5 rounded-lg text-xs font-medium transition-all">
                      {fcCopied ? "✓ Copied!" : `Copy ${fcSelected.size} Selected`}
                    </button>
                  )}
                </div>
                <div className="hidden md:block overflow-x-auto bg-card border border-card-border rounded-xl">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-card-border bg-card-hover/50">
                        <th className="w-8 px-3 py-3"><span className="sr-only">Select</span></th>
                        <th className="text-left px-3 py-3 font-medium text-muted text-xs">Address</th>
                        <th className="text-left px-3 py-3 font-medium text-muted text-xs">City</th>
                        {type === "Sale" ? (
                          <>
                            <th className="text-left px-3 py-3 font-medium text-muted text-xs">Date</th>
                            <th className="text-right px-3 py-3 font-medium text-muted text-xs">Price</th>
                            <th className="text-right px-3 py-3 font-medium text-muted text-xs">Price/SF</th>
                          </>
                        ) : (
                          <>
                            <th className="text-left px-3 py-3 font-medium text-muted text-xs">Tenant</th>
                            <th className="text-right px-3 py-3 font-medium text-muted text-xs">Rent/SF</th>
                          </>
                        )}
                        <th className="text-right px-3 py-3 font-medium text-muted text-xs">Size SF</th>
                        {type === "Sale" ? (
                          <>
                            <th className="text-left px-3 py-3 font-medium text-muted text-xs">Type</th>
                            <th className="text-left px-3 py-3 font-medium text-muted text-xs">Vendor</th>
                            <th className="text-left px-3 py-3 font-medium text-muted text-xs">Purchaser</th>
                          </>
                        ) : (
                          <>
                            <th className="text-left px-3 py-3 font-medium text-muted text-xs">Start</th>
                            <th className="text-left px-3 py-3 font-medium text-muted text-xs">Expiry</th>
                            <th className="text-left px-3 py-3 font-medium text-muted text-xs">Type</th>
                          </>
                        )}
                        <th className="text-right px-3 py-3 font-medium text-muted text-xs w-24">Relevance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fcResults.map(r => (
                        <React.Fragment key={r.id}>
                          <tr className={`border-b border-card-border/50 hover:bg-card-hover/30 cursor-pointer transition-colors ${fcExpanded === r.id ? "bg-card-hover/20" : ""}`}>
                            <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                              <input type="checkbox" checked={fcSelected.has(r.id)} onChange={() => toggleFcSelect(r.id)} className="accent-accent" />
                            </td>
                            <td className="px-3 py-2.5 font-medium text-foreground" onClick={() => setFcExpanded(fcExpanded === r.id ? null : r.id)}>
                              {r.address}{r.unit ? ` ${r.unit}` : ""}
                            </td>
                            <td className="px-3 py-2.5 text-muted" onClick={() => setFcExpanded(fcExpanded === r.id ? null : r.id)}>{r.city || "—"}</td>
                            {type === "Sale" ? (
                              <>
                                <td className="px-3 py-2.5 text-muted" onClick={() => setFcExpanded(fcExpanded === r.id ? null : r.id)}>{fmtDate(r.saleDate)}</td>
                                <td className="px-3 py-2.5 text-right text-foreground" onClick={() => setFcExpanded(fcExpanded === r.id ? null : r.id)}>{fmtPrice(r.salePrice)}</td>
                                <td className="px-3 py-2.5 text-right text-muted" onClick={() => setFcExpanded(fcExpanded === r.id ? null : r.id)}>{fmtPSF(r.pricePSF)}</td>
                              </>
                            ) : (
                              <>
                                <td className="px-3 py-2.5 text-muted" onClick={() => setFcExpanded(fcExpanded === r.id ? null : r.id)}>{r.tenant || "—"}</td>
                                <td className="px-3 py-2.5 text-right text-foreground" onClick={() => setFcExpanded(fcExpanded === r.id ? null : r.id)}>{fmtPSF(r.netRentPSF)}</td>
                              </>
                            )}
                            <td className="px-3 py-2.5 text-right text-muted" onClick={() => setFcExpanded(fcExpanded === r.id ? null : r.id)}>{fmtNum(r.areaSF)}</td>
                            {type === "Sale" ? (
                              <>
                                <td className="px-3 py-2.5 text-muted" onClick={() => setFcExpanded(fcExpanded === r.id ? null : r.id)}>{r.propertyType || "—"}</td>
                                <td className="px-3 py-2.5 text-muted truncate max-w-[120px]" onClick={() => setFcExpanded(fcExpanded === r.id ? null : r.id)}>{r.seller || "—"}</td>
                                <td className="px-3 py-2.5 text-muted truncate max-w-[120px]" onClick={() => setFcExpanded(fcExpanded === r.id ? null : r.id)}>{r.purchaser || "—"}</td>
                              </>
                            ) : (
                              <>
                                <td className="px-3 py-2.5 text-muted" onClick={() => setFcExpanded(fcExpanded === r.id ? null : r.id)}>{fmtDate(r.leaseStart)}</td>
                                <td className="px-3 py-2.5 text-muted" onClick={() => setFcExpanded(fcExpanded === r.id ? null : r.id)}>{fmtDate(r.leaseExpiry)}</td>
                                <td className="px-3 py-2.5 text-muted" onClick={() => setFcExpanded(fcExpanded === r.id ? null : r.id)}>{r.propertyType || "—"}</td>
                              </>
                            )}
                            <td className="px-3 py-2.5" onClick={() => setFcExpanded(fcExpanded === r.id ? null : r.id)}>
                              <div className="flex items-center gap-2 justify-end">
                                <div className="w-16 h-1.5 bg-card-border rounded-full overflow-hidden">
                                  <div className="h-full rounded-full transition-all" style={{
                                    width: `${Math.round(r.relevanceScore * 100)}%`,
                                    backgroundColor: r.relevanceScore >= 0.8 ? "#10b981" : r.relevanceScore >= 0.5 ? "#f59e0b" : "#ef4444",
                                  }} />
                                </div>
                                <span className="text-xs text-muted w-8 text-right">{Math.round(r.relevanceScore * 100)}%</span>
                              </div>
                            </td>
                          </tr>
                          {fcExpanded === r.id && (
                            <tr className="bg-card-hover/10">
                              <td colSpan={type === "Sale" ? 11 : 10} className="px-6 py-4">
                                <FcExpandedDetail comp={r} type={type} />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Mobile cards for find comps */}
                <div className="md:hidden space-y-3">
                  {fcResults.map(r => (
                    <div key={r.id} className="bg-card border border-card-border rounded-xl p-4">
                      <div className="flex items-start gap-3">
                        <input type="checkbox" checked={fcSelected.has(r.id)} onChange={() => toggleFcSelect(r.id)} className="accent-accent mt-1" />
                        <div className="flex-1 min-w-0" onClick={() => setFcExpanded(fcExpanded === r.id ? null : r.id)}>
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <p className="font-medium text-foreground text-sm truncate">{r.address}{r.unit ? ` ${r.unit}` : ""}</p>
                            <span className="text-xs px-2 py-0.5 rounded-full whitespace-nowrap" style={{
                              backgroundColor: r.relevanceScore >= 0.8 ? "rgba(16,185,129,0.15)" : r.relevanceScore >= 0.5 ? "rgba(245,158,11,0.15)" : "rgba(239,68,68,0.15)",
                              color: r.relevanceScore >= 0.8 ? "#10b981" : r.relevanceScore >= 0.5 ? "#f59e0b" : "#ef4444",
                            }}>{Math.round(r.relevanceScore * 100)}%</span>
                          </div>
                          <p className="text-xs text-muted">{r.city} · {r.propertyType || "—"} · {fmtNum(r.areaSF)} SF</p>
                          {type === "Sale" ? (
                            <p className="text-xs text-muted mt-1">{fmtDate(r.saleDate)} · {fmtPrice(r.salePrice)} · {fmtPSF(r.pricePSF)}</p>
                          ) : (
                            <p className="text-xs text-muted mt-1">{r.tenant || "—"} · {fmtPSF(r.netRentPSF)}</p>
                          )}
                          {fcExpanded === r.id && (
                            <div className="mt-3 pt-3 border-t border-card-border">
                              <FcExpandedDetail comp={r} type={type} />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {fcSearched && !fcLoading && fcResults.length === 0 && (
              <div className="mt-4 bg-card border border-card-border rounded-xl p-12 text-center">
                <p className="text-muted text-sm">No matching comps found. Try widening your search criteria.</p>
              </div>
            )}
        </div>
      </div>

      {/* Full transaction table */}
      <div>
        {type === "Sale" ? (
          <SalesPage
            embedded
            embeddedSearch={fcSearch}
            embeddedPropertyType={fcPropertyType}
            embeddedCity={fcCity}
            embeddedSizeMin={targetSF && sizeTolerance !== "any" ? String(Math.round(Number(targetSF) * (1 - Number(sizeTolerance) / 100))) : ""}
            embeddedSizeMax={targetSF && sizeTolerance !== "any" ? String(Math.round(Number(targetSF) * (1 + Number(sizeTolerance) / 100))) : ""}
            embeddedDateFrom={dateRange !== "all" ? new Date(new Date().setFullYear(new Date().getFullYear() - Number(dateRange))).toISOString().split("T")[0] : ""}
            embeddedResearchFilter={researchFilter}
          />
        ) : (
          <LeasesPage
            embedded
            embeddedSearch={fcSearch}
            embeddedPropertyType={fcPropertyType}
            embeddedCity={fcCity}
            embeddedSizeMin={targetSF && sizeTolerance !== "any" ? String(Math.round(Number(targetSF) * (1 - Number(sizeTolerance) / 100))) : ""}
            embeddedSizeMax={targetSF && sizeTolerance !== "any" ? String(Math.round(Number(targetSF) * (1 + Number(sizeTolerance) / 100))) : ""}
            embeddedDateFrom={dateRange !== "all" ? new Date(new Date().setFullYear(new Date().getFullYear() - Number(dateRange))).toISOString().split("T")[0] : ""}
            embeddedResearchFilter={researchFilter}
          />
        )}
      </div>
    </div>
  );
}

function FcExpandedDetail({ comp: r, type }: { comp: FindComp; type: string }) {
  const Detail = ({ label, value }: { label: string; value: string | null | undefined }) => {
    if (!value || value === "—") return null;
    return (
      <div>
        <span className="text-xs text-muted">{label}</span>
        <p className="text-sm text-foreground">{value}</p>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
      <Detail label="Address" value={r.address + (r.unit ? ` ${r.unit}` : "")} />
      <Detail label="City" value={r.city} />
      <Detail label="Property Type" value={r.propertyType} />
      <Detail label="Property Name" value={r.propertyName} />
      {type === "Sale" && (
        <>
          <Detail label="Sale Date" value={fmtDate(r.saleDate)} />
          <Detail label="Sale Price" value={fmtPrice(r.salePrice)} />
          <Detail label="Price/SF" value={fmtPSF(r.pricePSF)} />
          <Detail label="Vendor" value={r.seller} />
          <Detail label="Purchaser" value={r.purchaser} />
          <Detail label="Cap Rate" value={r.capRate != null ? r.capRate.toFixed(2) + "%" : null} />
          <Detail label="NOI" value={r.noi != null ? fmtPrice(r.noi) : null} />
        </>
      )}
      {type === "Lease" && (
        <>
          <Detail label="Tenant" value={r.tenant} />
          <Detail label="Landlord" value={r.landlord} />
          <Detail label="Net Rent/SF" value={fmtPSF(r.netRentPSF)} />
          <Detail label="Annual Rent" value={r.annualRent != null ? fmtPrice(r.annualRent) : null} />
          <Detail label="Lease Start" value={fmtDate(r.leaseStart)} />
          <Detail label="Lease Expiry" value={fmtDate(r.leaseExpiry)} />
          <Detail label="Term (months)" value={r.termMonths?.toString()} />
        </>
      )}
      <Detail label="Size (SF)" value={r.areaSF != null ? fmtNum(r.areaSF) : null} />
      <Detail label="Office SF" value={r.officeSF != null ? fmtNum(r.officeSF) : null} />
      <Detail label="Land Acres" value={r.landAcres?.toString()} />
      <Detail label="Year Built" value={r.yearBuilt?.toString()} />
      <Detail label="Zoning" value={r.zoning} />
      <Detail label="Construction" value={r.constructionClass} />
      <Detail label="Ceiling Height" value={r.ceilingHeight ? r.ceilingHeight + " ft" : null} />
      <Detail label="Loading Docks" value={r.loadingDocks?.toString()} />
      <Detail label="Drive-In Doors" value={r.driveInDoors?.toString()} />
      <Detail label="Units" value={r.numUnits?.toString()} />
      <Detail label="Investment Type" value={r.investmentType} />
      <Detail label="Source" value={r.source} />
      {r.comments && (
        <div className="col-span-full">
          <span className="text-xs text-muted">Comments</span>
          <p className="text-sm text-foreground">{r.comments}</p>
        </div>
      )}
    </div>
  );
}
