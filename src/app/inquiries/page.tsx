"use client";

import { useEffect, useState } from "react";

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
  status: string | null;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  new: "#3b82f6",
  contacted: "#f59e0b",
  qualified: "#10b981",
  not_a_fit: "#6b7280",
  lost: "#ef4444",
};

const TABS = ["All", "New", "Contacted", "Qualified", "Not a Fit"];
const tabToStatus: Record<string, string | null> = {
  All: null,
  New: "new",
  Contacted: "contacted",
  Qualified: "qualified",
  "Not a Fit": "not_a_fit",
};

export default function InquiriesPage() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [tab, setTab] = useState("All");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [editNotes, setEditNotes] = useState<Record<number, string>>({});

  const load = () => {
    const params = new URLSearchParams();
    const s = tabToStatus[tab];
    if (s) params.set("status", s);
    if (search) params.set("search", search);
    fetch(`/api/inquiries?${params}`).then(r => r.json()).then(setInquiries);
  };

  useEffect(() => { load(); }, [tab, search]);

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

  const now = new Date();
  const thisMonth = inquiries.filter(i => {
    const d = new Date(i.createdAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Inquiries</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total", value: inquiries.length, color: "text-foreground" },
          { label: "New", value: inquiries.filter(i => i.status === "new").length, color: "text-blue-400" },
          { label: "Qualified", value: inquiries.filter(i => i.status === "qualified").length, color: "text-emerald-400" },
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
        className="w-full bg-card border border-card-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted mb-4 focus:outline-none focus:border-accent/50"
      />

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
                <div className="flex flex-wrap gap-3 items-end">
                  <div>
                    <label className="text-[11px] text-muted block mb-1">Status</label>
                    <select
                      value={inq.status || "new"}
                      onChange={e => updateStatus(inq.id, e.target.value)}
                      className="bg-background border border-card-border rounded-lg px-3 py-1.5 text-sm text-foreground"
                    >
                      <option value="new">New</option>
                      <option value="contacted">Contacted</option>
                      <option value="qualified">Qualified</option>
                      <option value="not_a_fit">Not a Fit</option>
                      <option value="lost">Lost</option>
                    </select>
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <label className="text-[11px] text-muted block mb-1">Notes</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editNotes[inq.id] ?? inq.notes ?? ""}
                        onChange={e => setEditNotes(n => ({ ...n, [inq.id]: e.target.value }))}
                        className="flex-1 bg-background border border-card-border rounded-lg px-3 py-1.5 text-sm text-foreground"
                        placeholder="Add notes..."
                      />
                      <button
                        onClick={() => saveNotes(inq.id)}
                        className="bg-accent/15 text-accent px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-accent/25"
                      >
                        Save
                      </button>
                    </div>
                  </div>
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
