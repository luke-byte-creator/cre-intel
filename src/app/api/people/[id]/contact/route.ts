import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const personId = parseInt(id, 10);
  const body = await req.json();

  const updates: Partial<{ email: string | null; phone: string | null; notes: string | null; updatedAt: string }> = {};
  for (const key of ["email", "phone", "notes"] as const) {
    if (key in body) {
      updates[key] = body[key] ?? null;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  updates.updatedAt = new Date().toISOString();

  db.update(schema.people).set(updates).where(eq(schema.people.id, personId)).run();

  return NextResponse.json({ ok: true });
}
