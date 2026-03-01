import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { requireAuth } from "@/lib/auth";
import { eq, and } from "drizzle-orm";
import { extractDocxXmlText } from "@/lib/docx-edit";
import { callAI } from "@/lib/ai";
import fs from "fs";
import path from "path";

// POST /api/underwriting/packages/[id]/documents - Upload additional documents directly
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  try {
    const { id } = await params;
    const packageId = parseInt(id);

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

    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    if (!file.name.toLowerCase().match(/\.(docx|pdf)$/)) {
      return NextResponse.json({ error: "Only .docx and .pdf files are supported" }, { status: 400 });
    }

    // Save file
    const underwritingDir = path.join(process.cwd(), "data", "underwriting");
    if (!fs.existsSync(underwritingDir)) fs.mkdirSync(underwritingDir, { recursive: true });

    const savedFilename = `${packageId}_${Date.now()}_${file.name}`;
    const savedPath = path.join(underwritingDir, savedFilename);
    
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(savedPath, fileBuffer);

    // Extract text content
    let docText = "";
    try {
      if (file.name.toLowerCase().endsWith('.docx')) {
        docText = await extractDocxXmlText(savedPath);
      }
      // PDF extraction would go here - for now skip PDFs
    } catch (e) {
      console.error(`Failed to extract text from ${file.name}:`, e);
    }

    // AI extraction for lease terms
    let extractedData: any = {};
    let fieldConfidence: any = {};
    let extractionStatus = "failed";
    let documentNotes = "";

    if (docText.trim()) {
      try {
        const leaseExtraction = await extractLeaseTerms(docText);
        if (leaseExtraction) {
          extractedData = leaseExtraction.extractedData || {};
          fieldConfidence = leaseExtraction.fieldConfidence || {};
          
          // Determine extraction status
          const coreFields = ['tenantName', 'areaSF', 'baseRentPSF'];
          const hasCore = coreFields.some(field => extractedData[field] && extractedData[field] !== null);
          
          if (hasCore && Object.keys(extractedData).length >= 5) {
            extractionStatus = "success";
          } else if (hasCore || Object.keys(extractedData).length >= 2) {
            extractionStatus = "partial";
          } else {
            extractionStatus = "failed";
          }
        } else {
          documentNotes = "AI extraction returned no data";
        }
      } catch (e) {
        console.error(`Lease extraction failed for ${file.name}:`, e);
        extractionStatus = "failed";
        documentNotes = `Extraction error: ${e}`;
      }
    } else {
      extractionStatus = "failed";
      documentNotes = "Could not extract text from document";
    }

    const now = new Date().toISOString();

    // Save document record
    const document = await db.insert(schema.underwritingDocuments).values({
      packageId,
      fileName: file.name,
      filePath: savedPath,
      extractedData: JSON.stringify(extractedData),
      fieldConfidence: JSON.stringify(fieldConfidence),
      extractionStatus,
      source: "upload",
      sourceRef: `Direct upload by ${auth.user.name}`,
      notes: documentNotes.trim() || null,
      createdAt: now,
      updatedAt: now,
    }).returning();

    // Update package timestamp
    await db.update(schema.underwritingPackages)
      .set({ updatedAt: now })
      .where(eq(schema.underwritingPackages.id, packageId));

    return NextResponse.json({
      success: true,
      document: {
        ...document[0],
        extractedData: extractedData,
        fieldConfidence: fieldConfidence,
      }
    });

  } catch (error) {
    console.error("Error uploading document:", error);
    return NextResponse.json({ error: "Failed to upload document" }, { status: 500 });
  }
}

async function extractLeaseTerms(docText: string): Promise<any> {
  try {
    const response = await callAI([
      {
        role: "system",
        content: `You are extracting lease terms from commercial real estate lease documents. Extract specific financial and lease terms from the provided text.

Return a JSON object with two parts:
1. extractedData: the actual lease terms
2. fieldConfidence: confidence level for each field ("high", "medium", "low")

LEASE TERMS TO EXTRACT:
- tenantName: tenant business name
- suite: suite/unit number 
- areaSF: leased area in square feet (number)
- baseRentPSF: base rent per square foot (number)
- rentType: "net", "gross", or "modified gross"
- leaseStart: lease commencement date (YYYY-MM-DD format)
- leaseExpiry: lease expiry date (YYYY-MM-DD format)
- termMonths: lease term in months (number)
- tiAllowance: tenant improvement allowance (number)
- operatingExpenses: annual operating expenses if mentioned (number)
- escalations: escalation schedule description (text)
- renewalOptions: renewal option terms (text)
- propertyAddress: property address if mentioned
- specialClauses: any special lease terms (text)

CONFIDENCE SCORING:
- "high": explicitly stated with clear numbers/dates
- "medium": reasonably inferred from context  
- "low": uncertain or estimated

Example response:
{
  "extractedData": {
    "tenantName": "ABC Medical Clinic",
    "suite": "Suite 200",
    "areaSF": 2500,
    "baseRentPSF": 18.50,
    "rentType": "net",
    "leaseStart": "2024-01-01",
    "leaseExpiry": "2029-12-31",
    "termMonths": 72,
    "tiAllowance": 25000
  },
  "fieldConfidence": {
    "tenantName": "high",
    "suite": "high", 
    "areaSF": "high",
    "baseRentPSF": "high",
    "rentType": "medium",
    "leaseStart": "high",
    "leaseExpiry": "high",
    "termMonths": "high",
    "tiAllowance": "medium"
  }
}`
      },
      {
        role: "user",
        content: `Extract lease terms from this document:\n\n${docText.slice(0, 8000)}`
      }
    ], 4000);

    return JSON.parse(response);
  } catch (error) {
    console.error("Lease extraction error:", error);
    return null;
  }
}