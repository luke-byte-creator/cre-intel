import { db, schema } from "@/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireFullAccess } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { awardCredits } from "@/lib/credit-service";
import { CREDIT_CONFIG } from "@/lib/credits";

// Add a new unit
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFullAccess(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const buildingId = parseInt(id);
  const body = await req.json();

  if (!body.floor) return NextResponse.json({ error: "floor required" }, { status: 400 });

  db.insert(schema.officeUnits).values({
    buildingId,
    floor: body.floor,
    suite: body.suite || null,
    areaSF: body.areaSF ? Number(body.areaSF) : null,
    tenantName: body.tenantName || null,
    isVacant: body.isVacant ? 1 : 0,
    isSublease: body.isSublease ? 1 : 0,
    listingAgent: body.listingAgent || null,
    notes: body.notes || null,
    verifiedDate: body.verifiedDate || null,
  }).run();

  // Award credits for stacking plan update
  const [bldg] = db.select({ name: schema.officeBuildings.buildingName, addr: schema.officeBuildings.address }).from(schema.officeBuildings).where(eq(schema.officeBuildings.id, buildingId)).all();
  awardCredits(auth.user.id, 1, "update_office_unit", undefined, undefined, `Added unit to ${bldg?.name || bldg?.addr || "office building"}`);

  const units = db.select().from(schema.officeUnits).where(eq(schema.officeUnits.buildingId, buildingId)).all();
  return NextResponse.json(units);
}
