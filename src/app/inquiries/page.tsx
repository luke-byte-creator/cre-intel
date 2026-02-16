"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Inquiry {
  id: number;
  tenantName: string;
  tenantCompany: string | null;
  tenantEmail: string | null;
  tenantPhone: string | null;
  propertyOfInterest: string | null;
  businessDescription: string | null;
  spaceNeedsSf: string | null;
  timeline: string | null;
  notes: string | null;
  source: string | null;
  submittedBy: string | null;
  assetTypePreference: string | null;
  status: string | null;
  claimedByName: string | null;
  claimedAt: string | null;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  new: "#3b82f6",
  contacted: "#f59e0b",
  pipeline: "#10b981",
  not_a_fit: "#6b7280",
};

const TABS = ["All", "New", "Not a Fit"];
const tabToStatus: Record<string, string | null> = {
  All: null,
  New: "new",
  "Not a Fit": "not_a_fit",
};

const EMPTY_FORM = {
  tenantName: "",
  tenantCompany: "",
  tenantEmail: "",
  tenantPhone: "",
  propertyOfInterest: "",
  businessDescription: "",
  spaceNeedsSf: "",
  timeline: "",
  notes: "",
};

export default function InquiriesPage() {
  const router = useRouter();
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [tab, setTab] = useState("New");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [editNotes, setEditNotes] = useState<Record<number, string>>({});
  const [moving, setMoving] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_FORM);
  const [pasteText, setPasteText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addMode, setAddMode] = useState<"paste" | "manual">("paste");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [assetTypeFilter, setAssetTypeFilter] = useState("");
  const [sfMin, setSfMin] = useState("");
  const [sfMax, setSfMax] = useState("");

  const load = () => {
    const params = new URLSearchParams();
    const s = tabToStatus[tab];
    if (s) params.set("status", s);
    if (search) params.set("search", search);
    if (assetTypeFilter) params.set("assetType", assetTypeFilter);
    if (sfMin) params.set("sfMin", sfMin);
    if (sfMax) params.set("sfMax", sfMax);
    fetch(`/api/inquiries?${params}`).then(r => r.json()).then(setInquiries);
  };

  useEffect(() => { load(); }, [tab, search, assetTypeFilter, sfMin, sfMax]);

  const updateStatus = async (id: number, status: string) => {
    await fetch(`/api/inquiries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  };

  const saveNotes = async (id: number) => {
    await fetch(`/api/inquiries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: editNotes[id] }),
    });
    load();
  };

  const moveToPipeline = async (inq: Inquiry) => {
    setMoving(inq.id);
    try {
      // Create a deal in the pipeline at "prospect" stage
      const dealName = inq.tenantCompany
        ? `${inq.tenantName} (${inq.tenantCompany})`
        : inq.tenantName;
      const noteParts = [];
      if (inq.businessDescription) noteParts.push(`Business: ${inq.businessDescription}`);
      if (inq.spaceNeedsSf) noteParts.push(`Space needs: ${inq.spaceNeedsSf}`);
      if (inq.timeline) noteParts.push(`Timeline: ${inq.timeline}`);
      if (inq.tenantEmail) noteParts.push(`Email: ${inq.tenantEmail}`);
      if (inq.tenantPhone) noteParts.push(`Phone: ${inq.tenantPhone}`);
      if (inq.notes) noteParts.push(`Notes: ${inq.notes}`);
      noteParts.push(`Source: Inquiry #${inq.id}`);

      await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantName: dealName,
          propertyAddress: inq.propertyOfInterest || "",
          stage: "prospect",
          notes: noteParts.join("\n"),
        }),
      });

      // Update inquiry status to "pipeline" and claim it
      await fetch(`/api/inquiries/${inq.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "pipeline", claim: true }),
      });
      load();
    } finally {
      setMoving(null);
    }
  };

  const markNotAFit = async (inq: Inquiry) => {
    await updateStatus(inq.id, "not_a_fit");
  };

  const parseEmail = async () => {
    if (!pasteText.trim()) return;
    setParsing(true);
    try {
      const res = await fetch("/api/inquiries/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pasteText }),
      });
      const data = await res.json();
      if (res.ok) {
        setAddForm({
          tenantName: data.tenantName || "",
          tenantCompany: data.tenantCompany || "",
          tenantEmail: data.tenantEmail || "",
          tenantPhone: data.tenantPhone || "",
          propertyOfInterest: data.propertyOfInterest || "",
          businessDescription: data.businessDescription || "",
          spaceNeedsSf: data.spaceNeedsSf || "",
          timeline: data.timeline || "",
          notes: data.notes || "",
        });
        setAddMode("manual"); // Switch to form view to review/edit
      }
    } catch {}
    setParsing(false);
  };

  const saveInquiry = async () => {
    if (!addForm.tenantName.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...addForm,
          source: pasteText.trim() ? "email_paste" : "manual",
          submittedBy: "agent",
        }),
      });
      setShowAdd(false);
      setAddForm(EMPTY_FORM);
      setPasteText("");
      setAddMode("paste");
      load();
    } catch {}
    setSaving(false);
  };

  const now = new Date();
  const thisMonth = inquiries.filter(i => {
    const d = new Date(i.createdAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Inquiries</h1>
        <button
          onClick={() => { setShowAdd(true); setAddForm(EMPTY_FORM); setPasteText(""); setAddMode("paste"); }}
          className="bg-accent hover:bg-accent/90 text-white font-medium px-4 py-2 rounded-lg text-sm transition-all"
        >
          + Add Inquiry
        </button>
      </div>

      {/* Add Inquiry Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-card border border-card-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-card-border">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">Add Inquiry</h2>
                <button onClick={() => setShowAdd(false)} className="text-muted hover:text-foreground text-xl">×</button>
              </div>
              <div className="flex gap-1 mt-3">
                <button
                  onClick={() => setAddMode("paste")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${addMode === "paste" ? "bg-accent/15 text-accent" : "text-muted hover:text-foreground"}`}
                >
                  Paste Email
                </button>
                <button
                  onClick={() => setAddMode("manual")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${addMode === "manual" ? "bg-accent/15 text-accent" : "text-muted hover:text-foreground"}`}
                >
                  Manual Entry
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {addMode === "paste" && (
                <>
                  <div>
                    <label className="text-xs text-muted block mb-1.5">Paste email or inquiry text</label>
                    <textarea
                      value={pasteText}
                      onChange={e => setPasteText(e.target.value)}
                      rows={8}
                      placeholder="Paste the email content here..."
                      className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted resize-y"
                    />
                  </div>
                  <button
                    onClick={parseEmail}
                    disabled={parsing || !pasteText.trim()}
                    className="w-full bg-accent hover:bg-accent/90 text-white font-medium py-2.5 rounded-lg text-sm transition-all disabled:opacity-50"
                  >
                    {parsing ? "Parsing…" : "Extract Details"}
                  </button>
                </>
              )}

              {addMode === "manual" && (
                <>
                  {[
                    { key: "tenantName", label: "Name *", placeholder: "Contact name" },
                    { key: "tenantCompany", label: "Company", placeholder: "Company name" },
                    { key: "tenantEmail", label: "Email", placeholder: "email@example.com" },
                    { key: "tenantPhone", label: "Phone", placeholder: "306-555-1234" },
                    { key: "propertyOfInterest", label: "Property of Interest", placeholder: "Property or area" },
                    { key: "businessDescription", label: "Business / Need", placeholder: "What they do or need" },
                    { key: "spaceNeedsSf", label: "Space Requirements", placeholder: "e.g. 5,000 SF" },
                    { key: "timeline", label: "Timeline", placeholder: "e.g. Q2 2026" },
                    { key: "notes", label: "Notes", placeholder: "Additional details" },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="text-xs text-muted block mb-1">{f.label}</label>
                      <input
                        type="text"
                        value={addForm[f.key as keyof typeof addForm]}
                        onChange={e => setAddForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                        placeholder={f.placeholder}
                        className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted"
                      />
                    </div>
                  ))}
                  <button
                    onClick={saveInquiry}
                    disabled={saving || !addForm.tenantName.trim()}
                    className="w-full bg-emerald-500 hover:bg-emerald-500/90 text-white font-medium py-2.5 rounded-lg text-sm transition-all disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save Inquiry"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total", value: inquiries.length, color: "text-foreground" },
          { label: "New", value: inquiries.filter(i => i.status === "new").length, color: "text-blue-400" },
          { label: "In Pipeline", value: inquiries.filter(i => i.status === "pipeline").length, color: "text-emerald-400" },
          { label: "This Month", value: thisMonth.length, color: "text-foreground" },
        ].map(s => (
          <div key={s.label} className="bg-card border border-card-border rounded-xl p-4">
            <p className="text-xs text-muted mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t ? "bg-accent/15 text-accent" : "text-muted hover:text-foreground hover:bg-white/5"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search by name, company, property, business..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full bg-card border border-card-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50"
      />
      <div className="mb-4">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-xs text-muted hover:text-accent transition-colors mt-1.5 flex items-center gap-1"
        >
          <span className={`transition-transform ${showAdvanced ? "rotate-90" : ""}`}>▸</span>
          Advanced Search
        </button>
        {showAdvanced && (
          <div className="mt-2 flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-muted mb-1">Asset Type</label>
              <select
                value={assetTypeFilter}
                onChange={e => setAssetTypeFilter(e.target.value)}
                className="bg-card border border-card-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-accent/50"
              >
                <option value="">All Types</option>
                <option value="office">Office</option>
                <option value="retail">Retail</option>
                <option value="industrial">Industrial</option>
                <option value="land">Land</option>
                <option value="multifamily">Multifamily</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Min SF</label>
              <input
                type="number"
                value={sfMin}
                onChange={e => setSfMin(e.target.value)}
                placeholder="e.g. 800"
                className="w-28 bg-card border border-card-border rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50"
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Max SF</label>
              <input
                type="number"
                value={sfMax}
                onChange={e => setSfMax(e.target.value)}
                placeholder="e.g. 2000"
                className="w-28 bg-card border border-card-border rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50"
              />
            </div>
            {(assetTypeFilter || sfMin || sfMax) && (
              <button
                onClick={() => { setAssetTypeFilter(""); setSfMin(""); setSfMax(""); }}
                className="text-xs text-muted hover:text-red-400 transition-colors py-1.5"
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* List */}
      <div className="space-y-2">
        {inquiries.map(inq => (
          <div key={inq.id} className="bg-card border border-card-border rounded-xl overflow-hidden">
            <div
              className="p-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
              onClick={() => setExpanded(expanded === inq.id ? null : inq.id)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm">{inq.tenantName}</span>
                    {inq.tenantCompany && (
                      <span className="text-xs text-muted">· {inq.tenantCompany}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    {inq.assetTypePreference && <span className="text-accent/70 capitalize">{inq.assetTypePreference}</span>}
                    {inq.propertyOfInterest && <span className="text-accent/70">→ {inq.propertyOfInterest}</span>}
                    {inq.businessDescription && <span>{inq.businessDescription}</span>}
                    {inq.spaceNeedsSf && <span>{inq.spaceNeedsSf}</span>}
                    {inq.timeline && <span>{inq.timeline}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                    style={{
                      background: `${STATUS_COLORS[inq.status || "new"]}20`,
                      color: STATUS_COLORS[inq.status || "new"],
                    }}
                  >
                    {(inq.status || "new").replace("_", " ")}
                  </span>
                  {inq.claimedByName && (
                    <span className="text-[11px] text-emerald-400">→ {inq.claimedByName}&apos;s pipeline</span>
                  )}
                  <span className="text-[11px] text-muted">
                    {new Date(inq.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>

            {expanded === inq.id && (
              <div className="border-t border-card-border px-4 py-3 bg-white/[0.01] space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-muted">
                  {inq.tenantEmail && <p>📧 {inq.tenantEmail}</p>}
                  {inq.tenantPhone && <p>📞 {inq.tenantPhone}</p>}
                  {inq.propertyOfInterest && <p>🏢 Property: {inq.propertyOfInterest}</p>}
                  {inq.businessDescription && <p>💼 Business: {inq.businessDescription}</p>}
                  {inq.spaceNeedsSf && <p>📐 Space: {inq.spaceNeedsSf}</p>}
                  {inq.source && <p>Source: {inq.source}</p>}
                </div>
                {inq.notes && (
                  <p className="text-sm text-muted">{inq.notes}</p>
                )}

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2 items-center">
                  {inq.status !== "pipeline" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); moveToPipeline(inq); }}
                      disabled={moving === inq.id}
                      className="bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                    >
                      {moving === inq.id ? "Moving…" : "→ Move to Pipeline"}
                    </button>
                  )}
                  {inq.status === "pipeline" && (
                    <button
                      onClick={() => router.push("/pipeline")}
                      className="bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                    >
                      ✓ In Pipeline — View
                    </button>
                  )}
                  {inq.status !== "not_a_fit" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); markNotAFit(inq); }}
                      className="bg-zinc-500/15 text-zinc-400 hover:bg-zinc-500/25 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                    >
                      Not a Fit
                    </button>
                  )}
                  {inq.status === "not_a_fit" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); updateStatus(inq.id, "new"); }}
                      className="bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                    >
                      ↩ Reopen
                    </button>
                  )}
                </div>

                {/* Notes */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editNotes[inq.id] ?? inq.notes ?? ""}
                    onChange={e => setEditNotes(n => ({ ...n, [inq.id]: e.target.value }))}
                    onClick={e => e.stopPropagation()}
                    className="flex-1 bg-background border border-card-border rounded-lg px-3 py-1.5 text-sm text-foreground"
                    placeholder="Add notes..."
                  />
                  <button
                    onClick={(e) => { e.stopPropagation(); saveNotes(inq.id); }}
                    className="bg-accent/15 text-accent px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-accent/25"
                  >
                    Save
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {inquiries.length === 0 && (
          <p className="text-center text-muted py-12">No inquiries found.</p>
        )}
      </div>
    </div>
  );
}
