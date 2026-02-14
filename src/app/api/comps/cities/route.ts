import { db, schema } from "@/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const rows = await db.select({
    city: schema.comps.city,
    count: sql<number>`count(*)`,
  })
    .from(schema.comps)
    .where(sql`${schema.comps.city} IS NOT NULL AND ${schema.comps.city} != ''`)
    .groupBy(schema.comps.city)
    .orderBy(sql`count(*) DESC`);

  return NextResponse.json(rows);
}
