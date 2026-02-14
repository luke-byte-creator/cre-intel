import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  return NextResponse.json({ person, companies });
}
