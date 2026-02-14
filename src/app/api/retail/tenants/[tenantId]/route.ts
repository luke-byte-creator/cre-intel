import { db, schema } from "@/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { tenantId } = await params;
  const body = await req.json();
  const allowed = new Set(["tenantName", "category", "comment", "status"]);
  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const [k, v] of Object.entries(body)) {
    if (allowed.has(k)) updates[k] = v === "" ? null : v;
  }
  await db.update(schema.retailTenants).set(updates).where(eq(schema.retailTenants.id, parseInt(tenantId)));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { tenantId } = await params;
  await db.delete(schema.retailTenants).where(eq(schema.retailTenants.id, parseInt(tenantId)));
  return NextResponse.json({ ok: true });
}
