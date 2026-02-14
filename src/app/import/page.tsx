"use client";

import { useState, useCallback } from "react";

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
