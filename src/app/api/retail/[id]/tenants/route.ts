import { db, schema } from "@/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireFullAccess } from "@/lib/auth";
import { awardCredits } from "@/lib/credit-service";
import { syncRetailTenantToComp } from "@/lib/retail-comp-sync";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFullAccess(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const body = await req.json();
  if (!body.tenantName) return NextResponse.json({ error: "tenantName required" }, { status: 400 });

  db.insert(schema.retailTenants).values({
    developmentId: parseInt(id),
    tenantName: body.tenantName,
    category: body.category || null,
    areaSF: body.areaSF ? Number(body.areaSF) : null,
    unitSuite: body.unitSuite || null,
    netRentPSF: body.netRentPSF ? Number(body.netRentPSF) : null,
    annualRent: body.annualRent ? Number(body.annualRent) : null,
    leaseStart: body.leaseStart || null,
    leaseExpiry: body.leaseExpiry || null,
    termMonths: body.termMonths ? Math.round(Number(body.termMonths)) : null,
    rentSteps: body.rentSteps || null,
    leaseType: body.leaseType || null,
    operatingCosts: body.operatingCosts ? Number(body.operatingCosts) : null,
    comment: body.comment || null,
    status: body.status || "active",
  }).run();

  // Get the inserted tenant ID and sync to comps
  const inserted = db.select({ id: schema.retailTenants.id }).from(schema.retailTenants)
    .orderBy(schema.retailTenants.id).all();
  const newId = inserted[inserted.length - 1]?.id;
  if (newId) syncRetailTenantToComp(newId);

  // Award credits: +1 base, check required fields for bonus
  const requiredFilled = [body.tenantName, body.areaSF, body.netRentPSF, body.annualRent, body.leaseStart, body.leaseExpiry]
    .filter(v => v != null && v !== "").length;
  const credits = requiredFilled >= 6 ? 2 : 1;
  awardCredits(auth.user.id, credits, "update_retail");
  return NextResponse.json({ ok: true });
}
