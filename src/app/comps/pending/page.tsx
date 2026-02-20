"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface PendingComp {
  id: number;
  type: string;
  address: string;
  tenant?: string;
  landlord?: string;
  seller?: string;
  purchaser?: string;
  salePrice?: number;
  saleDate?: string;
  leaseStart?: string;
  leaseExpiry?: string;
  netRentPSF?: number;
  areaSF?: number;
  propertyType?: string;
  sourceRef: string;
  confidence: number;
  fieldConfidence: Record<string, { confidence: number; source: string }>;
  missingFields: string[];
  notes?: string;
  status: string;
  duplicateOfId?: number;
  createdAt: string;
}

export default function PendingCompsPage() {
  const [comps, setComps] = useState<PendingComp[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedComps, setSelectedComps] = useState<Set<number>>(new Set());
  const [showDetails, setShowDetails] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetchPendingComps();
  }, []);

  const fetchPendingComps = async () => {
    try {
      const res = await fetch('/api/comps/pending');
      if (res.ok) {
        const data = await res.json();
        setComps(data.comps || []);
      }
    } catch (error) {
      console.error('Failed to fetch pending comps:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (action: string, compIds?: number[]) => {
    const targetIds = compIds || Array.from(selectedComps);
    if (targetIds.length === 0) return;

    try {
      const res = await fetch('/api/comps/pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, compIds: targetIds })
      });

      if (res.ok) {
        await fetchPendingComps(); // Refresh list
        setSelectedComps(new Set()); // Clear selection
      }
    } catch (error) {
      console.error(`${action} failed:`, error);
    }
  };

  const toggleSelection = (compId: number) => {
    const newSelection = new Set(selectedComps);
    if (newSelection.has(compId)) {
      newSelection.delete(compId);
    } else {
      newSelection.add(compId);
    }
    setSelectedComps(newSelection);
  };

  const toggleDetails = (compId: number) => {
    const newDetails = new Set(showDetails);
    if (newDetails.has(compId)) {
      newDetails.delete(compId);
    } else {
      newDetails.add(compId);
    }
    setShowDetails(newDetails);
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-emerald-400';
    if (confidence >= 0.6) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getFieldConfidenceIndicator = (field: string, comp: PendingComp) => {
    const fieldConf = comp.fieldConfidence[field];
    if (!fieldConf) return null;

    const color = fieldConf.source === 'explicit' ? 'bg-emerald-500' : 'bg-yellow-500';
    const title = `${fieldConf.source}: ${(fieldConf.confidence * 100).toFixed(0)}% confidence`;
    
    return (
      <span 
        className={`inline-block w-2 h-2 rounded-full ${color} ml-1`}
        title={title}
      />
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Pending Comps Review</h1>
        <div className="text-muted">Loading pending comps...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Pending Comps Review</h1>
        <div className="text-sm text-muted">
          {comps.length} comps pending review
        </div>
      </div>

      {/* Action Bar */}
      {selectedComps.size > 0 && (
        <div className="bg-card border border-card-border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">
              {selectedComps.size} comp(s) selected
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => handleAction('approve')}
                className="px-3 py-1 bg-emerald-600 text-white rounded text-sm hover:bg-emerald-700"
              >
                Approve Selected
              </button>
              <button
                onClick={() => handleAction('reject')}
                className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
              >
                Reject Selected
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => handleAction('bulk_approve')}
          className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700"
        >
          Bulk Approve High Confidence
        </button>
      </div>

      {/* Comps List */}
      {comps.length === 0 ? (
        <div className="bg-card border border-card-border rounded-lg p-8 text-center">
          <div className="text-muted">No pending comps to review</div>
          <div className="text-sm text-muted mt-2">
            Comps will appear here when submitted via email #comp tags
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {comps.map((comp) => (
            <div key={comp.id} className="bg-card border border-card-border rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selectedComps.has(comp.id)}
                    onChange={() => toggleSelection(comp.id)}
                    className="mt-1"
                  />
                  
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">
                        {comp.address}
                        {getFieldConfidenceIndicator('address', comp)}
                      </span>
                      <span className="text-xs px-2 py-1 bg-accent/20 text-accent rounded">
                        {comp.type}
                      </span>
                      {comp.duplicateOfId && (
                        <span className="text-xs px-2 py-1 bg-red-500/20 text-red-400 rounded">
                          DUPLICATE
                        </span>
                      )}
                    </div>
                    
                    <div className="text-sm text-muted space-y-1">
                      {comp.tenant && (
                        <div>
                          Tenant: {comp.tenant}
                          {getFieldConfidenceIndicator('tenant', comp)}
                        </div>
                      )}
                      {comp.seller && (
                        <div>
                          Seller: {comp.seller}
                          {getFieldConfidenceIndicator('seller', comp)}
                        </div>
                      )}
                      {comp.salePrice && (
                        <div>
                          Price: ${comp.salePrice.toLocaleString()}
                          {getFieldConfidenceIndicator('salePrice', comp)}
                        </div>
                      )}
                      {comp.netRentPSF && (
                        <div>
                          Rent: ${comp.netRentPSF}/SF
                          {getFieldConfidenceIndicator('netRentPSF', comp)}
                        </div>
                      )}
                      {comp.areaSF && (
                        <div>
                          Area: {comp.areaSF.toLocaleString()} SF
                          {getFieldConfidenceIndicator('areaSF', comp)}
                        </div>
                      )}
                    </div>

                    <div className="text-xs text-muted">
                      Source: {comp.sourceRef}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className={`text-sm font-medium ${getConfidenceColor(comp.confidence)}`}>
                      {(comp.confidence * 100).toFixed(0)}% confidence
                    </div>
                    <div className="text-xs text-muted">
                      {comp.missingFields.length} missing fields
                    </div>
                  </div>

                  <div className="flex gap-1">
                    <button
                      onClick={() => toggleDetails(comp.id)}
                      className="p-1 text-muted hover:text-foreground"
                      title="View details"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </button>
                    
                    <button
                      onClick={() => handleAction('approve', [comp.id])}
                      className="p-1 text-emerald-400 hover:text-emerald-300"
                      title="Approve"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                    
                    <button
                      onClick={() => handleAction('reject', [comp.id])}
                      className="p-1 text-red-400 hover:text-red-300"
                      title="Reject"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* Expanded Details */}
              {showDetails.has(comp.id) && (
                <div className="mt-4 pt-4 border-t border-card-border space-y-3">
                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-2">Field Confidence</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                      {Object.entries(comp.fieldConfidence).map(([field, conf]) => (
                        <div key={field} className="flex items-center justify-between">
                          <span className="capitalize">{field.replace(/([A-Z])/g, ' $1').trim()}:</span>
                          <span className={`${conf.source === 'explicit' ? 'text-emerald-400' : 'text-yellow-400'}`}>
                            {conf.source} ({(conf.confidence * 100).toFixed(0)}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {comp.missingFields.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-foreground mb-2">Missing Fields</h4>
                      <div className="text-xs text-muted">
                        {comp.missingFields.join(', ')}
                      </div>
                    </div>
                  )}

                  {comp.notes && (
                    <div>
                      <h4 className="text-sm font-medium text-foreground mb-2">Nova's Notes</h4>
                      <div className="text-xs text-muted bg-muted/10 p-2 rounded">
                        {comp.notes}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="bg-card border border-card-border rounded-lg p-4">
        <h3 className="text-sm font-medium text-foreground mb-2">Confidence Indicators</h3>
        <div className="flex gap-6 text-xs">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-muted">Explicit (high confidence)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-yellow-500" />
            <span className="text-muted">Inferred (medium confidence)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-muted">Missing field (no dot)</span>
          </div>
        </div>
      </div>
    </div>
  );
}