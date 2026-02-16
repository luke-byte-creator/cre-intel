/**
 * Auto-links a comp to properties and companies by normalizing names/addresses.
 * Called on every comp insert and update.
 */
import { db, schema } from "@/db";
import { eq, sql } from "drizzle-orm";
import { normalizeAddress, normalizeCity } from "@/lib/address";

function normalizeCompanyName(name: string): string {
  return name.toLowerCase()
    .replace(/\./g, '')
    .replace(/,/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Cache company names (refresh per call is fine for single inserts)
let companyCache: { id: number; norm: string }[] | null = null;

function getCompanyCache(): { id: number; norm: string }[] {
  if (!companyCache) {
    const companies = db.select({ id: schema.companies.id, name: schema.companies.name })
      .from(schema.companies).all();
    companyCache = companies.map(c => ({ id: c.id, norm: normalizeCompanyName(c.name) }));
  }
  return companyCache;
}

function matchCompany(name: string | null): number | null {
  if (!name || name.trim().length < 3) return null;
  const norm = normalizeCompanyName(name);
  const match = getCompanyCache().find(c => c.norm === norm);
  return match?.id ?? null;
}

function matchOrCreateProperty(address: string, city?: string | null, province?: string | null, propertyType?: string | null): number {
  const normAddr = normalizeAddress(address);
  const normCity = normalizeCity(city || 'Saskatoon');

  if (!normAddr) {
    // Can't normalize — create a property anyway
    const result = db.insert(schema.properties).values({
      address,
      city: city || 'Saskatoon',
      province: province || 'Saskatchewan',
      propertyType: propertyType || null,
      addressNormalized: null,
      cityNormalized: normCity,
    }).returning({ id: schema.properties.id }).get();
    return result.id;
  }

  // Try to find existing property by normalized address + city
  const existing = db.all(sql`
    SELECT id FROM properties 
    WHERE address_normalized = ${normAddr}
    AND (city_normalized = ${normCity} OR (city_normalized IS NULL AND ${normCity} IS NULL))
    LIMIT 1
  `) as { id: number }[];

  if (existing.length > 0) {
    return existing[0].id;
  }

  // Create new property
  const result = db.insert(schema.properties).values({
    address,
    city: city || 'Saskatoon',
    province: province || 'Saskatchewan',
    propertyType: propertyType || null,
    addressNormalized: normAddr,
    cityNormalized: normCity,
  }).returning({ id: schema.properties.id }).get();

  return result.id;
}

/**
 * Links a comp to properties and companies. Call after insert or update.
 */
export function linkComp(compId: number): void {
  const comp = db.select().from(schema.comps).where(eq(schema.comps.id, compId)).get();
  if (!comp) return;

  // Reset company cache for fresh matching
  companyCache = null;

  const updates: Record<string, number | null> = {};

  // Property linking
  if (!comp.propertyId && comp.address) {
    updates.propertyId = matchOrCreateProperty(comp.address, comp.city, comp.province, comp.propertyType);
  }

  // Company linking
  if (!comp.sellerCompanyId && comp.seller) {
    const id = matchCompany(comp.seller);
    if (id) updates.sellerCompanyId = id;
  }
  if (!comp.purchaserCompanyId && comp.purchaser) {
    const id = matchCompany(comp.purchaser);
    if (id) updates.purchaserCompanyId = id;
  }
  if (!comp.landlordCompanyId && comp.landlord) {
    const id = matchCompany(comp.landlord);
    if (id) updates.landlordCompanyId = id;
  }
  if (!comp.tenantCompanyId && comp.tenant) {
    const id = matchCompany(comp.tenant);
    if (id) updates.tenantCompanyId = id;
  }

  if (Object.keys(updates).length > 0) {
    db.update(schema.comps).set(updates).where(eq(schema.comps.id, compId)).run();
  }
}
