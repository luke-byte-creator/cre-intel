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

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updatedAt: now };
  if (body.title !== undefined) updates.title = body.title;
  if (body.generatedContent !== undefined) updates.generatedContent = body.generatedContent;
  if (body.instructions !== undefined) updates.instructions = body.instructions;
  if (body.status !== undefined) updates.status = body.status;
  if (body.textFeedback !== undefined) updates.textFeedback = body.textFeedback;

  // Handle "used as-is" feedback
  if (body.status === "used_as_is") {
    updates.uploadedAt = now;

    // Create positive preference observation
    const draft = await db.select().from(schema.documentDrafts)
      .where(and(eq(schema.documentDrafts.id, Number(id)), eq(schema.documentDrafts.userId, auth.user.id)))
      .limit(1);

    if (draft[0]) {
      const observation = `User was satisfied with the generated ${draft[0].documentType} draft and used it as-is`;
      const existing = await db.select().from(schema.draftPreferences)
        .where(and(
          eq(schema.draftPreferences.userId, auth.user.id),
          eq(schema.draftPreferences.documentType, draft[0].documentType),
          eq(schema.draftPreferences.observation, observation),
        )).limit(1);

      if (existing[0]) {
        await db.update(schema.draftPreferences).set({
          occurrences: existing[0].occurrences + 1,
          confidence: Math.min(1, existing[0].confidence + 0.15),
          lastSeenAt: now,
        }).where(eq(schema.draftPreferences.id, existing[0].id));
      } else {
        await db.insert(schema.draftPreferences).values({
          userId: auth.user.id,
          documentType: draft[0].documentType,
          observation,
          confidence: 0.7,
          occurrences: 1,
          lastSeenAt: now,
          createdAt: now,
        });
      }
    }
  }

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
