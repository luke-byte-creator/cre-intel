/**
 * Auto-links a comp to properties and companies by normalizing names/addresses.
 * Called on every comp insert and update.
 */
import { db, schema } from "@/db";
import { eq, sql } from "drizzle-orm";

function normalizeAddress(addr: string): string {
  return addr.toLowerCase()
    .replace(/,?\s*(saskatoon|regina|prince albert|moose jaw|swift current|north battleford|yorkton|sk|saskatchewan).*$/i, '')
    .replace(/\bave\b/gi, 'avenue')
    .replace(/\bst\b(?!\w)/gi, 'street')
    .replace(/\bdr\b/gi, 'drive')
    .replace(/\bcres\b/gi, 'crescent')
    .replace(/\bblvd\b/gi, 'boulevard')
    .replace(/\brd\b/gi, 'road')
    .replace(/\bpl\b/gi, 'place')
    .replace(/\bpkwy\b/gi, 'parkway')
    .replace(/\bct\b/gi, 'court')
    .replace(/\bcrt\b/gi, 'court')
    .replace(/\bcirc\b/gi, 'circle')
    .replace(/\s+/g, ' ')
    .trim();
}

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

  // Try to find existing property by normalized address
  const properties = db.select({ id: schema.properties.id, address: schema.properties.address })
    .from(schema.properties).all();

  for (const p of properties) {
    if (p.address && normalizeAddress(p.address) === normAddr) {
      return p.id;
    }
  }

  // Create new property
  const result = db.insert(schema.properties).values({
    address: address,
    city: city || 'Saskatoon',
    province: province || 'Saskatchewan',
    propertyType: propertyType || null,
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
