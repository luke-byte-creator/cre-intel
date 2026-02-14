import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const table = req.nextUrl.searchParams.get("table");

  switch (table) {
    case "companies":
      return NextResponse.json(db.select().from(schema.companies).orderBy(sql`name`).all());
    case "people":
      return NextResponse.json(db.select().from(schema.people).orderBy(sql`full_name`).all());
    case "properties":
      return NextResponse.json(db.select().from(schema.properties).orderBy(sql`address`).all());
    case "transactions":
      return NextResponse.json(db.select().from(schema.transactions).orderBy(sql`transfer_date DESC`).all());
    case "permits":
      return NextResponse.json(db.select().from(schema.permits).orderBy(sql`issue_date DESC`).all());
    default:
      return NextResponse.json({ error: "Invalid table" }, { status: 400 });
  }
}
