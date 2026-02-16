"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface DataPoint {
  type: "comp" | "permit" | "company" | "property";
  id: number;
  label: string;
}

interface Insight {
  id: number;
  title: string;
  hypothesis: string;
  reasoning: string;
  category: string;
  confidence: number;
  dataPoints: string | null;
  feedbackRating: number | null;
  feedbackComment: string | null;
  feedbackUserName: string | null;
  feedbackAt: string | null;
  generatedAt: string;
}

const categoryColors: Record<string, string> = {
  lease_expiry: "bg-blue-500/15 text-blue-400",
  permit_activity: "bg-amber-500/15 text-amber-400",
  acquisition_pattern: "bg-purple-500/15 text-purple-400",
  vacancy_signal: "bg-red-500/15 text-red-400",
  tenant_movement: "bg-cyan-500/15 text-cyan-400",
  market_anomaly: "bg-orange-500/15 text-orange-400",
  cross_reference: "bg-emerald-500/15 text-emerald-400",
};

const categoryLabels: Record<string, string> = {
  lease_expiry: "LEASE EXPIRY",
  permit_activity: "PERMIT ACTIVITY",
  acquisition_pattern: "ACQUISITION PATTERN",
  vacancy_signal: "VACANCY SIGNAL",
  tenant_movement: "TENANT MOVEMENT",
  market_anomaly: "MARKET ANOMALY",
  cross_reference: "CROSS-REFERENCE",
};

function dataPointLink(dp: DataPoint): string {
  switch (dp.type) {
    case "comp": return `/comps?highlight=${dp.id}`;
    case "permit": return `/permits?highlight=${dp.id}`;
    case "company": return `/companies/${dp.id}`;
    case "property": return `/properties/${dp.id}`;
    default: return "#";
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function NovaPickCard({ insight: initialInsight, showNav = true }: { insight?: Insight | null; showNav?: boolean }) {
  const [insight, setInsight] = useState<Insight | null>(initialInsight || null);
  const [loading, setLoading] = useState(!initialInsight);
  const [expanded, setExpanded] = useState(false);
  const [voted, setVoted] = useState(false);
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [showPrevious, setShowPrevious] = useState(false);
  const [previousPicks, setPreviousPicks] = useState<Insight[]>([]);
  const [loadingPrevious, setLoadingPrevious] = useState(false);

  useEffect(() => {
    if (!initialInsight && loading) {
      fetch("/api/insights?limit=1")
        .then(r => r.json())
        .then(d => {
          setInsight(d.insights?.[0] || null);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [initialInsight, loading]);

  useEffect(() => {
    if (insight?.feedbackRating) setVoted(true);
  }, [insight]);

  const trackView = () => {
    fetch("/api/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "view", category: "insights", detail: JSON.stringify({ insightId: insight?.id }) }),
    }).catch(() => {});
  };

  const submitFeedback = async (rating: 1 | -1) => {
    if (!insight || voted) return;
    if (rating === -1) {
      setShowComment(true);
      // Pre-set the rating so we can submit with comment
      setInsight({ ...insight, feedbackRating: rating });
      return;
    }
    try {
      const res = await fetch(`/api/insights/${insight.id}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating }),
      });
      if (res.ok) {
        const data = await res.json();
        setInsight(data.insight);
        setVoted(true);
      }
    } catch {}
  };

  const submitCommentFeedback = async () => {
    if (!insight) return;
    setSubmittingComment(true);
    try {
      const res = await fetch(`/api/insights/${insight.id}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: -1, comment }),
      });
      if (res.ok) {
        const data = await res.json();
        setInsight(data.insight);
        setVoted(true);
        setShowComment(false);
      }
    } catch {} finally {
      setSubmittingComment(false);
    }
  };

  if (loading) {
    return (
      <div className="card-elevated p-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">✨</span>
          <h2 className="text-sm font-semibold text-foreground">Nova&apos;s Pick</h2>
        </div>
        <div className="py-6 text-center">
          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm text-muted">Loading...</p>
        </div>
      </div>
    );
  }

  if (!insight) {
    return (
      <div className="card-elevated p-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">✨</span>
          <h2 className="text-sm font-semibold text-foreground">Nova&apos;s Pick</h2>
        </div>
        <div className="py-8 text-center">
          <p className="text-sm text-muted">Nova&apos;s first daily pick drops tomorrow morning. Stay tuned. ✨</p>
        </div>
      </div>
    );
  }

  let dataPoints: DataPoint[] = [];
  try {
    dataPoints = JSON.parse(insight.dataPoints || "[]");
  } catch {}

  const hypothesisTruncated = insight.hypothesis.length > 250 && !expanded;

  return (
    <div className="card-elevated p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">✨</span>
          <h2 className="text-sm font-semibold text-foreground">Nova&apos;s Pick</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">{formatDate(insight.generatedAt)}</span>
          <span className="text-xs text-muted/60">Nova is {Math.round(insight.confidence * 100)}% confident</span>
        </div>
      </div>

      {/* Category + Title */}
      <div className="mb-3">
        <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${categoryColors[insight.category] || "bg-zinc-500/15 text-zinc-400"}`}>
          {categoryLabels[insight.category] || insight.category}
        </span>
        <h3 className="text-base font-semibold text-foreground mt-2">&ldquo;{insight.title}&rdquo;</h3>
      </div>

      {/* Hypothesis */}
      <div className="mb-4">
        <p className="text-sm text-muted leading-relaxed whitespace-pre-line">
          {hypothesisTruncated ? insight.hypothesis.slice(0, 250) + "..." : insight.hypothesis}
        </p>
        {insight.hypothesis.length > 250 && (
          <button
            onClick={() => {
              setExpanded(!expanded);
              if (!expanded) trackView();
            }}
            className="text-xs text-accent hover:text-accent/80 mt-1 font-medium"
          >
            {expanded ? "Show less ▲" : "Read more ▼"}
          </button>
        )}
      </div>

      {/* Reasoning (when expanded) */}
      {expanded && insight.reasoning && (
        <div className="mb-4 pl-3 border-l-2 border-card-border">
          <p className="text-xs text-muted/80 font-medium mb-1">Reasoning:</p>
          <p className="text-xs text-muted leading-relaxed whitespace-pre-line">{insight.reasoning}</p>
        </div>
      )}

      {/* Data Points */}
      {dataPoints.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="text-xs text-muted/60">Data points:</span>
          {dataPoints.map((dp, i) => (
            <Link
              key={i}
              href={dataPointLink(dp)}
              className="text-xs text-accent hover:text-accent/80 hover:underline"
            >
              {dp.type.charAt(0).toUpperCase() + dp.type.slice(1)} #{dp.id}
              {i < dataPoints.length - 1 ? " ·" : ""}
            </Link>
          ))}
        </div>
      )}

      {/* Feedback */}
      {!voted && !showComment && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => submitFeedback(1)}
            className="flex items-center gap-1.5 text-sm text-muted hover:text-emerald-400 transition px-3 py-1.5 rounded-lg hover:bg-emerald-400/10"
          >
            👍 Useful
          </button>
          <button
            onClick={() => submitFeedback(-1)}
            className="flex items-center gap-1.5 text-sm text-muted hover:text-red-400 transition px-3 py-1.5 rounded-lg hover:bg-red-400/10"
          >
            👎 Not useful
          </button>
        </div>
      )}

      {showComment && !voted && (
        <div className="space-y-2">
          <p className="text-xs text-muted">Help Nova learn — what was off about the logic?</p>
          <div className="flex gap-2">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && comment.trim()) { e.preventDefault(); submitCommentFeedback(); } }}
              placeholder="e.g. 'The permit and the lease are likely unrelated — different suites in the same building'"
              rows={2}
              className="flex-1 text-sm px-3 py-1.5 bg-card border border-card-border rounded-lg text-foreground placeholder:text-muted/50 focus:outline-none focus:border-accent/50 resize-none"
            />
            <div className="flex flex-col gap-1">
              <button
                onClick={submitCommentFeedback}
                disabled={submittingComment || !comment.trim()}
                className="text-sm px-3 py-1.5 bg-red-500/15 text-red-400 rounded-lg hover:bg-red-500/25 transition disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {submittingComment ? "..." : "Submit"}
              </button>
              <button
                onClick={() => { setShowComment(false); setInsight({ ...insight, feedbackRating: null }); }}
                className="text-xs px-3 py-1 text-muted hover:text-foreground transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {voted && (
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>{insight.feedbackRating === 1 ? "👍" : "👎"}</span>
          <span>Feedback recorded{insight.feedbackComment ? ` — "${insight.feedbackComment}"` : ""}</span>
          {insight.feedbackUserName && <span>by {insight.feedbackUserName}</span>}
        </div>
      )}

      {/* Previous Picks */}
      {showNav && (
        <div className="mt-4 pt-3 border-t border-card-border/50">
          <button
            onClick={async () => {
              if (!showPrevious && previousPicks.length === 0) {
                setLoadingPrevious(true);
                try {
                  const res = await fetch("/api/insights?limit=10&offset=1");
                  const d = await res.json();
                  setPreviousPicks(d.insights || []);
                } catch {}
                setLoadingPrevious(false);
              }
              setShowPrevious(!showPrevious);
            }}
            className="text-xs text-accent hover:text-accent/80 font-medium"
          >
            {showPrevious ? "Hide previous picks ▲" : "← Previous picks"}
          </button>

          {showPrevious && (
            <div className="mt-3 space-y-2">
              {loadingPrevious ? (
                <p className="text-xs text-muted">Loading...</p>
              ) : previousPicks.length === 0 ? (
                <p className="text-xs text-muted">No previous picks yet.</p>
              ) : (
                previousPicks.map(p => (
                  <div key={p.id} className="bg-white/[0.02] border border-card-border/50 rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">{p.title}</span>
                      <div className="flex items-center gap-2">
                        {p.feedbackRating !== null && (
                          <span className="text-xs">{p.feedbackRating === 1 ? "👍" : "👎"}</span>
                        )}
                        <span className="text-[10px] text-muted">{formatDate(p.generatedAt)}</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted mt-1 line-clamp-2">{p.hypothesis}</p>
                    {p.feedbackComment && (
                      <p className="text-xs text-amber-400/70 mt-1 italic">&ldquo;{p.feedbackComment}&rdquo;</p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
