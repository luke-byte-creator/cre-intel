import { db, schema } from "@/db";
import { sql, gte, lte, eq, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  if (auth.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") || new Date(Date.now() - 7 * 86400000).toISOString();
  const to = searchParams.get("to") || new Date().toISOString();

  const t = schema.activityEvents;
  const conditions = and(gte(t.createdAt, from), lte(t.createdAt, to));

  // Events by action
  const byAction = await db.select({
    action: t.action,
    count: sql<number>`count(*)`,
  }).from(t).where(conditions).groupBy(t.action);

  // Events by category
  const byCategory = await db.select({
    category: t.category,
    count: sql<number>`count(*)`,
  }).from(t).where(conditions).groupBy(t.category);

  // Per-user breakdown
  const byUser = await db.select({
    userName: t.userName,
    userId: t.userId,
    count: sql<number>`count(*)`,
  }).from(t).where(conditions).groupBy(t.userId, t.userName);

  // Most viewed pages
  const topPages = await db.select({
    path: t.path,
    count: sql<number>`count(*)`,
  }).from(t).where(and(conditions, eq(t.action, "page_view"))).groupBy(t.path).orderBy(sql`count(*) desc`).limit(20);

  // Most searched terms
  const searchEvents = await db.select({
    detail: t.detail,
  }).from(t).where(and(conditions, eq(t.action, "search")));

  const searchTerms: Record<string, number> = {};
  for (const e of searchEvents) {
    try {
      const d = JSON.parse(e.detail || "{}");
      const q = d.query || d.search || d.q;
      if (q) searchTerms[q] = (searchTerms[q] || 0) + 1;
    } catch {}
  }
  const topSearches = Object.entries(searchTerms).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([term, count]) => ({ term, count }));

  // Draft generation stats
  const draftEvents = await db.select({
    action: t.action,
    count: sql<number>`count(*)`,
  }).from(t).where(and(conditions, eq(t.category, "drafts"))).groupBy(t.action);

  return NextResponse.json({
    period: { from, to },
    byAction,
    byCategory,
    byUser,
    topPages,
    topSearches,
    draftStats: draftEvents,
  });
}
