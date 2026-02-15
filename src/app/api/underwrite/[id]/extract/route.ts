import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { extractFromDocuments } from "@/lib/extraction/extract-documents";
import path from "path";
import fs from "fs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const analysisId = Number(id);

  const rows = await db.select().from(schema.underwritingAnalyses).where(eq(schema.underwritingAnalyses.id, analysisId));
  if (!rows.length) return NextResponse.json({ error: "Analysis not found" }, { status: 404 });

  const analysis = rows[0];
  const docs: Array<{ name: string; size: number; uploadedAt: string }> = JSON.parse(analysis.documents || "[]");

  if (!docs.length) {
    return NextResponse.json({ error: "No documents uploaded" }, { status: 400 });
  }

  const dir = path.join(process.cwd(), "data", "underwriting", id);

  const documents = docs
    .map((d) => {
      const filePath = path.join(dir, d.name);
      if (!fs.existsSync(filePath)) return null;
      return { filename: d.name, filePath };
    })
    .filter(Boolean) as { filename: string; filePath: string }[];

  if (!documents.length) {
    return NextResponse.json({ error: "No document files found on disk" }, { status: 400 });
  }

  try {
    const result = await extractFromDocuments(documents);

    // Merge extracted inputs with any existing inputs
    const existingInputs = analysis.inputs ? JSON.parse(analysis.inputs) : {};
    const mergedInputs = { ...existingInputs, ...result.inputs };

    await db
      .update(schema.underwritingAnalyses)
      .set({
        inputs: JSON.stringify(mergedInputs),
        status: "extracted",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.underwritingAnalyses.id, analysisId));

    return NextResponse.json({
      status: "complete",
      inputs: result.inputs,
      auditTrail: result.auditTrail,
      warnings: result.warnings,
      conflicts: result.conflicts,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Extraction failed: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
