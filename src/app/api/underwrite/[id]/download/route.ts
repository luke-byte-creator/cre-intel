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

  const analysis = rows[0];
  if (!analysis.excelPath || !fs.existsSync(analysis.excelPath)) {
    return NextResponse.json({ error: "No generated file available" }, { status: 404 });
  }

  const buffer = fs.readFileSync(analysis.excelPath);
  const filename = `${analysis.name.replace(/[^a-zA-Z0-9_-]/g, "_")}_underwriting.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
