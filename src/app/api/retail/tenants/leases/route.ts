import { db, schema } from "@/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { sql, asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  // Get all retail tenants that have at least one lease field filled
  const tenants = db.select().from(schema.retailTenants).all();
  const developments = db.select().from(schema.retailDevelopments).all();
  const devMap = new Map(developments.map(d => [d.id, d]));

  const leaseComps = tenants
    .filter(t => 
      t.netRentPSF != null || t.annualRent != null || t.areaSF != null ||
      t.leaseStart != null || t.leaseExpiry != null || t.termMonths != null ||
      t.leaseType != null
    )
    .map(t => {
      const dev = devMap.get(t.developmentId);
      return {
        id: `rt-${t.id}`,
        retailTenantId: t.id,
        type: "Lease",
        propertyType: "Retail",
        address: dev?.address || dev?.name || "Unknown Development",
        propertyName: dev?.name || null,
        unit: t.unitSuite || null,
        city: "Saskatoon",
        province: "Saskatchewan",
        tenant: t.tenantName,
        landlord: null,
        areaSF: t.areaSF,
        netRentPSF: t.netRentPSF,
        annualRent: t.annualRent,
        leaseStart: t.leaseStart,
        leaseExpiry: t.leaseExpiry,
        termMonths: t.termMonths,
        rentSteps: t.rentSteps,
        leaseType: t.leaseType,
        comments: t.comment,
        source: "Retail Rent Roll",
        isRetailTenant: true,
        // Fields that don't apply but needed for display compat
        investmentType: null,
        portfolio: null,
        saleDate: null,
        isRenewal: null,
        officeSF: null,
        ceilingHeight: null,
        loadingDocks: null,
        driveInDoors: null,
        landAcres: null,
        landSF: null,
        yearBuilt: null,
        zoning: null,
        numBuildings: null,
        numStories: null,
        constructionClass: null,
        operatingCost: null,
        improvementAllowance: null,
        freeRentPeriod: null,
        fixturingPeriod: null,
        researchedUnavailable: 0,
        researchedAt: null,
        researchedBy: null,
        researchedExpired: false,
        isResearched: false,
        isAutoResearched: false,
      };
    });

  return NextResponse.json({ data: leaseComps });
}
