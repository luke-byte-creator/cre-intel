import { db, schema } from "@/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const params = req.nextUrl.searchParams;
  const type = params.get("type") || "Sale";
  const propertyType = params.get("propertyType");
  const city = params.get("city");
  const targetSF = parseFloat(params.get("targetSF") || "0");
  const sizeTolerance = params.get("sizeTolerance") || "50";
  const dateRange = params.get("dateRange") || "3";

  const conditions = [sql`${schema.comps.type} = ${type}`];

  if (propertyType && propertyType !== "All") {
    conditions.push(sql`${schema.comps.propertyType} = ${propertyType}`);
  }
  if (city && city !== "All") {
    conditions.push(sql`${schema.comps.city} = ${city}`);
  }

  // Size filter
  if (targetSF > 0 && sizeTolerance !== "any") {
    const pct = parseFloat(sizeTolerance) / 100;
    const minSF = targetSF * (1 - pct);
    const maxSF = targetSF * (1 + pct);
    conditions.push(sql`${schema.comps.areaSF} >= ${minSF}`);
    conditions.push(sql`${schema.comps.areaSF} <= ${maxSF}`);
  }

  // Date filter
  if (dateRange !== "all") {
    const years = parseInt(dateRange);
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - years);
    const cutoffStr = cutoff.toISOString().split("T")[0];
    conditions.push(sql`${schema.comps.saleDate} >= ${cutoffStr}`);
  }

  const where = sql.join(conditions, sql` AND `);

  const rows = await db.select()
    .from(schema.comps)
    .where(where)
    .limit(200); // fetch more, score and trim to 50

  // Calculate relevance scores
  const now = Date.now();
  const maxAge = 5 * 365 * 24 * 60 * 60 * 1000; // 5 years in ms

  const scored = rows.map(row => {
    // Size similarity (0-1): 1 = exact match, 0 = far away
    let sizeSimilarity = 1;
    if (targetSF > 0 && row.areaSF) {
      const pctDiff = Math.abs(row.areaSF - targetSF) / targetSF;
      sizeSimilarity = Math.max(0, 1 - pctDiff);
    }

    // Recency (0-1): 1 = today, 0 = 5+ years ago
    let recency = 0.5;
    if (row.saleDate) {
      const age = now - new Date(row.saleDate + "T00:00:00").getTime();
      recency = Math.max(0, 1 - age / maxAge);
    }

    const relevanceScore = sizeSimilarity * 0.6 + recency * 0.4;

    return { ...row, relevanceScore: Math.round(relevanceScore * 100) / 100 };
  });

  scored.sort((a, b) => b.relevanceScore - a.relevanceScore);

  return NextResponse.json({
    data: scored.slice(0, 50),
    total: scored.length,
  });
}
