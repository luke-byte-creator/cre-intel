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

  const transactions = db
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

  const permits = db
    .select()
    .from(schema.permits)
    .where(eq(schema.permits.applicantCompanyId, companyId))
    .orderBy(sql`issue_date DESC`)
    .all();

  return NextResponse.json({ company, people, transactions, permits });
}
