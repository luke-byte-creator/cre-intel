import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db, schema } from "@/db";
import { desc, sql, isNotNull } from "drizzle-orm";
import { callAI } from "@/lib/ai";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") || "7");
  const offset = parseInt(url.searchParams.get("offset") || "0");

  const insights = db
    .select()
    .from(schema.novaInsights)
    .orderBy(desc(schema.novaInsights.generatedAt))
    .limit(limit)
    .offset(offset)
    .all();

  const total = db
    .select({ count: sql<number>`count(*)` })
    .from(schema.novaInsights)
    .get();

  return NextResponse.json({ insights, total: total?.count || 0 });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  if (auth.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  // 0. Change detection — figure out what's new since last insight
  const lastInsight = db
    .select({ generatedAt: schema.novaInsights.generatedAt, dataPoints: schema.novaInsights.dataPoints })
    .from(schema.novaInsights)
    .orderBy(desc(schema.novaInsights.generatedAt))
    .limit(1)
    .get();

  const lastGeneratedAt = lastInsight?.generatedAt || "2000-01-01T00:00:00Z";

  // Check for meaningful data changes since last insight
  const recentActivity = db.all(sql`
    SELECT action, category, COUNT(*) as cnt
    FROM activity_events
    WHERE created_at > ${lastGeneratedAt}
      AND action IN ('create', 'edit', 'upload', 'generate')
    GROUP BY action, category
  `);

  const newCompsCount = db.get(sql`
    SELECT COUNT(*) as cnt FROM comps WHERE created_at > ${lastGeneratedAt}
  `) as any;

  const hasNewData = recentActivity.length > 0 || (newCompsCount?.cnt || 0) > 0;

  // Collect IDs already pitched in recent insights (last 30) to avoid rehashing
  const recentInsights = db
    .select({
      dataPoints: schema.novaInsights.dataPoints,
      category: schema.novaInsights.category,
    })
    .from(schema.novaInsights)
    .orderBy(desc(schema.novaInsights.generatedAt))
    .limit(30)
    .all();

  const alreadyPitchedIds = new Set<string>();
  const recentCategories: string[] = [];
  for (const ins of recentInsights) {
    if (ins.category) recentCategories.push(ins.category);
    try {
      const pts = JSON.parse(ins.dataPoints || "[]");
      for (const p of pts) alreadyPitchedIds.add(`${p.type}:${p.id}`);
    } catch {}
  }

  // Never skip — there's always enough data for one pick per day.
  // Only guard against generating twice in the same day.
  if (lastInsight) {
    const hoursSinceLast = (Date.now() - new Date(lastGeneratedAt).getTime()) / (1000 * 60 * 60);
    if (hoursSinceLast < 20) {
      return NextResponse.json({
        skipped: true,
        reason: "Already generated today — next pick tomorrow",
        lastGeneratedAt,
      });
    }
  }

  // Determine which category to lean into (rotate away from recent)
  const categoryRotation = ['lease_expiry', 'permit_activity', 'acquisition_pattern', 'vacancy_signal', 'market_anomaly', 'cross_reference'];
  const last3Categories = recentCategories.slice(0, 3);
  const preferredCategories = categoryRotation.filter(c => !last3Categories.includes(c));
  const categoryHint = preferredCategories.length > 0
    ? `\nPREFERRED CATEGORIES (you've recently covered ${last3Categories.join(', ')} — try something different): ${preferredCategories.join(', ')}`
    : "";

  // 1. Gather signal data
  const expiringLeases = db.all(sql`
    SELECT id, tenant, landlord, address, area_sf, lease_expiry, net_rent_psf, property_type
    FROM comps
    WHERE type = 'Lease' AND lease_expiry IS NOT NULL
      AND lease_expiry > date('now')
      AND lease_expiry < date('now', '+18 months')
    LIMIT 50
  `);

  const highValuePermits = db.all(sql`
    SELECT id, permit_number, address, applicant, description, work_type, estimated_value, issue_date
    FROM permits
    WHERE estimated_value > 1000000
    ORDER BY issue_date DESC
    LIMIT 30
  `);

  const activeCompanies = db.all(sql`
    SELECT c.id, c.name, count(*) as txn_count
    FROM companies c
    JOIN transactions t ON t.grantee_company_id = c.id OR t.grantor_company_id = c.id
    WHERE t.transfer_date > date('now', '-2 years')
    GROUP BY c.id
    HAVING txn_count >= 3
    LIMIT 20
  `);

  const activeProperties = db.all(sql`
    SELECT p.id, p.address, p.property_type, count(*) as comp_count
    FROM properties p
    JOIN comps co ON co.property_id = p.id
    GROUP BY p.id
    HAVING comp_count >= 2
    ORDER BY comp_count DESC
    LIMIT 20
  `);

  const pricingOutliers = db.all(sql`
    SELECT c.id, c.address, c.property_type, c.price_psf, c.type,
      avg_psf.avg_price_psf,
      CASE WHEN avg_psf.avg_price_psf > 0
        THEN (c.price_psf - avg_psf.avg_price_psf) / avg_psf.avg_price_psf * 100
        ELSE 0 END as pct_diff
    FROM comps c
    JOIN (
      SELECT property_type, type, AVG(price_psf) as avg_price_psf
      FROM comps WHERE price_psf IS NOT NULL AND price_psf > 0
      GROUP BY property_type, type
    ) avg_psf ON avg_psf.property_type = c.property_type AND avg_psf.type = c.type
    WHERE c.price_psf IS NOT NULL AND c.price_psf > 0
      AND ABS((c.price_psf - avg_psf.avg_price_psf) / avg_psf.avg_price_psf) > 0.3
    ORDER BY ABS(pct_diff) DESC
    LIMIT 20
  `);

  // Past feedback
  const pastFeedback = db
    .select({
      title: schema.novaInsights.title,
      category: schema.novaInsights.category,
      feedbackRating: schema.novaInsights.feedbackRating,
      feedbackComment: schema.novaInsights.feedbackComment,
    })
    .from(schema.novaInsights)
    .where(isNotNull(schema.novaInsights.feedbackRating))
    .orderBy(desc(schema.novaInsights.generatedAt))
    .limit(30)
    .all();

  const feedbackHistory = pastFeedback.length > 0
    ? pastFeedback.map(f => `- "${f.title}" (${f.category}): ${f.feedbackRating === 1 ? "👍" : "👎"}${f.feedbackComment ? ` — "${f.feedbackComment}"` : ""}`).join("\n")
    : "No feedback yet — this is early days.";

  const signals = JSON.stringify({
    expiringLeases,
    highValuePermits,
    activeCompanies,
    activeProperties,
    pricingOutliers,
  }, null, 2);

  // 2. Call AI
  const systemPrompt = `You are Nova, an AI commercial real estate analyst for a brokerage team in Saskatoon, Saskatchewan. Your job is to identify ONE potential transaction opportunity from the data provided.

Think creatively. Connect dots across different data types. The team values bold, thoughtful ideas — even if they're wrong most of the time. One good idea per year pays for itself.

ALREADY PITCHED (avoid these specific records — find something new):
${alreadyPitchedIds.size > 0 ? Array.from(alreadyPitchedIds).join(', ') : 'None yet'}
${categoryHint}

${hasNewData ? 'NEW DATA has been added since the last insight — consider prioritizing fresh records, but don\'t ignore the existing database.' : 'Dig deep into the existing database — there are thousands of comps, companies, and permits to cross-reference. Find connections nobody has spotted yet.'}

PAST FEEDBACK (learn from this but DO NOT become conservative — keep swinging):
${feedbackHistory}

DATA SIGNALS:
${signals}

Generate ONE insight with:
- title: punchy headline (max 80 chars)
- hypothesis: 2-4 paragraphs explaining the opportunity and suggested next steps
- reasoning: bullet points of which data points you connected
- category: one of 'lease_expiry', 'permit_activity', 'acquisition_pattern', 'vacancy_signal', 'tenant_movement', 'market_anomaly', 'cross_reference'
- confidence: 0-1 (be honest)
- dataPoints: array of {type: "comp"|"permit"|"company"|"property", id: number, label: "brief description"} for the records you referenced

Return as JSON only. No markdown fences.`;

  let aiResponse: string;
  try {
    aiResponse = await callAI([
      { role: "system", content: systemPrompt },
      { role: "user", content: "Analyze the data and generate one insight." },
    ]);
  } catch (e) {
    return NextResponse.json({ error: "AI generation failed" }, { status: 500 });
  }

  // 3. Parse
  let parsed: any;
  try {
    // Strip markdown fences if present
    const cleaned = aiResponse.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return NextResponse.json({ error: "Failed to parse AI response", raw: aiResponse }, { status: 500 });
  }

  // 4. Insert
  const result = db
    .insert(schema.novaInsights)
    .values({
      title: parsed.title || "Untitled Insight",
      hypothesis: parsed.hypothesis || "",
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : JSON.stringify(parsed.reasoning),
      category: parsed.category || "cross_reference",
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      dataPoints: JSON.stringify(parsed.dataPoints || []),
    })
    .returning()
    .get();

  return NextResponse.json({ insight: result });
}
