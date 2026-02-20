import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { requireAuth } from "@/lib/auth";
import { eq, desc, sql } from "drizzle-orm";

// GET /api/underwriting/packages - List packages for current user
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  try {
    // Get packages with document counts and extraction status summary
    const packages = await db.select({
      id: schema.underwritingPackages.id,
      propertyAddress: schema.underwritingPackages.propertyAddress,
      status: schema.underwritingPackages.status,
      createdAt: schema.underwritingPackages.createdAt,
      updatedAt: schema.underwritingPackages.updatedAt,
      totalDocs: sql<number>`count(${schema.underwritingDocuments.id})`,
      successfulDocs: sql<number>`sum(case when ${schema.underwritingDocuments.extractionStatus} = 'success' then 1 else 0 end)`,
      partialDocs: sql<number>`sum(case when ${schema.underwritingDocuments.extractionStatus} = 'partial' then 1 else 0 end)`,
      failedDocs: sql<number>`sum(case when ${schema.underwritingDocuments.extractionStatus} = 'failed' then 1 else 0 end)`,
    })
    .from(schema.underwritingPackages)
    .leftJoin(
      schema.underwritingDocuments,
      eq(schema.underwritingDocuments.packageId, schema.underwritingPackages.id)
    )
    .where(eq(schema.underwritingPackages.createdBy, auth.user.id))
    .groupBy(schema.underwritingPackages.id)
    .orderBy(desc(schema.underwritingPackages.updatedAt));

    return NextResponse.json(packages);
  } catch (error) {
    console.error("Error fetching underwriting packages:", error);
    return NextResponse.json({ error: "Failed to fetch packages" }, { status: 500 });
  }
}