import { db, schema } from "@/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { eq, and, lte, asc, isNotNull } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const status = req.nextUrl.searchParams.get("status");
  const days = req.nextUrl.searchParams.get("days");

  const conditions = [];
  if (status) conditions.push(eq(schema.followups.status, status));
  if (days) {
    const future = new Date();
    future.setDate(future.getDate() + parseInt(days));
    conditions.push(lte(schema.followups.dueDate, future.toISOString().slice(0, 10)));
  }

  const rows = await db
    .select({
      id: schema.followups.id,
      contactName: schema.followups.contactName,
      contactPhone: schema.followups.contactPhone,
      contactEmail: schema.followups.contactEmail,
      dealId: schema.followups.dealId,
      note: schema.followups.note,
      dueDate: schema.followups.dueDate,
      status: schema.followups.status,
      completedAt: schema.followups.completedAt,
      createdAt: schema.followups.createdAt,
      updatedAt: schema.followups.updatedAt,
      dealTenantName: schema.deals.tenantName,
      dealPropertyAddress: schema.deals.propertyAddress,
    })
    .from(schema.followups)
    .leftJoin(schema.deals, eq(schema.followups.dealId, schema.deals.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(schema.followups.dueDate));

  // Also fetch pipeline todos with due dates
  const todoConditions = [isNotNull(schema.pipelineTodos.dueDate)];
  if (status === "pending") todoConditions.push(eq(schema.pipelineTodos.completed, 0));
  else if (status === "done") todoConditions.push(eq(schema.pipelineTodos.completed, 1));
  if (days) {
    const future = new Date();
    future.setDate(future.getDate() + parseInt(days));
    todoConditions.push(lte(schema.pipelineTodos.dueDate, future.toISOString().slice(0, 10)));
  }

  const todoRows = await db
    .select({
      id: schema.pipelineTodos.id,
      text: schema.pipelineTodos.text,
      dueDate: schema.pipelineTodos.dueDate,
      completed: schema.pipelineTodos.completed,
      completedAt: schema.pipelineTodos.completedAt,
      dealId: schema.pipelineTodos.dealId,
      createdAt: schema.pipelineTodos.createdAt,
      dealTenantName: schema.deals.tenantName,
      dealPropertyAddress: schema.deals.propertyAddress,
    })
    .from(schema.pipelineTodos)
    .leftJoin(schema.deals, eq(schema.pipelineTodos.dealId, schema.deals.id))
    .where(and(...todoConditions))
    .orderBy(asc(schema.pipelineTodos.dueDate));

  // Normalize todos into follow-up shape
  const todoFollowups = todoRows.map(t => ({
    id: t.id,
    contactName: t.dealTenantName || "Task",
    contactPhone: null,
    contactEmail: null,
    dealId: t.dealId,
    note: t.text,
    dueDate: t.dueDate,
    status: t.completed ? "done" : "pending",
    completedAt: t.completedAt,
    createdAt: t.createdAt,
    updatedAt: t.createdAt,
    dealTenantName: t.dealTenantName,
    dealPropertyAddress: t.dealPropertyAddress,
    source: "todo" as const,
  }));

  const followupRows = rows.map(r => ({ ...r, source: "followup" as const }));

  // Merge and sort by dueDate
  const merged = [...followupRows, ...todoFollowups].sort((a, b) =>
    (a.dueDate || "").localeCompare(b.dueDate || "")
  );

  return NextResponse.json(merged);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  if (!body.contactName || !body.dueDate) {
    return NextResponse.json({ error: "contactName and dueDate are required" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const result = await db.insert(schema.followups).values({
    contactName: body.contactName as string,
    contactPhone: (body.contactPhone as string) || null,
    contactEmail: (body.contactEmail as string) || null,
    dealId: body.dealId ? Number(body.dealId) : null,
    note: (body.note as string) || null,
    dueDate: body.dueDate as string,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  }).returning();

  return NextResponse.json(result[0], { status: 201 });
}
