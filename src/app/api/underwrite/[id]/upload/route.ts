import { db, schema } from "@/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_FILES = 10;
const ALLOWED_TYPES = [".pdf", ".xlsx", ".xls", ".csv", ".jpg", ".png"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;

  const rows = await db.select().from(schema.underwritingAnalyses).where(eq(schema.underwritingAnalyses.id, Number(id)));
  if (!rows.length) return NextResponse.json({ error: "Analysis not found" }, { status: 404 });

  const analysis = rows[0];
  const existingDocs: Array<{ name: string; size: number; uploadedAt: string }> = JSON.parse(analysis.documents || "[]");

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED_TYPES.includes(ext)) {
    return NextResponse.json({ error: `File type ${ext} not allowed` }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File exceeds 50MB limit" }, { status: 400 });
  }
  if (existingDocs.length >= MAX_FILES) {
    return NextResponse.json({ error: "Maximum 10 files reached" }, { status: 400 });
  }

  const dir = path.join(process.cwd(), "data", "underwriting", id);
  fs.mkdirSync(dir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  const filePath = path.join(dir, file.name);
  fs.writeFileSync(filePath, buffer);

  existingDocs.push({ name: file.name, size: file.size, uploadedAt: new Date().toISOString() });
  const docsJson = JSON.stringify(existingDocs);

  await db.update(schema.underwritingAnalyses).set({ documents: docsJson, updatedAt: new Date().toISOString() }).where(eq(schema.underwritingAnalyses.id, Number(id)));

  return NextResponse.json({ documents: existingDocs });
}
