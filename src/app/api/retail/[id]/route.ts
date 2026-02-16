import { db, schema } from "@/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireFullAccess } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { awardCredits } from "@/lib/credit-service";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFullAccess(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const body = await req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const k of ["name", "area", "address", "notes"]) {
    if (k in body) updates[k] = body[k] === "" ? null : body[k];
  }
  await db.update(schema.retailDevelopments).set(updates).where(eq(schema.retailDevelopments.id, parseInt(id)));
  const devName = body.name || (await db.select({ name: schema.retailDevelopments.name }).from(schema.retailDevelopments).where(eq(schema.retailDevelopments.id, parseInt(id))).get())?.name || "development";
  awardCredits(auth.user.id, 1, "update_retail", parseInt(id), undefined, `Updated ${devName}`);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const devId = parseInt(id);
  await db.delete(schema.retailTenants).where(eq(schema.retailTenants.developmentId, devId));
  await db.delete(schema.retailDevelopments).where(eq(schema.retailDevelopments.id, devId));
  return NextResponse.json({ ok: true });
}
