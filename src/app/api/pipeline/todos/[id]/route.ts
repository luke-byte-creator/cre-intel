import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  const todo = await db.select().from(schema.pipelineTodos).where(eq(schema.pipelineTodos.id, Number(id)));
  if (!todo.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {};

  if (body.text !== undefined) updates.text = body.text;
  if (body.dueDate !== undefined) updates.dueDate = body.dueDate || null;
  if (body.completed !== undefined) {
    updates.completed = body.completed;
    if (body.completed) {
      updates.completedAt = now;
    } else {
      updates.completedAt = null;
    }

    // Add comment to deal if linked
    const dealId = todo[0].dealId;
    const deal = dealId ? await db.select().from(schema.deals).where(eq(schema.deals.id, dealId)) : [];
    if (deal.length > 0 && dealId) {
      let comments: { text: string; date: string }[] = [];
      try { comments = JSON.parse(deal[0].notes || "[]"); if (!Array.isArray(comments)) comments = []; } catch { comments = []; }
      const commentText = body.completed
        ? `✅ Task completed: ${body.text || todo[0].text}`
        : `🔄 Task uncompleted: ${body.text || todo[0].text}`;
      comments.push({ text: commentText, date: now });
      await db.update(schema.deals).set({ notes: JSON.stringify(comments), updatedAt: now }).where(eq(schema.deals.id, dealId));
    }
  }

  const result = await db.update(schema.pipelineTodos).set(updates).where(eq(schema.pipelineTodos.id, Number(id))).returning();
  return NextResponse.json(result[0]);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;

  const result = await db.delete(schema.pipelineTodos).where(eq(schema.pipelineTodos.id, Number(id))).returning();
  if (!result.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
