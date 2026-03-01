"use client";

import { useState, useCallback } from "react";
import { track } from "@/lib/track";

const SALE_KEY_REQUIRED = new Set(['propertyType', 'saleDate', 'salePrice']);
const SALE_KEY_GROUPS: Record<string, string> = {
  areaSF: 'Size (one required)', landAcres: 'Size (one required)',
  seller: 'Parties (one required)', purchaser: 'Parties (one required)',
};

const LEASE_KEY_REQUIRED = new Set(['propertyType', 'tenant', 'areaSF']);
const LEASE_KEY_GROUPS: Record<string, string> = {
  netRentPSF: 'Rate (one required)', annualRent: 'Rate (one required)',
  leaseStart: 'Timing (one required)', leaseExpiry: 'Timing (one required)',
};

interface CompEditModalProps {
  comp: Record<string, unknown>;
  type: "Sale" | "Lease";
  onSave: (updated: Record<string, unknown>) => void;
  onDelete?: () => void;
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

/* ── helpers ── */

function isEmpty(v: unknown): boolean {
  return v === "" || v === null || v === undefined || v === 0 || v === "0";
}

function num(v: unknown): number | null {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function roundDollars(v: number) { return Math.round(v * 100) / 100; }
function roundCapRate(v: number) { return Math.round(v * 100) / 100; }
function roundSF(v: number) { return Math.round(v); }
function roundAcres(v: number) { return Math.round(v * 10000) / 10000; }

/** Add months to a date string (YYYY-MM-DD), subtract 1 day for expiry */
function addMonthsExpiry(startStr: string, months: number): string {
  const d = new Date(startStr + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Difference in months between two date strings */
function diffMonths(startStr: string, endStr: string): number {
  const s = new Date(startStr + "T00:00:00");
  // expiry is last day, so add 1 day to get the "end" boundary
  const e = new Date(endStr + "T00:00:00");
  e.setDate(e.getDate() + 1);
  return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
}

export default function CompEditModal({ comp, type, onSave, onDelete, onClose }: CompEditModalProps) {
  const isCreate = !comp.id;
  const fields = type === "Sale" ? SALE_FIELDS : LEASE_FIELDS;
  const keyRequired = type === "Sale" ? SALE_KEY_REQUIRED : LEASE_KEY_REQUIRED;
  const keyGroups = type === "Sale" ? SALE_KEY_GROUPS : LEASE_KEY_GROUPS;
  const [form, setForm] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    for (const f of fields) {
      initial[f.key] = comp[f.key] ?? "";
    }
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [autoCalced, setAutoCalced] = useState<Set<string>>(new Set());

  function handleChange(key: string, value: string) {
    // If user manually edits a field, remove its auto-calc flag
    setAutoCalced(prev => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    setForm(prev => ({ ...prev, [key]: value }));
  }

  /** Set a field only if it's currently empty; mark it as auto-calculated */
  const autoSet = useCallback((
    prev: Record<string, unknown>,
    key: string,
    value: string | number,
    calced: Set<string>,
  ): boolean => {
    // Only fill if empty OR was previously auto-calced (allow re-calc)
    if (!isEmpty(prev[key]) && !calced.has(key)) return false;
    prev[key] = value;
    calced.add(key);
    return true;
  }, []);

  const handleBlur = useCallback((blurredKey: string) => {
    setForm(prev => {
      const f = { ...prev };
      const calced = new Set(autoCalced);
      let changed = false;

      // ── Shared: landAcres ↔ landSF ──
      if (blurredKey === "landAcres") {
        const acres = num(f.landAcres);
        if (acres && acres > 0) {
          if (autoSet(f, "landSF", roundSF(acres * 43560), calced)) changed = true;
        }
      }
      if (blurredKey === "landSF") {
        const sf = num(f.landSF);
        if (sf && sf > 0) {
          if (autoSet(f, "landAcres", roundAcres(sf / 43560), calced)) changed = true;
        }
      }

      if (type === "Lease") {
        // leaseStart + termMonths → leaseExpiry
        if (blurredKey === "leaseStart" || blurredKey === "termMonths") {
          const start = f.leaseStart as string;
          const term = num(f.termMonths);
          if (start && term && term > 0) {
            if (autoSet(f, "leaseExpiry", addMonthsExpiry(start, term), calced)) changed = true;
          }
        }
        // leaseExpiry + leaseStart → termMonths
        if (blurredKey === "leaseExpiry" || blurredKey === "leaseStart") {
          const start = f.leaseStart as string;
          const expiry = f.leaseExpiry as string;
          if (start && expiry) {
            const months = diffMonths(start, expiry);
            if (months > 0) {
              if (autoSet(f, "termMonths", months, calced)) changed = true;
            }
          }
        }
        // netRentPSF × areaSF → annualRent
        if (blurredKey === "netRentPSF" || blurredKey === "areaSF") {
          const rent = num(f.netRentPSF);
          const area = num(f.areaSF);
          if (rent && area && rent > 0 && area > 0) {
            if (autoSet(f, "annualRent", roundDollars(rent * area), calced)) changed = true;
          }
        }
        // annualRent ÷ areaSF → netRentPSF
        if (blurredKey === "annualRent" || blurredKey === "areaSF") {
          const annual = num(f.annualRent);
          const area = num(f.areaSF);
          if (annual && area && annual > 0 && area > 0) {
            if (autoSet(f, "netRentPSF", roundDollars(annual / area), calced)) changed = true;
          }
        }
      }

      if (type === "Sale") {
        const price = num(f.salePrice);
        const area = num(f.areaSF);
        const acres = num(f.landAcres);
        const noival = num(f.noi);
        const cap = num(f.capRate);
        const units = num(f.numUnits);

        // salePrice ÷ areaSF → pricePSF
        if ((blurredKey === "salePrice" || blurredKey === "areaSF") && price && area && price > 0 && area > 0) {
          if (autoSet(f, "pricePSF", roundDollars(price / area), calced)) changed = true;
        }
        // salePrice ÷ landAcres → pricePerAcre
        if ((blurredKey === "salePrice" || blurredKey === "landAcres") && price && acres && price > 0 && acres > 0) {
          if (autoSet(f, "pricePerAcre", roundDollars(price / acres), calced)) changed = true;
        }
        // noi ÷ salePrice → capRate (stored as percentage)
        if ((blurredKey === "noi" || blurredKey === "salePrice") && noival && price && noival > 0 && price > 0) {
          if (autoSet(f, "capRate", roundCapRate((noival / price) * 100), calced)) changed = true;
        }
        // salePrice × capRate → noi (capRate is percentage)
        if ((blurredKey === "salePrice" || blurredKey === "capRate") && price && cap && price > 0 && cap > 0) {
          if (autoSet(f, "noi", roundDollars(price * (cap / 100)), calced)) changed = true;
        }
        // salePrice ÷ numUnits → pricePerUnit
        if ((blurredKey === "salePrice" || blurredKey === "numUnits") && price && units && price > 0 && units > 0) {
          if (autoSet(f, "pricePerUnit", roundDollars(price / units), calced)) changed = true;
        }
      }

      if (changed) {
        setAutoCalced(calced);
        return f;
      }
      return prev;
    });
  }, [type, autoCalced, autoSet]);

  async function handleSave() {
    setSaving(true);
    track(isCreate ? "create" : "edit", "comps", { type, compId: comp.id });
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
          <h2 className="text-lg font-bold text-white">{isCreate ? "Add" : "Edit"} {type === "Sale" ? "Sale" : "Lease"} Comp</h2>
          <div className="flex items-center gap-2">
            {!isCreate && (
              !confirmDelete ? (
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
              )
            )}
            <button onClick={onClose} className="text-zinc-400 hover:text-white p-1">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        <div className="px-6 py-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {fields.map(f => {
            const isCalced = autoCalced.has(f.key);
            return (
              <div key={f.key} className={f.type === "textarea" ? "md:col-span-2" : ""}>
                <label className="text-xs text-zinc-400 mb-1 flex items-center gap-1">
                  {f.label}
                  {keyRequired.has(f.key) && <span className="text-red-400 ml-0.5">*</span>}
                  {keyGroups[f.key] && <span className="text-amber-400/70 ml-1 text-[10px]">({keyGroups[f.key]})</span>}
                  {isCalced && <span className="text-blue-400/70 text-[10px] italic ml-1">calc</span>}
                </label>
                {f.type === "textarea" ? (
                  <textarea
                    value={String(form[f.key] ?? "")}
                    onChange={e => handleChange(f.key, e.target.value)}
                    onBlur={() => handleBlur(f.key)}
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
                    onBlur={() => handleBlur(f.key)}
                    className={`w-full bg-zinc-800 border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${isCalced ? "border-blue-500/30 italic" : "border-zinc-700"}`}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="sticky bottom-0 bg-zinc-900 border-t border-zinc-700 px-6 py-4 flex justify-end gap-3">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-white rounded-lg transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50">
            {saving ? (isCreate ? "Creating..." : "Saving...") : (isCreate ? "Create Comp" : "Save Changes")}
          </button>
        </div>
      </div>
    </div>
  );
}
