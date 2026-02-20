"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Package {
  id: number;
  propertyAddress: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  totalDocs: number;
  successfulDocs: number;
  partialDocs: number;
  failedDocs: number;
}

const STATUS_COLORS: Record<string, string> = {
  collecting: "bg-blue-500/15 text-blue-400",
  ready: "bg-yellow-500/15 text-yellow-400",
  analyzed: "bg-emerald-500/15 text-emerald-400",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[status] || "bg-gray-500/15 text-gray-400"}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function ExtractionSummary({ pkg }: { pkg: Package }) {
  if (pkg.totalDocs === 0) {
    return <span className="text-xs text-muted">No documents</span>;
  }

  const parts = [];
  if (pkg.successfulDocs > 0) parts.push(`${pkg.successfulDocs} ✓`);
  if (pkg.partialDocs > 0) parts.push(`${pkg.partialDocs} ⚠`);
  if (pkg.failedDocs > 0) parts.push(`${pkg.failedDocs} ✗`);

  return (
    <span className="text-xs text-muted">
      {pkg.totalDocs} docs: {parts.join(", ")}
    </span>
  );
}

export default function UnderwritingPackagesPage() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPackages();
  }, []);

  async function fetchPackages() {
    try {
      const res = await fetch("/api/underwriting/packages");
      if (res.ok) {
        const data = await res.json();
        setPackages(data);
      }
    } catch (error) {
      console.error("Failed to fetch packages:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted">Loading packages...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Underwriting Packages</h1>
        <p className="text-sm text-muted mt-1">
          Email lease documents to <strong>@underwrite [address]</strong> to create packages
        </p>
      </div>

      {packages.length === 0 ? (
        <div className="bg-card border border-card-border rounded-xl p-8 text-center">
          <svg className="w-12 h-12 mx-auto text-muted/40 mb-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3-6.75h.007v.008H20.25V9.5M20.25 9.75a1.5 1.5 0 00-1.5-1.5h-6.75M20.25 9.75V15a2.25 2.25 0 01-2.25 2.25H9.75a2.25 2.25 0 01-2.25-2.25V6.75A2.25 2.25 0 019.75 4.5h6.75A1.5 1.5 0 0118 3m0 0l3 3m0 0l-3 3" />
          </svg>
          <h3 className="text-lg font-semibold text-foreground mb-2">No packages yet</h3>
          <p className="text-muted mb-4">
            Send lease documents via email with <code className="bg-white/[0.04] px-1.5 py-0.5 rounded text-accent">@underwrite 123 Main St</code> to get started
          </p>
          <div className="text-sm text-muted/60">
            The system will extract lease terms and build rent rolls for underwriting analysis
          </div>
        </div>
      ) : (
        <div className="bg-card border border-card-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/[0.02] border-b border-card-border">
                <tr>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-foreground">Property Address</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-foreground">Status</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-foreground">Documents</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-foreground">Created</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-foreground">Updated</th>
                </tr>
              </thead>
              <tbody>
                {packages.map((pkg, index) => (
                  <tr key={pkg.id} className={`hover:bg-white/[0.02] transition-colors ${index !== packages.length - 1 ? 'border-b border-card-border' : ''}`}>
                    <td className="py-3 px-4">
                      <Link href={`/underwriting/packages/${pkg.id}`} className="text-foreground hover:text-accent transition font-medium">
                        {pkg.propertyAddress}
                      </Link>
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={pkg.status} />
                    </td>
                    <td className="py-3 px-4">
                      <ExtractionSummary pkg={pkg} />
                    </td>
                    <td className="py-3 px-4 text-sm text-muted">
                      {new Date(pkg.createdAt).toLocaleDateString('en-CA', { 
                        month: 'short', 
                        day: 'numeric', 
                        year: 'numeric' 
                      })}
                    </td>
                    <td className="py-3 px-4 text-sm text-muted">
                      {new Date(pkg.updatedAt).toLocaleDateString('en-CA', { 
                        month: 'short', 
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit'
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}