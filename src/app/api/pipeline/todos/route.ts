import { db, schema } from "@/db";
import { eq, asc, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const url = new URL(req.url);
  const completedFilter = url.searchParams.get("completed");

  let results = await db
    .select({
      id: schema.pipelineTodos.id,
      dealId: schema.pipelineTodos.dealId,
      text: schema.pipelineTodos.text,
      completed: schema.pipelineTodos.completed,
      sortOrder: schema.pipelineTodos.sortOrder,
      dueDate: schema.pipelineTodos.dueDate,
      completedAt: schema.pipelineTodos.completedAt,
      createdAt: schema.pipelineTodos.createdAt,
      dealName: schema.deals.tenantName,
      dealProperty: schema.deals.propertyAddress,
      dealStage: schema.deals.stage,
    })
    .from(schema.pipelineTodos)
    .leftJoin(schema.deals, eq(schema.pipelineTodos.dealId, schema.deals.id))
    .orderBy(asc(schema.pipelineTodos.completed), asc(schema.pipelineTodos.sortOrder));

  if (completedFilter === "true") {
    results = results.filter(r => r.completed === 1);
  } else if (completedFilter === "false") {
    results = results.filter(r => r.completed === 0);
  }

  return NextResponse.json(results);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  if (!body.text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const dealId = body.dealId ? (body.dealId as number) : null;

  // Get max sortOrder
  const maxResult = await db
    .select({ maxOrder: sql<number>`COALESCE(MAX(${schema.pipelineTodos.sortOrder}), -1)` })
    .from(schema.pipelineTodos);
  const nextOrder = (maxResult[0]?.maxOrder ?? -1) + 1;

  const now = new Date().toISOString();
  const dueDate = body.dueDate ? (body.dueDate as string) : null;

  const result = await db.insert(schema.pipelineTodos).values({
    dealId,
    text: body.text as string,
    sortOrder: nextOrder,
    dueDate,
    createdAt: now,
  }).returning();

  // Add comment to deal if linked
  if (dealId) {
    const deal = await db.select().from(schema.deals).where(eq(schema.deals.id, dealId));
    if (deal.length > 0) {
      let comments: { text: string; date: string }[] = [];
      try { comments = JSON.parse(deal[0].notes || "[]"); if (!Array.isArray(comments)) comments = []; } catch { comments = []; }
      comments.push({ text: `📋 Task added: ${body.text}`, date: now });
      await db.update(schema.deals).set({ notes: JSON.stringify(comments), updatedAt: now }).where(eq(schema.deals.id, dealId));
    }
  }

  return NextResponse.json(result[0], { status: 201 });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  let body: { items: { id: number; sortOrder: number }[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  if (!body.items || !Array.isArray(body.items)) {
    return NextResponse.json({ error: "items array required" }, { status: 400 });
  }

  for (const item of body.items) {
    await db.update(schema.pipelineTodos)
      .set({ sortOrder: item.sortOrder })
      .where(eq(schema.pipelineTodos.id, item.id));
  }

  return NextResponse.json({ success: true });
}
