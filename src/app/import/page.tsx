"use client";

import { useState, useCallback } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface ExtractedComp { [key: string]: any }

interface ImportStats {
  companiesFound: number;
  companiesCreated: number;
  companiesMatched: number;
  peopleFound: number;
  peopleCreated: number;
  peopleMatched: number;
  propertiesFound: number;
  propertiesCreated: number;
  propertiesMatched: number;
  transactionsCreated: number;
  permitsCreated: number;
}

interface MatchInfo {
  source: string;
  matched: string;
  score: number;
  type: string;
}

interface ImportResult {
  success: boolean;
  fileType: string;
  filename: string;
  stats: ImportStats;
  warnings: string[];
  matches: MatchInfo[];
  error?: string;
}

export default function ImportPage() {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  // External comp extraction state
  const [compDragActive, setCompDragActive] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractedComps, setExtractedComps] = useState<ExtractedComp[]>([]);
  const [compStatuses, setCompStatuses] = useState<Record<number, "added" | "skipped" | "adding">>({});
  const [compError, setCompError] = useState<string | null>(null);
  const [compFilename, setCompFilename] = useState<string>("");
  const [editingComp, setEditingComp] = useState<number | null>(null);

  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);

    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);

      try {
        const res = await fetch("/api/import", { method: "POST", body: formData });
        const data = await res.json();
        if (data.success) {
          setResults((prev) => [data, ...prev]);
        } else {
          setError(data.error || "Import failed");
        }
      } catch {
        setError("Upload failed. Please try again.");
      }
    }
    setUploading(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      handleUpload(e.dataTransfer.files);
    },
    [handleUpload]
  );

  const handleCompUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setExtracting(true);
    setCompError(null);
    setExtractedComps([]);
    setCompStatuses({});
    setCompFilename(file.name);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/import/extract-comps", { method: "POST", body: formData });
      const data = await res.json();
      if (data.success && data.comps) {
        setExtractedComps(data.comps);
      } else {
        setCompError(data.error || "Extraction failed");
      }
    } catch (err) {
      setCompError(`Upload failed: ${(err as Error).message || "Unknown error"}. Try again.`);
    }
    setExtracting(false);
  }, []);

  const handleCompDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setCompDragActive(false);
      handleCompUpload(e.dataTransfer.files);
    },
    [handleCompUpload]
  );

  const addComp = useCallback(async (comp: ExtractedComp, index: number) => {
    setCompStatuses((prev) => ({ ...prev, [index]: "adding" }));
    try {
      const res = await fetch("/api/import/add-comp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(comp),
      });
      const data = await res.json();
      if (data.success) {
        setCompStatuses((prev) => ({ ...prev, [index]: "added" }));
      } else {
        setCompStatuses((prev) => { const n = { ...prev }; delete n[index]; return n; });
        setCompError(data.error || "Failed to add comp");
      }
    } catch {
      setCompStatuses((prev) => { const n = { ...prev }; delete n[index]; return n; });
      setCompError("Failed to add comp");
    }
  }, []);

  const addAllComps = useCallback(async () => {
    for (let i = 0; i < extractedComps.length; i++) {
      if (!compStatuses[i]) {
        await addComp(extractedComps[i], i);
      }
    }
  }, [extractedComps, compStatuses, addComp]);

  const skipComp = useCallback((index: number) => {
    setCompStatuses((prev) => ({ ...prev, [index]: "skipped" }));
  }, []);

  const formatPrice = (v: number | null | undefined) => {
    if (!v) return "—";
    return "$" + v.toLocaleString();
  };

  const fileTypeLabel = (ft: string) => {
    switch (ft) {
      case "corporate_registry": return "Corporate Registry";
      case "building_permit": return "Building Permits";
      case "transfer_list": return "Transfer List";
      default: return ft;
    }
  };

  const fileTypeIcon = (ft: string) => {
    switch (ft) {
      case "corporate_registry": return "🏢";
      case "building_permit": return "🏗️";
      case "transfer_list": return "📊";
      default: return "📁";
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Import</h1>
        <p className="text-muted text-sm mt-1">
          Upload PDFs and Excel files — data is parsed, matched, and imported automatically
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
          dragActive ? "border-accent bg-accent/5" : "border-card-border hover:border-muted"
        }`}
      >
        <p className="text-4xl mb-4">📥</p>
        <p className="text-foreground font-medium mb-2">
          {uploading ? "Processing..." : "Drop files here or click to browse"}
        </p>
        <p className="text-muted text-sm mb-4">Supports PDF, Excel (.xlsx/.xls), and CSV files</p>
        <label className="inline-block cursor-pointer">
          <input
            type="file"
            multiple
            accept=".pdf,.xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
            disabled={uploading}
          />
          <span className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            uploading
              ? "bg-muted/30 text-muted cursor-not-allowed"
              : "bg-accent hover:bg-accent-hover text-white cursor-pointer"
          }`}>
            {uploading ? "Processing..." : "Browse Files"}
          </span>
        </label>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 text-danger rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Import Results */}
      {results.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-3">Import Results</h2>
          <div className="space-y-4">
            {results.map((r, i) => (
              <div key={i} className="bg-card border border-card-border rounded-xl p-5">
                {/* Header */}
                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{fileTypeIcon(r.fileType)}</span>
                    <div>
                      <p className="text-foreground font-medium">{r.filename}</p>
                      <p className="text-muted text-xs mt-0.5">{fileTypeLabel(r.fileType)}</p>
                    </div>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-success/15 text-success font-medium">
                    ✓ Imported
                  </span>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  {r.stats.companiesFound > 0 && (
                    <StatBox
                      label="Companies"
                      found={r.stats.companiesFound}
                      created={r.stats.companiesCreated}
                      matched={r.stats.companiesMatched}
                    />
                  )}
                  {r.stats.peopleFound > 0 && (
                    <StatBox
                      label="People"
                      found={r.stats.peopleFound}
                      created={r.stats.peopleCreated}
                      matched={r.stats.peopleMatched}
                    />
                  )}
                  {r.stats.propertiesFound > 0 && (
                    <StatBox
                      label="Properties"
                      found={r.stats.propertiesFound}
                      created={r.stats.propertiesCreated}
                      matched={r.stats.propertiesMatched}
                    />
                  )}
                  {r.stats.transactionsCreated > 0 && (
                    <div className="bg-background rounded-lg p-3">
                      <p className="text-2xl font-bold text-foreground">{r.stats.transactionsCreated}</p>
                      <p className="text-muted text-xs">Transactions</p>
                    </div>
                  )}
                  {r.stats.permitsCreated > 0 && (
                    <div className="bg-background rounded-lg p-3">
                      <p className="text-2xl font-bold text-foreground">{r.stats.permitsCreated}</p>
                      <p className="text-muted text-xs">Permits</p>
                    </div>
                  )}
                </div>

                {/* Warnings */}
                {r.warnings.length > 0 && (
                  <div className="mb-3">
                    {r.warnings.map((w, j) => (
                      <p key={j} className="text-sm text-warning flex items-center gap-1">
                        <span>⚠️</span> {w}
                      </p>
                    ))}
                  </div>
                )}

                {/* Entity Matches */}
                {r.matches.length > 0 && (
                  <details className="mt-2">
                    <summary className="text-sm text-accent cursor-pointer hover:underline">
                      {r.matches.length} entity match{r.matches.length !== 1 ? "es" : ""} found
                    </summary>
                    <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                      {r.matches.map((m, j) => (
                        <div key={j} className="text-xs flex items-center gap-2 text-muted py-1">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            m.type === "company" ? "bg-blue-500/15 text-blue-400" :
                            m.type === "person" ? "bg-purple-500/15 text-purple-400" :
                            "bg-green-500/15 text-green-400"
                          }`}>
                            {m.type}
                          </span>
                          <span className="text-foreground">{m.source}</span>
                          <span>→</span>
                          <span className="text-foreground">{m.matched}</span>
                          <span className="text-accent">({Math.round(m.score * 100)}%)</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* External Comp Sets */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-foreground mb-1">External Comp Sets</h2>
        <p className="text-muted text-sm mb-4">
          Drop appraiser PDFs, broker comp sheets, or any transaction summaries — AI extracts and you review before adding
        </p>

        <div
          onDragOver={(e) => { e.preventDefault(); setCompDragActive(true); }}
          onDragLeave={() => setCompDragActive(false)}
          onDrop={handleCompDrop}
          className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
            compDragActive ? "border-accent bg-accent/5" : "border-card-border hover:border-muted"
          }`}
        >
          <p className="text-3xl mb-3">🤖</p>
          <p className="text-foreground font-medium mb-1">
            {extracting ? "Extracting comps..." : "Drop a comp set file"}
          </p>
          <p className="text-muted text-xs mb-3">PDF, Excel, or CSV — AI will find and extract all comps</p>
          <label className="inline-block cursor-pointer">
            <input
              type="file"
              accept=".pdf,.xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => handleCompUpload(e.target.files)}
              disabled={extracting}
            />
            <span className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              extracting
                ? "bg-muted/30 text-muted cursor-not-allowed"
                : "bg-accent hover:bg-accent-hover text-white cursor-pointer"
            }`}>
              {extracting ? "Extracting..." : "Browse"}
            </span>
          </label>
        </div>
      </div>

      {compError && (
        <div className="bg-danger/10 border border-danger/30 text-danger rounded-lg px-4 py-3 text-sm">
          {compError}
        </div>
      )}

      {extractedComps.length > 0 && (
        <div className="bg-card border border-card-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-foreground font-semibold">
                {extractedComps.length} comp{extractedComps.length !== 1 ? "s" : ""} found
              </h3>
              <p className="text-muted text-xs">from {compFilename}</p>
            </div>
            <button
              onClick={addAllComps}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent hover:bg-accent-hover text-white transition-colors"
            >
              Add All
            </button>
          </div>

          <div className="space-y-3">
            {extractedComps.map((comp, i) => {
              const status = compStatuses[i];
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const c = comp as Record<string, any>;
              const isSale = c.type === "Sale";

              // All tracked fields with labels
              const fields: [string, string, unknown][] = [
                ["Type", "type", c.type],
                ["Property Type", "propertyType", c.propertyType],
                ["Address", "address", c.address],
                ["City", "city", c.city],
                ["Province", "province", c.province],
                ...(isSale ? [
                  ["Seller", "seller", c.seller] as [string, string, unknown],
                  ["Purchaser", "purchaser", c.purchaser] as [string, string, unknown],
                  ["Sale Date", "saleDate", c.saleDate] as [string, string, unknown],
                  ["Sale Price", "salePrice", c.salePrice ? `$${Number(c.salePrice).toLocaleString()}` : null] as [string, string, unknown],
                  ["Price PSF", "pricePSF", c.pricePSF ? `$${Number(c.pricePSF).toFixed(2)}` : null] as [string, string, unknown],
                  ["Price/Acre", "pricePerAcre", c.pricePerAcre ? `$${Number(c.pricePerAcre).toLocaleString()}` : null] as [string, string, unknown],
                  ["Cap Rate", "capRate", c.capRate ? `${(c.capRate * 100).toFixed(2)}%` : null] as [string, string, unknown],
                  ["NOI", "noi", c.noi ? `$${Number(c.noi).toLocaleString()}` : null] as [string, string, unknown],
                ] : [
                  ["Landlord", "landlord", c.landlord] as [string, string, unknown],
                  ["Tenant", "tenant", c.tenant] as [string, string, unknown],
                  ["Lease Start", "leaseStart", c.leaseStart] as [string, string, unknown],
                  ["Lease Expiry", "leaseExpiry", c.leaseExpiry] as [string, string, unknown],
                  ["Term (months)", "termMonths", c.termMonths] as [string, string, unknown],
                  ["Net Rent PSF", "netRentPSF", c.netRentPSF ? `$${Number(c.netRentPSF).toFixed(2)}` : null] as [string, string, unknown],
                  ["Annual Rent", "annualRent", c.annualRent ? `$${Number(c.annualRent).toLocaleString()}` : null] as [string, string, unknown],
                ]),
                ["Area SF", "areaSF", c.areaSF ? `${Number(c.areaSF).toLocaleString()} SF` : null],
                ["Land Acres", "landAcres", c.landAcres],
                ["Land SF", "landSF", c.landSF ? `${Number(c.landSF).toLocaleString()} SF` : null],
                ["Year Built", "yearBuilt", c.yearBuilt],
                ["Zoning", "zoning", c.zoning],
                ["Comments", "comments", c.comments],
              ];

              const filled = fields.filter(([,, v]) => v !== null && v !== undefined && v !== "").length;
              const total = fields.length;

              return (
                <div
                  key={i}
                  className={`border rounded-xl p-4 transition ${
                    status === "added" ? "border-success/40 bg-success/5" :
                    status === "skipped" ? "border-card-border opacity-40" :
                    "border-card-border bg-card hover:border-gray-600"
                  }`}
                >
                  {/* Header row */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          isSale ? "bg-blue-500/15 text-blue-400" : "bg-purple-500/15 text-purple-400"
                        }`}>{c.type}</span>
                        {c.propertyType && <span className="text-xs text-muted">{c.propertyType}</span>}
                        <span className="text-xs text-muted">·</span>
                        <span className="text-xs text-accent">{filled}/{total} fields</span>
                      </div>
                      <p className="text-foreground font-medium mt-1">{c.address}{c.city && c.city !== "Saskatoon" ? `, ${c.city}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {status === "added" ? (
                        <span className="text-success text-sm font-medium">✓ Added</span>
                      ) : status === "skipped" ? (
                        <span className="text-muted text-sm">Skipped</span>
                      ) : status === "adding" ? (
                        <span className="text-muted text-sm">Adding...</span>
                      ) : (
                        <>
                          <button onClick={() => addComp(comp, i)} className="px-3 py-1 rounded-lg text-xs font-medium bg-success/15 text-success hover:bg-success/25 transition">Add</button>
                          <button onClick={() => setEditingComp(editingComp === i ? null : i)} className={`px-3 py-1 rounded-lg text-xs font-medium transition ${editingComp === i ? "bg-accent/25 text-accent" : "bg-accent/10 text-accent hover:bg-accent/20"}`}>{editingComp === i ? "Done" : "Edit"}</button>
                          <button onClick={() => skipComp(i)} className="px-3 py-1 rounded-lg text-xs font-medium bg-danger/15 text-danger hover:bg-danger/25 transition">Skip</button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Full field grid */}
                  {editingComp === i ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                      {fields.map(([label, key]) => (
                        <div key={label}>
                          <label className="text-[11px] text-gray-500 block mb-0.5">{label}</label>
                          {key === "comments" ? (
                            <textarea
                              value={c[key] ?? ""}
                              onChange={e => {
                                const updated = [...extractedComps];
                                updated[i] = { ...updated[i], [key]: e.target.value || null };
                                setExtractedComps(updated);
                              }}
                              rows={2}
                              className="w-full bg-transparent border border-card-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-accent/50"
                            />
                          ) : key === "type" ? (
                            <select
                              value={c[key] || "Sale"}
                              onChange={e => {
                                const updated = [...extractedComps];
                                updated[i] = { ...updated[i], [key]: e.target.value };
                                setExtractedComps(updated);
                              }}
                              className="w-full bg-transparent border border-card-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-accent/50"
                            >
                              <option value="Sale">Sale</option>
                              <option value="Lease">Lease</option>
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={c[key] ?? ""}
                              onChange={e => {
                                const updated = [...extractedComps];
                                const raw = e.target.value;
                                // Strip formatting for numeric fields before storing
                                const numericKeys = ["salePrice", "pricePSF", "pricePerAcre", "netRentPSF", "annualRent", "areaSF", "landAcres", "landSF", "capRate", "noi", "yearBuilt", "termMonths"];
                                if (numericKeys.includes(key)) {
                                  updated[i] = { ...updated[i], [key]: raw === "" ? null : Number(raw.replace(/[$,%\sSF]/g, "")) || null };
                                } else {
                                  updated[i] = { ...updated[i], [key]: raw || null };
                                }
                                setExtractedComps(updated);
                              }}
                              className="w-full bg-transparent border border-card-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-accent/50"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5">
                        {fields.filter(([label]) => label !== "Comments").map(([label,, val]) => (
                          <div key={label} className="flex items-baseline gap-1.5">
                            <span className="text-[11px] text-gray-500 shrink-0">{label}:</span>
                            {val !== null && val !== undefined && val !== "" ? (
                              <span className="text-xs text-foreground truncate">{String(val)}</span>
                            ) : (
                              <span className="text-xs text-gray-700">—</span>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Comments (full width) */}
                      {c.comments && (
                        <p className="text-xs text-muted mt-2 leading-relaxed">{c.comments}</p>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Supported formats */}
      <div className="bg-card border border-card-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Supported Formats</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-accent font-medium">🏢 Corporate Registry PDF</p>
            <p className="text-muted mt-1">SK corporate registry extracts — company details, directors, shareholders</p>
          </div>
          <div>
            <p className="text-accent font-medium">🏗️ Building Permit PDF</p>
            <p className="text-muted mt-1">Weekly permit reports — filters commercial permits over $350k</p>
          </div>
          <div>
            <p className="text-accent font-medium">📊 Transfer List Excel</p>
            <p className="text-muted mt-1">Property transfer records — roll#, address, vendor, purchaser, price</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, found, created, matched }: {
  label: string; found: number; created: number; matched: number;
}) {
  return (
    <div className="bg-background rounded-lg p-3">
      <p className="text-2xl font-bold text-foreground">{found}</p>
      <p className="text-muted text-xs">{label}</p>
      <div className="flex gap-2 mt-1 text-[10px]">
        {created > 0 && <span className="text-success">+{created} new</span>}
        {matched > 0 && <span className="text-accent">🔗{matched} matched</span>}
      </div>
    </div>
  );
}
