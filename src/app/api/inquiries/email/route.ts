import { db, schema } from "@/db";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeString } from "@/lib/security";

const INGEST_SECRET = process.env.INGEST_SECRET || "nova-ingest-dev-key-2026";

export async function GET() {
  return NextResponse.json({ status: "ok", endpoint: "email ingestion" });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Validate secret
  if (body.secret !== INGEST_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawEmail = sanitizeString(body.rawEmail, 10000);
  const from = sanitizeString(body.from, 254);
  const subject = sanitizeString(body.subject, 500);
  const source = sanitizeString(body.source, 50) || "email";
  const parsed = (body.parsed && typeof body.parsed === "object") ? body.parsed as Record<string, unknown> : null;

  // Use parsed fields if available, otherwise fallback to raw data
  const tenantName = (parsed && sanitizeString(parsed.tenantName, 200)) || from || "Unknown";
  const tenantCompany = parsed ? sanitizeString(parsed.tenantCompany, 200) : null;
  const tenantEmail = (parsed && sanitizeString(parsed.tenantEmail, 254)) || from;
  const tenantPhone = (parsed && sanitizeString(parsed.tenantPhone, 20)) || null;
  const propertyOfInterest = (parsed && sanitizeString(parsed.propertyOfInterest, 500)) || subject || "See notes";
  const businessDescription = (parsed && sanitizeString(parsed.businessDescription, 1000)) || null;
  const spaceNeedsSf = (parsed && sanitizeString(parsed.spaceNeedsSf, 50)) || null;
  const notes = (parsed && sanitizeString(parsed.notes, 2000)) || rawEmail || null;

  const result = await db.insert(schema.inquiries).values({
    tenantName,
    tenantCompany,
    tenantEmail,
    tenantPhone,
    propertyOfInterest,
    businessDescription,
    spaceNeedsSf,
    notes: notes ? `[Email Forward] Subject: ${subject || "N/A"}\nFrom: ${from || "N/A"}\n\n${notes}` : null,
    source,
    submittedBy: "email_forward",
    status: "new",
  }).returning();

  return NextResponse.json({ id: result[0].id, status: "created" }, { status: 201 });
}
