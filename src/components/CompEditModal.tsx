"use client";

import { useState } from "react";

interface CompEditModalProps {
  comp: Record<string, unknown>;
  type: "Sale" | "Lease";
  onSave: (updated: Record<string, unknown>) => void;
  onDelete: () => void;
  onClose: () => void;
}

const SALE_FIELDS = [
  { key: "address", label: "Address", type: "text" },
  { key: "unit", label: "Unit", type: "text" },
  { key: "city", label: "City", type: "text" },
  { key: "propertyType", label: "Property Type", type: "select", options: ["Land", "Investment", "Retail", "Industrial", "Office", "Other", "Unknown"] },
  { key: "investmentType", label: "Investment Type", type: "select", options: ["", "Multifamily", "Retail", "Industrial", "Office", "Other"] },
  { key: "propertyName", label: "Property Name", type: "text" },
  { key: "seller", label: "Vendor", type: "text" },
  { key: "purchaser", label: "Purchaser", type: "text" },
  { key: "saleDate", label: "Sale Date", type: "date" },
  { key: "salePrice", label: "Sale Price", type: "number" },
  { key: "pricePSF", label: "Price/SF", type: "number" },
  { key: "pricePerAcre", label: "Price/Acre", type: "number" },
  { key: "areaSF", label: "Building Area (SF)", type: "number" },
  { key: "officeSF", label: "Office Area (SF)", type: "number" },
  { key: "landAcres", label: "Land (Acres)", type: "number" },
  { key: "landSF", label: "Land (SF)", type: "number" },
  { key: "yearBuilt", label: "Year Built", type: "number" },
  { key: "zoning", label: "Zoning", type: "text" },
  { key: "ceilingHeight", label: "Ceiling Height (ft)", type: "number" },
  { key: "loadingDocks", label: "Loading Docks", type: "number" },
  { key: "driveInDoors", label: "Drive-In Doors", type: "number" },
  { key: "numBuildings", label: "# Buildings", type: "number" },
  { key: "numStories", label: "# Stories", type: "number" },
  { key: "constructionClass", label: "Construction Class", type: "text" },
  { key: "capRate", label: "Cap Rate (%)", type: "number" },
  { key: "noi", label: "NOI", type: "number" },
  { key: "stabilizedCapRate", label: "Stabilized Cap Rate (%)", type: "number" },
  { key: "stabilizedNOI", label: "Stabilized NOI", type: "number" },
  { key: "pricePerUnit", label: "Price/Unit", type: "number" },
  { key: "numUnits", label: "# Units", type: "number" },
  { key: "vacancyRate", label: "Vacancy Rate (%)", type: "number" },
  { key: "opexRatio", label: "OPEX Ratio (%)", type: "number" },
  { key: "rollNumber", label: "Roll #", type: "text" },
  { key: "pptDescriptor", label: "PPT Descriptor", type: "text" },
  { key: "comments", label: "Comments", type: "textarea" },
];

const LEASE_FIELDS = [
  { key: "address", label: "Address", type: "text" },
  { key: "unit", label: "Unit", type: "text" },
  { key: "city", label: "City", type: "text" },
  { key: "propertyType", label: "Property Type", type: "select", options: ["Retail", "Industrial", "Office", "Investment", "Land", "Other", "Unknown"] },
  { key: "leaseType", label: "Lease Type", type: "select", options: ["", "NNN", "Gross", "Ground"] },
  { key: "propertyName", label: "Property Name", type: "text" },
  { key: "tenant", label: "Tenant", type: "text" },
  { key: "landlord", label: "Landlord", type: "text" },
  { key: "leaseStart", label: "Lease Start", type: "date" },
  { key: "leaseExpiry", label: "Lease Expiry", type: "date" },
  { key: "termMonths", label: "Term (months)", type: "number" },
  { key: "netRentPSF", label: "Net Rent/SF/yr", type: "number" },
  { key: "annualRent", label: "Annual Rent", type: "number" },
  { key: "operatingCost", label: "Operating Cost/SF", type: "number" },
  { key: "areaSF", label: "Leasable Area (SF)", type: "number" },
  { key: "officeSF", label: "Office Area (SF)", type: "number" },
  { key: "landAcres", label: "Land (Acres)", type: "number" },
  { key: "landSF", label: "Land (SF)", type: "number" },
  { key: "yearBuilt", label: "Year Built", type: "number" },
  { key: "zoning", label: "Zoning", type: "text" },
  { key: "ceilingHeight", label: "Ceiling Height (ft)", type: "number" },
  { key: "loadingDocks", label: "Loading Docks", type: "number" },
  { key: "driveInDoors", label: "Drive-In Doors", type: "number" },
  { key: "numBuildings", label: "# Buildings", type: "number" },
  { key: "numStories", label: "# Stories", type: "number" },
  { key: "constructionClass", label: "Construction Class", type: "text" },
  { key: "improvementAllowance", label: "Improvement Allowance", type: "text" },
  { key: "freeRentPeriod", label: "Free Rent Period", type: "text" },
  { key: "fixturingPeriod", label: "Fixturing Period", type: "text" },
  { key: "portfolio", label: "Portfolio", type: "text" },
  { key: "comments", label: "Comments", type: "textarea" },
];

export default function CompEditModal({ comp, type, onSave, onDelete, onClose }: CompEditModalProps) {
  const fields = type === "Sale" ? SALE_FIELDS : LEASE_FIELDS;
  const [form, setForm] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    for (const f of fields) {
      initial[f.key] = comp[f.key] ?? "";
    }
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleChange(key: string, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    const updates: Record<string, unknown> = {};
    for (const f of fields) {
      const val = form[f.key];
      if (f.type === "number") {
        updates[f.key] = val === "" || val === null ? null : Number(val);
      } else {
        updates[f.key] = val === "" ? null : val;
      }
    }
    onSave(updates);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-zinc-900 border-b border-zinc-700 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold text-white">Edit {type === "Sale" ? "Sale" : "Lease"} Comp</h2>
          <div className="flex items-center gap-2">
            {!confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)}
                className="px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors">
                Delete
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-400">Sure?</span>
                <button onClick={onDelete}
                  className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors">
                  Yes, Delete
                </button>
                <button onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 text-sm text-zinc-400 hover:text-white rounded-lg transition-colors">
                  Cancel
                </button>
              </div>
            )}
            <button onClick={onClose} className="text-zinc-400 hover:text-white p-1">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        <div className="px-6 py-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {fields.map(f => (
            <div key={f.key} className={f.type === "textarea" ? "md:col-span-2" : ""}>
              <label className="text-xs text-zinc-400 mb-1 block">{f.label}</label>
              {f.type === "textarea" ? (
                <textarea
                  value={String(form[f.key] ?? "")}
                  onChange={e => handleChange(f.key, e.target.value)}
                  rows={3}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                />
              ) : f.type === "select" ? (
                <select
                  value={String(form[f.key] ?? "")}
                  onChange={e => handleChange(f.key, e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  {f.options?.map(o => <option key={o} value={o}>{o || "—"}</option>)}
                </select>
              ) : (
                <input
                  type={f.type}
                  value={String(form[f.key] ?? "")}
                  onChange={e => handleChange(f.key, e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              )}
            </div>
          ))}
        </div>

        <div className="sticky bottom-0 bg-zinc-900 border-t border-zinc-700 px-6 py-4 flex justify-end gap-3">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-white rounded-lg transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50">
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
