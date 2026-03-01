import { db, schema } from "@/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireFullAccess } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { awardCredits } from "@/lib/credit-service";
import { CREDIT_CONFIG, isCompKeyFieldsComplete } from "@/lib/credits";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFullAccess(req);
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const compId = parseInt(id);
  if (isNaN(compId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  // Get current comp to check which fields were empty
  const [currentComp] = db.select().from(schema.comps).where(eq(schema.comps.id, compId)).all();
  if (!currentComp) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();

  // Handle researched flag toggle
  if (body.researchedUnavailable !== undefined) {
    if (body.researchedUnavailable) {
      await db.update(schema.comps).set({
        researchedUnavailable: 1,
        researchedAt: new Date().toISOString(),
        researchedBy: auth.user.id,
      }).where(eq(schema.comps.id, compId));
    } else {
      await db.update(schema.comps).set({
        researchedUnavailable: 0,
        researchedAt: null,
        researchedBy: null,
      }).where(eq(schema.comps.id, compId));
    }
    const [updated] = await db.select().from(schema.comps).where(eq(schema.comps.id, compId));
    return NextResponse.json(updated);
  }

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

  // Re-normalize address if address or city changed
  if (updates.address || updates.city) {
    const { normalizeAddress, normalizeCity, displayAddress } = await import("@/lib/address");
    if (updates.address) {
      const norm = normalizeAddress(updates.address as string);
      updates.addressNormalized = norm;
      updates.address = norm ? displayAddress(norm) || updates.address : updates.address;
    }
    if (updates.city) {
      updates.cityNormalized = normalizeCity(updates.city as string);
    }
  }

  await db.update(schema.comps).set(updates).where(eq(schema.comps.id, compId));

  // Count newly filled fields (were null/empty, now have values)
  let filledCount = 0;
  const filledFields: string[] = [];
  for (const [key, value] of Object.entries(updates)) {
    const oldVal = (currentComp as Record<string, unknown>)[key];
    if ((oldVal === null || oldVal === undefined || oldVal === "") && value !== null && value !== undefined && value !== "") {
      filledCount++;
      filledFields.push(key);
    }
  }

  if (filledCount > 0) {
    const amount = filledCount >= 5 ? CREDIT_CONFIG.ACTIONS.FILL_FIELDS_MAJOR : CREDIT_CONFIG.ACTIONS.FILL_FIELDS_MINOR;
    const reason = filledCount >= 5 ? "fill_fields" : "fill_fields";
    awardCredits(auth.user.id, amount, reason, compId, JSON.stringify({ fields: filledFields, count: filledCount }), `Updated comp ${currentComp.address}`);
  }

  // Auto-set researched flag if key fields are now complete
  const [afterUpdate] = await db.select().from(schema.comps).where(eq(schema.comps.id, compId));
  if (afterUpdate && afterUpdate.researchedUnavailable !== 1) {
    if (isCompKeyFieldsComplete(afterUpdate as unknown as Record<string, unknown>)) {
      await db.update(schema.comps).set({
        researchedUnavailable: 1,
        researchedAt: new Date().toISOString(),
        researchedBy: auth.user.id,
      }).where(eq(schema.comps.id, compId));
      const [final] = await db.select().from(schema.comps).where(eq(schema.comps.id, compId));
      return NextResponse.json(final);
    }
  }

  return NextResponse.json(afterUpdate);
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
