import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { requireAuth } from "@/lib/auth";
import { eq, and } from "drizzle-orm";
import fs from "fs";

// DELETE /api/underwriting/packages/[id]/documents/[docId] - Remove a document from package
export async function DELETE(
  req: NextRequest, 
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  try {
    const { id, docId } = await params;
    const packageId = parseInt(id);
    const docIdInt = parseInt(docId);

    // Verify package ownership
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

    // Get the document
    const document = await db.select()
      .from(schema.underwritingDocuments)
      .where(and(
        eq(schema.underwritingDocuments.id, docIdInt),
        eq(schema.underwritingDocuments.packageId, packageId)
      ))
      .limit(1);

    if (!document[0]) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // Delete the file if it exists
    try {
      if (fs.existsSync(document[0].filePath)) {
        fs.unlinkSync(document[0].filePath);
      }
    } catch (e) {
      console.warn("Could not delete file:", document[0].filePath, e);
    }

    // Delete the document record
    await db.delete(schema.underwritingDocuments)
      .where(eq(schema.underwritingDocuments.id, docIdInt));

    // Update package timestamp
    await db.update(schema.underwritingPackages)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(schema.underwritingPackages.id, packageId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting document:", error);
    return NextResponse.json({ error: "Failed to delete document" }, { status: 500 });
  }
}

// PATCH /api/underwriting/packages/[id]/documents/[docId] - Edit extracted data
export async function PATCH(
  req: NextRequest, 
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  try {
    const { id, docId } = await params;
    const packageId = parseInt(id);
    const docIdInt = parseInt(docId);
    const body = await req.json();

    // Verify package ownership
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

    // Get the document
    const document = await db.select()
      .from(schema.underwritingDocuments)
      .where(and(
        eq(schema.underwritingDocuments.id, docIdInt),
        eq(schema.underwritingDocuments.packageId, packageId)
      ))
      .limit(1);

    if (!document[0]) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // Update extracted data
    const currentData = document[0].extractedData ? JSON.parse(document[0].extractedData) : {};
    const currentConfidence = document[0].fieldConfidence ? JSON.parse(document[0].fieldConfidence) : {};

    const updatedData = { ...currentData, ...body.extractedData };
    
    // Set confidence to "high" for all edited fields
    const updatedConfidence = { ...currentConfidence };
    for (const field in body.extractedData) {
      updatedConfidence[field] = "high";
    }

    await db.update(schema.underwritingDocuments)
      .set({
        extractedData: JSON.stringify(updatedData),
        fieldConfidence: JSON.stringify(updatedConfidence),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.underwritingDocuments.id, docIdInt));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating document:", error);
    return NextResponse.json({ error: "Failed to update document" }, { status: 500 });
  }
}