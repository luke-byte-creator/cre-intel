import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, or, sql } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const companyId = parseInt(id, 10);

  const [company] = db.select().from(schema.companies).where(eq(schema.companies.id, companyId)).all();
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const people = db
    .select({
      id: schema.people.id,
      fullName: schema.people.fullName,
      role: schema.companyPeople.role,
      title: schema.companyPeople.title,
      startDate: schema.companyPeople.startDate,
      email: schema.people.email,
      phone: schema.people.phone,
      notes: schema.people.notes,
    })
    .from(schema.companyPeople)
    .innerJoin(schema.people, eq(schema.companyPeople.personId, schema.people.id))
    .where(eq(schema.companyPeople.companyId, companyId))
    .all();

  // Legacy transactions table (transfer list data)
  const legacyTransactions = db
    .select({
      id: schema.transactions.id,
      propertyId: schema.transactions.propertyId,
      transferDate: schema.transactions.transferDate,
      registrationDate: schema.transactions.registrationDate,
      titleNumber: schema.transactions.titleNumber,
      transactionType: schema.transactions.transactionType,
      price: schema.transactions.price,
      grantor: schema.transactions.grantor,
      grantee: schema.transactions.grantee,
      propertyAddress: schema.properties.address,
      propertyType: schema.properties.propertyType,
    })
    .from(schema.transactions)
    .leftJoin(schema.properties, eq(schema.transactions.propertyId, schema.properties.id))
    .where(
      or(
        eq(schema.transactions.grantorCompanyId, companyId),
        eq(schema.transactions.granteeCompanyId, companyId)
      )
    )
    .orderBy(sql`transfer_date DESC`)
    .all();

  // Comps (sale/lease) where company appears as seller/purchaser/landlord/tenant (FK-based)
  const compsAsParty = db.all(sql`
    SELECT id, type, address, city, sale_date as saleDate, sale_price as salePrice, price_psf as pricePSF,
      seller, purchaser, landlord, tenant, property_type as propertyType,
      net_rent_psf as netRentPSF, annual_rent as annualRent, area_sf as areaSF, term_months as termMonths,
      seller_company_id, purchaser_company_id, landlord_company_id, tenant_company_id
    FROM comps
    WHERE seller_company_id = ${companyId}
      OR purchaser_company_id = ${companyId}
      OR landlord_company_id = ${companyId}
      OR tenant_company_id = ${companyId}
    ORDER BY sale_date DESC
  `) as any[];

  const transactions = legacyTransactions;
  const compTransactions = compsAsParty.map((c: any) => ({
    ...c,
    role: c.seller_company_id === companyId ? "Seller" :
          c.purchaser_company_id === companyId ? "Purchaser" :
          c.landlord_company_id === companyId ? "Landlord" : "Tenant",
  }));

  const permits = db
    .select()
    .from(schema.permits)
    .where(eq(schema.permits.applicantCompanyId, companyId))
    .orderBy(sql`issue_date DESC`)
    .all();

  return NextResponse.json({ company, people, transactions, permits, compTransactions });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const companyId = parseInt(id, 10);
  if (isNaN(companyId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  // Delete relationships
  db.delete(schema.companyPeople).where(eq(schema.companyPeople.companyId, companyId)).run();
  // Delete watchlist entries
  db.run(sql`DELETE FROM watchlist WHERE entity_type = 'company' AND entity_id = ${companyId}`);
  // Delete company
  db.delete(schema.companies).where(eq(schema.companies.id, companyId)).run();
  return NextResponse.json({ ok: true });
}
