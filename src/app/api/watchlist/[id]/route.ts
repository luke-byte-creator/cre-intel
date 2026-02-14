import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  db.delete(schema.watchlist).where(eq(schema.watchlist.id, parseInt(id, 10))).run();
  return NextResponse.json({ success: true });
}
