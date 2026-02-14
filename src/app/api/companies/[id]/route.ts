import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    })
    .from(schema.companyPeople)
    .innerJoin(schema.people, eq(schema.companyPeople.personId, schema.people.id))
    .where(eq(schema.companyPeople.companyId, companyId))
    .all();

  const transactions = db
    .select()
    .from(schema.transactions)
    .where(sql`grantor_company_id = ${companyId} OR grantee_company_id = ${companyId}`)
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
