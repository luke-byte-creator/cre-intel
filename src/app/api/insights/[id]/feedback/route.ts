import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, sql } from "drizzle-orm";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const insightId = parseInt(id);
  if (isNaN(insightId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = await req.json();
  const { rating, comment } = body;

  if (rating !== 1 && rating !== -1) {
    return NextResponse.json({ error: "Rating must be 1 or -1" }, { status: 400 });
  }

  const updated = db
    .update(schema.novaInsights)
    .set({
      feedbackRating: rating,
      feedbackComment: comment || null,
      feedbackUserId: auth.user.id,
      feedbackUserName: auth.user.name,
      feedbackAt: new Date().toISOString(),
    })
    .where(eq(schema.novaInsights.id, insightId))
    .returning()
    .get();

  if (!updated) {
    return NextResponse.json({ error: "Insight not found" }, { status: 404 });
  }

  // Log activity event
  db.insert(schema.activityEvents).values({
    userId: auth.user.id,
    userName: auth.user.name,
    action: "feedback",
    category: "insights",
    detail: JSON.stringify({ insightId, rating, comment }),
    path: `/insights`,
  }).run();

  return NextResponse.json({ insight: updated });
}
