"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

interface Document {
  id: number;
  fileName: string;
  extractionStatus: string;
  extractedData: any;
  fieldConfidence: any;
  source: string;
  createdAt: string;
  notes?: string;
}

interface Package {
  id: number;
  propertyAddress: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  analysisResult?: string;
  documents: Document[];
}

const EXTRACTION_STATUS_ICONS = {
  success: { icon: "✅", label: "Success", class: "text-emerald-400" },
  partial: { icon: "⚠️", label: "Partial", class: "text-yellow-400" },
  failed: { icon: "❌", label: "Failed", class: "text-red-400" },
  pending: { icon: "⏳", label: "Pending", class: "text-muted" },
};

const CONFIDENCE_COLORS = {
  high: "bg-emerald-400",
  medium: "bg-yellow-400", 
  low: "bg-red-400",
};

function ConfidenceDot({ confidence }: { confidence: string }) {
  return (
    <div 
      className={`w-2 h-2 rounded-full ${CONFIDENCE_COLORS[confidence as keyof typeof CONFIDENCE_COLORS] || "bg-gray-400"}`} 
      title={confidence}
    />
  );
}

function DocumentRow({ doc, onEdit, onDelete }: { 
  doc: Document; 
  onEdit: (docId: number, field: string, value: any) => void;
  onDelete: (docId: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const statusInfo = EXTRACTION_STATUS_ICONS[doc.extractionStatus as keyof typeof EXTRACTION_STATUS_ICONS];

  const handleEdit = (field: string, value: any) => {
    onEdit(doc.id, field, value);
    setEditing(null);
  };

  return (
    <div className="border border-card-border rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className={`text-sm ${statusInfo.class}`}>{statusInfo.icon}</span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-foreground truncate">{doc.fileName}</div>
            <div className="flex items-center gap-4 text-xs text-muted">
              <span>Status: {statusInfo.label}</span>
              {doc.extractedData?.tenantName && (
                <span>Tenant: {doc.extractedData.tenantName}</span>
              )}
              {doc.extractedData?.areaSF && (
                <span>SF: {doc.extractedData.areaSF.toLocaleString()}</span>
              )}
              {doc.extractedData?.baseRentPSF && (
                <span>Rent: ${doc.extractedData.baseRentPSF}/SF</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-muted hover:text-foreground transition"
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
          <button
            onClick={() => onDelete(doc.id)}
            className="text-xs text-red-400 hover:text-red-300 transition"
          >
            Delete
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-card-border">
          <div className="space-y-3">
            {doc.extractedData && Object.keys(doc.extractedData).map(field => (
              <div key={field} className="flex items-center gap-3">
                <div className="w-32 text-xs text-muted capitalize">{field.replace(/([A-Z])/g, ' $1').trim()}:</div>
                <div className="flex items-center gap-2 flex-1">
                  {editing === field ? (
                    <input
                      type="text"
                      defaultValue={doc.extractedData[field] || ""}
                      onBlur={(e) => handleEdit(field, e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleEdit(field, (e.target as HTMLInputElement).value)}
                      className="flex-1 bg-white/[0.04] border border-gray-700 rounded px-2 py-1 text-xs text-foreground"
                      autoFocus
                    />
                  ) : (
                    <span 
                      className="text-xs text-foreground cursor-pointer hover:bg-white/[0.04] px-2 py-1 rounded flex-1"
                      onClick={() => setEditing(field)}
                    >
                      {doc.extractedData[field] || "—"}
                    </span>
                  )}
                  {doc.fieldConfidence?.[field] && (
                    <ConfidenceDot confidence={doc.fieldConfidence[field]} />
                  )}
                </div>
              </div>
            ))}
          </div>
          
          {doc.notes && (
            <div className="mt-3 pt-3 border-t border-card-border">
              <div className="text-xs text-muted">
                <strong>Notes:</strong> {doc.notes}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RentRollPreview({ documents }: { documents: Document[] }) {
  const validDocs = documents.filter(doc => doc.extractionStatus === "success" || doc.extractionStatus === "partial");
  
  if (validDocs.length === 0) {
    return (
      <div className="text-center py-8 text-muted">
        No valid rent roll data yet
      </div>
    );
  }

  const totalSF = validDocs.reduce((sum, doc) => sum + (doc.extractedData?.areaSF || 0), 0);
  const totalAnnualRent = validDocs.reduce((sum, doc) => {
    const sf = doc.extractedData?.areaSF || 0;
    const psf = doc.extractedData?.baseRentPSF || 0;
    return sum + (sf * psf);
  }, 0);
  const avgRentPSF = totalSF > 0 ? totalAnnualRent / totalSF : 0;

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-card-border">
              <th className="pb-2 text-xs font-semibold text-muted">Tenant</th>
              <th className="pb-2 text-xs font-semibold text-muted">Suite</th>
              <th className="pb-2 text-xs font-semibold text-muted text-right">SF</th>
              <th className="pb-2 text-xs font-semibold text-muted text-right">Rent PSF</th>
              <th className="pb-2 text-xs font-semibold text-muted text-right">Annual Rent</th>
              <th className="pb-2 text-xs font-semibold text-muted">Expiry</th>
            </tr>
          </thead>
          <tbody>
            {validDocs.map(doc => (
              <tr key={doc.id} className="border-b border-card-border/50">
                <td className="py-2 text-foreground">{doc.extractedData?.tenantName || "Unknown"}</td>
                <td className="py-2 text-muted">{doc.extractedData?.suite || "—"}</td>
                <td className="py-2 text-right text-foreground">{doc.extractedData?.areaSF?.toLocaleString() || "—"}</td>
                <td className="py-2 text-right text-foreground">
                  {doc.extractedData?.baseRentPSF ? `$${doc.extractedData.baseRentPSF}` : "—"}
                </td>
                <td className="py-2 text-right text-foreground">
                  {doc.extractedData?.areaSF && doc.extractedData?.baseRentPSF 
                    ? `$${(doc.extractedData.areaSF * doc.extractedData.baseRentPSF).toLocaleString()}`
                    : "—"
                  }
                </td>
                <td className="py-2 text-muted">{doc.extractedData?.leaseExpiry || "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-card-border">
            <tr className="font-semibold">
              <td className="pt-2 text-foreground" colSpan={2}>Totals</td>
              <td className="pt-2 text-right text-foreground">{totalSF.toLocaleString()}</td>
              <td className="pt-2 text-right text-foreground">${avgRentPSF.toFixed(2)}</td>
              <td className="pt-2 text-right text-foreground">${totalAnnualRent.toLocaleString()}</td>
              <td className="pt-2"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export default function PackageDetailPage() {
  const params = useParams();
  const packageId = parseInt(params.id as string);
  
  const [package_, setPackage] = useState<Package | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (packageId) {
      fetchPackage();
    }
  }, [packageId]);

  async function fetchPackage() {
    try {
      const res = await fetch(`/api/underwriting/packages/${packageId}`);
      if (res.ok) {
        const data = await res.json();
        setPackage(data);
      }
    } catch (error) {
      console.error("Failed to fetch package:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusUpdate(newStatus: string) {
    try {
      const res = await fetch(`/api/underwriting/packages/${packageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setPackage(prev => prev ? { ...prev, status: newStatus } : null);
      }
    } catch (error) {
      console.error("Failed to update status:", error);
    }
  }

  async function handleAnalyze() {
    setAnalyzing(true);
    try {
      const res = await fetch(`/api/underwriting/packages/${packageId}/analyze`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setPackage(prev => prev ? { 
          ...prev, 
          status: "analyzed",
          analysisResult: JSON.stringify(data.analysis)
        } : null);
      }
    } catch (error) {
      console.error("Failed to analyze:", error);
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleFileUpload(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      
      const res = await fetch(`/api/underwriting/packages/${packageId}/documents`, {
        method: "POST",
        body: formData,
      });
      
      if (res.ok) {
        fetchPackage(); // Refresh the package data
      }
    } catch (error) {
      console.error("Failed to upload file:", error);
    } finally {
      setUploading(false);
    }
  }

  async function handleEditDocument(docId: number, field: string, value: any) {
    try {
      const res = await fetch(`/api/underwriting/packages/${packageId}/documents/${docId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extractedData: { [field]: value } }),
      });
      if (res.ok) {
        fetchPackage(); // Refresh the package data
      }
    } catch (error) {
      console.error("Failed to edit document:", error);
    }
  }

  async function handleDeleteDocument(docId: number) {
    if (!confirm("Are you sure you want to delete this document?")) return;
    
    try {
      const res = await fetch(`/api/underwriting/packages/${packageId}/documents/${docId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchPackage(); // Refresh the package data
      }
    } catch (error) {
      console.error("Failed to delete document:", error);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted">Loading package...</div>
      </div>
    );
  }

  if (!package_) {
    return (
      <div className="text-center py-8">
        <div className="text-red-400 mb-2">Package not found</div>
        <Link href="/underwriting/packages" className="text-accent hover:text-accent/80">
          ← Back to packages
        </Link>
      </div>
    );
  }

  const successfulDocs = package_.documents.filter(doc => doc.extractionStatus === "success").length;
  const partialDocs = package_.documents.filter(doc => doc.extractionStatus === "partial").length;
  const failedDocs = package_.documents.filter(doc => doc.extractionStatus === "failed").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/underwriting/packages" className="text-sm text-muted hover:text-foreground transition">
            ← Back to packages
          </Link>
          <div>
            <input
              type="text"
              value={package_.propertyAddress}
              onChange={async (e) => {
                const res = await fetch(`/api/underwriting/packages/${packageId}`, {
                  method: "PATCH", 
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ propertyAddress: e.target.value }),
                });
                if (res.ok) {
                  setPackage(prev => prev ? { ...prev, propertyAddress: e.target.value } : null);
                }
              }}
              className="text-xl font-bold text-foreground bg-transparent border-b border-transparent hover:border-gray-600 focus:border-accent transition px-1"
            />
            <div className="flex items-center gap-3 mt-1">
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                package_.status === "collecting" ? "bg-blue-500/15 text-blue-400" :
                package_.status === "ready" ? "bg-yellow-500/15 text-yellow-400" :
                package_.status === "analyzed" ? "bg-emerald-500/15 text-emerald-400" :
                "bg-gray-500/15 text-gray-400"
              }`}>
                {package_.status.charAt(0).toUpperCase() + package_.status.slice(1)}
              </span>
              <span className="text-xs text-muted">
                {package_.documents.length} documents • {successfulDocs} successful • {failedDocs} failed
              </span>
            </div>
          </div>
        </div>
        
        {(package_.status === "collecting" || package_.status === "ready") && (
          <button
            onClick={handleAnalyze}
            disabled={analyzing || successfulDocs === 0}
            className={`px-4 py-2 rounded-lg font-semibold transition ${
              successfulDocs > 0 && !analyzing
                ? "bg-accent text-white hover:bg-accent/90"
                : "bg-white/[0.06] text-muted cursor-not-allowed"
            }`}
          >
            {analyzing ? "Analyzing..." : "Run Analysis"}
          </button>
        )}
      </div>

      {/* Documents Section */}
      <div className="bg-card border border-card-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Documents</h3>
          <div className="flex items-center gap-3">
            <input
              type="file"
              accept=".docx,.pdf"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
              }}
              className="hidden"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className={`px-3 py-1.5 text-sm rounded-lg cursor-pointer transition ${
                uploading
                  ? "bg-white/[0.06] text-muted cursor-not-allowed"
                  : "bg-accent text-white hover:bg-accent/90"
              }`}
            >
              {uploading ? "Uploading..." : "Upload Document"}
            </label>
          </div>
        </div>

        <div className="space-y-3">
          {package_.documents.map(doc => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              onEdit={handleEditDocument}
              onDelete={handleDeleteDocument}
            />
          ))}
        </div>

        {package_.documents.length === 0 && (
          <div className="text-center py-8 text-muted">
            No documents yet. Upload documents or send via email.
          </div>
        )}
      </div>

      {/* Rent Roll Preview */}
      {(successfulDocs > 0 || partialDocs > 0) && (
        <div className="bg-card border border-card-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-foreground">Rent Roll Preview</h3>
            {failedDocs > 0 && (
              <span className="text-xs text-yellow-400">
                {failedDocs} document{failedDocs > 1 ? 's' : ''} failed extraction — manual entry needed
              </span>
            )}
          </div>
          <RentRollPreview documents={package_.documents} />
        </div>
      )}

      {/* Analysis Results */}
      {package_.status === "analyzed" && package_.analysisResult && (
        <div className="bg-card border border-card-border rounded-xl p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Analysis Results</h3>
          <div className="text-sm text-foreground">
            <pre className="whitespace-pre-wrap text-xs bg-white/[0.04] p-4 rounded-lg overflow-x-auto">
              {JSON.stringify(JSON.parse(package_.analysisResult), null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}