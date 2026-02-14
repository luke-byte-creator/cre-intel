import { db, schema } from "@/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const body = await req.json();
  if (!body.tenantName) return NextResponse.json({ error: "tenantName required" }, { status: 400 });

  db.insert(schema.retailTenants).values({
    developmentId: parseInt(id),
    tenantName: body.tenantName,
    category: body.category || null,
    comment: body.comment || null,
    status: body.status || "active",
  }).run();

  return NextResponse.json({ ok: true });
}
