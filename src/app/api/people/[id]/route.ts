import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const personId = parseInt(id, 10);

  const [person] = db.select().from(schema.people).where(eq(schema.people.id, personId)).all();
  if (!person) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const companies = db
    .select({
      id: schema.companies.id,
      name: schema.companies.name,
      role: schema.companyPeople.role,
      title: schema.companyPeople.title,
    })
    .from(schema.companyPeople)
    .innerJoin(schema.companies, eq(schema.companyPeople.companyId, schema.companies.id))
    .where(eq(schema.companyPeople.personId, personId))
    .all();

  // Get transactions through their companies
  const companyIds = companies.map(c => c.id);
  let transactions: any[] = [];
  if (companyIds.length > 0) {
    transactions = db.all(sql`
      SELECT c.id, c.type, c.address, c.sale_date as saleDate, c.sale_price as salePrice,
        c.net_rent_psf as netRentPSF, c.seller, c.purchaser, c.landlord, c.tenant,
        c.property_type as propertyType,
        CASE
          WHEN c.seller_company_id IN (${sql.raw(companyIds.join(','))}) THEN 'Seller'
          WHEN c.purchaser_company_id IN (${sql.raw(companyIds.join(','))}) THEN 'Purchaser'
          WHEN c.landlord_company_id IN (${sql.raw(companyIds.join(','))}) THEN 'Landlord'
          WHEN c.tenant_company_id IN (${sql.raw(companyIds.join(','))}) THEN 'Tenant'
        END as role
      FROM comps c
      WHERE c.seller_company_id IN (${sql.raw(companyIds.join(','))})
        OR c.purchaser_company_id IN (${sql.raw(companyIds.join(','))})
        OR c.landlord_company_id IN (${sql.raw(companyIds.join(','))})
        OR c.tenant_company_id IN (${sql.raw(companyIds.join(','))})
      ORDER BY c.sale_date DESC
      LIMIT 50
    `);
  }

  return NextResponse.json({ person, companies, transactions });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const personId = parseInt(id, 10);
  if (isNaN(personId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  // Delete relationships first
  db.delete(schema.companyPeople).where(eq(schema.companyPeople.personId, personId)).run();
  // Delete watchlist entries
  db.run(sql`DELETE FROM watchlist WHERE entity_type = 'person' AND entity_id = ${personId}`);
  // Delete person
  db.delete(schema.people).where(eq(schema.people.id, personId)).run();
  return NextResponse.json({ ok: true });
}
