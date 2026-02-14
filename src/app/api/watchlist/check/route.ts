import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
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
