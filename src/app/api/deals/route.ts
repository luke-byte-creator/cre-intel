import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const results = await db.select().from(schema.deals).where(eq(schema.deals.userId, auth.user.id));
  const stageOrder: Record<string, number> = { prospect: 0, ongoing: 1, closed: 2 };
  results.sort((a, b) => {
    const so = (stageOrder[a.stage] ?? 99) - (stageOrder[b.stage] ?? 99);
    if (so !== 0) return so;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });
  return NextResponse.json(results);
}

export async function PUT(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  let body: { items: { id: number; sortOrder: number; stage?: string }[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  if (!body.items || !Array.isArray(body.items)) {
    return NextResponse.json({ error: "items array required" }, { status: 400 });
  }

  const now = new Date().toISOString();
  for (const item of body.items) {
    const updates: Record<string, unknown> = { sortOrder: item.sortOrder, updatedAt: now };
    if (item.stage) {
      updates.stage = item.stage;
      updates.stageEnteredAt = now;
    }
    await db.update(schema.deals)
      .set(updates)
      .where(eq(schema.deals.id, item.id));
  }

  return NextResponse.json({ success: true });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  if (!body.tenantName) {
    return NextResponse.json({ error: "tenantName (deal name) is required" }, { status: 400 });
  }

  const now = new Date().toISOString();

  // Format initial note as JSON array if provided
  let notes: string | null = null;
  if (body.notes && typeof body.notes === "string") {
    notes = JSON.stringify([{ text: body.notes, date: now }]);
  } else if (body.notes) {
    notes = typeof body.notes === "string" ? body.notes : JSON.stringify(body.notes);
  }

  const result = await db.insert(schema.deals).values({
    userId: auth.user.id,
    tenantName: body.tenantName as string,
    propertyAddress: (body.propertyAddress as string) || "",
    stage: (body.stage as string) || "prospect",
    stageEnteredAt: now,
    notes,
    createdAt: now,
    updatedAt: now,
  }).returning();

  return NextResponse.json(result[0], { status: 201 });
}
