import { db, schema } from "@/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireFullAccess } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { awardCredits } from "@/lib/credit-service";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ unitId: string }> }) {
  const auth = await requireFullAccess(req);
  if (auth instanceof Response) return auth;
  const { unitId } = await params;
  const id = parseInt(unitId);
  const body = await req.json();

  const allowed = new Set(["floor", "suite", "areaSF", "tenantName", "isVacant", "isSublease", "listingAgent", "notes", "verifiedDate"]);
  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const [k, v] of Object.entries(body)) {
    if (allowed.has(k)) {
      if (k === "isVacant" || k === "isSublease") updates[k] = v ? 1 : 0;
      else if (k === "areaSF") updates[k] = v === "" || v === null ? null : Number(v);
      else updates[k] = v === "" ? null : v;
    }
  }

  await db.update(schema.officeUnits).set(updates).where(eq(schema.officeUnits.id, id));

  // Look up building name for description
  const [unitRec] = db.select({ buildingId: schema.officeUnits.buildingId }).from(schema.officeUnits).where(eq(schema.officeUnits.id, id)).all();
  let bldgName = "office building";
  if (unitRec) {
    const [b] = db.select({ name: schema.officeBuildings.buildingName, addr: schema.officeBuildings.address }).from(schema.officeBuildings).where(eq(schema.officeBuildings.id, unitRec.buildingId)).all();
    if (b) bldgName = b.name || b.addr;
  }
  awardCredits(auth.user.id, 1, "update_office_unit", id, undefined, `Updated unit in ${bldgName}`);

  const [updated] = db.select().from(schema.officeUnits).where(eq(schema.officeUnits.id, id)).all();
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ unitId: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { unitId } = await params;
  await db.delete(schema.officeUnits).where(eq(schema.officeUnits.id, parseInt(unitId)));
  return NextResponse.json({ ok: true });
}
