import { db, schema } from "@/db";
import { like, or, and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import {
  sanitizeString,
  isValidEmail,
  isValidPhone,
  inquiryRateLimiter,
  getClientIp,
} from "@/lib/security";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const status = req.nextUrl.searchParams.get("status");
  const search = req.nextUrl.searchParams.get("search");

  const conditions = [];
  if (status) conditions.push(eq(schema.inquiries.status, status));
  if (search) {
    const s = `%${search}%`;
    conditions.push(or(
      like(schema.inquiries.tenantName, s),
      like(schema.inquiries.tenantCompany, s),
      like(schema.inquiries.propertyOfInterest, s),
      like(schema.inquiries.businessDescription, s),
      like(schema.inquiries.notes, s),
    )!);
  }

  const results = await db.select()
    .from(schema.inquiries)
    .where(conditions.length ? and(...conditions) : undefined);

  return NextResponse.json(results);
}

export async function POST(req: NextRequest) {
  // Rate limiting
  const ip = getClientIp(req);
  if (!inquiryRateLimiter.check(ip)) {
    return NextResponse.json(
      { error: "Too many submissions. Please try again later." },
      { status: 429 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Validate and sanitize
  const tenantName = sanitizeString(body.tenantName, 200);
  if (!tenantName) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const tenantEmail = sanitizeString(body.tenantEmail, 254);
  if (!tenantEmail) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }
  if (!isValidEmail(tenantEmail)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  const tenantPhone = sanitizeString(body.tenantPhone, 20);
  if (!tenantPhone) {
    return NextResponse.json({ error: "Phone is required" }, { status: 400 });
  }
  if (!isValidPhone(tenantPhone)) {
    return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
  }

  const propertyOfInterest = sanitizeString(body.propertyOfInterest, 500);
  if (!propertyOfInterest) {
    return NextResponse.json({ error: "Property of interest is required" }, { status: 400 });
  }

  const businessDescription = sanitizeString(body.businessDescription, 1000);
  if (!businessDescription) {
    return NextResponse.json({ error: "Business description is required" }, { status: 400 });
  }

  const spaceNeedsSf = sanitizeString(body.spaceNeedsSf, 50);
  if (!spaceNeedsSf) {
    return NextResponse.json({ error: "Space requirements are required" }, { status: 400 });
  }

  const tenantCompany = sanitizeString(body.tenantCompany, 200);
  const timeline = sanitizeString(body.timeline, 50);
  const notes = sanitizeString(body.notes, 2000);
  const source = sanitizeString(body.source, 50) || "form";
  const submittedBy = sanitizeString(body.submittedBy, 50) || "tenant";

  const result = await db.insert(schema.inquiries).values({
    tenantName,
    tenantCompany,
    tenantEmail,
    tenantPhone,
    propertyOfInterest,
    businessDescription,
    spaceNeedsSf,
    timeline,
    notes,
    source,
    submittedBy,
    status: "new",
  }).returning();
  return NextResponse.json(result[0], { status: 201 });
}
