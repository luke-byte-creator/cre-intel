import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { requireAuth } from "@/lib/auth";
import { eq, and } from "drizzle-orm";

// GET /api/underwriting/packages/[id] - Get package detail
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  try {
    const { id } = await params;
    const packageId = parseInt(id);
    
    // Get package (only accessible by owner or admin)
    const packageQuery = await db.select()
      .from(schema.underwritingPackages)
      .where(and(
        eq(schema.underwritingPackages.id, packageId),
        eq(schema.underwritingPackages.createdBy, auth.user.id)
      ))
      .limit(1);

    if (!packageQuery[0]) {
      return NextResponse.json({ error: "Package not found" }, { status: 404 });
    }

    // Get all documents in the package
    const documents = await db.select()
      .from(schema.underwritingDocuments)
      .where(eq(schema.underwritingDocuments.packageId, packageId))
      .orderBy(schema.underwritingDocuments.createdAt);

    const packageData = {
      ...packageQuery[0],
      documents: documents.map(doc => ({
        ...doc,
        extractedData: doc.extractedData ? JSON.parse(doc.extractedData) : null,
        fieldConfidence: doc.fieldConfidence ? JSON.parse(doc.fieldConfidence) : null,
      }))
    };

    return NextResponse.json(packageData);
  } catch (error) {
    console.error("Error fetching package:", error);
    return NextResponse.json({ error: "Failed to fetch package" }, { status: 500 });
  }
}

// PATCH /api/underwriting/packages/[id] - Update package
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  try {
    const { id } = await params;
    const packageId = parseInt(id);
    const body = await req.json();

    // Verify ownership
    const packageQuery = await db.select()
      .from(schema.underwritingPackages)
      .where(and(
        eq(schema.underwritingPackages.id, packageId),
        eq(schema.underwritingPackages.createdBy, auth.user.id)
      ))
      .limit(1);

    if (!packageQuery[0]) {
      return NextResponse.json({ error: "Package not found" }, { status: 404 });
    }

    const updates: any = {
      updatedAt: new Date().toISOString()
    };

    // Allow updating status and propertyAddress
    if (body.status && ['collecting', 'ready', 'analyzed'].includes(body.status)) {
      updates.status = body.status;
    }
    
    if (body.propertyAddress) {
      updates.propertyAddress = body.propertyAddress;
      // Also update normalized address
      updates.propertyAddressNormalized = normalizeAddress(body.propertyAddress);
    }

    await db.update(schema.underwritingPackages)
      .set(updates)
      .where(eq(schema.underwritingPackages.id, packageId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating package:", error);
    return NextResponse.json({ error: "Failed to update package" }, { status: 500 });
  }
}

function normalizeAddress(address: string): string {
  return address
    .toLowerCase()
    .replace(/\b(street|st|avenue|ave|road|rd|drive|dr|boulevard|blvd|lane|ln)\b/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}