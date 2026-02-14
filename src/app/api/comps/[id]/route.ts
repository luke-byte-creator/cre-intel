import { db, schema } from "@/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const compId = parseInt(id);
  if (isNaN(compId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const body = await req.json();

  // Allowlist of editable fields
  const allowed = new Set([
    "type", "propertyType", "investmentType", "leaseType", "propertyName",
    "address", "unit", "city", "province",
    "seller", "purchaser", "landlord", "tenant", "portfolio",
    "saleDate", "salePrice", "pricePSF", "pricePerAcre",
    "isRenewal", "leaseStart", "leaseExpiry", "termMonths",
    "netRentPSF", "annualRent", "rentSteps",
    "areaSF", "officeSF", "ceilingHeight", "loadingDocks", "driveInDoors",
    "landAcres", "landSF", "yearBuilt", "zoning",
    "noi", "capRate", "stabilizedNOI", "stabilizedCapRate",
    "vacancyRate", "pricePerUnit", "opexRatio",
    "numUnits", "numBuildings", "numStories", "constructionClass",
    "retailSalesPerAnnum", "retailSalesPSF", "operatingCost",
    "improvementAllowance", "freeRentPeriod", "fixturingPeriod",
    "comments", "rollNumber", "pptCode", "pptDescriptor", "armsLength",
  ]);

  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (allowed.has(key)) {
      updates[key] = value === "" ? null : value;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  await db.update(schema.comps).set(updates).where(eq(schema.comps.id, compId));

  const [updated] = await db.select().from(schema.comps).where(eq(schema.comps.id, compId));
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const compId = parseInt(id);
  if (isNaN(compId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  await db.delete(schema.comps).where(eq(schema.comps.id, compId));
  return NextResponse.json({ ok: true });
}
