import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const items = db
    .select()
    .from(schema.watchlist)
    .orderBy(sql`created_at DESC`)
    .all();

  // Enrich with entity details
  const enriched = items.map((item) => {
    let entity: Record<string, unknown> = {};
    if (item.entityType === "company") {
      const [c] = db.select().from(schema.companies).where(sql`id = ${item.entityId}`).all();
      entity = c || {};
    } else if (item.entityType === "person") {
      const [p] = db.select().from(schema.people).where(sql`id = ${item.entityId}`).all();
      entity = p || {};
    } else if (item.entityType === "property") {
      const [p] = db.select().from(schema.properties).where(sql`id = ${item.entityId}`).all();
      entity = p || {};
    }
    return { ...item, entity };
  });

  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { entityType, entityId, label, notes } = body;

  const result = db.insert(schema.watchlist).values({
    entityType,
    entityId,
    label: label || null,
    notes: notes || null,
  }).run();

  return NextResponse.json({ id: result.lastInsertRowid, success: true });
}
