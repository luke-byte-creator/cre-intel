"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import type { AuditEntry, ConflictEntry, TenantRow } from "@/lib/extraction/extract-documents";

// ─── Types ──────────────────────────────────────────────────────────────────

type ViewState = "upload" | "review" | "complete";

type AnalysisMode = "quick" | "institutional";

interface Analysis {
  id: number;
  name: string;
  assetClass: string;
  mode?: AnalysisMode;
  status: string;
  inputs?: string;
  feedbackContext?: string;
  uploadedAt?: string;
  createdAt: string;
}

interface UploadedFile {
  name: string;
  size: number;
  uploadedAt: string;
  file?: File;
}

type Confidence = "high" | "medium" | "low" | "default" | "manual";

interface FieldMeta {
  confidence: Confidence;
  sourceDoc?: string;
  page?: string;
  reasoning?: string;
  sourceText?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Inputs = Record<string, any>;

// ─── Constants ──────────────────────────────────────────────────────────────

const ASSET_CLASSES = [
  { value: "office_retail_industrial", label: "Office / Retail / Industrial Acquisition", enabled: true },
  { value: "multifamily", label: "Multifamily Acquisition", enabled: false },
  { value: "industrial_dev", label: "Industrial Development", enabled: false },
  { value: "stnl", label: "STNL Valuation", enabled: false },
];

const ACCEPTED_EXTENSIONS = ".pdf,.xlsx,.xls,.csv,.jpg,.png";
const MAX_FILES = 10;
const MAX_SIZE = 50 * 1024 * 1024;

const TABS = ["Property", "Income", "Expenses", "CapEx", "Financing", "Exit"] as const;
type Tab = (typeof TABS)[number];

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-yellow-500/15 text-yellow-400",
  extracted: "bg-blue-500/15 text-blue-400",
  reviewed: "bg-emerald-500/15 text-emerald-400",
  complete: "bg-purple-500/15 text-purple-400",
};

const CONFIDENCE_COLORS: Record<Confidence, string> = {
  high: "bg-emerald-400",
  medium: "bg-yellow-400",
  low: "bg-red-400",
  default: "bg-gray-400",
  manual: "bg-blue-400",
};

const EXTRACTION_STATUS_MESSAGES = [
  "Classifying documents...",
  "Extracting data...",
  "Cross-validating...",
  "Applying defaults...",
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatBytes(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

function formatNumber(n: number | undefined | null): string {
  if (n === undefined || n === null) return "";
  return n.toLocaleString("en-CA");
}

function parseNumber(s: string): number | undefined {
  const cleaned = s.replace(/[,$\s]/g, "");
  if (!cleaned) return undefined;
  const n = Number(cleaned);
  return isNaN(n) ? undefined : n;
}

function formatPct(n: number | undefined | null): string {
  if (n === undefined || n === null) return "";
  return (n * 100).toFixed(2);
}

function parsePct(s: string): number | undefined {
  const n = parseNumber(s);
  if (n === undefined) return undefined;
  return n / 100;
}

// ─── Field definitions per tab ──────────────────────────────────────────────

interface FieldDef {
  key: string;
  label: string;
  type: "text" | "number" | "pct" | "select";
  options?: string[];
  placeholder?: string;
}

const TAB_FIELDS: Record<Tab, FieldDef[]> = {
  Property: [
    { key: "propertyName", label: "Property Name", type: "text" },
    { key: "propertyAddress", label: "Address", type: "text" },
    { key: "city", label: "City", type: "text" },
    { key: "propertyType", label: "Property Type", type: "select", options: ["Office", "Retail", "Industrial", "Mixed-Use"] },
    { key: "nraSF", label: "NRA (SF)", type: "number" },
    { key: "landArea", label: "Land Area (acres)", type: "number" },
    { key: "yearBuilt", label: "Year Built", type: "number" },
    { key: "floors", label: "Floors", type: "number" },
    { key: "parking", label: "Parking Stalls", type: "text" },
  ],
  Income: [
    { key: "baseRent", label: "Base Rent (Annual)", type: "number" },
    { key: "recoveryIncome", label: "Recovery Income", type: "number" },
    { key: "parkingIncome", label: "Parking Income", type: "number" },
    { key: "otherIncome", label: "Other Income", type: "number" },
    { key: "vacancyRate", label: "Vacancy Rate", type: "pct" },
    { key: "askingPrice", label: "Asking / Purchase Price", type: "number" },
    { key: "askingCapRate", label: "Asking Cap Rate", type: "pct" },
  ],
  Expenses: [
    { key: "propertyTax", label: "Property Tax", type: "number" },
    { key: "insurance", label: "Insurance", type: "number" },
    { key: "utilities", label: "Utilities", type: "number" },
    { key: "repairsMaint", label: "Repairs & Maintenance", type: "number" },
    { key: "managementPct", label: "Management (% of EGI)", type: "pct" },
    { key: "admin", label: "Administrative", type: "number" },
    { key: "payroll", label: "Payroll", type: "number" },
    { key: "marketing", label: "Marketing", type: "number" },
    { key: "otherExpenses", label: "Other Expenses", type: "number" },
  ],
  CapEx: [
    { key: "capitalReservesPSF", label: "Capital Reserves ($/SF)", type: "number", placeholder: "0.25" },
    { key: "closingCostsPct", label: "Closing Costs %", type: "pct", placeholder: "2.00" },
    { key: "sellingCostsPct", label: "Selling Costs %", type: "pct", placeholder: "2.00" },
  ],
  Financing: [
    { key: "loanAmount", label: "Loan Amount", type: "number", placeholder: "0" },
    { key: "interestRate", label: "Interest Rate", type: "pct", placeholder: "5.00" },
    { key: "amortizationYears", label: "Amortization (years)", type: "number", placeholder: "25" },
    { key: "loanTerm", label: "Loan Term (years)", type: "number", placeholder: "5" },
    { key: "ioYears", label: "I/O Period (years)", type: "number", placeholder: "0" },
    { key: "lenderFeesPct", label: "Lender Fees %", type: "pct", placeholder: "1.00" },
  ],
  Exit: [
    { key: "exitCapRate", label: "Exit Cap Rate", type: "pct", placeholder: "6.50" },
    { key: "analysisPeriod", label: "Analysis Period (years)", type: "number", placeholder: "10" },
    { key: "discountRate", label: "Discount Rate", type: "pct", placeholder: "8.00" },
    { key: "incomeGrowth", label: "Income Growth %/yr", type: "pct", placeholder: "2.00" },
    { key: "expenseGrowth", label: "Expense Growth %/yr", type: "pct", placeholder: "2.00" },
    { key: "propertyTaxGrowth", label: "Property Tax Growth %/yr", type: "pct", placeholder: "3.00" },
    { key: "capexGrowth", label: "CapEx Growth %/yr", type: "pct", placeholder: "2.00" },
  ],
};

// ─── Sub-components ─────────────────────────────────────────────────────────

function ConfidenceDot({ meta, onClick }: { meta?: FieldMeta; onClick?: () => void }) {
  const conf = meta?.confidence || "low";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-2.5 h-2.5 rounded-full shrink-0 ${CONFIDENCE_COLORS[conf]} cursor-pointer hover:ring-2 hover:ring-white/20 transition`}
      title={conf}
    />
  );
}

function SourcePopover({ meta, onClose }: { meta: FieldMeta; onClose: () => void }) {
  return (
    <div className="absolute right-0 top-8 z-50 w-72 bg-gray-800 border border-gray-600 rounded-lg p-3 shadow-xl text-xs">
      <div className="flex justify-between items-center mb-2">
        <span className="font-semibold text-gray-200">Source Details</span>
        <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
      </div>
      <div className="space-y-1.5 text-gray-300">
        <div><span className="text-gray-500">Document:</span> {meta.sourceDoc || "—"}</div>
        <div><span className="text-gray-500">Page:</span> {meta.page || "—"}</div>
        <div><span className="text-gray-500">Confidence:</span> {meta.confidence}</div>
        {meta.reasoning && <div><span className="text-gray-500">Reasoning:</span> {meta.reasoning}</div>}
        {meta.sourceText && <div className="mt-1 p-1.5 bg-gray-900 rounded text-[11px] italic">{meta.sourceText}</div>}
      </div>
    </div>
  );
}

function ReviewField({
  field,
  value,
  meta,
  onChange,
}: {
  field: FieldDef;
  value: string | number | undefined;
  meta?: FieldMeta;
  onChange: (val: string | number | undefined) => void;
}) {
  const [popoverOpen, setPopoverOpen] = useState(false);

  const displayValue = field.type === "pct"
    ? formatPct(value as number)
    : field.type === "number"
      ? (value !== undefined && value !== null ? String(value) : "")
      : (value ?? "");

  const handleChange = (raw: string) => {
    if (field.type === "pct") {
      onChange(parsePct(raw));
    } else if (field.type === "number") {
      onChange(parseNumber(raw));
    } else {
      onChange(raw || undefined);
    }
  };

  return (
    <div className="flex items-center gap-3 py-1.5">
      <label className="w-48 shrink-0 text-sm text-gray-400">{field.label}</label>
      <div className="flex-1 relative">
        {field.type === "select" ? (
          <select
            value={String(value ?? "")}
            onChange={e => onChange(e.target.value || undefined)}
            className="w-full bg-white/[0.04] border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100"
          >
            <option value="">—</option>
            {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <input
            type="text"
            value={displayValue}
            onChange={e => handleChange(e.target.value)}
            placeholder={field.placeholder}
            className={`w-full bg-white/[0.04] border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 ${field.type === "number" || field.type === "pct" ? "text-right" : ""}`}
          />
        )}
      </div>
      <div className="relative">
        <ConfidenceDot meta={meta} onClick={() => setPopoverOpen(!popoverOpen)} />
        {popoverOpen && meta && <SourcePopover meta={meta} onClose={() => setPopoverOpen(false)} />}
      </div>
    </div>
  );
}

// ─── Rent Roll Table ────────────────────────────────────────────────────────

const EMPTY_TENANT: TenantRow = {
  tenantName: "",
  suite: "",
  sf: 0,
  leaseStart: "",
  leaseExpiry: "",
  baseRentPSF: 0,
  baseRentAnnual: 0,
  recoveryType: "Net",
};

function RentRollTable({
  tenants,
  onChange,
}: {
  tenants: TenantRow[];
  onChange: (t: TenantRow[]) => void;
}) {
  const updateRow = (idx: number, field: keyof TenantRow, val: string | number | boolean | undefined) => {
    const updated = [...tenants];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (updated[idx] as any)[field] = val;
    // Auto-calc annual rent
    if (field === "baseRentPSF" || field === "sf") {
      updated[idx].baseRentAnnual = (updated[idx].sf || 0) * (updated[idx].baseRentPSF || 0);
    }
    onChange(updated);
  };

  const addRow = () => onChange([...tenants, { ...EMPTY_TENANT }]);
  const removeRow = (idx: number) => onChange(tenants.filter((_, i) => i !== idx));

  const totalSF = tenants.reduce((s, t) => s + (t.sf || 0), 0);
  const totalRent = tenants.reduce((s, t) => s + (t.baseRentAnnual || 0), 0);
  const wtdAvgRent = totalSF > 0 ? totalRent / totalSF : 0;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-200">Rent Roll</h3>
        <button onClick={addRow} className="text-xs text-accent hover:text-accent/80 transition">+ Add Tenant</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-gray-700">
              <th className="text-left py-1.5 px-1 font-medium">Tenant</th>
              <th className="text-left py-1.5 px-1 font-medium">Suite</th>
              <th className="text-right py-1.5 px-1 font-medium">SF</th>
              <th className="text-left py-1.5 px-1 font-medium">Lease Start</th>
              <th className="text-left py-1.5 px-1 font-medium">Lease Expiry</th>
              <th className="text-right py-1.5 px-1 font-medium">Rent PSF</th>
              <th className="text-right py-1.5 px-1 font-medium">Annual Rent</th>
              <th className="text-left py-1.5 px-1 font-medium">Recovery</th>
              <th className="py-1.5 px-1"></th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t, i) => (
              <tr key={i} className="border-b border-gray-800 hover:bg-white/[0.02]">
                <td className="py-1 px-1"><input className="w-full bg-transparent text-gray-100 text-xs" value={t.tenantName} onChange={e => updateRow(i, "tenantName", e.target.value)} /></td>
                <td className="py-1 px-1"><input className="w-16 bg-transparent text-gray-100 text-xs" value={t.suite || ""} onChange={e => updateRow(i, "suite", e.target.value)} /></td>
                <td className="py-1 px-1"><input className="w-16 bg-transparent text-gray-100 text-xs text-right" type="number" value={t.sf || ""} onChange={e => updateRow(i, "sf", Number(e.target.value) || 0)} /></td>
                <td className="py-1 px-1"><input className="w-24 bg-transparent text-gray-100 text-xs" value={t.leaseStart || ""} onChange={e => updateRow(i, "leaseStart", e.target.value)} /></td>
                <td className="py-1 px-1"><input className="w-24 bg-transparent text-gray-100 text-xs" value={t.leaseExpiry || ""} onChange={e => updateRow(i, "leaseExpiry", e.target.value)} /></td>
                <td className="py-1 px-1"><input className="w-16 bg-transparent text-gray-100 text-xs text-right" type="number" step="0.01" value={t.baseRentPSF || ""} onChange={e => updateRow(i, "baseRentPSF", Number(e.target.value) || 0)} /></td>
                <td className="py-1 px-1 text-right text-gray-300">{formatNumber(t.baseRentAnnual)}</td>
                <td className="py-1 px-1">
                  <select className="bg-transparent text-gray-100 text-xs" value={t.recoveryType || ""} onChange={e => updateRow(i, "recoveryType", e.target.value)}>
                    <option value="Net">Net</option>
                    <option value="Gross">Gross</option>
                    <option value="Semi-Gross">Semi-Gross</option>
                  </select>
                </td>
                <td className="py-1 px-1">
                  <button onClick={() => removeRow(i)} className="text-gray-600 hover:text-red-400 text-xs">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-600 text-gray-300 font-medium">
              <td className="py-1.5 px-1" colSpan={2}>Totals</td>
              <td className="py-1.5 px-1 text-right">{formatNumber(totalSF)}</td>
              <td colSpan={3}></td>
              <td className="py-1.5 px-1 text-right">{formatNumber(totalRent)}</td>
              <td colSpan={2}></td>
            </tr>
            <tr className="text-gray-400 text-[11px]">
              <td className="py-0.5 px-1" colSpan={2}>Wtd Avg Rent PSF</td>
              <td className="py-0.5 px-1 text-right" colSpan={5}>${wtdAvgRent.toFixed(2)}</td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Conflicts Section ──────────────────────────────────────────────────────

function ConflictsSection({
  conflicts,
  inputs,
  onResolve,
}: {
  conflicts: ConflictEntry[];
  inputs: Inputs;
  onResolve: (field: string, value: string | number) => void;
}) {
  if (!conflicts.length) return null;
  return (
    <div className="mt-4 bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-yellow-400 mb-3">⚠ Conflicts ({conflicts.length})</h3>
      <div className="space-y-3">
        {conflicts.map((c, i) => (
          <div key={i} className="text-sm">
            <div className="text-gray-300 font-medium mb-1">{c.field}</div>
            <div className="flex items-center gap-2 flex-wrap">
              {c.values.map((v, j) => (
                <button
                  key={j}
                  onClick={() => onResolve(c.field, v.value)}
                  className={`px-2 py-1 rounded text-xs transition ${
                    inputs[c.field] === v.value
                      ? "bg-accent/20 text-accent border border-accent/40"
                      : "bg-white/[0.04] text-gray-400 border border-gray-700 hover:text-gray-200"
                  }`}
                >
                  {String(v.value)} <span className="text-gray-500 ml-1">({v.label})</span>
                </button>
              ))}
            </div>
            <div className="text-[11px] text-gray-500 mt-1">{c.resolution}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Page Component
// ═══════════════════════════════════════════════════════════════════════════

type PageTab = "analysis" | "packages";

interface UWPackage {
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

export default function UnderwritePage() {
  // --- Page-level tab ---
  const [pageTab, setPageTab] = useState<PageTab>("analysis");
  const [packages, setPackages] = useState<UWPackage[]>([]);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [packagesLoaded, setPackagesLoaded] = useState(false);

  // --- Shared state ---
  const [view, setView] = useState<ViewState>("upload");
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [currentId, setCurrentId] = useState<number | null>(null);

  // --- Upload state ---
  const [mode, setMode] = useState<AnalysisMode>("quick");
  const [assetClass, setAssetClass] = useState("office_retail_industrial");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [extractStatus, setExtractStatus] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // --- Review state ---
  const [inputs, setInputs] = useState<Inputs>({});
  const [fieldMeta, setFieldMeta] = useState<Record<string, FieldMeta>>({});
  const [conflicts, setConflicts] = useState<ConflictEntry[]>([]);
  const [auditTrail, setAuditTrail] = useState<AuditEntry[]>([]);
  const [analysisName, setAnalysisName] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("Property");
  const [generating, setGenerating] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Complete state ---
  const [downloading, setDownloading] = useState(false);

  // Load analyses list
  useEffect(() => {
    fetch("/api/underwrite").then(r => r.json()).then(setAnalyses).catch(() => {});
  }, []);

  // ─── Upload handlers ────────────────────────────────────────────────────

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    setFiles(prev => {
      const combined = [...prev];
      for (const f of arr) {
        if (combined.length >= MAX_FILES) break;
        if (f.size > MAX_SIZE) continue;
        if (combined.some(e => e.name === f.name)) continue;
        combined.push({ name: f.name, size: f.size, uploadedAt: "", file: f });
      }
      return combined;
    });
  }, []);

  const removeFile = (name: string) => setFiles(prev => prev.filter(f => f.name !== name));

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  async function handleExtract() {
    if (!files.length) return;
    setExtracting(true);

    // Cycle status messages
    let msgIdx = 0;
    setExtractStatus(EXTRACTION_STATUS_MESSAGES[0]);
    const interval = setInterval(() => {
      msgIdx = Math.min(msgIdx + 1, EXTRACTION_STATUS_MESSAGES.length - 1);
      setExtractStatus(EXTRACTION_STATUS_MESSAGES[msgIdx]);
    }, 3000);

    try {
      // 1. Create analysis
      const res = await fetch("/api/underwrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: files[0].name.replace(/\.[^.]+$/, ""), assetClass: mode === "quick" ? "quick" : assetClass, mode }),
      });
      const analysis = await res.json();
      if (!res.ok) throw new Error(analysis.error);

      // 2. Upload files (5 min timeout per file for large PDFs over tunnel)
      for (const f of files) {
        if (!f.file) continue;
        const fd = new FormData();
        fd.append("file", f.file);
        const uploadCtrl = new AbortController();
        const uploadTimeout = setTimeout(() => uploadCtrl.abort(), 300000);
        try {
          const uploadRes = await fetch(`/api/underwrite/${analysis.id}/upload`, { method: "POST", body: fd, signal: uploadCtrl.signal });
          if (!uploadRes.ok) {
            const err = await uploadRes.json().catch(() => ({ error: "Upload failed" }));
            throw new Error(err.error || `Upload failed (${uploadRes.status})`);
          }
        } finally {
          clearTimeout(uploadTimeout);
        }
      }

      // 3. Extract (5 min timeout — AI extraction can be slow for large docs)
      const extractCtrl = new AbortController();
      const extractTimeout = setTimeout(() => extractCtrl.abort(), 300000);
      let extractRes;
      try {
        extractRes = await fetch(`/api/underwrite/${analysis.id}/extract`, { method: "POST", signal: extractCtrl.signal });
      } finally {
        clearTimeout(extractTimeout);
      }
      const extractData = await extractRes.json();
      if (!extractRes.ok) throw new Error(extractData.error);

      // 4. Transition to review
      setCurrentId(analysis.id);
      setAnalysisName(analysis.name);
      setInputs(extractData.inputs || {});
      setAuditTrail(extractData.auditTrail || []);
      setConflicts(extractData.conflicts || []);
      buildFieldMeta(extractData.auditTrail || []);
      setView("review");

      // Refresh list
      const list = await fetch("/api/underwrite").then(r => r.json());
      setAnalyses(list);
      setFiles([]);
    } catch (err) {
      console.error(err);
      setExtractStatus(`Error: ${(err as Error).message}`);
      setTimeout(() => setExtracting(false), 3000);
      return;
    } finally {
      clearInterval(interval);
      setExtracting(false);
    }
  }

  // ─── Review handlers ───────────────────────────────────────────────────

  function buildFieldMeta(trail: AuditEntry[]) {
    const meta: Record<string, FieldMeta> = {};
    for (const entry of trail) {
      meta[entry.field] = {
        confidence: entry.confidence,
        sourceDoc: entry.sourceDoc,
        page: entry.page,
        reasoning: entry.reasoning,
        sourceText: entry.sourceText,
      };
    }
    setFieldMeta(meta);
  }

  function updateField(key: string, value: string | number | boolean | undefined) {
    setInputs(prev => ({ ...prev, [key]: value }));
    setFieldMeta(prev => ({
      ...prev,
      [key]: { ...prev[key], confidence: "manual" as Confidence },
    }));
    debouncedSave();
  }

  function debouncedSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (!currentId) return;
      fetch(`/api/underwrite/${currentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: JSON.stringify(inputs) }),
      }).catch(console.error);
    }, 1500);
  }

  async function openAnalysis(a: Analysis) {
    setCurrentId(a.id);
    setAnalysisName(a.name);
    setMode((a.mode as AnalysisMode) || (a.assetClass === "quick" ? "quick" : "institutional"));

    if (a.status === "complete") {
      const parsed = a.inputs ? JSON.parse(a.inputs) : {};
      setInputs(parsed);
      setView("complete");
      return;
    }

    // Fetch latest
    const res = await fetch(`/api/underwrite/${a.id}`);
    const data = await res.json();
    const parsed = data.inputs ? JSON.parse(data.inputs) : {};
    setInputs(parsed);
    setConflicts([]);
    setAuditTrail([]);
    setFieldMeta({});
    setMode(data.mode || (data.assetClass === "quick" ? "quick" : "institutional"));
    setView(data.status === "extracted" || data.status === "reviewed" ? "review" : "upload");
  }

  // ─── Summary stats ──────────────────────────────────────────────────────

  const summaryStats = useMemo(() => {
    const allFields = TABS.flatMap(t => TAB_FIELDS[t]);
    let extracted = 0, needReview = 0, notFound = 0;
    for (const f of allFields) {
      const m = fieldMeta[f.key];
      const hasVal = inputs[f.key] !== undefined && inputs[f.key] !== null && inputs[f.key] !== "";
      if (!m && !hasVal) { notFound++; continue; }
      if (m?.confidence === "low" || (!hasVal && m)) { notFound++; continue; }
      if (m?.confidence === "medium") { needReview++; extracted++; continue; }
      if (hasVal) extracted++;
    }
    return { total: allFields.length, extracted, needReview, notFound, docs: auditTrail.length > 0 ? new Set(auditTrail.map(a => a.sourceDoc)).size : 0 };
  }, [inputs, fieldMeta, auditTrail]);

  const redCount = useMemo(() => {
    return TABS.flatMap(t => TAB_FIELDS[t]).filter(f => {
      const m = fieldMeta[f.key];
      const hasVal = inputs[f.key] !== undefined && inputs[f.key] !== null && inputs[f.key] !== "";
      return !hasVal && (!m || m.confidence === "low");
    }).length;
  }, [inputs, fieldMeta]);

  // ─── Generate ───────────────────────────────────────────────────────────

  async function handleGenerate() {
    if (!currentId) return;
    setGenerating(true);
    try {
      // Save latest
      await fetch(`/api/underwrite/${currentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: JSON.stringify(inputs), status: "reviewed" }),
      });

      const res = await fetch(`/api/underwrite/${currentId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auditTrail }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      setView("complete");
      const list = await fetch("/api/underwrite").then(r => r.json());
      setAnalyses(list);
    } catch (err) {
      console.error(err);
      alert(`Generation failed: ${(err as Error).message}`);
    } finally {
      setGenerating(false);
    }
  }

  // ─── Download ───────────────────────────────────────────────────────────

  async function handleDownload() {
    if (!currentId) return;
    setDownloading(true);
    try {
      const res = await fetch(`/api/underwrite/${currentId}/download`);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${analysisName.replace(/[^a-zA-Z0-9_-]/g, "_")}_underwriting.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    } finally {
      setDownloading(false);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PACKAGES
  // ═══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (pageTab === "packages" && !packagesLoaded) {
      setPackagesLoading(true);
      fetch("/api/underwriting/packages")
        .then(r => r.json())
        .then(d => { setPackages(d); setPackagesLoaded(true); })
        .catch(() => {})
        .finally(() => setPackagesLoading(false));
    }
  }, [pageTab, packagesLoaded]);

  const PAGE_TAB_BAR = (
    <div className="flex gap-1 bg-card border border-card-border rounded-lg p-1 w-fit mb-6">
      <button
        onClick={() => setPageTab("analysis")}
        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
          pageTab === "analysis" ? "bg-accent text-white shadow-sm" : "text-muted hover:text-foreground"
        }`}
      >
        Analysis
      </button>
      <button
        onClick={() => setPageTab("packages")}
        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
          pageTab === "packages" ? "bg-accent text-white shadow-sm" : "text-muted hover:text-foreground"
        }`}
      >
        Packages
      </button>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── PACKAGES TAB ───────────────────────────────────────────────────────

  if (pageTab === "packages") {
    const PKG_STATUS_COLORS: Record<string, string> = {
      collecting: "bg-blue-500/15 text-blue-400",
      ready: "bg-yellow-500/15 text-yellow-400",
      analyzed: "bg-emerald-500/15 text-emerald-400",
    };

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Underwriter</h1>
          <p className="text-sm text-muted mt-1">AI-Powered Financial Modeling</p>
        </div>
        {PAGE_TAB_BAR}

        {packagesLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-muted">Loading packages...</div>
          </div>
        ) : packages.length === 0 ? (
          <div className="bg-card border border-card-border rounded-xl p-8 text-center">
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
                  {packages.map((pkg, index) => {
                    const parts = [];
                    if (pkg.successfulDocs > 0) parts.push(`${pkg.successfulDocs} ✓`);
                    if (pkg.partialDocs > 0) parts.push(`${pkg.partialDocs} ⚠`);
                    if (pkg.failedDocs > 0) parts.push(`${pkg.failedDocs} ✗`);
                    return (
                      <tr key={pkg.id} className={`hover:bg-white/[0.02] transition-colors ${index !== packages.length - 1 ? "border-b border-card-border" : ""}`}>
                        <td className="py-3 px-4">
                          <Link href={`/underwriting/packages/${pkg.id}`} className="text-foreground hover:text-accent transition font-medium">
                            {pkg.propertyAddress}
                          </Link>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${PKG_STATUS_COLORS[pkg.status] || "bg-gray-500/15 text-gray-400"}`}>
                            {pkg.status.charAt(0).toUpperCase() + pkg.status.slice(1)}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {pkg.totalDocs === 0 ? (
                            <span className="text-xs text-muted">No documents</span>
                          ) : (
                            <span className="text-xs text-muted">{pkg.totalDocs} docs: {parts.join(", ")}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-sm text-muted">
                          {new Date(pkg.createdAt).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}
                        </td>
                        <td className="py-3 px-4 text-sm text-muted">
                          {new Date(pkg.updatedAt).toLocaleDateString("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── UPLOAD VIEW ────────────────────────────────────────────────────────

  if (view === "upload") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Underwriter</h1>
          <p className="text-sm text-muted mt-1">AI-Powered Financial Modeling</p>
        </div>
        {PAGE_TAB_BAR}

        {/* Mode Toggle */}
        <div className="flex gap-1 bg-card border border-card-border rounded-lg p-1 w-fit">
          <button
            onClick={() => setMode("quick")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              mode === "quick" ? "bg-accent text-white shadow-sm" : "text-muted hover:text-foreground"
            }`}
          >
            Quick Mode
          </button>
          <button
            onClick={() => setMode("institutional")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              mode === "institutional" ? "bg-accent text-white shadow-sm" : "text-muted hover:text-foreground"
            }`}
          >
            Institutional Mode
          </button>
        </div>
        <p className="text-xs text-muted -mt-3">
          {mode === "quick"
            ? "Upload leases and documents. We'll build a rent roll and income summary."
            : "Full institutional-grade acquisition model with DCF analysis."}
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Asset Class (institutional only) */}
          {mode === "institutional" && (
          <div className="lg:col-span-3">
            <div className="bg-card border border-card-border rounded-xl p-5">
              <h2 className="text-sm font-semibold text-foreground mb-3">Asset Class</h2>
              <div className="space-y-2">
                {ASSET_CLASSES.map(ac => (
                  <label
                    key={ac.value}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all text-sm ${
                      !ac.enabled ? "opacity-40 cursor-not-allowed" :
                      assetClass === ac.value ? "bg-accent/12 text-accent border border-accent/30" : "text-muted hover:text-foreground hover:bg-white/[0.04] border border-transparent"
                    }`}
                  >
                    <input
                      type="radio"
                      name="assetClass"
                      value={ac.value}
                      checked={assetClass === ac.value}
                      disabled={!ac.enabled}
                      onChange={() => setAssetClass(ac.value)}
                      className="accent-accent"
                    />
                    <span>{ac.label}</span>
                    {!ac.enabled && <span className="text-[10px] ml-auto opacity-60">Soon</span>}
                  </label>
                ))}
              </div>
            </div>
          </div>
          )}

          {/* Upload */}
          <div className={mode === "quick" ? "lg:col-span-8" : "lg:col-span-5"}>
            <div className="bg-card border border-card-border rounded-xl p-5">
              <h2 className="text-sm font-semibold text-foreground mb-3">Documents</h2>
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                  dragOver ? "border-accent bg-accent/5" : "border-card-border hover:border-muted/40"
                }`}
              >
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept={ACCEPTED_EXTENSIONS}
                  className="hidden"
                  onChange={e => e.target.files && addFiles(e.target.files)}
                />
                <svg className="w-10 h-10 mx-auto text-muted/40 mb-3" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.338-2.338 5.25 5.25 0 013.553 6.96A4.125 4.125 0 0118 19.5H6.75z" />
                </svg>
                <p className="text-sm text-muted">Drag & drop or <span className="text-accent">browse</span></p>
                <p className="text-xs text-muted/60 mt-1">PDF, Excel, CSV, Images · Max 50MB · Up to 10 files</p>
              </div>

              {files.length > 0 && (
                <div className="mt-4 space-y-2">
                  {files.map(f => (
                    <div key={f.name} className="flex items-center justify-between px-3 py-2 bg-white/[0.02] border border-card-border rounded-lg">
                      <div className="flex items-center gap-2 min-w-0">
                        <svg className="w-4 h-4 text-muted shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                        </svg>
                        <span className="text-sm text-foreground truncate">{f.name}</span>
                        <span className="text-xs text-muted shrink-0">{formatBytes(f.size)}</span>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); removeFile(f.name); }} className="text-muted hover:text-red-400 transition ml-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={handleExtract}
                disabled={!files.length || extracting}
                className={`mt-4 w-full py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  files.length && !extracting
                    ? "bg-accent text-white hover:bg-accent/90"
                    : "bg-white/[0.06] text-muted/40 cursor-not-allowed"
                }`}
              >
                {extracting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40 20" /></svg>
                    {extractStatus}
                  </span>
                ) : "Extract & Review →"}
              </button>
            </div>
          </div>

          {/* History */}
          <div className="lg:col-span-4">
            <div className="bg-card border border-card-border rounded-xl p-5">
              <h2 className="text-sm font-semibold text-foreground mb-3">Recent Analyses</h2>
              {analyses.length === 0 ? (
                <p className="text-sm text-muted/60">No analyses yet</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {analyses.map(a => (
                    <div
                      key={a.id}
                      onClick={() => openAnalysis(a)}
                      className="px-3 py-2.5 bg-white/[0.02] border border-card-border rounded-lg hover:bg-white/[0.04] cursor-pointer transition"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-foreground font-medium truncate">{a.name}</span>
                        <div className="flex items-center gap-1.5">
                          {a.uploadedAt ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-emerald-500/15 text-emerald-400">✓ Feedback</span>
                          ) : (a.status === "complete" || a.status === "used_as_is") ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-amber-500/15 text-amber-400">⟳ Awaiting feedback</span>
                          ) : null}
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[a.status] || "bg-white/10 text-muted"}`}>
                            {a.status === "used_as_is" ? "used as-is" : a.status}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          (a.mode || (a.assetClass === "quick" ? "quick" : "institutional")) === "quick"
                            ? "bg-blue-500/15 text-blue-400"
                            : "bg-purple-500/15 text-purple-400"
                        }`}>
                          {(a.mode || (a.assetClass === "quick" ? "quick" : "institutional")) === "quick" ? "Quick" : "Institutional"}
                        </span>
                        <span className="text-[11px] text-muted/40">·</span>
                        <span className="text-[11px] text-muted/60">{formatDate(a.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── REVIEW VIEW ────────────────────────────────────────────────────────

  if (view === "review") {
    // Shared header for both modes
    const reviewHeader = (
      <div className="flex items-center gap-4">
        <button
          onClick={() => { setView("upload"); setCurrentId(null); }}
          className="text-sm text-muted hover:text-foreground transition flex items-center gap-1"
        >
          ← Back
        </button>
        <input
          type="text"
          value={analysisName}
          onChange={e => {
            setAnalysisName(e.target.value);
            if (currentId) {
              fetch(`/api/underwrite/${currentId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: e.target.value }),
              }).catch(() => {});
            }
          }}
          className="text-xl font-bold text-foreground bg-transparent border-b border-transparent hover:border-gray-600 focus:border-accent transition px-1"
        />
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
          mode === "quick" ? "bg-blue-500/15 text-blue-400" : "bg-accent/15 text-accent"
        }`}>
          {mode === "quick" ? "Quick" : assetClass.replace(/_/g, " ")}
        </span>
      </div>
    );

    // ─── QUICK MODE REVIEW ────────────────────────────────────────────────
    if (mode === "quick") {
      const tenants: TenantRow[] = inputs.tenants || [];
      const totalSF = tenants.reduce((s: number, t: TenantRow) => s + (t.sf || 0), 0);
      const totalRent = tenants.reduce((s: number, t: TenantRow) => s + (t.baseRentAnnual || 0), 0);
      const wtdAvgRent = totalSF > 0 ? totalRent / totalSF : 0;
      const totalRecovery = tenants.reduce((s: number, t: TenantRow) => s + ((t.recoveryPSF || 0) * (t.sf || 0)), 0);

      // WALT calculation
      const now = Date.now();
      let waltNum = 0, waltDen = 0;
      tenants.forEach((t: TenantRow) => {
        if (t.leaseExpiry && t.baseRentAnnual) {
          const expDate = new Date(t.leaseExpiry);
          if (!isNaN(expDate.getTime())) {
            const yrs = Math.max(0, (expDate.getTime() - now) / (365.25 * 24 * 60 * 60 * 1000));
            waltNum += yrs * t.baseRentAnnual;
            waltDen += t.baseRentAnnual;
          }
        }
      });
      const walt = waltDen > 0 ? waltNum / waltDen : 0;
      const occupancy = totalSF > 0 ? 100 : 0; // all listed tenants = occupied

      return (
        <div className="space-y-4">
          {reviewHeader}

          {/* Section 1: Property (compact row) */}
          <div className="bg-card border border-card-border rounded-xl p-4">
            <h3 className="text-xs font-semibold text-muted mb-2 uppercase tracking-wide">Property</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-[11px] text-gray-500">Property Name</label>
                <input
                  type="text"
                  value={inputs.propertyName || ""}
                  onChange={e => updateField("propertyName", e.target.value)}
                  className="w-full bg-white/[0.04] border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100"
                  placeholder="Property name"
                />
              </div>
              <div>
                <label className="text-[11px] text-gray-500">Address / City</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inputs.propertyAddress || ""}
                    onChange={e => updateField("propertyAddress", e.target.value)}
                    className="flex-1 min-w-0 bg-white/[0.04] border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100"
                    placeholder="Address"
                  />
                  <input
                    type="text"
                    value={inputs.city || ""}
                    onChange={e => updateField("city", e.target.value)}
                    className="w-28 shrink-0 bg-white/[0.04] border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100"
                    placeholder="City"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] text-gray-500">Property Type</label>
                <select
                  value={inputs.propertyType || ""}
                  onChange={e => updateField("propertyType", e.target.value)}
                  className="w-full bg-white/[0.04] border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100"
                >
                  <option value="">—</option>
                  <option value="Office">Office</option>
                  <option value="Retail">Retail</option>
                  <option value="Industrial">Industrial</option>
                  <option value="Mixed-Use">Mixed-Use</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Rent Roll */}
          <div className="bg-card border border-card-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">Rent Roll</h3>
              <button
                onClick={() => {
                  const updated = [...tenants, { tenantName: "", suite: "", sf: 0, leaseStart: "", leaseExpiry: "", baseRentPSF: 0, baseRentAnnual: 0, recoveryType: "Net" } as TenantRow];
                  setInputs(prev => ({ ...prev, tenants: updated }));
                  debouncedSave();
                }}
                className="text-xs text-accent hover:text-accent/80 transition"
              >+ Add Tenant</button>
            </div>
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-xs" style={{ minWidth: '720px' }}>
                <thead>
                  <tr className="text-gray-500 border-b border-gray-700">
                    <th className="text-left py-1.5 px-1.5 font-medium" style={{ minWidth: '120px' }}>Tenant</th>
                    <th className="text-left py-1.5 px-1.5 font-medium" style={{ width: '60px' }}>Suite</th>
                    <th className="text-right py-1.5 px-1.5 font-medium" style={{ width: '70px' }}>SF</th>
                    <th className="text-left py-1.5 px-1.5 font-medium" style={{ width: '95px' }}>Start</th>
                    <th className="text-left py-1.5 px-1.5 font-medium" style={{ width: '95px' }}>Expiry</th>
                    <th className="text-right py-1.5 px-1.5 font-medium" style={{ width: '70px' }}>$/SF</th>
                    <th className="text-right py-1.5 px-1.5 font-medium" style={{ width: '85px' }}>Annual</th>
                    <th className="text-left py-1.5 px-1.5 font-medium" style={{ width: '75px' }}>Recovery</th>
                    <th className="text-right py-1.5 px-1.5 font-medium" style={{ width: '60px' }}>Rec PSF</th>
                    <th className="py-1.5 px-1" style={{ width: '28px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((t: TenantRow, i: number) => {
                    const tMeta = fieldMeta[`tenant_${i}`];
                    return (
                      <tr key={i} className="border-b border-gray-800 hover:bg-white/[0.02]">
                        <td className="py-1 px-1.5">
                          <div className="flex items-center gap-1">
                            {tMeta && <ConfidenceDot meta={tMeta} />}
                            <input className="w-full min-w-0 bg-transparent text-gray-100 text-xs" value={t.tenantName} onChange={e => {
                              const updated = [...tenants]; updated[i] = { ...updated[i], tenantName: e.target.value };
                              setInputs(prev => ({ ...prev, tenants: updated })); debouncedSave();
                            }} />
                          </div>
                        </td>
                        <td className="py-1 px-1.5"><input className="w-full bg-transparent text-gray-100 text-xs" value={t.suite || ""} onChange={e => {
                          const updated = [...tenants]; updated[i] = { ...updated[i], suite: e.target.value };
                          setInputs(prev => ({ ...prev, tenants: updated })); debouncedSave();
                        }} /></td>
                        <td className="py-1 px-1.5"><input className="w-full bg-transparent text-gray-100 text-xs text-right" type="number" value={t.sf || ""} onChange={e => {
                          const sf = Number(e.target.value) || 0;
                          const updated = [...tenants]; updated[i] = { ...updated[i], sf, baseRentAnnual: sf * (updated[i].baseRentPSF || 0) };
                          setInputs(prev => ({ ...prev, tenants: updated })); debouncedSave();
                        }} /></td>
                        <td className="py-1 px-1.5"><input className="w-full bg-transparent text-gray-100 text-xs" value={t.leaseStart || ""} onChange={e => {
                          const updated = [...tenants]; updated[i] = { ...updated[i], leaseStart: e.target.value };
                          setInputs(prev => ({ ...prev, tenants: updated })); debouncedSave();
                        }} /></td>
                        <td className="py-1 px-1.5"><input className="w-full bg-transparent text-gray-100 text-xs" value={t.leaseExpiry || ""} onChange={e => {
                          const updated = [...tenants]; updated[i] = { ...updated[i], leaseExpiry: e.target.value };
                          setInputs(prev => ({ ...prev, tenants: updated })); debouncedSave();
                        }} /></td>
                        <td className="py-1 px-1.5"><input className="w-full bg-transparent text-gray-100 text-xs text-right" type="number" step="0.01" value={t.baseRentPSF || ""} onChange={e => {
                          const psf = Number(e.target.value) || 0;
                          const updated = [...tenants]; updated[i] = { ...updated[i], baseRentPSF: psf, baseRentAnnual: (updated[i].sf || 0) * psf };
                          setInputs(prev => ({ ...prev, tenants: updated })); debouncedSave();
                        }} /></td>
                        <td className="py-1 px-1.5 text-right text-gray-300 whitespace-nowrap">{formatNumber(t.baseRentAnnual)}</td>
                        <td className="py-1 px-1.5">
                          <select className="w-full bg-transparent text-gray-100 text-xs" value={t.recoveryType || ""} onChange={e => {
                            const updated = [...tenants]; updated[i] = { ...updated[i], recoveryType: e.target.value };
                            setInputs(prev => ({ ...prev, tenants: updated })); debouncedSave();
                          }}>
                            <option value="Net">Net</option>
                            <option value="Gross">Gross</option>
                            <option value="Semi-Gross">Semi-Gross</option>
                          </select>
                        </td>
                        <td className="py-1 px-1.5"><input className="w-full bg-transparent text-gray-100 text-xs text-right" type="number" step="0.01" value={t.recoveryPSF || ""} onChange={e => {
                          const updated = [...tenants]; updated[i] = { ...updated[i], recoveryPSF: Number(e.target.value) || 0 };
                          setInputs(prev => ({ ...prev, tenants: updated })); debouncedSave();
                        }} /></td>
                        <td className="py-1 px-1">
                          <button onClick={() => {
                            const updated = tenants.filter((_: TenantRow, j: number) => j !== i);
                            setInputs(prev => ({ ...prev, tenants: updated })); debouncedSave();
                          }} className="text-gray-600 hover:text-red-400 text-xs">✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-600 text-gray-300 font-medium text-xs">
                    <td className="py-2 px-1.5" colSpan={2}>Summary</td>
                    <td className="py-2 px-1.5 text-right whitespace-nowrap">{formatNumber(totalSF)} SF</td>
                    <td colSpan={3} className="py-2 px-1.5 text-center text-gray-500 whitespace-nowrap">
                      {occupancy}% occ · ${wtdAvgRent.toFixed(2)}/SF · {walt.toFixed(1)}yr WALT
                    </td>
                    <td className="py-2 px-1.5 text-right whitespace-nowrap">${formatNumber(totalRent)}</td>
                    <td colSpan={3} className="py-2 px-1.5 text-right text-gray-500 whitespace-nowrap">
                      Rec: ${formatNumber(totalRecovery)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Section 3: Quick Assumptions */}
          <div className="bg-card border border-card-border rounded-xl p-4">
            <h3 className="text-xs font-semibold text-muted mb-3 uppercase tracking-wide">Assumptions</h3>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 max-w-2xl">
              {[
                { key: "operatingCostsPSF", label: "Operating Costs PSF", placeholder: "0.00", type: "number" },
                { key: "capitalReservesPSF", label: "Capital Reserves PSF", placeholder: "0.25", type: "number" },
                { key: "propertyTaxPSF", label: "Property Tax PSF", placeholder: "0.00", type: "number" },
                { key: "vacancyRate", label: "Vacancy Rate (%)", placeholder: "5", type: "pct" },
                { key: "managementPct", label: "Management Fee (%)", placeholder: "3", type: "pct" },
                { key: "capRateLow", label: "Cap Rate Low (%)", placeholder: "5.50", type: "pct" },
                { key: "capRateMid", label: "Cap Rate Mid (%)", placeholder: "6.00", type: "pct" },
                { key: "capRateHigh", label: "Cap Rate High (%)", placeholder: "6.50", type: "pct" },
                { key: "purchasePrice", label: "Purchase Price ($)", placeholder: "Optional", type: "number" },
              ].map(f => (
                <div key={f.key} className="flex items-center gap-2 py-1">
                  <label className="w-40 shrink-0 text-xs text-gray-400">{f.label}</label>
                  <input
                    type="text"
                    value={f.type === "pct" ? (inputs[f.key] !== undefined && inputs[f.key] !== null ? (inputs[f.key] * 100).toFixed(2) : "") : (inputs[f.key] ?? "")}
                    onChange={e => {
                      const raw = e.target.value.replace(/[,$\s]/g, "");
                      if (!raw) { updateField(f.key, undefined); return; }
                      const n = Number(raw);
                      if (isNaN(n)) return;
                      updateField(f.key, f.type === "pct" ? n / 100 : n);
                    }}
                    placeholder={f.placeholder}
                    className="w-28 bg-white/[0.04] border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 text-right"
                  />
                </div>
              ))}
              <div className="flex items-center gap-2 py-1">
                <label className="w-40 shrink-0 text-xs text-gray-400">Tax in Operating Costs?</label>
                <input
                  type="checkbox"
                  checked={inputs.propertyTaxIncludedInOpex || false}
                  onChange={e => updateField("propertyTaxIncludedInOpex", e.target.checked)}
                  className="accent-accent"
                />
              </div>
            </div>
          </div>

          {/* Section 4: Notes */}
          <div className="bg-card border border-card-border rounded-xl p-4">
            <h3 className="text-xs font-semibold text-muted mb-2 uppercase tracking-wide">Notes</h3>
            <textarea
              value={inputs.notes || ""}
              onChange={e => updateField("notes", e.target.value)}
              rows={3}
              className="w-full bg-white/[0.04] border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 resize-none"
              placeholder="Free-form notes (appears on output)..."
            />
          </div>

          {/* Generate */}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-6 py-2.5 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? (
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40 20" /></svg>
                Generating...
              </span>
            ) : "Generate Quick Analysis ↓"}
          </button>
        </div>
      );
    }

    // ─── INSTITUTIONAL MODE REVIEW ────────────────────────────────────────
    const currentFields = TAB_FIELDS[activeTab];

    return (
      <div className="space-y-4">
        {reviewHeader}

        {/* Summary bar */}
        <div className="bg-card border border-card-border rounded-xl px-5 py-3 flex items-center gap-6 text-xs text-gray-400">
          <span>📄 {summaryStats.docs} documents</span>
          <span className="text-gray-600">|</span>
          <span>✅ {summaryStats.extracted} fields extracted</span>
          <span className="text-gray-600">|</span>
          <span className="text-yellow-400">⚠ {summaryStats.needReview} need review</span>
          <span className="text-gray-600">|</span>
          <span className="text-red-400">🔴 {summaryStats.notFound} not found</span>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-gray-700">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm transition ${
                activeTab === tab
                  ? "text-white border-b-2 border-white font-medium"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="bg-card border border-card-border rounded-xl p-5">
          <div className="max-w-2xl">
            {currentFields.map(field => (
              <ReviewField
                key={field.key}
                field={field}
                value={inputs[field.key]}
                meta={fieldMeta[field.key]}
                onChange={val => updateField(field.key, val)}
              />
            ))}
          </div>
        </div>

        {/* Conflicts */}
        <ConflictsSection
          conflicts={conflicts}
          inputs={inputs}
          onResolve={(field, value) => updateField(field, value)}
        />

        {/* Rent Roll */}
        {(inputs.tenants || activeTab === "Income") && (
          <div className="bg-card border border-card-border rounded-xl p-5">
            <RentRollTable
              tenants={inputs.tenants || []}
              onChange={t => {
                setInputs(prev => ({ ...prev, tenants: t }));
                debouncedSave();
              }}
            />
          </div>
        )}

        {/* Generate button */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-6 py-2.5 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? (
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40 20" /></svg>
                Generating...
              </span>
            ) : "Generate Excel Model ↓"}
          </button>
          {redCount > 0 && (
            <span className="text-xs text-red-400">{redCount} fields missing (defaults will be used)</span>
          )}
        </div>
      </div>
    );
  }

  // ─── COMPLETE VIEW ──────────────────────────────────────────────────────

  return <CompleteView
    analysisName={analysisName}
    currentId={currentId}
    downloading={downloading}
    handleDownload={handleDownload}
    setView={setView}
    setCurrentId={setCurrentId}
    setInputs={setInputs}
    setFieldMeta={setFieldMeta}
    setConflicts={setConflicts}
    setAuditTrail={setAuditTrail}
  />;
}

// ─── COMPLETE VIEW COMPONENT ──────────────────────────────────────────────

function CompleteView({
  analysisName,
  currentId,
  downloading,
  handleDownload,
  setView,
  setCurrentId,
  setInputs,
  setFieldMeta,
  setConflicts,
  setAuditTrail,
}: {
  analysisName: string;
  currentId: number | null;
  downloading: boolean;
  handleDownload: () => void;
  setView: (v: ViewState) => void;
  setCurrentId: (id: number | null) => void;
  setInputs: (i: Inputs) => void;
  setFieldMeta: (m: Record<string, FieldMeta>) => void;
  setConflicts: (c: ConflictEntry[]) => void;
  setAuditTrail: (a: AuditEntry[]) => void;
}) {
  const [feedbackFile, setFeedbackFile] = useState<File | null>(null);
  const [feedbackContext, setFeedbackContext] = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [diffSummary, setDiffSummary] = useState<string | null>(null);
  const [diffExpanded, setDiffExpanded] = useState(false);
  const [markingAsIs, setMarkingAsIs] = useState(false);
  const feedbackInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmitFeedback() {
    if (!currentId || (!feedbackContext.trim() && !feedbackFile)) return;
    setSubmittingFeedback(true);
    try {
      const fd = new FormData();
      if (feedbackFile) fd.append("file", feedbackFile);
      if (feedbackContext.trim()) fd.append("context", feedbackContext.trim());

      const res = await fetch(`/api/underwrite/${currentId}/upload-final`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setFeedbackSubmitted(true);
      setDiffSummary(data.diffSummary);

      // Track
      fetch("/api/analytics/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "underwriting_feedback", category: "underwriting", detail: { analysisId: currentId } }),
      }).catch(() => {});
    } catch (err) {
      alert(`Failed: ${(err as Error).message}`);
    } finally {
      setSubmittingFeedback(false);
    }
  }

  async function handleUsedAsIs() {
    if (!currentId) return;
    setMarkingAsIs(true);
    try {
      const res = await fetch(`/api/underwrite/${currentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "used_as_is" }),
      });
      if (!res.ok) throw new Error("Failed");
      setFeedbackSubmitted(true);
      setDiffSummary(null);

      fetch("/api/analytics/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "underwriting_used_as_is", category: "underwriting", detail: { analysisId: currentId } }),
      }).catch(() => {});
    } catch (err) {
      alert(`Failed: ${(err as Error).message}`);
    } finally {
      setMarkingAsIs(false);
    }
  }

  // Parse diff summary for display
  const parsedDiff = useMemo(() => {
    if (!diffSummary) return null;
    try {
      const match = diffSummary.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
    } catch {}
    return null;
  }, [diffSummary]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
      <div className="bg-card border border-card-border rounded-xl p-8 max-w-md text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto">
          <svg className="w-7 h-7 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-foreground">Model Generated</h2>
        <p className="text-sm text-muted">{analysisName || "Your acquisition model"} is ready for download.</p>
        <div className="space-y-2 pt-2">
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="w-full py-2.5 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent/90 transition disabled:opacity-50"
          >
            {downloading ? "Downloading..." : "Download Excel Model"}
          </button>
          <button
            onClick={() => setView("review")}
            className="w-full py-2.5 rounded-lg text-sm font-medium text-muted hover:text-foreground bg-white/[0.04] hover:bg-white/[0.06] transition"
          >
            Edit Inputs
          </button>
          <button
            onClick={() => { setView("upload"); setCurrentId(null); setInputs({}); setFieldMeta({}); setConflicts([]); setAuditTrail([]); }}
            className="w-full py-2 text-sm text-muted/60 hover:text-muted transition"
          >
            New Analysis
          </button>
        </div>
      </div>

      {/* Feedback Section */}
      <div className="bg-card border border-card-border rounded-xl p-6 max-w-lg w-full space-y-4">
        {feedbackSubmitted ? (
          <div className="text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto">
              <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-medium text-foreground">✓ Feedback received</p>
            <p className="text-xs text-muted">Nova will use this to improve future underwriting.</p>

            {/* Diff summary collapsible */}
            {parsedDiff && (
              <div className="mt-3 text-left">
                <button
                  onClick={() => setDiffExpanded(!diffExpanded)}
                  className="text-xs text-accent hover:text-accent/80 transition flex items-center gap-1"
                >
                  {diffExpanded ? "▾" : "▸"} View AI Analysis
                </button>
                {diffExpanded && (
                  <div className="mt-2 bg-white/[0.02] border border-card-border rounded-lg p-3 space-y-2 text-xs">
                    <p className="text-gray-300">{parsedDiff.summary}</p>
                    {parsedDiff.changes?.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-gray-500 font-medium">Changes:</p>
                        {parsedDiff.changes.map((c: { field?: string; section?: string; description?: string; original?: string; final?: string; reasoning?: string }, i: number) => (
                          <div key={i} className="pl-2 border-l border-gray-700 text-gray-400">
                            <span className="text-gray-200">{c.field || c.section}</span>: {c.description || `${c.original} → ${c.final}`}
                            {c.reasoning && <span className="text-gray-500"> — {c.reasoning}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    {parsedDiff.patterns?.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-gray-500 font-medium">Patterns learned:</p>
                        {parsedDiff.patterns.map((p: string, i: number) => (
                          <div key={i} className="pl-2 text-gray-400">• {p}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="text-base">📊</span>
              <h3 className="text-sm font-semibold text-foreground">Help Nova improve future underwriting</h3>
            </div>
            <p className="text-xs text-muted">
              Once you&apos;ve finalized this model, upload your final version and tell Nova what you changed.
            </p>

            {/* File upload */}
            <div>
              <input
                ref={feedbackInputRef}
                type="file"
                accept=".xlsx,.xls,.pdf"
                className="hidden"
                onChange={e => e.target.files?.[0] && setFeedbackFile(e.target.files[0])}
              />
              <button
                onClick={() => feedbackInputRef.current?.click()}
                className="px-3 py-1.5 text-xs rounded-lg bg-white/[0.04] border border-card-border text-muted hover:text-foreground hover:bg-white/[0.06] transition"
              >
                {feedbackFile ? `📎 ${feedbackFile.name}` : "Choose File (Excel, PDF)"}
              </button>
              {feedbackFile && (
                <button onClick={() => setFeedbackFile(null)} className="ml-2 text-xs text-gray-500 hover:text-red-400">✕</button>
              )}
            </div>

            {/* Context textarea */}
            <div>
              <label className="text-xs font-medium text-gray-300 block mb-1">What did you change and why?</label>
              <textarea
                value={feedbackContext}
                onChange={e => setFeedbackContext(e.target.value)}
                rows={4}
                className="w-full bg-white/[0.04] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 resize-none placeholder:text-gray-600"
                placeholder={'e.g. "Need to see three cap rate scenarios side by side instead of one. Add a debt coverage ratio row in the financing section. Break out recovery income by type (CAM, tax, insurance) instead of one line."'}
              />
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleSubmitFeedback}
                disabled={submittingFeedback || (!feedbackContext.trim() && !feedbackFile)}
                className="flex-1 py-2 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent/90 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submittingFeedback ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40 20" /></svg>
                    Analyzing...
                  </span>
                ) : "Upload & Submit Feedback"}
              </button>
              <button
                onClick={handleUsedAsIs}
                disabled={markingAsIs}
                className="px-4 py-2 rounded-lg text-sm font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/15 transition disabled:opacity-40"
              >
                {markingAsIs ? "..." : "I used it as-is ✓"}
              </button>
            </div>

            <p className="text-[11px] text-muted/50 text-center">
              This helps Nova learn your team&apos;s underwriting style.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
