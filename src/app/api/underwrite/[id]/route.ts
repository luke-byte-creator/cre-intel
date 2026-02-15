import { db, schema } from "@/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;

  const rows = await db.select().from(schema.underwritingAnalyses).where(eq(schema.underwritingAnalyses.id, Number(id)));
  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(rows[0]);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  const allowed = ["name", "assetClass", "mode", "propertyAddress", "status", "inputs", "documents", "excelPath"];
  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  await db.update(schema.underwritingAnalyses).set(updates).where(eq(schema.underwritingAnalyses.id, Number(id)));
  const rows = await db.select().from(schema.underwritingAnalyses).where(eq(schema.underwritingAnalyses.id, Number(id)));
  return NextResponse.json(rows[0]);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;

  // Clean up files
  const dir = path.join(process.cwd(), "data", "underwriting", id);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  await db.delete(schema.underwritingAnalyses).where(eq(schema.underwritingAnalyses.id, Number(id)));
  return NextResponse.json({ ok: true });
}
