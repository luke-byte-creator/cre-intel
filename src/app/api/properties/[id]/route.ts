import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const propId = parseInt(id, 10);

  const [property] = db.select().from(schema.properties).where(eq(schema.properties.id, propId)).all();
  if (!property) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const permits = db
    .select()
    .from(schema.permits)
    .where(eq(schema.permits.propertyId, propId))
    .orderBy(sql`issue_date DESC`)
    .all();

  const comps = db.all(sql`
    SELECT id, type, address, sale_date as saleDate, sale_price as salePrice, price_psf as pricePSF,
      seller, purchaser, landlord, tenant, property_type as propertyType,
      net_rent_psf as netRentPSF, annual_rent as annualRent, area_sf as areaSF, term_months as termMonths
    FROM comps WHERE property_id = ${propId}
    ORDER BY sale_date DESC
  `);

  return NextResponse.json({ property, transactions: [], permits, comps });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const propId = parseInt(id, 10);
  if (isNaN(propId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  // Delete watchlist entries
  db.run(sql`DELETE FROM watchlist WHERE entity_type = 'property' AND entity_id = ${propId}`);
  // Delete property
  db.delete(schema.properties).where(eq(schema.properties.id, propId)).run();
  return NextResponse.json({ ok: true });
}
