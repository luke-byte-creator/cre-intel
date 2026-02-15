import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updatedAt: now };

  if (body.tenantName !== undefined) updates.tenantName = body.tenantName;
  if (body.tenantCompany !== undefined) updates.tenantCompany = body.tenantCompany;
  if (body.tenantEmail !== undefined) updates.tenantEmail = body.tenantEmail;
  if (body.tenantPhone !== undefined) updates.tenantPhone = body.tenantPhone;
  if (body.propertyAddress !== undefined) updates.propertyAddress = body.propertyAddress;
  if (body.notes !== undefined) {
    // Accept full JSON array of comments or a string
    updates.notes = typeof body.notes === "string" ? body.notes : JSON.stringify(body.notes);
  }
  if (body.dealEconomics !== undefined) {
    updates.dealEconomics = body.dealEconomics === null ? null : (typeof body.dealEconomics === "string" ? body.dealEconomics : JSON.stringify(body.dealEconomics));
  }
  if (body.stage !== undefined) {
    updates.stage = body.stage;
    updates.stageEnteredAt = now;
  }

  const result = await db.update(schema.deals).set(updates).where(eq(schema.deals.id, Number(id))).returning();
  if (!result.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(result[0]);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const dealId = Number(id);
  // Delete related records first (FK constraints)
  await db.delete(schema.pipelineTodos).where(eq(schema.pipelineTodos.dealId, dealId));
  await db.delete(schema.tours).where(eq(schema.tours.dealId, dealId));
  const result = await db.delete(schema.deals).where(eq(schema.deals.id, dealId)).returning();
  if (!result.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
