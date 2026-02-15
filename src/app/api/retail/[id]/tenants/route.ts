import { db, schema } from "@/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireFullAccess } from "@/lib/auth";
import { awardCredits } from "@/lib/credit-service";

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
    comment: body.comment || null,
    status: body.status || "active",
  }).run();

  awardCredits(auth.user.id, 1, "update_retail");
  return NextResponse.json({ ok: true });
}
