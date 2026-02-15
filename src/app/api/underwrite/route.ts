import { db, schema } from "@/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const status = req.nextUrl.searchParams.get("status");
  let results;
  if (status) {
    results = await db.select().from(schema.underwritingAnalyses).where(eq(schema.underwritingAnalyses.status, status));
  } else {
    results = await db.select().from(schema.underwritingAnalyses);
  }
  results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json(results);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  if (!body.name || !body.assetClass) {
    return NextResponse.json({ error: "name and assetClass are required" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const result = await db.insert(schema.underwritingAnalyses).values({
    name: body.name as string,
    assetClass: body.assetClass as string,
    mode: (body.mode as string) || "quick",
    propertyAddress: (body.propertyAddress as string) || null,
    status: "draft",
    documents: "[]",
    createdAt: now,
    updatedAt: now,
  }).returning();

  return NextResponse.json(result[0], { status: 201 });
}
