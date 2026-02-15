import { db, schema } from "@/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireFullAccess } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { awardCredits } from "@/lib/credit-service";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
  const auth = await requireFullAccess(req);
  if (auth instanceof Response) return auth;
  const { tenantId } = await params;
  const body = await req.json();
  const allowed = new Set(["tenantName", "category", "areaSF", "unitSuite", "netRentPSF", "annualRent", "leaseStart", "leaseExpiry", "termMonths", "rentSteps", "leaseType", "comment", "status"]);
  const numericFields = new Set(["areaSF", "netRentPSF", "annualRent"]);
  const intFields = new Set(["termMonths"]);
  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  let fieldChanges = 0;
  for (const [k, v] of Object.entries(body)) {
    if (allowed.has(k)) {
      if (numericFields.has(k)) updates[k] = v === "" || v === null ? null : Number(v);
      else if (intFields.has(k)) updates[k] = v === "" || v === null ? null : Math.round(Number(v));
      else updates[k] = v === "" ? null : v;
      fieldChanges++;
    }
  }
  await db.update(schema.retailTenants).set(updates).where(eq(schema.retailTenants.id, parseInt(tenantId)));
  const creditAmount = fieldChanges >= 5 ? 2 : 1;
  awardCredits(auth.user.id, creditAmount, "update_retail");
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { tenantId } = await params;
  await db.delete(schema.retailTenants).where(eq(schema.retailTenants.id, parseInt(tenantId)));
  return NextResponse.json({ ok: true });
}
