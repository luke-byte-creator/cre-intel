"use client";

import { useState, useCallback } from "react";

interface UploadResult {
  success: boolean;
  fileType: string;
  filepath: string;
  preview: {
    filename: string;
    size: number;
    type: string;
    message: string;
    suggestedParser?: string;
  };
}

export default function ImportPage() {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploads, setUploads] = useState<UploadResult[]>([]);
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
          setUploads((prev) => [data, ...prev]);
        } else {
          setError(data.error || "Upload failed");
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

  const parserLabel = (parser?: string) => {
    switch (parser) {
      case "corporate_registry": return "Corporate Registry";
      case "building_permit": return "Building Permits";
      case "transfer_list": return "Transfer List";
      default: return "Auto Detect";
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Import</h1>
        <p className="text-muted text-sm mt-1">Upload PDFs and Excel files to import data into CRE Intel</p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
          dragActive
            ? "border-accent bg-accent/5"
            : "border-card-border hover:border-muted"
        }`}
      >
        <p className="text-4xl mb-4">📥</p>
        <p className="text-foreground font-medium mb-2">
          {uploading ? "Uploading..." : "Drop files here or click to browse"}
        </p>
        <p className="text-muted text-sm mb-4">Supports PDF, Excel (.xlsx/.xls), and CSV files</p>
        <label className="inline-block cursor-pointer">
          <input
            type="file"
            multiple
            accept=".pdf,.xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
          <span className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            Browse Files
          </span>
        </label>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 text-danger rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Uploaded files review */}
      {uploads.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-3">Uploaded Files</h2>
          <div className="space-y-3">
            {uploads.map((u, i) => (
              <div key={i} className="bg-card border border-card-border rounded-xl p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{u.fileType === "pdf" ? "📄" : u.fileType === "spreadsheet" ? "📊" : "📁"}</span>
                    <div>
                      <p className="text-foreground font-medium">{u.preview.filename}</p>
                      <p className="text-muted text-xs mt-0.5">{u.preview.type} · {formatSize(u.preview.size)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-1 rounded-full bg-accent/15 text-accent font-medium">
                      {parserLabel(u.preview.suggestedParser)}
                    </span>
                    <span className="text-xs px-2 py-1 rounded-full bg-success/15 text-success font-medium">
                      ✓ Uploaded
                    </span>
                  </div>
                </div>
                <p className="text-muted text-sm mt-3">{u.preview.message}</p>
                <div className="mt-4 flex gap-2">
                  <button className="bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">
                    Process & Import
                  </button>
                  <button className="bg-card border border-card-border text-muted hover:text-foreground px-3 py-1.5 rounded-lg text-sm transition-colors">
                    Change Parser
                  </button>
                </div>
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
            <p className="text-accent font-medium">📄 Corporate Registry PDF</p>
            <p className="text-muted mt-1">SK corporate registry extracts — company details, directors, shareholders</p>
          </div>
          <div>
            <p className="text-accent font-medium">📄 Building Permit PDF</p>
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
