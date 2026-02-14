"use client";

import { useEffect, useState, useCallback } from "react";

interface Comment {
  text: string;
  date: string;
}

interface Deal {
  id: number;
  tenantName: string;
  tenantCompany: string | null;
  tenantEmail: string | null;
  tenantPhone: string | null;
  propertyAddress: string;
  stage: string;
  stageEnteredAt: string;
  notes: string | null;
  updatedAt: string;
}

const STAGES = ["prospect", "ongoing", "closed"] as const;
const STAGE_LABELS: Record<string, string> = { prospect: "Prospect", ongoing: "Ongoing", closed: "Closed" };
const STAGE_COLORS: Record<string, string> = {
  prospect: "bg-zinc-600", ongoing: "bg-blue-600", closed: "bg-emerald-600",
};

function parseComments(notes: string | null): Comment[] {
  if (!notes) return [];
  try {
    const parsed = JSON.parse(notes);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return notes ? [{ text: notes, date: "" }] : [];
}

function daysSince(dateStr: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000));
}

function formatDate(dateStr: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" });
}

/* Inline editable contact field */
function ContactField({ label, value, placeholder, onSave }: { label: string; value: string; placeholder: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-muted w-12">{label}</span>
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { onSave(draft); setEditing(false); } if (e.key === "Escape") setEditing(false); }}
          onBlur={() => { onSave(draft); setEditing(false); }}
          className="flex-1 bg-background border border-card-border rounded px-1.5 py-0.5 text-xs text-foreground"
          placeholder={placeholder}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 cursor-pointer group" onClick={() => setEditing(true)}>
      <span className="text-[10px] text-muted w-12">{label}</span>
      <span className="text-xs text-foreground/70 group-hover:text-accent transition">
        {value || <span className="italic text-muted/50">+ Add {label.toLowerCase()}</span>}
      </span>
    </div>
  );
}

/* Email generation section */
function GenerateEmail({ deal, onRefreshDeal }: { deal: Deal; onRefreshDeal: () => void }) {
  const [open, setOpen] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ subject: string; body: string; recipientEmail: string } | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    if (!instructions.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/deals/${deal.id}/generate-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructions }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(data);
        setEditSubject(data.subject);
        setEditBody(data.body);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEmail = () => {
    const email = deal.tenantEmail || result?.recipientEmail || "";
    const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(editSubject)}&body=${encodeURIComponent(editBody)}`;
    window.open(mailto);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(`Subject: ${editSubject}\n\n${editBody}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!open) {
    return (
      <div className="pt-2">
        <button onClick={() => setOpen(true)} className="text-xs text-accent hover:text-accent/80">
          ✉ Generate Email
        </button>
      </div>
    );
  }

  return (
    <div className="pt-2 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">Generate Email</span>
        <button onClick={() => { setOpen(false); setResult(null); }} className="text-[10px] text-muted hover:text-foreground">Close</button>
      </div>

      <div className="flex gap-2">
        <input
          value={instructions}
          onChange={e => setInstructions(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") generate(); }}
          placeholder="e.g. Follow up after tour, mention 2 other options nearby"
          className="flex-1 bg-background border border-card-border rounded px-2 py-1.5 text-xs text-foreground placeholder:text-muted"
        />
        <button onClick={generate} disabled={loading} className="px-3 py-1.5 bg-accent text-white rounded text-xs font-medium hover:bg-accent/80 disabled:opacity-50">
          {loading ? "…" : result ? "Regenerate" : "Generate"}
        </button>
      </div>

      {result && (
        <div className="border border-card-border rounded-lg p-3 space-y-2 bg-background/50">
          <div>
            <label className="text-[10px] text-muted">Subject</label>
            <input value={editSubject} onChange={e => setEditSubject(e.target.value)} className="w-full bg-background border border-card-border rounded px-2 py-1 text-xs text-foreground mt-0.5" />
          </div>
          <div>
            <label className="text-[10px] text-muted">Body</label>
            <textarea value={editBody} onChange={e => setEditBody(e.target.value)} rows={8} className="w-full bg-background border border-card-border rounded px-2 py-1 text-xs text-foreground mt-0.5 resize-y" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleOpenEmail} className="px-3 py-1.5 bg-accent text-white rounded text-xs font-medium hover:bg-accent/80">
              Open in Email
            </button>
            <button onClick={handleCopy} className="px-3 py-1.5 bg-card border border-card-border text-foreground rounded text-xs font-medium hover:bg-card-hover">
              {copied ? "✓ Copied" : "Copy to Clipboard"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PipelinePage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [newComment, setNewComment] = useState("");
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [form, setForm] = useState({ tenantName: "", propertyAddress: "", stage: "prospect", initialNote: "" });

  const fetchDeals = useCallback(async () => {
    const res = await fetch("/api/deals");
    setDeals(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchDeals(); }, [fetchDeals]);

  const handleDrop = async (stage: string, dealId: number) => {
    setDragOverStage(null);
    await fetch(`/api/deals/${dealId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage }) });
    fetchDeals();
  };

  const handleCreate = async () => {
    if (!form.tenantName) return;
    await fetch("/api/deals", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantName: form.tenantName,
        propertyAddress: form.propertyAddress || "",
        stage: form.stage,
        notes: form.initialNote || undefined,
      }),
    });
    setForm({ tenantName: "", propertyAddress: "", stage: "prospect", initialNote: "" });
    setShowForm(false);
    fetchDeals();
  };

  const handleAddComment = async (deal: Deal) => {
    if (!newComment.trim()) return;
    const comments = parseComments(deal.notes);
    comments.push({ text: newComment.trim(), date: new Date().toISOString() });
    await fetch(`/api/deals/${deal.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: JSON.stringify(comments) }),
    });
    setNewComment("");
    fetchDeals();
  };

  const handleDelete = async (id: number) => {
    await fetch(`/api/deals/${id}`, { method: "DELETE" });
    setExpandedId(null);
    fetchDeals();
  };

  const handleUpdateContact = async (dealId: number, field: string, value: string) => {
    await fetch(`/api/deals/${dealId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    fetchDeals();
  };

  const activeCount = deals.filter(d => d.stage !== "closed").length;

  if (loading) return <div className="p-8 text-muted">Loading pipeline…</div>;

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Deal Pipeline</h1>
          <p className="text-sm text-muted mt-1">{activeCount} Active Deal{activeCount !== 1 ? "s" : ""}</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/80 transition">
          {showForm ? "Cancel" : "+ Add Deal"}
        </button>
      </div>

      {showForm && (
        <div className="bg-card border border-card-border rounded-xl p-5 space-y-3">
          <input placeholder="Deal Name *" value={form.tenantName} onChange={e => setForm({ ...form, tenantName: e.target.value })} className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted" />
          <input placeholder="Property Address" value={form.propertyAddress} onChange={e => setForm({ ...form, propertyAddress: e.target.value })} className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted" />
          <select value={form.stage} onChange={e => setForm({ ...form, stage: e.target.value })} className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground">
            {STAGES.map(s => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
          </select>
          <textarea placeholder="Initial note (optional)" value={form.initialNote} onChange={e => setForm({ ...form, initialNote: e.target.value })} className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted" rows={2} />
          <button onClick={handleCreate} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/80">Create Deal</button>
        </div>
      )}

      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map(stage => {
          const stageDeals = deals.filter(d => d.stage === stage);
          return (
            <div
              key={stage}
              className={`min-w-[300px] flex-1 rounded-xl border transition-colors ${dragOverStage === stage ? "border-accent bg-accent/5" : "border-card-border bg-card/50"}`}
              onDragOver={e => { e.preventDefault(); setDragOverStage(stage); }}
              onDragLeave={() => setDragOverStage(null)}
              onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData("dealId"); if (id) handleDrop(stage, Number(id)); }}
            >
              <div className={`${STAGE_COLORS[stage]} rounded-t-xl px-4 py-2.5`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">{STAGE_LABELS[stage]}</span>
                  <span className="text-xs text-white/70 bg-white/20 rounded-full px-2 py-0.5">{stageDeals.length}</span>
                </div>
              </div>
              <div className="p-2 space-y-2 min-h-[100px]">
                {stageDeals.map(deal => {
                  const comments = parseComments(deal.notes);
                  const lastComment = comments.length > 0 ? comments[comments.length - 1] : null;
                  const days = daysSince(deal.updatedAt);
                  const isExpanded = expandedId === deal.id;

                  return (
                    <div
                      key={deal.id}
                      draggable
                      onDragStart={e => { e.dataTransfer.setData("dealId", String(deal.id)); e.dataTransfer.effectAllowed = "move"; }}
                      className="bg-card border border-card-border rounded-lg cursor-grab active:cursor-grabbing hover:border-accent/40 hover:shadow-lg hover:shadow-accent/5 transition-all"
                    >
                      <div className="p-3" onClick={() => { setExpandedId(isExpanded ? null : deal.id); setNewComment(""); }}>
                        <p className="text-sm font-semibold text-foreground">{deal.tenantName}</p>
                        {deal.propertyAddress && <p className="text-xs text-muted mt-0.5 truncate">{deal.propertyAddress}</p>}
                        {lastComment && (
                          <p className="text-xs text-muted/70 mt-1.5 truncate italic">
                            {lastComment.text.slice(0, 60)}{lastComment.text.length > 60 ? "…" : ""}
                          </p>
                        )}
                        <p className="text-[10px] text-muted/50 mt-1.5">{days === 0 ? "Updated today" : `${days}d since update`}</p>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-card-border p-3 space-y-3" onClick={e => e.stopPropagation()}>
                          {/* Contact fields */}
                          <div className="space-y-1 pb-2 border-b border-card-border/50">
                            <ContactField label="Email" value={deal.tenantEmail || ""} placeholder="tenant@example.com" onSave={v => handleUpdateContact(deal.id, "tenantEmail", v)} />
                            <ContactField label="Phone" value={deal.tenantPhone || ""} placeholder="306-555-0000" onSave={v => handleUpdateContact(deal.id, "tenantPhone", v)} />
                          </div>

                          {/* Comment timeline */}
                          <div className="space-y-2 max-h-[300px] overflow-y-auto">
                            {comments.length === 0 && <p className="text-xs text-muted italic">No notes yet</p>}
                            {comments.map((c, i) => (
                              <div key={i} className="text-xs">
                                {c.date && <p className="text-muted/50 text-[10px] mb-0.5">{formatDate(c.date)}</p>}
                                <p className="text-foreground/80">{c.text}</p>
                              </div>
                            ))}
                          </div>

                          {/* Add comment */}
                          <div className="flex gap-2">
                            <input
                              value={newComment}
                              onChange={e => setNewComment(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddComment(deal); } }}
                              placeholder="Add a note…"
                              className="flex-1 bg-background border border-card-border rounded px-2 py-1.5 text-xs text-foreground placeholder:text-muted"
                            />
                            <button onClick={() => handleAddComment(deal)} className="px-3 py-1.5 bg-accent text-white rounded text-xs font-medium hover:bg-accent/80">Add</button>
                          </div>

                          {/* Generate Email */}
                          <GenerateEmail deal={deal} onRefreshDeal={fetchDeals} />

                          {/* Actions */}
                          <div className="flex gap-2 pt-1">
                            <button onClick={() => handleDelete(deal.id)} className="px-2 py-1 text-[10px] text-red-400 hover:text-red-300">Delete Deal</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
