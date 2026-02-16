"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";

interface Draft {
  id: number;
  dealId: number | null;
  documentType: string;
  title: string;
  generatedContent: string | null;
  extractedStructure: string | null;
  instructions: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  dealName: string | null;
}

interface Preset {
  id: number;
  documentType: string;
  subType: string | null;
  name: string;
  extractedStructure: string;
  exampleCount: number;
  updatedAt: string;
}

interface Deal {
  id: number;
  tenantName: string;
  propertyAddress: string;
}

const DOC_TYPES = [
  { value: "otl", label: "Offer to Lease" },
  { value: "loi", label: "Letter of Intent" },
  { value: "renewal", label: "Renewal" },
  { value: "lease_amendment", label: "Lease Amendment" },
  { value: "sale_offer", label: "Sale Offer" },
  { value: "rfp_response", label: "RFP Response" },
  { value: "counter_offer", label: "Counter-Offer" },
  { value: "lease_agreement", label: "Lease Agreement" },
];

const DOC_TYPE_COLORS: Record<string, string> = {
  otl: "bg-blue-500/20 text-blue-400",
  loi: "bg-purple-500/20 text-purple-400",
  renewal: "bg-emerald-500/20 text-emerald-400",
  lease_amendment: "bg-amber-500/20 text-amber-400",
  sale_offer: "bg-rose-500/20 text-rose-400",
  rfp_response: "bg-cyan-500/20 text-cyan-400",
  counter_offer: "bg-orange-500/20 text-orange-400",
  lease_agreement: "bg-indigo-500/20 text-indigo-400",
};

function docTypeLabel(type: string) {
  return DOC_TYPES.find(d => d.value === type)?.label || type;
}

export default function DraftsPage() {
  const searchParams = useSearchParams();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"drafts" | "new" | "presets">("drafts");

  // New draft form state
  const [newDocType, setNewDocType] = useState("");
  const [newDealId, setNewDealId] = useState<string>("");
  const [newPresetId, setNewPresetId] = useState<string>("");
  const [newInstructions, setNewInstructions] = useState("");
  const [newFile, setNewFile] = useState<File | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatedDraft, setGeneratedDraft] = useState<Draft | null>(null);
  const [generatedContent, setGeneratedContent] = useState("");

  // Preset suggestion
  const [presetSuggestion, setPresetSuggestion] = useState<any>(null);
  const [presetName, setPresetName] = useState("");
  const [savingPreset, setSavingPreset] = useState(false);

  const fetchDrafts = useCallback(async () => {
    const res = await fetch("/api/drafts");
    if (res.ok) setDrafts(await res.json());
  }, []);

  const fetchPresets = useCallback(async () => {
    const res = await fetch("/api/drafts/presets");
    if (res.ok) setPresets(await res.json());
  }, []);

  const fetchDeals = useCallback(async () => {
    const res = await fetch("/api/deals");
    if (res.ok) {
      const all = await res.json();
      setDeals(all.map((d: any) => ({ id: d.id, tenantName: d.tenantName, propertyAddress: d.propertyAddress })));
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchDrafts(), fetchPresets(), fetchDeals()]).then(() => setLoading(false));
  }, [fetchDrafts, fetchPresets, fetchDeals]);

  // Pre-fill from URL params (pipeline integration)
  useEffect(() => {
    const dealId = searchParams.get("dealId");
    if (dealId) {
      setNewDealId(dealId);
      setActiveTab("new");
    }
  }, [searchParams]);

  const handleGenerate = async () => {
    if (!newDocType) return;
    if (!newFile && !newPresetId) return;

    setGenerating(true);
    setGeneratedDraft(null);
    setGeneratedContent("");

    const formData = new FormData();
    formData.append("documentType", newDocType);
    if (newDealId) formData.append("dealId", newDealId);
    if (newPresetId) formData.append("presetId", newPresetId);
    if (newInstructions) formData.append("instructions", newInstructions);
    if (newFile) formData.append("referenceDoc", newFile);

    try {
      const res = await fetch("/api/drafts/generate", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) {
        setGeneratedDraft(data.draft);
        setGeneratedContent(data.content);
        fetchDrafts();
        // Check for preset suggestion
        checkPresetSuggestion(newDocType);
      } else {
        alert(data.error || "Generation failed");
      }
    } catch (err) {
      alert("Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const checkPresetSuggestion = async (docType: string) => {
    try {
      const res = await fetch("/api/drafts/check-preset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentType: docType }),
      });
      const data = await res.json();
      if (data.suggest) {
        setPresetSuggestion(data);
        setPresetName(`My ${docTypeLabel(docType)} Template`);
      }
    } catch {}
  };

  const handleSavePreset = async () => {
    if (!presetName || !presetSuggestion?.mergedStructure) return;
    setSavingPreset(true);
    try {
      await fetch("/api/drafts/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: presetName,
          documentType: newDocType,
          extractedStructure: JSON.stringify(presetSuggestion.mergedStructure),
          exampleCount: presetSuggestion.count,
        }),
      });
      setPresetSuggestion(null);
      fetchPresets();
    } finally {
      setSavingPreset(false);
    }
  };

  const handleSaveDraft = async (id: number) => {
    setSaving(true);
    await fetch(`/api/drafts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ generatedContent: editContent }),
    });
    setSaving(false);
    fetchDrafts();
  };

  const handleDeleteDraft = async (id: number) => {
    if (!confirm("Delete this draft?")) return;
    await fetch(`/api/drafts/${id}`, { method: "DELETE" });
    if (expandedId === id) setExpandedId(null);
    fetchDrafts();
  };

  const handleDeletePreset = async (id: number) => {
    if (!confirm("Delete this preset?")) return;
    await fetch(`/api/drafts/presets?id=${id}`, { method: "DELETE" });
    fetchPresets();
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = (text: string, title: string) => {
    const blob = new Blob([text], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9]/g, "_")}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="p-8 text-muted">Loading drafts…</div>;

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">Document Drafter</h1>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-medium">BETA</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-zinc-800/50 rounded-lg p-1 w-fit">
        <button onClick={() => setActiveTab("drafts")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${activeTab === "drafts" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white"}`}>
          My Drafts <span className="text-xs text-muted ml-1">({drafts.length})</span>
        </button>
        <button onClick={() => setActiveTab("new")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${activeTab === "new" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white"}`}>
          + New Draft
        </button>
        <button onClick={() => setActiveTab("presets")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${activeTab === "presets" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white"}`}>
          Presets <span className="text-xs text-muted ml-1">({presets.length})</span>
        </button>
      </div>

      {/* Drafts List */}
      {activeTab === "drafts" && (
        <div className="space-y-2">
          {drafts.length === 0 && (
            <div className="text-center py-12 text-muted">
              <p className="text-lg mb-2">No drafts yet</p>
              <p className="text-sm">Create your first draft by clicking "+ New Draft"</p>
            </div>
          )}
          {drafts.map(draft => {
            const isExpanded = expandedId === draft.id;
            return (
              <div key={draft.id} className="bg-card border border-card-border rounded-xl overflow-hidden">
                <div
                  className="p-4 cursor-pointer hover:bg-white/[0.02] transition flex items-center justify-between"
                  onClick={() => {
                    if (isExpanded) { setExpandedId(null); }
                    else { setExpandedId(draft.id); setEditContent(draft.generatedContent || ""); }
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`text-[10px] px-2 py-0.5 rounded font-medium whitespace-nowrap ${DOC_TYPE_COLORS[draft.documentType] || "bg-zinc-500/20 text-zinc-400"}`}>
                      {docTypeLabel(draft.documentType)}
                    </span>
                    <span className="text-sm font-medium text-foreground truncate">{draft.title}</span>
                    {draft.dealName && <span className="text-xs text-muted truncate hidden sm:inline">· {draft.dealName}</span>}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${draft.status === "final" ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-500/20 text-zinc-400"}`}>
                      {draft.status}
                    </span>
                    <span className="text-xs text-muted">{new Date(draft.updatedAt).toLocaleDateString("en-CA")}</span>
                    <span className="text-muted">{isExpanded ? "▲" : "▼"}</span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-card-border p-4 space-y-3">
                    <textarea
                      value={editContent}
                      onChange={e => setEditContent(e.target.value)}
                      rows={20}
                      className="w-full bg-background border border-card-border rounded-lg px-4 py-3 text-sm text-foreground font-mono resize-y"
                    />
                    <div className="flex items-center gap-2 flex-wrap">
                      <button onClick={() => handleSaveDraft(draft.id)}
                        className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/80 transition">
                        {saving ? "Saving…" : "Save Changes"}
                      </button>
                      <button onClick={() => handleCopy(editContent)}
                        className="px-4 py-2 bg-card border border-card-border text-foreground rounded-lg text-sm font-medium hover:bg-white/[0.04] transition">
                        {copied ? "✓ Copied" : "Copy to Clipboard"}
                      </button>
                      <button onClick={() => handleDownload(editContent, draft.title)}
                        className="px-4 py-2 bg-card border border-card-border text-foreground rounded-lg text-sm font-medium hover:bg-white/[0.04] transition">
                        Download .docx
                      </button>
                      <button onClick={() => handleDeleteDraft(draft.id)}
                        className="px-3 py-2 text-red-400 hover:text-red-300 text-sm ml-auto">
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* New Draft */}
      {activeTab === "new" && (
        <div className="bg-card border border-card-border rounded-xl p-6 space-y-5 max-w-2xl">
          <h2 className="text-lg font-semibold text-foreground">Create New Draft</h2>

          {/* Document Type */}
          <div>
            <label className="text-xs text-muted mb-1.5 block">Document Type *</label>
            <select value={newDocType} onChange={e => setNewDocType(e.target.value)}
              className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground">
              <option value="">Select type…</option>
              {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {/* Link to Deal */}
          <div>
            <label className="text-xs text-muted mb-1.5 block">Link to Pipeline Deal (optional)</label>
            <select value={newDealId} onChange={e => setNewDealId(e.target.value)}
              className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground">
              <option value="">None</option>
              {deals.map(d => <option key={d.id} value={d.id}>{d.tenantName} — {d.propertyAddress}</option>)}
            </select>
          </div>

          {/* Reference Source */}
          <div className="space-y-3">
            <label className="text-xs text-muted block">Reference Source *</label>

            {/* Upload */}
            <div className="border border-dashed border-card-border rounded-lg p-4">
              <p className="text-xs text-muted mb-2">Upload a reference document (PDF, XLSX, TXT — max 10MB)</p>
              <input type="file" accept=".pdf,.xlsx,.xls,.txt,.doc,.docx"
                onChange={e => { setNewFile(e.target.files?.[0] || null); if (e.target.files?.[0]) setNewPresetId(""); }}
                className="text-sm text-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-zinc-700 file:text-foreground file:text-xs file:cursor-pointer"
              />
              {newFile && <p className="text-xs text-emerald-400 mt-1.5">✓ {newFile.name}</p>}
            </div>

            {/* Or preset */}
            {presets.length > 0 && (
              <div>
                <p className="text-xs text-muted mb-1.5">— OR use a saved preset —</p>
                <select value={newPresetId} onChange={e => { setNewPresetId(e.target.value); if (e.target.value) setNewFile(null); }}
                  className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground">
                  <option value="">Select preset…</option>
                  {presets.map(p => <option key={p.id} value={p.id}>{p.name} ({docTypeLabel(p.documentType)})</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Instructions */}
          <div>
            <label className="text-xs text-muted mb-1.5 block">Additional Instructions (optional)</label>
            <textarea value={newInstructions} onChange={e => setNewInstructions(e.target.value)}
              placeholder="e.g. Make it formal, include a fixturing period of 3 months, use Saskatchewan law…"
              rows={3}
              className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted resize-y"
            />
          </div>

          {/* Generate Button */}
          <button onClick={handleGenerate}
            disabled={generating || !newDocType || (!newFile && !newPresetId)}
            className="px-6 py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/80 disabled:opacity-40 transition">
            {generating ? "Generating…" : "Generate Draft"}
          </button>

          {generating && (
            <div className="flex items-center gap-3 text-sm text-muted">
              <div className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
              Analyzing document and generating draft…
            </div>
          )}

          {/* Generated Result */}
          {generatedContent && (
            <div className="border border-card-border rounded-xl p-4 space-y-3 bg-background/50">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Generated Draft</h3>
                <span className="text-[10px] text-emerald-400">✓ Saved</span>
              </div>
              <textarea
                value={generatedContent}
                onChange={e => setGeneratedContent(e.target.value)}
                rows={20}
                className="w-full bg-background border border-card-border rounded-lg px-4 py-3 text-sm text-foreground font-mono resize-y"
              />
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => handleCopy(generatedContent)}
                  className="px-4 py-2 bg-card border border-card-border text-foreground rounded-lg text-sm font-medium hover:bg-white/[0.04] transition">
                  {copied ? "✓ Copied" : "Copy to Clipboard"}
                </button>
                <button onClick={() => handleDownload(generatedContent, generatedDraft?.title || "draft")}
                  className="px-4 py-2 bg-card border border-card-border text-foreground rounded-lg text-sm font-medium hover:bg-white/[0.04] transition">
                  Download .docx
                </button>
                {generatedDraft && (
                  <button onClick={async () => {
                    await fetch(`/api/drafts/${generatedDraft.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ generatedContent, status: "final" }),
                    });
                    fetchDrafts();
                  }}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-500 transition">
                    Mark as Final
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Preset Suggestion */}
          {presetSuggestion && (
            <div className="border border-amber-500/30 bg-amber-500/5 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-amber-400">💡</span>
                <p className="text-sm text-foreground font-medium">Create a reusable template?</p>
              </div>
              <p className="text-xs text-muted">
                You've created {presetSuggestion.count} similar {docTypeLabel(newDocType)} documents.
                {presetSuggestion.summary && ` ${presetSuggestion.summary}`}
              </p>
              <div className="flex items-center gap-2">
                <input value={presetName} onChange={e => setPresetName(e.target.value)}
                  placeholder="Template name"
                  className="flex-1 bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground" />
                <button onClick={handleSavePreset} disabled={savingPreset || !presetName}
                  className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-500 disabled:opacity-40 transition">
                  {savingPreset ? "Saving…" : "Save Preset"}
                </button>
                <button onClick={() => setPresetSuggestion(null)} className="text-xs text-muted hover:text-foreground">Dismiss</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Presets */}
      {activeTab === "presets" && (
        <div className="space-y-2">
          {presets.length === 0 && (
            <div className="text-center py-12 text-muted">
              <p className="text-lg mb-2">No presets yet</p>
              <p className="text-sm">Presets are suggested after you create 3+ similar documents</p>
            </div>
          )}
          {presets.map(preset => (
            <div key={preset.id} className="bg-card border border-card-border rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${DOC_TYPE_COLORS[preset.documentType] || "bg-zinc-500/20 text-zinc-400"}`}>
                  {docTypeLabel(preset.documentType)}
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground">{preset.name}</p>
                  <p className="text-xs text-muted">{preset.exampleCount} example{preset.exampleCount !== 1 ? "s" : ""} · Updated {new Date(preset.updatedAt).toLocaleDateString("en-CA")}</p>
                </div>
              </div>
              <button onClick={() => handleDeletePreset(preset.id)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
