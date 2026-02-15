import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { generateAcquisitionModel, AcquisitionInputs } from "@/lib/excel/generate-acquisition";
import type { AcquisitionInputs as ExtractedInputs, AuditEntry } from "@/lib/extraction/extract-documents";
import path from "path";
import fs from "fs";

function mapExtractedToExcel(ext: Partial<ExtractedInputs>, auditTrail?: AuditEntry[]): AcquisitionInputs {
  return {
    propertyName: ext.propertyName || "Unnamed Property",
    address: ext.propertyAddress || "",
    city: ext.city || "",
    province: "",
    propertyType: ext.propertyType || "Office",
    nraSF: ext.nraSF || 0,
    landArea: ext.landArea || 0,
    yearBuilt: ext.yearBuilt || 0,
    floors: ext.floors || 0,
    parking: typeof ext.parking === "string" ? parseInt(ext.parking) || 0 : 0,
    purchasePrice: ext.askingPrice || 0,
    closingCostPct: ext.closingCostsPct || 0.02,
    upfrontCapex: 0,
    analysisStartDate: new Date().toISOString().slice(0, 10),
    analysisPeriod: ext.analysisPeriod || 10,
    baseRent: ext.baseRent || 0,
    recoveryIncome: ext.recoveryIncome || 0,
    parkingIncome: ext.parkingIncome || 0,
    otherIncome: ext.otherIncome || 0,
    vacancyRate: ext.vacancyRate || 0.05,
    rentAbatement: 0,
    historicalT2: ext.historical?.t2 ? { revenue: ext.historical.t2.revenue, expenses: ext.historical.t2.expenses, noi: ext.historical.t2.noi } : undefined,
    historicalT1: ext.historical?.t1 ? { revenue: ext.historical.t1.revenue, expenses: ext.historical.t1.expenses, noi: ext.historical.t1.noi } : undefined,
    historicalT12: ext.historical?.t12 ? { revenue: ext.historical.t12.revenue, expenses: ext.historical.t12.expenses, noi: ext.historical.t12.noi } : undefined,
    propertyTax: ext.propertyTax || 0,
    insurance: ext.insurance || 0,
    utilities: ext.utilities || 0,
    repairsMaint: ext.repairsMaint || 0,
    managementPct: ext.managementPct || 0.03,
    admin: ext.admin || 0,
    payroll: ext.payroll || 0,
    marketing: ext.marketing || 0,
    otherExpenses: ext.otherExpenses || 0,
    incomeGrowth: ext.incomeGrowth || 0.02,
    expenseGrowth: ext.expenseGrowth || 0.02,
    propertyTaxGrowth: ext.propertyTaxGrowth || 0.03,
    capexGrowth: ext.capexGrowth || 0.02,
    tiPSF: 0,
    leasingCommPct: 0,
    capitalReservesPSF: ext.capitalReservesPSF || 0.25,
    loanAmount: 0,
    interestRate: 0.05,
    amortizationYears: 25,
    loanTerm: 5,
    ioYears: 0,
    lenderFeesPct: 0.01,
    exitCapRate: ext.askingCapRate || 0.065,
    sellingCostPct: ext.sellingCostsPct || 0.02,
    discountRate: 0.08,
    rentRoll: ext.tenants?.map(t => ({
      tenantName: t.tenantName || "",
      suite: t.suite || "",
      sf: t.sf || 0,
      leaseStart: t.leaseStart || "",
      leaseExpiry: t.leaseExpiry || "",
      baseRentPSF: t.baseRentPSF || 0,
      recoveryType: t.recoveryType || "Net",
      recoveryPSF: t.recoveryPSF || 0,
      escalationType: t.escalationType || "Fixed",
      escalationRate: t.escalationRate || 0,
      options: "",
      notes: "",
    })),
    auditTrail: auditTrail,
  };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const analysisId = Number(id);

  const rows = await db.select().from(schema.underwritingAnalyses).where(eq(schema.underwritingAnalyses.id, analysisId));
  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const analysis = rows[0];
  const extractedInputs: Partial<ExtractedInputs> = analysis.inputs ? JSON.parse(analysis.inputs) : {};

  // Get audit trail from request body if provided
  let auditTrail: AuditEntry[] | undefined;
  try {
    const body = await req.json();
    auditTrail = body.auditTrail;
  } catch {
    // no body is fine
  }

  try {
    const excelInputs = mapExtractedToExcel(extractedInputs, auditTrail);
    const buffer = await generateAcquisitionModel(excelInputs);

    const dir = path.join(process.cwd(), "data", "underwriting", id);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const excelPath = path.join(dir, "model.xlsx");
    fs.writeFileSync(excelPath, buffer);

    await db.update(schema.underwritingAnalyses).set({
      excelPath,
      status: "complete",
      updatedAt: new Date().toISOString(),
    }).where(eq(schema.underwritingAnalyses.id, analysisId));

    return NextResponse.json({ status: "complete", excelPath });
  } catch (err) {
    return NextResponse.json({ error: `Generation failed: ${(err as Error).message}` }, { status: 500 });
  }
}
