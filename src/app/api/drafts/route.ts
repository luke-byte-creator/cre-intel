import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const drafts = await db
    .select()
    .from(schema.documentDrafts)
    .where(eq(schema.documentDrafts.userId, auth.user.id))
    .orderBy(desc(schema.documentDrafts.updatedAt));

  // Attach deal info
  const result = [];
  for (const draft of drafts) {
    let dealName = null;
    if (draft.dealId) {
      const deal = await db.select({ tenantName: schema.deals.tenantName, propertyAddress: schema.deals.propertyAddress })
        .from(schema.deals).where(eq(schema.deals.id, draft.dealId)).limit(1);
      if (deal[0]) dealName = `${deal[0].tenantName} — ${deal[0].propertyAddress}`;
    }
    result.push({ ...draft, dealName });
  }

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  if (!body.documentType || !body.title) {
    return NextResponse.json({ error: "documentType and title are required" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const result = await db.insert(schema.documentDrafts).values({
    userId: auth.user.id,
    dealId: (body.dealId as number) || null,
    documentType: body.documentType as string,
    title: body.title as string,
    instructions: (body.instructions as string) || null,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  }).returning();

  return NextResponse.json(result[0], { status: 201 });
}
