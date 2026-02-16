import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { desc, eq, sql } from "drizzle-orm";

// Internal-only endpoint for daily digest — localhost-gated
export async function GET(req: NextRequest) {
  const host = req.headers.get("host") || "";
  if (!host.includes("localhost") && !host.includes("127.0.0.1")) {
    return NextResponse.json({ error: "Internal only" }, { status: 403 });
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();

  // 1. Activity summary (today)
  const activitySummary = db.all(sql`
    SELECT user_name, action, category, COUNT(*) as cnt
    FROM activity_events
    WHERE created_at >= ${yesterdayStart}
      AND action != 'page_view'
    GROUP BY user_name, action, category
    ORDER BY cnt DESC
  `) as { user_name: string; action: string; category: string; cnt: number }[];

  // Unique active users today
  const activeUsers = db.all(sql`
    SELECT DISTINCT user_name FROM activity_events
    WHERE created_at >= ${yesterdayStart}
  `) as { user_name: string }[];

  // Page views by user
  const pageViews = db.all(sql`
    SELECT user_name, COUNT(*) as views
    FROM activity_events
    WHERE created_at >= ${yesterdayStart} AND action = 'page_view'
    GROUP BY user_name
    ORDER BY views DESC
  `) as { user_name: string; views: number }[];

  // 2. Unread team feedback ("Talk to the boss")
  const unreadFeedback = db
    .select()
    .from(schema.novaFeedback)
    .where(eq(schema.novaFeedback.readByAdmin, 0))
    .orderBy(desc(schema.novaFeedback.createdAt))
    .all();

  // 3. Nova's Pick feedback (last 24h)
  const pickFeedback = db.all(sql`
    SELECT title, category, feedback_rating, feedback_comment, feedback_user_name, feedback_at
    FROM nova_insights
    WHERE feedback_at >= ${yesterdayStart}
      AND feedback_rating IS NOT NULL
    ORDER BY feedback_at DESC
  `) as { title: string; category: string; feedback_rating: number; feedback_comment: string | null; feedback_user_name: string | null; feedback_at: string }[];

  // 4. Today's Nova's Pick
  const todaysPick = db
    .select({ title: schema.novaInsights.title, category: schema.novaInsights.category, confidence: schema.novaInsights.confidence })
    .from(schema.novaInsights)
    .orderBy(desc(schema.novaInsights.generatedAt))
    .limit(1)
    .get();

  // 5. Credit leaderboard (week)
  const leaderboard = db.all(sql`
    SELECT u.name, u.credit_balance as balance,
      COALESCE(SUM(CASE WHEN cl.created_at >= date('now', '-7 days') AND cl.amount > 0 THEN cl.amount ELSE 0 END), 0) as earned
    FROM users u
    LEFT JOIN credit_ledger cl ON cl.user_id = u.id
    WHERE u.role != 'admin'
    GROUP BY u.id
    ORDER BY earned DESC
  `) as { name: string; balance: number; earned: number }[];

  // 6. New comps added (last 24h)
  const newComps = db.get(sql`
    SELECT COUNT(*) as cnt FROM comps WHERE created_at >= ${yesterdayStart}
  `) as { cnt: number };

  // 7. Underwriting/draft activity
  const newAnalyses = db.get(sql`
    SELECT COUNT(*) as cnt FROM underwriting_analyses WHERE created_at >= ${yesterdayStart}
  `) as { cnt: number } | null;

  const newDrafts = db.get(sql`
    SELECT COUNT(*) as cnt FROM document_drafts WHERE created_at >= ${yesterdayStart}
  `) as { cnt: number } | null;

  return NextResponse.json({
    generatedAt: now.toISOString(),
    activeUsers: activeUsers.map(u => u.user_name),
    pageViews,
    activitySummary,
    unreadFeedback,
    pickFeedback,
    todaysPick,
    leaderboard,
    newComps: newComps?.cnt || 0,
    newAnalyses: newAnalyses?.cnt || 0,
    newDrafts: newDrafts?.cnt || 0,
  });
}
