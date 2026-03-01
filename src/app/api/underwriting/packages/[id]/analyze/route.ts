import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { requireAuth } from "@/lib/auth";
import { eq, and } from "drizzle-orm";
import { callAI } from "@/lib/ai";

// POST /api/underwriting/packages/[id]/analyze - Run the analysis
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  try {
    const { id } = await params;
    const packageId = parseInt(id);

    // Verify package ownership and status
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

    const package_ = packageQuery[0];
    
    if (!['collecting', 'ready'].includes(package_.status)) {
      return NextResponse.json({ error: "Package must be in 'collecting' or 'ready' status to analyze" }, { status: 400 });
    }

    // Get all successfully extracted documents
    const documents = await db.select()
      .from(schema.underwritingDocuments)
      .where(and(
        eq(schema.underwritingDocuments.packageId, packageId),
        eq(schema.underwritingDocuments.extractionStatus, "success")
      ));

    if (documents.length === 0) {
      return NextResponse.json({ error: "No successfully extracted documents to analyze" }, { status: 400 });
    }

    // Build rent roll data for analysis
    const rentRollData = documents.map(doc => {
      const extractedData = doc.extractedData ? JSON.parse(doc.extractedData) : {};
      return {
        tenant: extractedData.tenantName || 'Unknown Tenant',
        suite: extractedData.suite || null,
        sf: extractedData.areaSF || 0,
        rentPSF: extractedData.baseRentPSF || 0,
        annualRent: (extractedData.areaSF || 0) * (extractedData.baseRentPSF || 0),
        leaseStart: extractedData.leaseStart || null,
        leaseExpiry: extractedData.leaseExpiry || null,
        rentType: extractedData.rentType || 'net',
        operatingExpenses: extractedData.operatingExpenses || null,
      };
    });

    // Run AI analysis
    const analysisResult = await generateUnderwritingAnalysis(package_.propertyAddress, rentRollData);

    if (!analysisResult) {
      return NextResponse.json({ error: "Failed to generate analysis" }, { status: 500 });
    }

    const now = new Date().toISOString();

    // Save analysis result and update package status
    await db.update(schema.underwritingPackages)
      .set({
        analysisResult: JSON.stringify(analysisResult),
        status: "analyzed",
        updatedAt: now,
      })
      .where(eq(schema.underwritingPackages.id, packageId));

    return NextResponse.json({
      success: true,
      analysis: analysisResult
    });

  } catch (error) {
    console.error("Error analyzing package:", error);
    return NextResponse.json({ error: "Failed to analyze package" }, { status: 500 });
  }
}

async function generateUnderwritingAnalysis(propertyAddress: string, rentRollData: any[]): Promise<any> {
  try {
    const response = await callAI([
      {
        role: "system",
        content: `You are a commercial real estate underwriting analyst. Analyze the rent roll data for this property and provide a comprehensive underwriting analysis.

Return a JSON object with the following structure:
{
  "rentRoll": [
    {
      "tenant": "string",
      "suite": "string", 
      "sf": number,
      "rentPSF": number,
      "annualRent": number,
      "expiry": "YYYY-MM-DD"
    }
  ],
  "summary": {
    "totalOccupiedSF": number,
    "totalVacantSF": number,
    "occupancyRate": number,
    "totalAnnualRent": number,
    "weightedAvgRentPSF": number,
    "currentNOI": number
  },
  "leaseAnalysis": {
    "WALT": number,
    "rolloverSchedule": {
      "next12Months": { "sf": number, "percentOfTotal": number },
      "next24Months": { "sf": number, "percentOfTotal": number },
      "next36Months": { "sf": number, "percentOfTotal": number }
    }
  },
  "marketAnalysis": {
    "rentGapAnalysis": "string describing which tenants are above/below market",
    "riskFlags": ["array of risk factors"],
    "recommendations": ["array of recommendations"]
  },
  "financialMetrics": {
    "capRate": number,
    "priceEstimate": number,
    "NOIPerSF": number
  }
}

Calculate the weighted average lease term (WALT) by SF. For the rollover schedule, determine how much SF expires in each period. Identify market risks like near-term expiries, below-market rents, single-tenant concentration, etc.`
      },
      {
        role: "user",
        content: `Analyze this rent roll for ${propertyAddress}:

${JSON.stringify(rentRollData, null, 2)}

Provide a comprehensive underwriting analysis including rent roll summary, occupancy metrics, lease rollover schedule, and risk assessment.`
      }
    ], 6000);

    return JSON.parse(response);
  } catch (error) {
    console.error("Analysis generation error:", error);
    return null;
  }
}