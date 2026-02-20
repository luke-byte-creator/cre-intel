import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db, schema } from "@/db";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

function getQuarterDates(q: string, y: number): { start: string; end: string } {
  const qNum = parseInt(q.replace("Q", ""));
  const startMonth = (qNum - 1) * 3;
  const start = new Date(y, startMonth, 1).toISOString();
  const end = new Date(y, startMonth + 3, 0, 23, 59, 59).toISOString();
  return { start, end };
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const { searchParams } = new URL(req.url);
  const quarter = searchParams.get("quarter");
  const year = searchParams.get("year");
  const viewAll = searchParams.get("viewAll") === "true";

  let rows = db
    .select()
    .from(schema.suburbanOfficeListings)
    .orderBy(desc(schema.suburbanOfficeListings.lastSeen))
    .all();

  if (!viewAll && quarter && year) {
    const { start, end } = getQuarterDates(quarter, Number(year));
    rows = rows.filter(r => {
      const firstSeen = r.firstSeen || r.createdAt;
      const lastSeen = r.lastSeen || r.createdAt;
      return firstSeen <= end && lastSeen >= start;
    });
  }

  const totalSF = rows.reduce((sum, r) => sum + (r.squareFeet || 0), 0);

  return NextResponse.json({ 
    data: rows,
    stats: { count: rows.length, totalSF },
  });
}
