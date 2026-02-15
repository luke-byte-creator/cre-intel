"use client";

import React, { useState, useEffect } from "react";

interface Comp {
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

export default function FindCompsPage() {
  const [type, setType] = useState<"Sale" | "Lease">("Sale");
  const [propertyType, setPropertyType] = useState("All");
  const [city, setCity] = useState("All");
  const [cities, setCities] = useState<{ city: string; count: number }[]>([]);
  const [targetSF, setTargetSF] = useState("");
  const [sizeTolerance, setSizeTolerance] = useState("50");
  const [dateRange, setDateRange] = useState("3");
  const [results, setResults] = useState<Comp[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/comps/cities").then(r => r.json()).then(setCities).catch(() => {});
  }, []);

  async function handleSearch() {
    setLoading(true);
    setSearched(true);
    setSelected(new Set());
    const params = new URLSearchParams({
      type,
      propertyType,
      city,
      targetSF: targetSF || "0",
      sizeTolerance,
      dateRange,
    });
    try {
      const res = await fetch(`/api/comps/find?${params}`);
      const json = await res.json();
      setResults(json.data || []);
      setTotal(json.total || 0);
    } catch {
      setResults([]);
      setTotal(0);
    }
    setLoading(false);
  }

  function toggleSelect(id: number) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === results.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(results.map(r => r.id)));
    }
  }

  function copySelected() {
    const sel = results.filter(r => selected.has(r.id));
    if (!sel.length) return;

    let header: string;
    let rows: string[];

    if (type === "Sale") {
      header = "Address\tCity\tDate\tPrice\tPrice/SF\tSize (SF)\tProperty Type\tVendor\tPurchaser\tRelevance";
      rows = sel.map(r => [
        r.address + (r.unit ? ` ${r.unit}` : ""),
        r.city || "",
        r.saleDate ? fmtDate(r.saleDate) : "",
        r.salePrice != null ? fmtPrice(r.salePrice) : "",
        r.pricePSF != null ? fmtPSF(r.pricePSF) : "",
        r.areaSF != null ? fmtNum(r.areaSF) : "",
        r.propertyType || "",
        r.seller || "",
        r.purchaser || "",
        Math.round(r.relevanceScore * 100) + "%",
      ].join("\t"));
    } else {
      header = "Address\tCity\tTenant\tRent/SF\tSize (SF)\tLease Start\tExpiry\tProperty Type\tRelevance";
      rows = sel.map(r => [
        r.address + (r.unit ? ` ${r.unit}` : ""),
        r.city || "",
        r.tenant || "",
        r.netRentPSF != null ? fmtPSF(r.netRentPSF) : "",
        r.areaSF != null ? fmtNum(r.areaSF) : "",
        r.leaseStart ? fmtDate(r.leaseStart) : "",
        r.leaseExpiry ? fmtDate(r.leaseExpiry) : "",
        r.propertyType || "",
        Math.round(r.relevanceScore * 100) + "%",
      ].join("\t"));
    }

    const text = header + "\n" + rows.join("\n");

    // HTML table for rich paste
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
    setTimeout(() => setCopied(false), 2000);
  }

  const selectCls = "bg-card border border-card-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent";
  const inputCls = "bg-card border border-card-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent w-full";

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-1">Find Comps</h1>
      <p className="text-sm text-muted mb-6">Smart matching — find the most relevant comparables for your analysis</p>

      {/* Search Panel */}
      <div className="bg-card border border-card-border rounded-xl p-5 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {/* Type toggle */}
          <div>
            <label className="block text-xs text-muted mb-1.5 font-medium">Type</label>
            <div className="flex rounded-lg overflow-hidden border border-card-border">
              {(["Sale", "Lease"] as const).map(t => (
                <button key={t} onClick={() => setType(t)}
                  className={`flex-1 py-2 text-sm font-medium transition-all ${type === t ? "bg-accent text-white" : "bg-card text-muted hover:text-foreground"}`}
                >{t}</button>
              ))}
            </div>
          </div>

          {/* Property Type */}
          <div>
            <label className="block text-xs text-muted mb-1.5 font-medium">Property Type</label>
            <select value={propertyType} onChange={e => setPropertyType(e.target.value)} className={selectCls + " w-full"}>
              {PROPERTY_TYPES.map(pt => <option key={pt} value={pt}>{pt}</option>)}
            </select>
          </div>

          {/* City */}
          <div>
            <label className="block text-xs text-muted mb-1.5 font-medium">City</label>
            <select value={city} onChange={e => setCity(e.target.value)} className={selectCls + " w-full"}>
              <option value="All">All Cities</option>
              {cities.map(c => <option key={c.city} value={c.city}>{c.city} ({c.count})</option>)}
            </select>
          </div>

          {/* Target Size */}
          <div>
            <label className="block text-xs text-muted mb-1.5 font-medium">Target Size (SF)</label>
            <input type="number" placeholder="e.g. 5000" value={targetSF}
              onChange={e => setTargetSF(e.target.value)} className={inputCls}
            />
          </div>

          {/* Size Tolerance */}
          <div>
            <label className="block text-xs text-muted mb-1.5 font-medium">Size Tolerance</label>
            <select value={sizeTolerance} onChange={e => setSizeTolerance(e.target.value)} className={selectCls + " w-full"}>
              {SIZE_TOLERANCES.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}
            </select>
          </div>

          {/* Date Range */}
          <div>
            <label className="block text-xs text-muted mb-1.5 font-medium">Date Range</label>
            <select value={dateRange} onChange={e => setDateRange(e.target.value)} className={selectCls + " w-full"}>
              {DATE_RANGES.map(dr => <option key={dr.value} value={dr.value}>{dr.label}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button onClick={handleSearch} disabled={loading}
            className="bg-accent hover:bg-accent/90 text-white font-medium px-6 py-2.5 rounded-lg text-sm transition-all disabled:opacity-50"
          >
            {loading ? "Searching…" : "Find Comps"}
          </button>
          {searched && !loading && (
            <span className="text-sm text-muted">
              {results.length} result{results.length !== 1 ? "s" : ""}{total > 50 ? ` (showing top 50 of ${total})` : ""}
            </span>
          )}
        </div>
      </div>

      {/* Copy bar */}
      {results.length > 0 && (
        <div className="flex items-center gap-3 mb-3">
          <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
            <input type="checkbox" checked={selected.size === results.length && results.length > 0}
              onChange={toggleAll} className="accent-accent" />
            Select All
          </label>
          {selected.size > 0 && (
            <button onClick={copySelected}
              className="bg-accent/15 text-accent hover:bg-accent/25 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            >
              {copied ? "✓ Copied!" : `Copy ${selected.size} Selected`}
            </button>
          )}
        </div>
      )}

      {/* Results */}
      {searched && !loading && results.length === 0 && (
        <div className="bg-card border border-card-border rounded-xl p-12 text-center">
          <p className="text-muted text-sm">No matching comps found. Try widening your search criteria.</p>
        </div>
      )}

      {/* Desktop Table */}
      {results.length > 0 && (
        <>
          <div className="hidden md:block bg-card border border-card-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
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
                  {results.map(r => (
                    <React.Fragment key={r.id}>
                      <tr
                        className={`border-b border-card-border/50 hover:bg-card-hover/30 cursor-pointer transition-colors ${expanded === r.id ? "bg-card-hover/20" : ""}`}
                      >
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
                            <td className="px-3 py-2.5 text-muted" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>{r.tenant || "—"}</td>
                            <td className="px-3 py-2.5 text-right text-foreground" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>{fmtPSF(r.netRentPSF)}</td>
                          </>
                        )}
                        <td className="px-3 py-2.5 text-right text-muted" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>{fmtNum(r.areaSF)}</td>
                        {type === "Sale" ? (
                          <>
                            <td className="px-3 py-2.5 text-muted" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>{r.propertyType || "—"}</td>
                            <td className="px-3 py-2.5 text-muted truncate max-w-[120px]" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>{r.seller || "—"}</td>
                            <td className="px-3 py-2.5 text-muted truncate max-w-[120px]" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>{r.purchaser || "—"}</td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2.5 text-muted" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>{fmtDate(r.leaseStart)}</td>
                            <td className="px-3 py-2.5 text-muted" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>{fmtDate(r.leaseExpiry)}</td>
                            <td className="px-3 py-2.5 text-muted" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>{r.propertyType || "—"}</td>
                          </>
                        )}
                        <td className="px-3 py-2.5" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
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
                      {expanded === r.id && (
                        <tr key={`${r.id}-detail`} className="bg-card-hover/10">
                          <td colSpan={type === "Sale" ? 11 : 10} className="px-6 py-4">
                            <ExpandedDetail comp={r} type={type} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {results.map(r => (
              <div key={r.id} className="bg-card border border-card-border rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} className="accent-accent mt-1" />
                  <div className="flex-1 min-w-0" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="font-medium text-foreground text-sm truncate">{r.address}{r.unit ? ` ${r.unit}` : ""}</p>
                      <span className="text-xs px-2 py-0.5 rounded-full whitespace-nowrap" style={{
                        backgroundColor: r.relevanceScore >= 0.8 ? "rgba(16,185,129,0.15)" : r.relevanceScore >= 0.5 ? "rgba(245,158,11,0.15)" : "rgba(239,68,68,0.15)",
                        color: r.relevanceScore >= 0.8 ? "#10b981" : r.relevanceScore >= 0.5 ? "#f59e0b" : "#ef4444",
                      }}>
                        {Math.round(r.relevanceScore * 100)}%
                      </span>
                    </div>
                    <p className="text-xs text-muted">{r.city} · {r.propertyType || "—"} · {fmtNum(r.areaSF)} SF</p>
                    {type === "Sale" ? (
                      <p className="text-xs text-muted mt-1">{fmtDate(r.saleDate)} · {fmtPrice(r.salePrice)} · {fmtPSF(r.pricePSF)}</p>
                    ) : (
                      <p className="text-xs text-muted mt-1">{r.tenant || "—"} · {fmtPSF(r.netRentPSF)}</p>
                    )}
                    {expanded === r.id && (
                      <div className="mt-3 pt-3 border-t border-card-border">
                        <ExpandedDetail comp={r} type={type} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ExpandedDetail({ comp: r, type }: { comp: Comp; type: string }) {
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
