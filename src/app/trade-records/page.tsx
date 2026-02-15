"use client";

import { useState, useEffect, useCallback } from "react";

interface CommissionSplit {
  name: string;
  pct: number;
}

interface OfficeConfig {
  name: string;
  branchNum: string;
  share: number;
  people?: { name: string; pct: number }[];
}

const DEFAULT_SPLITS: CommissionSplit[] = [
  { name: "Michael Bratvold", pct: 38.5 },
  { name: "Ben Kelley", pct: 26.5 },
  { name: "Shane Endicott", pct: 12 },
  { name: "Dallon Kuprowski", pct: 16 },
  { name: "Luke Jansen", pct: 7 },
];

const STORAGE_KEY = "tr-commission-splits";
const OFFICES_KEY = "tr-offices";

type Stage = "upload" | "review" | "complete";

export default function TradeRecordsPage() {
  const [stage, setStage] = useState<Stage>("upload");
  const [trType, setTrType] = useState<"lease" | "sale">("lease");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [extractedData, setExtractedData] = useState<any>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [splitsOpen, setSplitsOpen] = useState(false);
  const [splits, setSplits] = useState<CommissionSplit[]>(DEFAULT_SPLITS);
  const [branchShare, setBranchShare] = useState(50);
  const [offices, setOffices] = useState<OfficeConfig[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setSplits(JSON.parse(saved));
      const savedBranch = localStorage.getItem("tr-branch-share");
      if (savedBranch) setBranchShare(JSON.parse(savedBranch));
      const savedOffices = localStorage.getItem(OFFICES_KEY);
      if (savedOffices) setOffices(JSON.parse(savedOffices));
    } catch { /* ignore */ }
  }, []);

  const saveSplits = useCallback((newSplits: CommissionSplit[]) => {
    setSplits(newSplits);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newSplits));
  }, []);

  const saveBranchShare = useCallback((v: number) => {
    setBranchShare(v);
    localStorage.setItem("tr-branch-share", JSON.stringify(v));
  }, []);

  const saveOffices = useCallback((o: OfficeConfig[]) => {
    setOffices(o);
    localStorage.setItem(OFFICES_KEY, JSON.stringify(o));
  }, []);

  async function handleExtract() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", trType);
      const res = await fetch("/api/trade-records/extract", { method: "POST", body: formData });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Extraction failed"); }
      const result = await res.json();
      setExtractedData(result.data);
      setStage("review");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const commissionConfig = {
        splits: splits.map(s => ({ name: s.name, pct: s.pct / 100 })),
        offices: [
          { name: "Saskatoon", branchNum: "100101", share: branchShare / 100 },
          ...offices.map(o => ({ ...o, share: o.share / 100, people: o.people?.map(p => ({ ...p, pct: p.pct / 100 })) })),
        ],
      };
      const res = await fetch("/api/trade-records/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: extractedData, type: trType, commission: commissionConfig }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Generation failed"); }
      const result = await res.json();
      setDownloadUrl(result.downloadUrl);
      setStage("complete");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function updateField(path: string, value: any) {
    setExtractedData((prev: Record<string, unknown>) => {
      const copy = JSON.parse(JSON.stringify(prev));
      const keys = path.split(".");
      let obj = copy;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!obj[keys[i]]) obj[keys[i]] = {};
        obj = obj[keys[i]];
      }
      obj[keys[keys.length - 1]] = value;
      return copy;
    });
  }

  function reset() {
    setStage("upload");
    setFile(null);
    setExtractedData(null);
    setDownloadUrl(null);
    setError(null);
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Trade Records</h1>
        {stage !== "upload" && (
          <button onClick={reset} className="px-4 py-2 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 transition">
            ← Start Over
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/15 text-red-400 text-sm">{error}</div>
      )}

      {/* UPLOAD STAGE */}
      {stage === "upload" && (
        <div className="space-y-6">
          {/* Type selector */}
          <div className="bg-card border border-card-border rounded-xl p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Document Type</h2>
            <div className="flex gap-4">
              {(["lease", "sale"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTrType(t)}
                  className={`px-6 py-3 rounded-lg font-medium transition ${
                    trType === t ? "bg-accent/20 text-accent border border-accent/40" : "bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700"
                  }`}
                >
                  {t === "lease" ? "Lease / Offer to Lease" : "Sale / PSA"}
                </button>
              ))}
            </div>
          </div>

          {/* File upload */}
          <div className="bg-card border border-card-border rounded-xl p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Upload Document</h2>
            <label className="block border-2 border-dashed border-gray-600 rounded-xl p-10 text-center cursor-pointer hover:border-gray-500 transition">
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                className="hidden"
                onChange={e => setFile(e.target.files?.[0] || null)}
              />
              {file ? (
                <div className="text-foreground">
                  <span className="text-accent font-medium">{file.name}</span>
                  <p className="text-sm text-muted mt-1">{(file.size / 1024).toFixed(0)} KB</p>
                </div>
              ) : (
                <div className="text-muted">
                  <svg className="w-10 h-10 mx-auto mb-3 text-gray-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  <p>Click to upload or drag a PDF</p>
                  <p className="text-xs mt-1">Supports text-based and scanned PDFs</p>
                </div>
              )}
            </label>
          </div>

          {/* Commission splits */}
          <div className="bg-card border border-card-border rounded-xl">
            <button
              onClick={() => setSplitsOpen(!splitsOpen)}
              className="w-full px-6 py-4 flex items-center justify-between text-foreground hover:bg-white/[0.02] transition rounded-xl"
            >
              <h2 className="text-lg font-semibold">Commission Splits</h2>
              <svg className={`w-5 h-5 transform transition ${splitsOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {splitsOpen && (
              <div className="px-6 pb-6 space-y-4">
                <div className="flex items-center gap-4">
                  <label className="text-sm text-muted w-40">Branch Share:</label>
                  <input
                    type="number"
                    value={branchShare}
                    onChange={e => saveBranchShare(Number(e.target.value))}
                    className="w-20 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-foreground text-sm focus:outline-none focus:border-gray-500"
                  />
                  <span className="text-sm text-muted">% of total commission</span>
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-muted uppercase tracking-wider font-semibold">Individual Splits (of branch share)</p>
                  {splits.map((s, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <input
                        value={s.name}
                        onChange={e => {
                          const n = [...splits]; n[i] = { ...n[i], name: e.target.value }; saveSplits(n);
                        }}
                        className="flex-1 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-foreground text-sm focus:outline-none focus:border-gray-500"
                      />
                      <input
                        type="number"
                        value={s.pct}
                        onChange={e => {
                          const n = [...splits]; n[i] = { ...n[i], pct: Number(e.target.value) }; saveSplits(n);
                        }}
                        className="w-20 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-foreground text-sm focus:outline-none focus:border-gray-500"
                      />
                      <span className="text-sm text-muted">%</span>
                      <button
                        onClick={() => { const n = splits.filter((_, j) => j !== i); saveSplits(n); }}
                        className="text-red-400 hover:text-red-300 text-sm"
                      >✕</button>
                    </div>
                  ))}
                  <button
                    onClick={() => saveSplits([...splits, { name: "", pct: 0 }])}
                    className="text-sm text-accent hover:text-accent/80 transition"
                  >+ Add Person</button>
                  <p className="text-xs text-muted">
                    Total: {splits.reduce((s, x) => s + x.pct, 0).toFixed(1)}%
                    {Math.abs(splits.reduce((s, x) => s + x.pct, 0) - 100) > 0.1 && (
                      <span className="text-yellow-400 ml-2">⚠ Should total 100%</span>
                    )}
                  </p>
                </div>

                {/* Additional offices (for sales) */}
                {trType === "sale" && (
                  <div className="space-y-3 border-t border-gray-700 pt-4">
                    <p className="text-xs text-muted uppercase tracking-wider font-semibold">Additional Offices</p>
                    {offices.map((o, oi) => (
                      <div key={oi} className="bg-gray-800/50 rounded-lg p-4 space-y-2">
                        <div className="flex items-center gap-3">
                          <input value={o.name} onChange={e => { const n = [...offices]; n[oi] = { ...n[oi], name: e.target.value }; saveOffices(n); }}
                            placeholder="Office name" className="flex-1 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-foreground text-sm focus:outline-none focus:border-gray-500" />
                          <input type="number" value={o.share} onChange={e => { const n = [...offices]; n[oi] = { ...n[oi], share: Number(e.target.value) }; saveOffices(n); }}
                            className="w-20 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-foreground text-sm focus:outline-none focus:border-gray-500" />
                          <span className="text-sm text-muted">%</span>
                          <button onClick={() => saveOffices(offices.filter((_, j) => j !== oi))} className="text-red-400 hover:text-red-300 text-sm">✕</button>
                        </div>
                        {(o.people || []).map((p, pi) => (
                          <div key={pi} className="flex items-center gap-3 ml-4">
                            <input value={p.name} onChange={e => {
                              const n = [...offices]; const ppl = [...(n[oi].people || [])]; ppl[pi] = { ...ppl[pi], name: e.target.value }; n[oi] = { ...n[oi], people: ppl }; saveOffices(n);
                            }} placeholder="Person name" className="flex-1 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-foreground text-sm focus:outline-none focus:border-gray-500" />
                            <input type="number" value={p.pct} onChange={e => {
                              const n = [...offices]; const ppl = [...(n[oi].people || [])]; ppl[pi] = { ...ppl[pi], pct: Number(e.target.value) }; n[oi] = { ...n[oi], people: ppl }; saveOffices(n);
                            }} className="w-20 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-foreground text-sm focus:outline-none focus:border-gray-500" />
                            <span className="text-sm text-muted">%</span>
                            <button onClick={() => {
                              const n = [...offices]; n[oi] = { ...n[oi], people: (n[oi].people || []).filter((_, j) => j !== pi) }; saveOffices(n);
                            }} className="text-red-400 hover:text-red-300 text-sm">✕</button>
                          </div>
                        ))}
                        <button onClick={() => {
                          const n = [...offices]; n[oi] = { ...n[oi], people: [...(n[oi].people || []), { name: "", pct: 50 }] }; saveOffices(n);
                        }} className="text-xs text-accent hover:text-accent/80 ml-4">+ Add Person</button>
                      </div>
                    ))}
                    <button onClick={() => saveOffices([...offices, { name: "", branchNum: "", share: 0, people: [] }])}
                      className="text-sm text-accent hover:text-accent/80 transition">+ Add Office</button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Generate button */}
          <button
            onClick={handleExtract}
            disabled={!file || loading}
            className={`w-full py-3 rounded-xl font-semibold text-lg transition ${
              !file || loading ? "bg-gray-700 text-gray-500 cursor-not-allowed" : "bg-accent text-white hover:bg-accent/90"
            }`}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                Extracting data from document...
              </span>
            ) : "Extract & Generate Trade Record"}
          </button>
        </div>
      )}

      {/* REVIEW STAGE */}
      {stage === "review" && extractedData && (
        <div className="space-y-6">
          <p className="text-sm text-muted">Review the extracted fields below. Edit any that need correction, then click Generate.</p>

          {trType === "lease" ? (
            <LeaseReviewForm data={extractedData} updateField={updateField} />
          ) : (
            <SaleReviewForm data={extractedData} updateField={updateField} />
          )}

          <button
            onClick={handleGenerate}
            disabled={loading}
            className={`w-full py-3 rounded-xl font-semibold text-lg transition ${
              loading ? "bg-gray-700 text-gray-500 cursor-not-allowed" : "bg-accent text-white hover:bg-accent/90"
            }`}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                Generating Excel...
              </span>
            ) : "Generate Trade Record"}
          </button>
        </div>
      )}

      {/* COMPLETE STAGE */}
      {stage === "complete" && downloadUrl && (
        <div className="bg-card border border-card-border rounded-xl p-10 text-center space-y-6">
          <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-foreground">Trade Record Generated!</h2>
          <p className="text-muted">Your {trType === "lease" ? "Lease" : "Sale"} Trade Record is ready to download.</p>
          <a
            href={downloadUrl}
            className="inline-block px-8 py-3 bg-accent text-white font-semibold rounded-xl hover:bg-accent/90 transition"
          >
            Download Excel File
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Field Input Helper ────────────────────────────────────────────────────

function Field({ label, value, onChange, className }: { label: string; value: string | number | undefined | null; onChange: (v: string) => void; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-xs text-muted mb-1">{label}</label>
      <input
        value={value ?? ""}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-foreground text-sm focus:outline-none focus:border-gray-500"
      />
    </div>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string | undefined | null; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs text-muted mb-1">{label}</label>
      <select
        value={value ?? ""}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-foreground text-sm focus:outline-none focus:border-gray-500"
      >
        <option value="">—</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <h3 className="text-sm font-semibold text-accent uppercase tracking-wider pt-2">{title}</h3>;
}

// ─── Lease Review Form ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function LeaseReviewForm({ data, updateField }: { data: any; updateField: (path: string, value: any) => void }) {
  return (
    <div className="space-y-4">
      <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
        <SectionHeader title="Deal Info" />
        <div className="grid grid-cols-4 gap-3">
          <SelectField label="Deal Type" value={data.dealType} options={["New", "Renewal", "Extension"]} onChange={v => updateField("dealType", v)} />
          <SelectField label="Space Type" value={data.spaceType} options={["Raw", "Improved"]} onChange={v => updateField("spaceType", v)} />
          <SelectField label="Lease Type" value={data.leaseType} options={["Direct", "Sublease"]} onChange={v => updateField("leaseType", v)} />
          <SelectField label="CBRE Listing" value={data.cbreListing ? "Yes" : "No"} options={["Yes", "No"]} onChange={v => updateField("cbreListing", v === "Yes")} />
        </div>
      </div>

      <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
        <SectionHeader title="Term" />
        <div className="grid grid-cols-6 gap-3">
          <Field label="Start Day" value={data.termStart?.day} onChange={v => updateField("termStart.day", Number(v))} />
          <Field label="Start Month" value={data.termStart?.month} onChange={v => updateField("termStart.month", v)} />
          <Field label="Start Year" value={data.termStart?.year} onChange={v => updateField("termStart.year", Number(v))} />
          <Field label="End Day" value={data.termEnd?.day} onChange={v => updateField("termEnd.day", Number(v))} />
          <Field label="End Month" value={data.termEnd?.month} onChange={v => updateField("termEnd.month", v)} />
          <Field label="End Year" value={data.termEnd?.year} onChange={v => updateField("termEnd.year", Number(v))} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <SelectField label="Renewal Option" value={data.renewalOption ? "Yes" : "No"} options={["Yes", "No"]} onChange={v => updateField("renewalOption", v === "Yes")} />
          <Field label="Renewal Date" value={data.renewalDate} onChange={v => updateField("renewalDate", v)} className="col-span-2" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-card-border rounded-xl p-5 space-y-3">
          <SectionHeader title="Landlord" />
          <Field label="Name" value={data.landlord?.name} onChange={v => updateField("landlord.name", v)} />
          <Field label="Contact Name" value={data.landlord?.contactName} onChange={v => updateField("landlord.contactName", v)} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone" value={data.landlord?.phone} onChange={v => updateField("landlord.phone", v)} />
            <Field label="Email" value={data.landlord?.email} onChange={v => updateField("landlord.email", v)} />
          </div>
          <Field label="Mailing Address" value={data.landlord?.address} onChange={v => updateField("landlord.address", v)} />
          <div className="grid grid-cols-3 gap-3">
            <Field label="City" value={data.landlord?.city} onChange={v => updateField("landlord.city", v)} />
            <Field label="Province" value={data.landlord?.province} onChange={v => updateField("landlord.province", v)} />
            <Field label="Postal Code" value={data.landlord?.postalCode} onChange={v => updateField("landlord.postalCode", v)} />
          </div>
        </div>

        <div className="bg-card border border-card-border rounded-xl p-5 space-y-3">
          <SectionHeader title="Tenant" />
          <Field label="Name" value={data.tenant?.name} onChange={v => updateField("tenant.name", v)} />
          <Field label="Contact Name" value={data.tenant?.contactName} onChange={v => updateField("tenant.contactName", v)} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone" value={data.tenant?.phone} onChange={v => updateField("tenant.phone", v)} />
            <Field label="Email" value={data.tenant?.email} onChange={v => updateField("tenant.email", v)} />
          </div>
          <Field label="Mailing Address" value={data.tenant?.address} onChange={v => updateField("tenant.address", v)} />
          <div className="grid grid-cols-3 gap-3">
            <Field label="City" value={data.tenant?.city} onChange={v => updateField("tenant.city", v)} />
            <Field label="Province" value={data.tenant?.province} onChange={v => updateField("tenant.province", v)} />
            <Field label="Postal Code" value={data.tenant?.postalCode} onChange={v => updateField("tenant.postalCode", v)} />
          </div>
        </div>
      </div>

      <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
        <SectionHeader title="Property" />
        <Field label="Address" value={data.property?.address} onChange={v => updateField("property.address", v)} />
        <div className="grid grid-cols-3 gap-3">
          <Field label="City" value={data.property?.city} onChange={v => updateField("property.city", v)} />
          <Field label="Province" value={data.property?.province} onChange={v => updateField("property.province", v)} />
          <Field label="Postal Code" value={data.property?.postalCode} onChange={v => updateField("property.postalCode", v)} />
        </div>
        <SelectField label="Property Type" value={data.propertyType} options={["Land", "Office", "Retail", "Industrial", "Residential", "Special Use"]} onChange={v => updateField("propertyType", v)} />
      </div>

      <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
        <SectionHeader title="Deal Details" />
        <div className="grid grid-cols-5 gap-3">
          <Field label="Total SF" value={data.totalSF} onChange={v => updateField("totalSF", Number(v))} />
          <Field label="Base Annual Rent PSF" value={data.baseAnnualRentPSF} onChange={v => updateField("baseAnnualRentPSF", Number(v))} />
          <Field label="Months Free Rent" value={data.monthsFreeRent} onChange={v => updateField("monthsFreeRent", Number(v))} />
          <Field label="TI PSF" value={data.tenantInducementPSF} onChange={v => updateField("tenantInducementPSF", Number(v))} />
          <Field label="Taxes & OpCosts PSF" value={data.taxesOperatingCostsPSF} onChange={v => updateField("taxesOperatingCostsPSF", Number(v))} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Commission Rate (decimal)" value={data.commissionRate} onChange={v => updateField("commissionRate", Number(v))} />
          <SelectField label="Engaged By" value={data.engagedBy} options={["Landlord", "Tenant"]} onChange={v => updateField("engagedBy", v)} />
          <SelectField label="Paid By" value={data.paidBy} options={["Landlord", "Tenant"]} onChange={v => updateField("paidBy", v)} />
        </div>
      </div>

      <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
        <SectionHeader title="Classification" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Occupier Industry" value={data.occupierIndustry} onChange={v => updateField("occupierIndustry", v)} />
          <Field label="Building Classification" value={data.buildingClassification} onChange={v => updateField("buildingClassification", v)} />
          <Field label="Space Use" value={data.spaceUse} onChange={v => updateField("spaceUse", v)} />
          <SelectField label="Reason for Transaction" value={data.reasonForTransaction} options={["Downsizing", "Expansion", "Relocation", "New"]} onChange={v => updateField("reasonForTransaction", v)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Asset/Property Manager" value={data.assetPropertyManager} onChange={v => updateField("assetPropertyManager", v)} />
          <Field label="Beneficial Owner" value={data.beneficialOwner} onChange={v => updateField("beneficialOwner", v)} />
        </div>
      </div>

      <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
        <SectionHeader title="Lease Schedule" />
        {(data.leaseSchedule || []).map((s: { startDate: string; endDate: string; rentPSF: number }, i: number) => (
          <div key={i} className="grid grid-cols-4 gap-3 items-end">
            <Field label="Start Date" value={s.startDate} onChange={v => updateField(`leaseSchedule.${i}.startDate`, v)} />
            <Field label="End Date" value={s.endDate} onChange={v => updateField(`leaseSchedule.${i}.endDate`, v)} />
            <Field label="Rent PSF" value={s.rentPSF} onChange={v => updateField(`leaseSchedule.${i}.rentPSF`, Number(v))} />
            <button onClick={() => {
              const newSched = [...(data.leaseSchedule || [])];
              newSched.splice(i, 1);
              updateField("leaseSchedule", newSched);
            }} className="text-red-400 hover:text-red-300 text-sm py-1.5">Remove</button>
          </div>
        ))}
        <button onClick={() => updateField("leaseSchedule", [...(data.leaseSchedule || []), { startDate: "", endDate: "", rentPSF: 0 }])}
          className="text-sm text-accent hover:text-accent/80">+ Add Period</button>
      </div>
    </div>
  );
}

// ─── Sale Review Form ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SaleReviewForm({ data, updateField }: { data: any; updateField: (path: string, value: any) => void }) {
  return (
    <div className="space-y-4">
      <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
        <SectionHeader title="Deal Info" />
        <div className="grid grid-cols-4 gap-3">
          <SelectField label="FINTRAC Representation" value={data.fintracRepresentation} options={["Vendor", "Buyer", "Both"]} onChange={v => updateField("fintracRepresentation", v)} />
          <SelectField label="Deal Status" value={data.dealStatus} options={["Conditional", "Firm", "Closed"]} onChange={v => updateField("dealStatus", v)} />
          <Field label="Closing Date" value={data.closingDate} onChange={v => updateField("closingDate", v)} />
          <SelectField label="CBRE Listing" value={data.cbreListing ? "Yes" : "No"} options={["Yes", "No"]} onChange={v => updateField("cbreListing", v === "Yes")} />
        </div>
        <div className="grid grid-cols-4 gap-3">
          <SelectField label="Engaged By" value={data.engagedBy} options={["Buyer", "Vendor"]} onChange={v => updateField("engagedBy", v)} />
          <SelectField label="Paid By" value={data.paidBy} options={["Buyer", "Vendor"]} onChange={v => updateField("paidBy", v)} />
          <SelectField label="Listing Type" value={data.listingType} options={["Open", "Exclusive", "MLS", "Off Market"]} onChange={v => updateField("listingType", v)} />
          <SelectField label="Invoice Recipient" value={data.invoiceRecipient} options={["Vendor", "Vendor's Lawyer", "Purchaser", "Purchaser's Lawyer", "Outside Broker"]} onChange={v => updateField("invoiceRecipient", v)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-card-border rounded-xl p-5 space-y-3">
          <SectionHeader title="Vendor" />
          <Field label="Name" value={data.vendor?.name} onChange={v => updateField("vendor.name", v)} />
          <Field label="Contact" value={data.vendor?.contactName} onChange={v => updateField("vendor.contactName", v)} />
          <Field label="Phone" value={data.vendor?.phone} onChange={v => updateField("vendor.phone", v)} />
          <Field label="Address" value={data.vendor?.address} onChange={v => updateField("vendor.address", v)} />
          <div className="grid grid-cols-3 gap-3">
            <Field label="City" value={data.vendor?.city} onChange={v => updateField("vendor.city", v)} />
            <Field label="Province" value={data.vendor?.province} onChange={v => updateField("vendor.province", v)} />
            <Field label="Postal Code" value={data.vendor?.postalCode} onChange={v => updateField("vendor.postalCode", v)} />
          </div>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-5 space-y-3">
          <SectionHeader title="Purchaser" />
          <Field label="Name" value={data.purchaser?.name} onChange={v => updateField("purchaser.name", v)} />
          <Field label="Contact" value={data.purchaser?.contactName} onChange={v => updateField("purchaser.contactName", v)} />
          <Field label="Phone" value={data.purchaser?.phone} onChange={v => updateField("purchaser.phone", v)} />
          <Field label="Address" value={data.purchaser?.address} onChange={v => updateField("purchaser.address", v)} />
          <div className="grid grid-cols-3 gap-3">
            <Field label="City" value={data.purchaser?.city} onChange={v => updateField("purchaser.city", v)} />
            <Field label="Province" value={data.purchaser?.province} onChange={v => updateField("purchaser.province", v)} />
            <Field label="Postal Code" value={data.purchaser?.postalCode} onChange={v => updateField("purchaser.postalCode", v)} />
          </div>
        </div>
      </div>

      <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
        <SectionHeader title="Property" />
        <Field label="Name & Address" value={data.property?.nameAddress} onChange={v => updateField("property.nameAddress", v)} />
        <div className="grid grid-cols-3 gap-3">
          <Field label="City" value={data.property?.city} onChange={v => updateField("property.city", v)} />
          <Field label="Province" value={data.property?.province} onChange={v => updateField("property.province", v)} />
          <Field label="Postal Code" value={data.property?.postalCode} onChange={v => updateField("property.postalCode", v)} />
        </div>
        <div className="grid grid-cols-5 gap-3">
          <SelectField label="Property Type" value={data.propertyType} options={["Retail", "Land", "Office", "Multi Housing", "Industrial", "Special Use", "Residential"]} onChange={v => updateField("propertyType", v)} />
          <Field label="Parcel Size (AC)" value={data.parcelSizeAcres} onChange={v => updateField("parcelSizeAcres", Number(v))} />
          <Field label="Building SF" value={data.buildingSF} onChange={v => updateField("buildingSF", Number(v))} />
          <Field label="# Units" value={data.numberOfUnits} onChange={v => updateField("numberOfUnits", Number(v))} />
          <Field label="# Buildings" value={data.numberOfBuildings} onChange={v => updateField("numberOfBuildings", Number(v))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Portfolio" value={data.portfolio ? "Yes" : "No"} options={["Yes", "No"]} onChange={v => updateField("portfolio", v === "Yes")} />
          <Field label="Occupier Industry" value={data.occupierIndustry} onChange={v => updateField("occupierIndustry", v)} />
        </div>
      </div>

      <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
        <SectionHeader title="Financial" />
        <div className="grid grid-cols-4 gap-3">
          <Field label="Purchase Price" value={data.purchasePrice} onChange={v => updateField("purchasePrice", Number(v))} />
          <SelectField label="Commission Type" value={data.commissionType} options={["percentage", "setFee"]} onChange={v => updateField("commissionType", v)} />
          <Field label="Commission %" value={data.commissionPercentage} onChange={v => updateField("commissionPercentage", Number(v))} />
          <Field label="Set Fee Amount" value={data.commissionSetFee} onChange={v => updateField("commissionSetFee", Number(v))} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Deposit Amount" value={data.depositAmount} onChange={v => updateField("depositAmount", Number(v))} />
          <Field label="Deposit Held By" value={data.depositHeldBy} onChange={v => updateField("depositHeldBy", v)} />
          <SelectField label="Interest Bearing" value={data.interestBearing ? "Yes" : "No"} options={["Yes", "No"]} onChange={v => updateField("interestBearing", v === "Yes")} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-card-border rounded-xl p-5 space-y-3">
          <SectionHeader title="Vendor Solicitor" />
          <Field label="Firm" value={data.vendorSolicitor?.name} onChange={v => updateField("vendorSolicitor.name", v)} />
          <Field label="Contact" value={data.vendorSolicitor?.contactName} onChange={v => updateField("vendorSolicitor.contactName", v)} />
          <Field label="Phone" value={data.vendorSolicitor?.phone} onChange={v => updateField("vendorSolicitor.phone", v)} />
          <Field label="Address" value={data.vendorSolicitor?.address} onChange={v => updateField("vendorSolicitor.address", v)} />
          <div className="grid grid-cols-3 gap-3">
            <Field label="City" value={data.vendorSolicitor?.city} onChange={v => updateField("vendorSolicitor.city", v)} />
            <Field label="Province" value={data.vendorSolicitor?.province} onChange={v => updateField("vendorSolicitor.province", v)} />
            <Field label="Postal Code" value={data.vendorSolicitor?.postalCode} onChange={v => updateField("vendorSolicitor.postalCode", v)} />
          </div>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-5 space-y-3">
          <SectionHeader title="Purchaser Solicitor" />
          <Field label="Firm" value={data.purchaserSolicitor?.name} onChange={v => updateField("purchaserSolicitor.name", v)} />
          <Field label="Contact" value={data.purchaserSolicitor?.contactName} onChange={v => updateField("purchaserSolicitor.contactName", v)} />
          <Field label="Phone" value={data.purchaserSolicitor?.phone} onChange={v => updateField("purchaserSolicitor.phone", v)} />
          <Field label="Address" value={data.purchaserSolicitor?.address} onChange={v => updateField("purchaserSolicitor.address", v)} />
          <div className="grid grid-cols-3 gap-3">
            <Field label="City" value={data.purchaserSolicitor?.city} onChange={v => updateField("purchaserSolicitor.city", v)} />
            <Field label="Province" value={data.purchaserSolicitor?.province} onChange={v => updateField("purchaserSolicitor.province", v)} />
            <Field label="Postal Code" value={data.purchaserSolicitor?.postalCode} onChange={v => updateField("purchaserSolicitor.postalCode", v)} />
          </div>
        </div>
      </div>

      <div className="bg-card border border-card-border rounded-xl p-5 space-y-3">
        <SectionHeader title="Other" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Asset/Property Manager" value={data.assetPropertyManager} onChange={v => updateField("assetPropertyManager", v)} />
          <Field label="Beneficial Owner" value={data.beneficialOwner} onChange={v => updateField("beneficialOwner", v)} />
        </div>
      </div>
    </div>
  );
}
