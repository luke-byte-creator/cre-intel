import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";

/**
 * Syncs a retail tenant to a real comp in the comps table.
 * Creates the comp if it doesn't exist, updates if it does.
 * Only syncs if the tenant has enough data (at least tenantName + one financial field).
 * After first creation, the comp is independent — lease page edits won't be overwritten
 * unless explicitly re-synced from retail.
 */
export function syncRetailTenantToComp(tenantId: number) {
  const tenant = db.select().from(schema.retailTenants)
    .where(eq(schema.retailTenants.id, tenantId)).get();
  if (!tenant) return;

  // Only create comp if there's meaningful lease data
  const hasLeaseData = tenant.netRentPSF != null || tenant.annualRent != null ||
    tenant.leaseStart != null || tenant.leaseExpiry != null;
  if (!hasLeaseData) return;

  // Get development info for address
  const dev = db.select().from(schema.retailDevelopments)
    .where(eq(schema.retailDevelopments.id, tenant.developmentId)).get();

  // Check if comp already exists for this tenant
  const existing = db.select().from(schema.comps)
    .where(eq(schema.comps.retailTenantId, tenantId)).get();

  if (existing) {
    // Update only the fields that come from retail — don't overwrite user edits on other fields
    db.update(schema.comps).set({
      address: dev?.address || dev?.name || "Unknown Development",
      propertyName: dev?.name || null,
      unit: tenant.unitSuite || null,
      tenant: tenant.tenantName,
      areaSF: tenant.areaSF,
      netRentPSF: tenant.netRentPSF,
      annualRent: tenant.annualRent,
      leaseStart: tenant.leaseStart,
      leaseExpiry: tenant.leaseExpiry,
      termMonths: tenant.termMonths,
      rentSteps: tenant.rentSteps,
      leaseType: tenant.leaseType,
      operatingCost: tenant.operatingCosts,
    }).where(eq(schema.comps.id, existing.id)).run();
  } else {
    // Create new comp
    db.insert(schema.comps).values({
      type: "Lease",
      propertyType: "Retail",
      address: dev?.address || dev?.name || "Unknown Development",
      propertyName: dev?.name || null,
      unit: tenant.unitSuite || null,
      city: "Saskatoon",
      province: "Saskatchewan",
      tenant: tenant.tenantName,
      areaSF: tenant.areaSF,
      netRentPSF: tenant.netRentPSF,
      annualRent: tenant.annualRent,
      leaseStart: tenant.leaseStart,
      leaseExpiry: tenant.leaseExpiry,
      termMonths: tenant.termMonths,
      rentSteps: tenant.rentSteps,
      leaseType: tenant.leaseType,
      operatingCost: tenant.operatingCosts,
      source: "Retail Rent Roll",
      retailTenantId: tenantId,
    }).run();
  }
}
