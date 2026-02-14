import { db, schema } from "@/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const body = await req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const k of ["name", "area", "address", "notes"]) {
    if (k in body) updates[k] = body[k] === "" ? null : body[k];
  }
  await db.update(schema.retailDevelopments).set(updates).where(eq(schema.retailDevelopments.id, parseInt(id)));
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
