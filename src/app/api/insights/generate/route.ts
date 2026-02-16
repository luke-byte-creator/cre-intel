import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { desc, sql, isNotNull } from "drizzle-orm";
import { callAI } from "@/lib/ai";

// Internal-only endpoint for cron generation — no auth required but localhost-gated
export async function POST(req: NextRequest) {
  // Only allow from localhost
  const host = req.headers.get("host") || "";
  const forwarded = req.headers.get("x-forwarded-for") || "";
  if (!host.includes("localhost") && !host.includes("127.0.0.1") && !forwarded.startsWith("127.")) {
    return NextResponse.json({ error: "Internal only" }, { status: 403 });
  }

  // Check if already generated today
  const lastInsight = db
    .select({ generatedAt: schema.novaInsights.generatedAt })
    .from(schema.novaInsights)
    .orderBy(desc(schema.novaInsights.generatedAt))
    .limit(1)
    .get();

  if (lastInsight) {
    const hoursSinceLast = (Date.now() - new Date(lastInsight.generatedAt).getTime()) / (1000 * 60 * 60);
    if (hoursSinceLast < 20) {
      return NextResponse.json({ skipped: true, reason: "Already generated today" });
    }
  }

  // Collect already-pitched IDs
  const recentInsights = db
    .select({ dataPoints: schema.novaInsights.dataPoints, category: schema.novaInsights.category })
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

  const categoryRotation = ['lease_expiry', 'permit_activity', 'acquisition_pattern', 'vacancy_signal', 'market_anomaly', 'cross_reference'];
  const last3Categories = recentCategories.slice(0, 3);
  const preferredCategories = categoryRotation.filter(c => !last3Categories.includes(c));
  const categoryHint = preferredCategories.length > 0
    ? `\nPREFERRED CATEGORIES (recently covered ${last3Categories.join(', ')} — try something different): ${preferredCategories.join(', ')}`
    : "";

  // Gather signals
  const expiringLeases = db.all(sql`
    SELECT id, tenant, landlord, address, area_sf, lease_expiry, net_rent_psf, property_type
    FROM comps WHERE type = 'Lease' AND lease_expiry IS NOT NULL
      AND lease_expiry > date('now') AND lease_expiry < date('now', '+18 months')
    LIMIT 50
  `);

  const highValuePermits = db.all(sql`
    SELECT id, permit_number, address, applicant, description, work_type, estimated_value, issue_date
    FROM permits WHERE estimated_value > 1000000 ORDER BY issue_date DESC LIMIT 30
  `);

  const activeCompanies = db.all(sql`
    SELECT c.id, c.name, count(*) as txn_count FROM companies c
    JOIN transactions t ON t.grantee_company_id = c.id OR t.grantor_company_id = c.id
    WHERE t.transfer_date > date('now', '-2 years') GROUP BY c.id HAVING txn_count >= 3 LIMIT 20
  `);

  const activeProperties = db.all(sql`
    SELECT p.id, p.address, p.property_type, count(*) as comp_count FROM properties p
    JOIN comps co ON co.property_id = p.id GROUP BY p.id HAVING comp_count >= 2
    ORDER BY comp_count DESC LIMIT 20
  `);

  const pricingOutliers = db.all(sql`
    SELECT c.id, c.address, c.property_type, c.price_psf, c.type,
      avg_psf.avg_price_psf,
      CASE WHEN avg_psf.avg_price_psf > 0
        THEN (c.price_psf - avg_psf.avg_price_psf) / avg_psf.avg_price_psf * 100 ELSE 0 END as pct_diff
    FROM comps c
    JOIN (SELECT property_type, type, AVG(price_psf) as avg_price_psf FROM comps
      WHERE price_psf IS NOT NULL AND price_psf > 0 GROUP BY property_type, type
    ) avg_psf ON avg_psf.property_type = c.property_type AND avg_psf.type = c.type
    WHERE c.price_psf IS NOT NULL AND c.price_psf > 0
      AND ABS((c.price_psf - avg_psf.avg_price_psf) / avg_psf.avg_price_psf) > 0.3
    ORDER BY ABS(pct_diff) DESC LIMIT 20
  `);

  const pastFeedback = db
    .select({
      title: schema.novaInsights.title, category: schema.novaInsights.category,
      feedbackRating: schema.novaInsights.feedbackRating, feedbackComment: schema.novaInsights.feedbackComment,
    })
    .from(schema.novaInsights)
    .where(isNotNull(schema.novaInsights.feedbackRating))
    .orderBy(desc(schema.novaInsights.generatedAt))
    .limit(30)
    .all();

  const feedbackHistory = pastFeedback.length > 0
    ? pastFeedback.map(f => `- "${f.title}" (${f.category}): ${f.feedbackRating === 1 ? "👍" : "👎"}${f.feedbackComment ? ` — "${f.feedbackComment}"` : ""}`).join("\n")
    : "No feedback yet — early days.";

  const signals = JSON.stringify({ expiringLeases, highValuePermits, activeCompanies, activeProperties, pricingOutliers }, null, 2);

  const systemPrompt = `You are Nova, an AI commercial real estate analyst for a brokerage team in Saskatoon, Saskatchewan. Your job is to identify ONE potential transaction opportunity from the data provided.

Think creatively. Connect dots across different data types. The team values bold, thoughtful ideas — even if they're wrong most of the time. One good idea per year pays for itself.

ALREADY PITCHED (avoid these specific records):
${alreadyPitchedIds.size > 0 ? Array.from(alreadyPitchedIds).join(', ') : 'None yet'}
${categoryHint}

Dig deep into the existing database — there are thousands of comps, companies, and permits to cross-reference. Find connections nobody has spotted yet.

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
  } catch {
    return NextResponse.json({ error: "AI generation failed" }, { status: 500 });
  }

  let parsed: any;
  try {
    const cleaned = aiResponse.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return NextResponse.json({ error: "Failed to parse AI response", raw: aiResponse }, { status: 500 });
  }

  db.insert(schema.novaInsights).values({
    title: parsed.title || "Untitled Insight",
    hypothesis: parsed.hypothesis || "",
    reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : JSON.stringify(parsed.reasoning),
    category: parsed.category || "cross_reference",
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    dataPoints: JSON.stringify(parsed.dataPoints || []),
  }).run();

  return NextResponse.json({ success: true, title: parsed.title });
}
