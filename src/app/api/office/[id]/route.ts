import { db, schema } from "@/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireFullAccess } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { awardCredits } from "@/lib/credit-service";

// Get building with units
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const buildingId = parseInt(id);

  const [building] = db.select().from(schema.officeBuildings).where(eq(schema.officeBuildings.id, buildingId)).all();
  if (!building) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const units = db.select().from(schema.officeUnits).where(eq(schema.officeUnits.buildingId, buildingId)).all();

  return NextResponse.json({ ...building, units });
}

// Update building
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFullAccess(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const buildingId = parseInt(id);
  const body = await req.json();

  const allowed = new Set([
    "address", "streetNumber", "neighborhood", "buildingName", "buildingClass",
    "floors", "yearBuilt", "totalSF", "contiguousBlock",
    "directVacantSF", "subleaseSF", "totalVacantSF", "totalAvailableSF",
    "vacancyRate", "netAskingRate", "opCost", "grossRate",
    "listingAgent", "parkingType", "parkingRatio", "owner", "parcelNumber", "comments",
  ]);

  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const [k, v] of Object.entries(body)) {
    if (allowed.has(k)) updates[k] = v === "" ? null : v;
  }
  if (updates.address) {
    const { normalizeAddress, displayAddress } = await import("@/lib/address");
    const norm = normalizeAddress(updates.address as string);
    updates.addressNormalized = norm;
    updates.address = norm ? displayAddress(norm) || updates.address : updates.address;
  }

  await db.update(schema.officeBuildings).set(updates).where(eq(schema.officeBuildings.id, buildingId));

  const [bldg] = db.select({ name: schema.officeBuildings.buildingName, addr: schema.officeBuildings.address }).from(schema.officeBuildings).where(eq(schema.officeBuildings.id, buildingId)).all();
  awardCredits(auth.user.id, 1, "update_office", buildingId, undefined, `Updated ${bldg?.name || bldg?.addr || "office building"}`);

  const [updated] = db.select().from(schema.officeBuildings).where(eq(schema.officeBuildings.id, buildingId)).all();
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const buildingId = parseInt(id);
  await db.delete(schema.officeUnits).where(eq(schema.officeUnits.buildingId, buildingId));
  await db.delete(schema.officeBuildings).where(eq(schema.officeBuildings.id, buildingId));
  return NextResponse.json({ ok: true });
}
