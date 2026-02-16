import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;

  const draft = await db.select().from(schema.documentDrafts)
    .where(and(eq(schema.documentDrafts.id, Number(id)), eq(schema.documentDrafts.userId, auth.user.id)))
    .limit(1);

  if (!draft[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(draft[0]);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (body.title !== undefined) updates.title = body.title;
  if (body.generatedContent !== undefined) updates.generatedContent = body.generatedContent;
  if (body.instructions !== undefined) updates.instructions = body.instructions;
  if (body.status !== undefined) updates.status = body.status;

  const result = await db.update(schema.documentDrafts).set(updates)
    .where(and(eq(schema.documentDrafts.id, Number(id)), eq(schema.documentDrafts.userId, auth.user.id)))
    .returning();

  if (!result.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(result[0]);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;

  const result = await db.delete(schema.documentDrafts)
    .where(and(eq(schema.documentDrafts.id, Number(id)), eq(schema.documentDrafts.userId, auth.user.id)))
    .returning();

  if (!result.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
