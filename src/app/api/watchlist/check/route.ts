import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const entityType = req.nextUrl.searchParams.get("entityType");
  const entityId = req.nextUrl.searchParams.get("entityId");
  if (!entityType || !entityId) return NextResponse.json({ watched: false });

  const [item] = db
    .select()
    .from(schema.watchlist)
    .where(sql`entity_type = ${entityType} AND entity_id = ${parseInt(entityId, 10)}`)
    .all();

  return NextResponse.json({ watched: !!item, watchId: item?.id ?? null });
}
