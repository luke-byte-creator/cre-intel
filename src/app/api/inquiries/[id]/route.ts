import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeString, pickFields } from "@/lib/security";
import { requireAuth } from "@/lib/auth";

const ALLOWED_FIELDS = ["status", "notes", "tenantName", "tenantCompany", "tenantEmail", "tenantPhone", "spaceNeedsSf", "assetTypePreference", "preferredArea", "budgetRate", "timeline"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const updates = pickFields(body, ALLOWED_FIELDS);
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  // Sanitize string fields
  for (const key of Object.keys(updates)) {
    const val = (updates as Record<string, unknown>)[key];
    if (typeof val === "string") {
      (updates as Record<string, unknown>)[key] = sanitizeString(val, key === "notes" ? 2000 : 200);
    }
  }

  // Handle claim — tag the inquiry with who moved it to pipeline
  if (body.claim) {
    (updates as Record<string, unknown>).claimedByUserId = auth.user.id;
    (updates as Record<string, unknown>).claimedByName = auth.user.name;
    (updates as Record<string, unknown>).claimedAt = new Date().toISOString();
  }

  const result = await db.update(schema.inquiries).set(updates).where(eq(schema.inquiries.id, numId)).returning();
  if (!result.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(result[0]);
}
