import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { sql, inArray } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const items = db
    .select()
    .from(schema.watchlist)
    .orderBy(sql`created_at DESC`)
    .all();

  if (items.length === 0) return NextResponse.json([]);

  // Batch-load entities by type to avoid N+1
  const companyIds = items.filter((i) => i.entityType === "company").map((i) => i.entityId);
  const personIds = items.filter((i) => i.entityType === "person").map((i) => i.entityId);
  const propertyIds = items.filter((i) => i.entityType === "property").map((i) => i.entityId);

  const companiesMap = new Map<number, Record<string, unknown>>();
  if (companyIds.length > 0) {
    const rows = db.select().from(schema.companies).where(inArray(schema.companies.id, companyIds)).all();
    for (const r of rows) companiesMap.set(r.id, r);
  }

  const peopleMap = new Map<number, Record<string, unknown>>();
  if (personIds.length > 0) {
    const rows = db.select().from(schema.people).where(inArray(schema.people.id, personIds)).all();
    for (const r of rows) peopleMap.set(r.id, r);
  }

  const propertiesMap = new Map<number, Record<string, unknown>>();
  if (propertyIds.length > 0) {
    const rows = db.select().from(schema.properties).where(inArray(schema.properties.id, propertyIds)).all();
    for (const r of rows) propertiesMap.set(r.id, r);
  }

  const enriched = items.map((item) => {
    let entity: Record<string, unknown> = {};
    if (item.entityType === "company") entity = companiesMap.get(item.entityId) || {};
    else if (item.entityType === "person") entity = peopleMap.get(item.entityId) || {};
    else if (item.entityType === "property") entity = propertiesMap.get(item.entityId) || {};
    return { ...item, entity };
  });

  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { entityType, entityId, label, notes } = body;

  // Validate entityType
  const validTypes = ["company", "person", "property"];
  if (!entityType || typeof entityType !== "string" || !validTypes.includes(entityType)) {
    return NextResponse.json({ error: "Invalid entity type" }, { status: 400 });
  }

  // Validate entityId
  const numEntityId = typeof entityId === "number" ? entityId : parseInt(String(entityId), 10);
  if (!Number.isFinite(numEntityId) || numEntityId < 1) {
    return NextResponse.json({ error: "Invalid entity ID" }, { status: 400 });
  }

  const result = db.insert(schema.watchlist).values({
    entityType: entityType as string,
    entityId: numEntityId,
    label: typeof label === "string" ? label.trim().slice(0, 200) || null : null,
    notes: typeof notes === "string" ? notes.trim().slice(0, 2000) || null : null,
  }).run();

  return NextResponse.json({ id: result.lastInsertRowid, success: true });
}
