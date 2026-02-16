import { db, schema } from "@/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };

  if (body.status !== undefined) {
    updates.status = body.status;
    if (body.status === "done") updates.completedAt = new Date().toISOString();
    if (body.status === "pending") updates.completedAt = null;
  }
  if (body.dueDate !== undefined) updates.dueDate = body.dueDate;
  if (body.contactName !== undefined) updates.contactName = body.contactName;
  if (body.contactPhone !== undefined) updates.contactPhone = body.contactPhone;
  if (body.contactEmail !== undefined) updates.contactEmail = body.contactEmail;
  if (body.dealId !== undefined) updates.dealId = body.dealId;
  if (body.note !== undefined) updates.note = body.note;

  const result = await db.update(schema.followups)
    .set(updates)
    .where(eq(schema.followups.id, Number(id)))
    .returning();

  if (result.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(result[0]);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const { id } = await params;
  await db.delete(schema.followups).where(eq(schema.followups.id, Number(id)));
  return NextResponse.json({ ok: true });
}
