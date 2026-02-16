import { db, schema } from "@/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireFullAccess } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { awardCredits } from "@/lib/credit-service";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFullAccess(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const bid = parseInt(id);
  const body = await req.json();

  const allowed = new Set([
    "streetNumber", "streetName", "address", "city", "postal", "buildingName",
    "cmhcZone", "region", "units", "zoning", "yearBuilt", "assessedValue",
    "buildingOwner", "parcelNumber", "titleValue", "titleTransferDate",
    "propertyManager", "managerContact", "propertyOwner", "ownerContact", "ownerEmail",
    "constructionClass", "comments",
    "bachRentLow", "bachRentHigh", "bachSF",
    "oneBedRentLow", "oneBedRentHigh", "oneBedSF",
    "twoBedRentLow", "twoBedRentHigh", "twoBedSF",
    "threeBedRentLow", "threeBedRentHigh", "threeBedSF",
    "rentSource", "contactInfo", "contactDate", "isCondo", "isSalesComp",
  ]);

  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const [k, v] of Object.entries(body)) {
    if (allowed.has(k)) {
      if (["units", "assessedValue", "titleValue", "yearBuilt", "bachSF", "oneBedSF", "twoBedSF", "threeBedSF"].includes(k)) {
        updates[k] = v === "" || v === null ? null : Math.round(Number(v));
      } else if (["bachRentLow", "bachRentHigh", "oneBedRentLow", "oneBedRentHigh", "twoBedRentLow", "twoBedRentHigh", "threeBedRentLow", "threeBedRentHigh"].includes(k)) {
        updates[k] = v === "" || v === null ? null : Number(v);
      } else if (["contactInfo", "isCondo", "isSalesComp"].includes(k)) {
        updates[k] = v ? 1 : 0;
      } else {
        updates[k] = v === "" ? null : v;
      }
    }
  }

  // Check if rent survey fields are being added
  const rentFields = ["bachRentLow", "bachRentHigh", "oneBedRentLow", "oneBedRentHigh", "twoBedRentLow", "twoBedRentHigh", "threeBedRentLow", "threeBedRentHigh"];
  const hasRentData = rentFields.some(f => f in body && body[f] !== null && body[f] !== "");

  let awardedRentSurvey = false;
  // Get current record to check if rent fields were previously empty
  if (hasRentData) {
    const [current] = db.select().from(schema.multiBuildings).where(eq(schema.multiBuildings.id, bid)).all();
    if (current) {
      const newRentFields = rentFields.filter(f => {
        const oldVal = (current as Record<string, unknown>)[f];
        return (oldVal === null || oldVal === undefined) && body[f] !== null && body[f] !== "" && body[f] !== undefined;
      });
      if (newRentFields.length > 0) {
        awardCredits(auth.user.id, 1, "add_rent_survey", bid, undefined, `Added rent survey for ${current.buildingName || current.address}`);
        awardedRentSurvey = true;
      }
    }
  }

  if (!awardedRentSurvey) {
    const [mBldg] = db.select({ name: schema.multiBuildings.buildingName, addr: schema.multiBuildings.address }).from(schema.multiBuildings).where(eq(schema.multiBuildings.id, bid)).all();
    awardCredits(auth.user.id, 1, "update_multi", bid, undefined, `Updated ${mBldg?.name || mBldg?.addr || "multifamily building"}`);
  }

  if (updates.address || updates.city) {
    const { normalizeAddress, normalizeCity } = await import("@/lib/address");
    if (updates.address) updates.addressNormalized = normalizeAddress(updates.address as string);
    if (updates.city) updates.cityNormalized = normalizeCity(updates.city as string);
  }
  await db.update(schema.multiBuildings).set(updates).where(eq(schema.multiBuildings.id, bid));
  const [updated] = db.select().from(schema.multiBuildings).where(eq(schema.multiBuildings.id, bid)).all();
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  await db.delete(schema.multiBuildings).where(eq(schema.multiBuildings.id, parseInt(id)));
  return NextResponse.json({ ok: true });
}
