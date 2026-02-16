"use client";

import { useEffect, useState, useCallback } from "react";

interface Followup {
  id: number;
  contactName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  dealId: number | null;
  note: string | null;
  dueDate: string;
  status: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  dealTenantName: string | null;
  dealPropertyAddress: string | null;
  source?: "followup" | "todo";
}

interface Deal {
  id: number;
  tenantName: string;
  propertyAddress: string;
  stage: string;
}

function relativeDate(dateStr: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T00:00:00");
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff < -1) return `${Math.abs(diff)} days ago`;
  if (diff <= 7) return `In ${diff} days`;
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function addMonths(months: number) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

const QUICK_DATES = [
  { label: "Tomorrow", fn: () => addDays(1) },
  { label: "Next Week", fn: () => addDays(7) },
  { label: "2 Weeks", fn: () => addDays(14) },
  { label: "1 Month", fn: () => addMonths(1) },
  { label: "3 Months", fn: () => addMonths(3) },
  { label: "1 Year", fn: () => addMonths(12) },
];

function FollowupCard({ f, onDone, onReschedule, onEdit, onDelete }: {
  f: Followup;
  onDone: () => void;
  onReschedule: (date: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [showReschedule, setShowReschedule] = useState(false);
  const [customDate, setCustomDate] = useState(f.dueDate);
  const isOverdue = f.dueDate < todayStr() && f.status === "pending";

  return (
    <div className={`bg-card border rounded-lg p-4 ${isOverdue ? "border-red-500/50" : "border-card-border"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{f.contactName}</p>
            {f.source === "todo" && <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500/15 text-blue-400 font-medium">TASK</span>}
          </div>
          {f.dealTenantName && (
            <p className="text-xs text-muted mt-0.5">{f.dealTenantName}{f.dealPropertyAddress ? ` · ${f.dealPropertyAddress}` : ""}</p>
          )}
          {f.dealId && !f.dealTenantName && (
            <p className="text-xs text-muted/50 mt-0.5 italic">Deleted deal</p>
          )}
          <p className={`text-xs mt-1 ${isOverdue ? "text-red-400 font-medium" : f.dueDate === todayStr() ? "text-accent font-medium" : "text-muted"}`}>
            {relativeDate(f.dueDate)}
          </p>
          {f.note && <p className="text-xs text-foreground/70 mt-1.5">{f.note}</p>}
          {(f.contactPhone || f.contactEmail) && (
            <div className="flex gap-3 mt-1.5">
              {f.contactPhone && <span className="text-[10px] text-muted">{f.contactPhone}</span>}
              {f.contactEmail && <span className="text-[10px] text-muted">{f.contactEmail}</span>}
            </div>
          )}
        </div>
        <div className="flex gap-1 flex-shrink-0">
          {f.status === "pending" && (
            <button onClick={onDone} className="px-2 py-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded transition" title="Mark done">✓</button>
          )}
          <button onClick={() => setShowReschedule(!showReschedule)} className="px-2 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 text-foreground rounded transition" title="Reschedule">📅</button>
          <button onClick={onEdit} className="px-2 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 text-foreground rounded transition" title="Edit">✎</button>
          <button onClick={onDelete} className="px-2 py-1 text-xs bg-zinc-700 hover:bg-red-600 text-foreground rounded transition" title="Delete">✕</button>
        </div>
      </div>
      {showReschedule && (
        <div className="mt-3 pt-3 border-t border-card-border/50 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {QUICK_DATES.map(q => (
              <button key={q.label} onClick={() => { onReschedule(q.fn()); setShowReschedule(false); }}
                className="px-2 py-1 text-[11px] bg-zinc-700 hover:bg-accent hover:text-white text-muted rounded transition">{q.label}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <input type="date" value={customDate} onChange={e => setCustomDate(e.target.value)}
              className="bg-background border border-card-border rounded px-2 py-1 text-xs text-foreground" />
            <button onClick={() => { onReschedule(customDate); setShowReschedule(false); }}
              className="px-3 py-1 text-xs bg-accent text-white rounded hover:bg-accent/80 transition">Set</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, color, items, children, defaultCollapsed = false }: {
  title: string; color: string; items: Followup[]; children: React.ReactNode; defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  if (items.length === 0) return null;
  return (
    <div>
      <button onClick={() => setCollapsed(!collapsed)} className="flex items-center gap-2 mb-3 group">
        <span className={`text-sm font-semibold ${color}`}>{title}</span>
        <span className="text-xs text-muted bg-zinc-700/50 rounded-full px-2 py-0.5">{items.length}</span>
        <span className="text-xs text-muted group-hover:text-foreground transition">{collapsed ? "▸" : "▾"}</span>
      </button>
      {!collapsed && <div className="space-y-2">{children}</div>}
    </div>
  );
}

export default function FollowupsPage() {
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [form, setForm] = useState({ contactName: "", contactPhone: "", contactEmail: "", dealId: "", dueDate: addDays(1), note: "" });

  const fetchFollowups = useCallback(async () => {
    const res = await fetch("/api/followups");
    setFollowups(await res.json());
    setLoading(false);
  }, []);

  const fetchDeals = useCallback(async () => {
    const res = await fetch("/api/deals");
    setDeals(await res.json());
  }, []);

  useEffect(() => { fetchFollowups(); fetchDeals(); }, [fetchFollowups, fetchDeals]);

  const handleSave = async () => {
    if (!form.contactName || !form.dueDate) return;
    const body = {
      contactName: form.contactName,
      contactPhone: form.contactPhone || null,
      contactEmail: form.contactEmail || null,
      dealId: form.dealId ? Number(form.dealId) : null,
      dueDate: form.dueDate,
      note: form.note || null,
    };

    if (editId) {
      await fetch(`/api/followups/${editId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } else {
      await fetch("/api/followups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }
    setShowModal(false);
    setEditId(null);
    setForm({ contactName: "", contactPhone: "", contactEmail: "", dealId: "", dueDate: addDays(1), note: "" });
    fetchFollowups();
  };

  const getFollowup = (id: number) => followups.find(f => f.id === id);

  const handleDone = async (id: number) => {
    const f = getFollowup(id);
    if (f?.source === "todo") {
      await fetch(`/api/pipeline/todos/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ completed: 1 }) });
    } else {
      await fetch(`/api/followups/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "done" }) });
    }
    fetchFollowups();
  };

  const handleReschedule = async (id: number, date: string) => {
    const f = getFollowup(id);
    if (f?.source === "todo") {
      await fetch(`/api/pipeline/todos/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dueDate: date }) });
    } else {
      await fetch(`/api/followups/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dueDate: date }) });
    }
    fetchFollowups();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this follow-up?")) return;
    const f = getFollowup(id);
    if (f?.source === "todo") {
      await fetch(`/api/pipeline/todos/${id}`, { method: "DELETE" });
    } else {
      await fetch(`/api/followups/${id}`, { method: "DELETE" });
    }
    fetchFollowups();
  };

  const handleEdit = (f: Followup) => {
    setEditId(f.id);
    setForm({ contactName: f.contactName, contactPhone: f.contactPhone || "", contactEmail: f.contactEmail || "", dealId: f.dealId ? String(f.dealId) : "", dueDate: f.dueDate, note: f.note || "" });
    setShowModal(true);
  };

  const today = todayStr();
  const weekEnd = addDays(7);
  const monthEnd = addDays(30);

  const pending = followups.filter(f => f.status === "pending");
  const done = followups.filter(f => f.status === "done");
  const overdue = pending.filter(f => f.dueDate < today);
  const todayItems = pending.filter(f => f.dueDate === today);
  const thisWeek = pending.filter(f => f.dueDate > today && f.dueDate <= weekEnd);
  const later = pending.filter(f => f.dueDate > weekEnd);

  if (loading) return <div className="p-8 text-muted">Loading follow-ups…</div>;

  const renderCard = (f: Followup) => (
    <FollowupCard key={f.id} f={f} onDone={() => handleDone(f.id)} onReschedule={(d) => handleReschedule(f.id, d)} onEdit={() => handleEdit(f)} onDelete={() => handleDelete(f.id)} />
  );

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Follow-ups</h1>
          <p className="text-sm text-muted mt-1">{pending.length} pending</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowDone(!showDone)} className="px-3 py-2 text-xs text-muted hover:text-foreground bg-card border border-card-border rounded-lg transition">
            {showDone ? "Hide Done" : `Done (${done.length})`}
          </button>
          <button onClick={() => { setEditId(null); setForm({ contactName: "", contactPhone: "", contactEmail: "", dealId: "", dueDate: addDays(1), note: "" }); setShowModal(true); }}
            className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/80 transition">+ Add Follow-up</button>
        </div>
      </div>

      <div className="space-y-6">
        <Section title="🔴 Overdue" color="text-red-400" items={overdue}>{overdue.map(renderCard)}</Section>
        <Section title="📌 Today" color="text-accent" items={todayItems}>{todayItems.map(renderCard)}</Section>
        <Section title="📅 This Week" color="text-foreground" items={thisWeek}>{thisWeek.map(renderCard)}</Section>
        <Section title="🗓 Later" color="text-muted" items={later} defaultCollapsed>{later.map(renderCard)}</Section>
      </div>

      {showDone && done.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted mb-3">✓ Completed</h3>
          <div className="space-y-2 opacity-60">
            {done.map(f => (
              <div key={f.id} className="bg-card border border-card-border rounded-lg p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground line-through">{f.contactName}</p>
                  {f.note && <p className="text-xs text-muted mt-0.5">{f.note}</p>}
                </div>
                <button onClick={() => handleDelete(f.id)} className="text-xs text-muted hover:text-red-400 transition">✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {pending.length === 0 && !showDone && (
        <div className="text-center py-12">
          <p className="text-muted">No follow-ups scheduled. Add one to get started.</p>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="bg-card border border-card-border rounded-xl w-full max-w-md p-5 shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">{editId ? "Edit Follow-up" : "Add Follow-up"}</h3>
              <button onClick={() => setShowModal(false)} className="text-muted hover:text-foreground text-lg">✕</button>
            </div>

            <input placeholder="Contact name *" value={form.contactName} onChange={e => setForm({ ...form, contactName: e.target.value })}
              className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted" />
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="Phone" value={form.contactPhone} onChange={e => setForm({ ...form, contactPhone: e.target.value })}
                className="bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted" />
              <input placeholder="Email" value={form.contactEmail} onChange={e => setForm({ ...form, contactEmail: e.target.value })}
                className="bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted" />
            </div>

            <select value={form.dealId} onChange={e => setForm({ ...form, dealId: e.target.value })}
              className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground">
              <option value="">No linked deal</option>
              {deals.filter(d => d.stage !== "closed").map(d => (
                <option key={d.id} value={d.id}>{d.tenantName} — {d.propertyAddress}</option>
              ))}
            </select>

            <div>
              <label className="text-xs text-muted mb-1.5 block">Due Date</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {QUICK_DATES.map(q => (
                  <button key={q.label} onClick={() => setForm({ ...form, dueDate: q.fn() })}
                    className={`px-2 py-1 text-[11px] rounded transition ${form.dueDate === q.fn() ? "bg-accent text-white" : "bg-zinc-700 text-muted hover:bg-zinc-600"}`}>{q.label}</button>
                ))}
              </div>
              <input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })}
                className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground" />
            </div>

            <textarea placeholder="Note (optional)" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} rows={3}
              className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted resize-y" />

            <button onClick={handleSave} disabled={!form.contactName || !form.dueDate}
              className="w-full px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/80 disabled:opacity-40 transition">
              {editId ? "Save Changes" : "Add Follow-up"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
