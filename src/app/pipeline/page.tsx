"use client";

import { useEffect, useState, useCallback } from "react";
import DealCalculator, { DealEconomicsData } from "@/components/DealCalculator";

interface Todo {
  id: number;
  dealId: number | null;
  text: string;
  completed: number;
  sortOrder: number;
  completedAt: string | null;
  createdAt: string;
  dealName: string | null;
  dealProperty: string | null;
  dealStage: string | null;
}

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
  dealEconomics: string | null;
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

/* Deal Todos inline in expanded view */
function DealTodos({ dealId, todos, onToggle }: { dealId: number; todos: Todo[]; onToggle: (todo: Todo) => void }) {
  const dealTodos = todos.filter(t => t.dealId === dealId);
  if (dealTodos.length === 0) return null;
  return (
    <div className="space-y-1 pb-2 border-b border-card-border/50">
      <p className="text-[10px] text-muted font-medium uppercase tracking-wider">Tasks</p>
      {dealTodos.map(todo => (
        <div key={todo.id} className="flex items-center gap-2">
          <button
            onClick={() => onToggle(todo)}
            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
              todo.completed ? "bg-emerald-500 border-emerald-500" : "border-zinc-500 hover:border-emerald-400"
            }`}
          >
            {todo.completed ? <span className="text-[8px] text-white">✓</span> : null}
          </button>
          <span className={`text-xs ${todo.completed ? "line-through text-muted/50" : "text-foreground/80"}`}>
            {todo.text}
          </span>
        </div>
      ))}
    </div>
  );
}

/* Todo List Section */
function TodoSection({ deals, todos, fetchTodos, fetchDeals }: { deals: Deal[]; todos: Todo[]; fetchTodos: () => void; fetchDeals: () => void }) {
  const [newText, setNewText] = useState("");
  const [hideCompleted, setHideCompleted] = useState(true);
  const [showAllCompleted, setShowAllCompleted] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionFilter, setSuggestionFilter] = useState("");
  const [cursorPos, setCursorPos] = useState(0);

  const incompleteTodos = todos.filter(t => !t.completed);
  const completedTodos = todos.filter(t => t.completed);

  // Parse @mention from text — returns { dealId, cleanText } 
  const parseMention = (text: string): { dealId: number | null; cleanText: string } => {
    const mentionMatch = text.match(/@\[(.+?)\]\((\d+)\)/);
    if (mentionMatch) {
      const dealId = parseInt(mentionMatch[2]);
      const cleanText = text.replace(/@\[.+?\]\(\d+\)/, "").trim();
      return { dealId, cleanText };
    }
    return { dealId: null, cleanText: text.trim() };
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNewText(val);
    setCursorPos(e.target.selectionStart || 0);

    // Check if user just typed @ 
    const beforeCursor = val.slice(0, e.target.selectionStart || 0);
    const atMatch = beforeCursor.match(/@([^@]*)$/);
    if (atMatch) {
      setSuggestionFilter(atMatch[1].toLowerCase());
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  };

  const handleSelectDeal = (deal: Deal) => {
    const beforeCursor = newText.slice(0, cursorPos);
    const afterCursor = newText.slice(cursorPos);
    const atIdx = beforeCursor.lastIndexOf("@");
    const before = beforeCursor.slice(0, atIdx);
    const inserted = `@[${deal.tenantName}](${deal.id})`;
    setNewText((before + inserted + " " + afterCursor).trim());
    setShowSuggestions(false);
  };

  const filteredDeals = deals.filter(d =>
    d.tenantName.toLowerCase().includes(suggestionFilter) ||
    d.propertyAddress.toLowerCase().includes(suggestionFilter)
  );

  const handleAdd = async () => {
    if (!newText.trim()) return;

    // @new creates a new deal as prospect
    const newDealMatch = newText.match(/^@new\s+(.+)/i);
    if (newDealMatch) {
      const raw = newDealMatch[1].trim();
      // Split on first comma or dash to get name vs details
      const sepMatch = raw.match(/^([^,\-]+)[,\-]\s*(.+)$/);
      const dealName = sepMatch ? sepMatch[1].trim() : raw;
      const details = sepMatch ? sepMatch[2].trim() : "";
      const notes = details || null;
      await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantName: dealName,
          propertyAddress: "",
          stage: "prospect",
          notes,
        }),
      });
      setNewText("");
      fetchDeals();
      return;
    }

    const { dealId, cleanText } = parseMention(newText);
    if (!cleanText) return;
    await fetch("/api/pipeline/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealId, text: cleanText }),
    });
    setNewText("");
    fetchTodos();
    fetchDeals();
  };

  const handleToggle = async (todo: Todo) => {
    await fetch(`/api/pipeline/todos/${todo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: todo.completed ? 0 : 1 }),
    });
    fetchTodos();
    fetchDeals();
  };

  const handleDelete = async (id: number) => {
    await fetch(`/api/pipeline/todos/${id}`, { method: "DELETE" });
    fetchTodos();
  };

  const handleMove = async (todo: Todo, direction: "up" | "down") => {
    const list = incompleteTodos;
    const idx = list.findIndex(t => t.id === todo.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= list.length) return;

    const items = [
      { id: list[idx].id, sortOrder: list[swapIdx].sortOrder },
      { id: list[swapIdx].id, sortOrder: list[idx].sortOrder },
    ];

    await fetch("/api/pipeline/todos", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    fetchTodos();
  };

  // Render text with @mention highlighted
  const renderTodoText = (todo: Todo) => (
    <span className="text-sm text-foreground flex-1">
      {todo.text}
      {todo.dealName && (
        <span className="text-[10px] text-muted bg-zinc-700/60 rounded-full px-2 py-0.5 ml-2 flex-shrink-0">{todo.dealName}</span>
      )}
    </span>
  );

  return (
    <div className="bg-card border border-card-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-foreground">To Do</h2>
          <span className="text-xs text-muted bg-zinc-700/50 rounded-full px-2 py-0.5">{incompleteTodos.length}</span>
        </div>
        <button
          onClick={() => setHideCompleted(!hideCompleted)}
          className="text-xs text-muted hover:text-foreground transition"
        >
          {hideCompleted ? "Show completed" : "Hide completed"}
        </button>
      </div>

      {/* Add todo */}
      <div className="relative flex gap-2 mb-4">
        <div className="relative flex-1">
          <input
            value={newText}
            onChange={handleInputChange}
            onKeyDown={e => {
              if (e.key === "Enter" && !showSuggestions) handleAdd();
              if (e.key === "Escape") setShowSuggestions(false);
            }}
            placeholder="Add a task… (@ to link deal, @new to create deal)"
            className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted"
          />
          {showSuggestions && filteredDeals.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto">
              {filteredDeals.map(d => (
                <button
                  key={d.id}
                  onClick={() => handleSelectDeal(d)}
                  className="w-full text-left px-3 py-2 hover:bg-zinc-700 transition text-sm"
                >
                  <span className="text-white font-medium">{d.tenantName}</span>
                  <span className="text-zinc-400 text-xs ml-2">{d.propertyAddress}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={handleAdd} disabled={!newText.trim()} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/80 disabled:opacity-40 transition">
          Add
        </button>
      </div>

      {/* Incomplete todos */}
      <div className="space-y-1">
        {incompleteTodos.map((todo, idx) => (
          <div key={todo.id} className="flex items-center gap-2 group py-1.5 px-2 rounded-lg hover:bg-zinc-800/50 transition">
            <button
              onClick={() => handleToggle(todo)}
              className="w-5 h-5 rounded-full border-2 border-zinc-500 hover:border-emerald-400 flex items-center justify-center flex-shrink-0 transition-colors"
            />
            {renderTodoText(todo)}
            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition">
              <button onClick={() => handleMove(todo, "up")} disabled={idx === 0} className="text-zinc-500 hover:text-foreground disabled:opacity-20 text-xs px-1">▲</button>
              <button onClick={() => handleMove(todo, "down")} disabled={idx === incompleteTodos.length - 1} className="text-zinc-500 hover:text-foreground disabled:opacity-20 text-xs px-1">▼</button>
              <button onClick={() => handleDelete(todo.id)} className="text-zinc-500 hover:text-red-400 text-xs px-1">✕</button>
            </div>
          </div>
        ))}
      </div>

      {/* Completed todos — show 5 most recent, expandable */}
      {!hideCompleted && completedTodos.length > 0 && (() => {
        const showAll = hideCompleted === false && completedTodos.length > 5;
        const visible = showAllCompleted ? completedTodos : completedTodos.slice(0, 5);
        return (
          <>
            <div className="border-t border-zinc-700/50 my-3" />
            <div className="space-y-1">
              {visible.map(todo => (
                <div key={todo.id} className="flex items-center gap-2 group py-1.5 px-2 rounded-lg hover:bg-zinc-800/50 transition">
                  <button
                    onClick={() => handleToggle(todo)}
                    className="w-5 h-5 rounded-full bg-emerald-500 border-2 border-emerald-500 flex items-center justify-center flex-shrink-0"
                  >
                    <span className="text-[10px] text-white">✓</span>
                  </button>
                  <span className="text-sm text-muted/50 line-through flex-1">{todo.text}</span>
                  <span className="text-[10px] text-muted/40 bg-zinc-700/30 rounded-full px-2 py-0.5 flex-shrink-0">{todo.dealName}</span>
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition">
                    <button onClick={() => handleDelete(todo.id)} className="text-zinc-500 hover:text-red-400 text-xs px-1">✕</button>
                  </div>
                </div>
              ))}
            </div>
            {completedTodos.length > 5 && (
              <button
                onClick={() => setShowAllCompleted(!showAllCompleted)}
                className="text-xs text-muted hover:text-foreground transition mt-2"
              >
                {showAllCompleted ? "Show less" : `Show more (${completedTodos.length - 5} more)`}
              </button>
            )}
          </>
        );
      })()}

      {todos.length === 0 && (
        <p className="text-sm text-muted/50 text-center py-6">No tasks yet. Add one above.</p>
      )}
    </div>
  );
}

/* Economics summary shown on deal card */
function EconomicsSummary({ data }: { data: DealEconomicsData }) {
  const r = data.results;
  return (
    <div className="mt-1.5 flex items-center gap-2 flex-wrap">
      <span className="text-[10px] bg-emerald-900/40 text-emerald-400 rounded px-1.5 py-0.5">
        NER ${r.nerYear.toFixed(2)}/SF
      </span>
      <span className="text-[10px] bg-blue-900/40 text-blue-400 rounded px-1.5 py-0.5">
        Comm ${r.commission >= 1000 ? `$${(r.commission / 1000).toFixed(1)}k` : `$${r.commission.toFixed(0)}`}
      </span>
      <span className="text-[10px] bg-zinc-700/60 text-zinc-400 rounded px-1.5 py-0.5">
        📊
      </span>
    </div>
  );
}

/* Modal overlay for deal calculator */
function EconomicsModal({ deal, onClose, onSaved }: { deal: Deal; onClose: () => void; onSaved: () => void }) {
  const existing: DealEconomicsData | null = deal.dealEconomics ? JSON.parse(deal.dealEconomics) : null;

  const handleSave = async (data: DealEconomicsData) => {
    await fetch(`/api/deals/${deal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealEconomics: JSON.stringify(data) }),
    });
    onSaved();
    onClose();
  };

  const handleRemove = async () => {
    await fetch(`/api/deals/${deal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealEconomics: null }),
    });
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-white">Deal Economics</h3>
            <p className="text-xs text-zinc-400">{deal.tenantName} — {deal.propertyAddress || "No address"}</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white text-lg px-2">✕</button>
        </div>
        <DealCalculator initialData={existing} onSave={handleSave} onRemove={handleRemove} compact />
      </div>
    </div>
  );
}

/* Standalone calculator tab with optional deal linking */
function DealCalculatorWithDealLink({ deals, onSaved }: { deals: Deal[]; onSaved: () => void }) {
  const [selectedDealId, setSelectedDealId] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);

  const selectedDeal = selectedDealId ? deals.find(d => d.id === selectedDealId) : null;
  const existingData: DealEconomicsData | null = selectedDeal?.dealEconomics ? JSON.parse(selectedDeal.dealEconomics) : null;

  const handleSave = async (data: DealEconomicsData) => {
    if (!selectedDealId) return;
    await fetch(`/api/deals/${selectedDealId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealEconomics: JSON.stringify(data) }),
    });
    onSaved();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleRemove = async () => {
    if (!selectedDealId) return;
    await fetch(`/api/deals/${selectedDealId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealEconomics: null }),
    });
    onSaved();
  };

  return (
    <div className="space-y-4">
      {/* Deal picker */}
      <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <label className="text-xs text-zinc-400 whitespace-nowrap">Link to Deal</label>
          <select
            value={selectedDealId ?? ""}
            onChange={e => { setSelectedDealId(e.target.value ? Number(e.target.value) : null); setSaved(false); }}
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-0"
          >
            <option value="">None — standalone calculation</option>
            {deals.map(d => (
              <option key={d.id} value={d.id}>
                {d.tenantName}{d.propertyAddress ? ` — ${d.propertyAddress}` : ""} ({STAGE_LABELS[d.stage]})
              </option>
            ))}
          </select>
          {saved && <span className="text-xs text-emerald-400">✓ Saved</span>}
        </div>
        {selectedDeal?.dealEconomics && (
          <p className="text-[10px] text-zinc-500 mt-2">This deal has saved economics. Changes below will update on save.</p>
        )}
      </div>

      <DealCalculator
        key={selectedDealId ?? "standalone"}
        initialData={existingData}
        onSave={selectedDealId ? handleSave : undefined}
        onRemove={selectedDealId && existingData ? handleRemove : undefined}
      />
    </div>
  );
}

export default function PipelinePage() {
  const [activeTab, setActiveTab] = useState<"pipeline" | "calculator">("pipeline");
  const [deals, setDeals] = useState<Deal[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [newComment, setNewComment] = useState("");
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [form, setForm] = useState({ tenantName: "", propertyAddress: "", stage: "prospect", initialNote: "" });
  const [economicsDealId, setEconomicsDealId] = useState<number | null>(null);

  const fetchDeals = useCallback(async () => {
    const res = await fetch("/api/deals");
    setDeals(await res.json());
    setLoading(false);
  }, []);

  const fetchTodos = useCallback(async () => {
    const res = await fetch("/api/pipeline/todos");
    setTodos(await res.json());
  }, []);

  useEffect(() => { fetchDeals(); fetchTodos(); }, [fetchDeals, fetchTodos]);

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
    try {
      const res = await fetch(`/api/deals/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("Delete failed:", res.status, err);
        alert(`Failed to delete deal: ${err.error || res.statusText}`);
        return;
      }
      setExpandedId(null);
      await fetchDeals();
    } catch (err) {
      console.error("Delete error:", err);
      alert("Failed to delete deal");
    }
  };

  const handleUpdateContact = async (dealId: number, field: string, value: string) => {
    await fetch(`/api/deals/${dealId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    fetchDeals();
  };

  const handleToggleTodo = async (todo: Todo) => {
    await fetch(`/api/pipeline/todos/${todo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: todo.completed ? 0 : 1 }),
    });
    fetchTodos();
    fetchDeals();
  };

  const activeCount = deals.filter(d => d.stage !== "closed").length;

  if (loading) return <div className="p-8 text-muted">Loading pipeline…</div>;

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-zinc-800/50 rounded-lg p-1">
          <button
            onClick={() => setActiveTab("pipeline")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${activeTab === "pipeline" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white"}`}
          >Pipeline</button>
          <button
            onClick={() => setActiveTab("calculator")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${activeTab === "calculator" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white"}`}
          >Deal Calculator</button>
        </div>
        {activeTab === "pipeline" && (
          <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/80 transition">
            {showForm ? "Cancel" : "+ Add Deal"}
          </button>
        )}
      </div>

      {activeTab === "calculator" && (
        <DealCalculatorWithDealLink deals={deals} onSaved={fetchDeals} />
      )}

      {/* Economics modal */}
      {economicsDealId && (() => {
        const deal = deals.find(d => d.id === economicsDealId);
        if (!deal) return null;
        return (
          <EconomicsModal
            deal={deal}
            onClose={() => setEconomicsDealId(null)}
            onSaved={fetchDeals}
          />
        );
      })()}

      {activeTab === "pipeline" && (<>
      {/* To Do Section */}
      <TodoSection deals={deals} todos={todos} fetchTodos={fetchTodos} fetchDeals={fetchDeals} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Deal Pipeline</h1>
          <p className="text-sm text-muted mt-1">{activeCount} Active Deal{activeCount !== 1 ? "s" : ""}</p>
        </div>
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
                        {deal.dealEconomics && (() => {
                          try { return <EconomicsSummary data={JSON.parse(deal.dealEconomics)} />; } catch { return null; }
                        })()}
                      </div>

                      {isExpanded && (
                        <div className="border-t border-card-border p-3 space-y-3" onClick={e => e.stopPropagation()}>
                          {/* Contact fields */}
                          <div className="space-y-1 pb-2 border-b border-card-border/50">
                            <ContactField label="Email" value={deal.tenantEmail || ""} placeholder="tenant@example.com" onSave={v => handleUpdateContact(deal.id, "tenantEmail", v)} />
                            <ContactField label="Phone" value={deal.tenantPhone || ""} placeholder="306-555-0000" onSave={v => handleUpdateContact(deal.id, "tenantPhone", v)} />
                          </div>

                          {/* Deal todos */}
                          <DealTodos dealId={deal.id} todos={todos} onToggle={handleToggleTodo} />

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

                          {/* Deal Economics */}
                          <div className="pt-1">
                            <button
                              onClick={() => setEconomicsDealId(deal.id)}
                              className="text-xs text-accent hover:text-accent/80"
                            >
                              📊 {deal.dealEconomics ? "Edit Economics" : "Add Economics"}
                            </button>
                          </div>

                          {/* Generate Email */}
                          <GenerateEmail deal={deal} onRefreshDeal={fetchDeals} />

                          {/* Actions */}

                          {/* Actions */}

                          {/* Actions */}
                          <div className="flex gap-2 pt-1">
                            <button onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${deal.tenantName}"? This cannot be undone.`)) handleDelete(deal.id); }} className="px-2 py-1 text-[10px] text-red-400 hover:text-red-300">Delete Deal</button>
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

      </>)}
    </div>
  );
}
