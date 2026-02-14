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

  const transactions = db
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.propertyId, propId))
    .orderBy(sql`transfer_date DESC`)
    .all();

  const permits = db
    .select()
    .from(schema.permits)
    .where(eq(schema.permits.propertyId, propId))
    .orderBy(sql`issue_date DESC`)
    .all();

  return NextResponse.json({ property, transactions, permits });
}
