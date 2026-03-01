import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const table = req.nextUrl.searchParams.get("table");

  switch (table) {
    case "companies":
      return NextResponse.json(db.select().from(schema.companies).orderBy(sql`name`).all());
    case "people":
      return NextResponse.json(db.select().from(schema.people).orderBy(sql`full_name`).all());
    case "properties":
      return NextResponse.json(db.select().from(schema.properties).orderBy(sql`address`).all());
    case "transactions": {
      const rows = db
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
        .leftJoin(schema.properties, sql`${schema.transactions.propertyId} = ${schema.properties.id}`)
        .orderBy(sql`transfer_date DESC`)
        .all();
      return NextResponse.json(rows);
    }
    case "permits":
      return NextResponse.json(db.select().from(schema.permits).orderBy(sql`issue_date DESC`).all());
    default:
      return NextResponse.json({ error: "Invalid table" }, { status: 400 });
  }
}
