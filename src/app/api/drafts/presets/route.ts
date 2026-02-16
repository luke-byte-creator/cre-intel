import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const presets = await db.select().from(schema.documentPresets)
    .where(eq(schema.documentPresets.userId, auth.user.id));

  return NextResponse.json(presets);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  if (!body.name || !body.documentType || !body.extractedStructure) {
    return NextResponse.json({ error: "name, documentType, and extractedStructure are required" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const result = await db.insert(schema.documentPresets).values({
    userId: auth.user.id,
    documentType: body.documentType as string,
    subType: (body.subType as string) || null,
    name: body.name as string,
    extractedStructure: typeof body.extractedStructure === "string" ? body.extractedStructure : JSON.stringify(body.extractedStructure),
    exampleCount: (body.exampleCount as number) || 1,
    createdAt: now,
    updatedAt: now,
  }).returning();

  return NextResponse.json(result[0], { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const result = await db.delete(schema.documentPresets)
    .where(and(eq(schema.documentPresets.id, Number(id)), eq(schema.documentPresets.userId, auth.user.id)))
    .returning();

  if (!result.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
