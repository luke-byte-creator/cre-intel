/**
 * Backfill property_id on all comps using normalized address matching.
 * Also links companies where possible.
 */
import { db, schema } from "../src/db";
import { eq, sql, isNull } from "drizzle-orm";
import { normalizeAddress, normalizeCity } from "../src/lib/address";

// Step 1: Link comps to properties via normalized address
console.log("=== Linking comps → properties ===\n");

const comps = db.select({
  id: schema.comps.id,
  address: schema.comps.address,
  city: schema.comps.city,
  province: schema.comps.province,
  propertyType: schema.comps.propertyType,
  propertyId: schema.comps.propertyId,
  addressNormalized: schema.comps.addressNormalized,
  cityNormalized: schema.comps.cityNormalized,
}).from(schema.comps).all();

let linked = 0;
let created = 0;
let alreadyLinked = 0;
let noAddress = 0;

for (const comp of comps) {
  if (comp.propertyId) {
    alreadyLinked++;
    continue;
  }
  
  if (!comp.addressNormalized) {
    noAddress++;
    continue;
  }

  // Find matching property
  const matches = db.all(sql`
    SELECT id FROM properties 
    WHERE address_normalized = ${comp.addressNormalized}
    AND (city_normalized = ${comp.cityNormalized} OR (city_normalized IS NULL AND ${comp.cityNormalized} IS NULL))
    LIMIT 1
  `) as { id: number }[];

  if (matches.length > 0) {
    db.update(schema.comps)
      .set({ propertyId: matches[0].id })
      .where(eq(schema.comps.id, comp.id))
      .run();
    linked++;
  } else {
    // Create new property
    const result = db.insert(schema.properties).values({
      address: comp.address,
      city: comp.city || 'Saskatoon',
      province: comp.province || 'Saskatchewan',
      propertyType: comp.propertyType || null,
      addressNormalized: comp.addressNormalized,
      cityNormalized: comp.cityNormalized,
    }).returning({ id: schema.properties.id }).get();

    db.update(schema.comps)
      .set({ propertyId: result.id })
      .where(eq(schema.comps.id, comp.id))
      .run();
    created++;
    linked++;
  }
}

console.log(`  Already linked: ${alreadyLinked}`);
console.log(`  Newly linked to existing properties: ${linked - created}`);
console.log(`  New properties created & linked: ${created}`);
console.log(`  No address (skipped): ${noAddress}`);
console.log(`  Total comps: ${comps.length}`);

// Step 2: Link comps to companies
console.log("\n=== Linking comps → companies ===\n");

function normalizeCompanyName(name: string): string {
  return name.toLowerCase().replace(/\./g, '').replace(/,/g, '').replace(/\s+/g, ' ').trim();
}

const companies = db.select({ id: schema.companies.id, name: schema.companies.name })
  .from(schema.companies).all();
const companyMap = new Map(companies.map(c => [normalizeCompanyName(c.name), c.id]));

const unlinkedComps = db.select().from(schema.comps).all();

let sellerLinks = 0, purchaserLinks = 0, landlordLinks = 0, tenantLinks = 0;

for (const comp of unlinkedComps) {
  const updates: Record<string, number> = {};

  if (!comp.sellerCompanyId && comp.seller) {
    const id = companyMap.get(normalizeCompanyName(comp.seller));
    if (id) { updates.sellerCompanyId = id; sellerLinks++; }
  }
  if (!comp.purchaserCompanyId && comp.purchaser) {
    const id = companyMap.get(normalizeCompanyName(comp.purchaser));
    if (id) { updates.purchaserCompanyId = id; purchaserLinks++; }
  }
  if (!comp.landlordCompanyId && comp.landlord) {
    const id = companyMap.get(normalizeCompanyName(comp.landlord));
    if (id) { updates.landlordCompanyId = id; landlordLinks++; }
  }
  if (!comp.tenantCompanyId && comp.tenant) {
    const id = companyMap.get(normalizeCompanyName(comp.tenant));
    if (id) { updates.tenantCompanyId = id; tenantLinks++; }
  }

  if (Object.keys(updates).length > 0) {
    db.update(schema.comps).set(updates).where(eq(schema.comps.id, comp.id)).run();
  }
}

console.log(`  Seller → Company: ${sellerLinks}`);
console.log(`  Purchaser → Company: ${purchaserLinks}`);
console.log(`  Landlord → Company: ${landlordLinks}`);
console.log(`  Tenant → Company: ${tenantLinks}`);
console.log(`  Total company links created: ${sellerLinks + purchaserLinks + landlordLinks + tenantLinks}`);

// Step 3: Link permits to properties
console.log("\n=== Linking permits → properties ===\n");

const permits = db.select({
  id: schema.permits.id,
  propertyId: schema.permits.propertyId,
  addressNormalized: schema.permits.addressNormalized,
}).from(schema.permits).all();

let permitLinks = 0;
for (const permit of permits) {
  if (permit.propertyId || !permit.addressNormalized) continue;

  // Permits are Saskatoon only
  const matches = db.all(sql`
    SELECT id FROM properties 
    WHERE address_normalized = ${permit.addressNormalized}
    AND (city_normalized = 'SASKATOON' OR city_normalized IS NULL)
    LIMIT 1
  `) as { id: number }[];

  if (matches.length > 0) {
    db.update(schema.permits)
      .set({ propertyId: matches[0].id })
      .where(eq(schema.permits.id, permit.id))
      .run();
    permitLinks++;
  }
}

console.log(`  Permits linked to properties: ${permitLinks} of ${permits.length}`);

// Summary
console.log("\n=== Final Stats ===\n");
const totalComps = db.all(sql`SELECT COUNT(*) as c FROM comps`)[0] as any;
const linkedComps = db.all(sql`SELECT COUNT(*) as c FROM comps WHERE property_id IS NOT NULL`)[0] as any;
const totalProps = db.all(sql`SELECT COUNT(*) as c FROM properties`)[0] as any;
const propsWithComps = db.all(sql`SELECT COUNT(DISTINCT property_id) as c FROM comps WHERE property_id IS NOT NULL`)[0] as any;
const linkedPermits = db.all(sql`SELECT COUNT(*) as c FROM permits WHERE property_id IS NOT NULL`)[0] as any;

console.log(`  Comps with property_id: ${linkedComps.c} / ${totalComps.c}`);
console.log(`  Properties total: ${totalProps.c}`);
console.log(`  Properties with comps: ${propsWithComps.c}`);
console.log(`  Permits with property_id: ${linkedPermits.c} / ${permits.length}`);
