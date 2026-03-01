import { NextRequest, NextResponse } from "next/server";
import { requireFullAccess } from "@/lib/auth";
import { awardCredits } from "@/lib/credit-service";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFullAccess(req);
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const body = await req.json();

  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const key of ["address", "availableSF", "totalBuildingSF", "listingBrokerage", "listingType", "quarterRecorded", "yearRecorded", "notes", "buildingId"]) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  db.update(schema.industrialVacancies)
    .set(updates)
    .where(eq(schema.industrialVacancies.id, Number(id)))
    .run();

  awardCredits(auth.user.id, 1, "update_industrial_vacancy", undefined, undefined, `Updated vacancy record`);

  const updated = db.select().from(schema.industrialVacancies)
    .where(eq(schema.industrialVacancies.id, Number(id))).get();

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFullAccess(req);
  if (auth instanceof Response) return auth;

  const { id } = await params;
  db.delete(schema.industrialVacancies)
    .where(eq(schema.industrialVacancies.id, Number(id)))
    .run();

  return NextResponse.json({ ok: true });
}
