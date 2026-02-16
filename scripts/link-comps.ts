import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "cre-intel.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function normalizeCompanyName(name: string): string {
  return name.toLowerCase()
    .replace(/\./g, '')
    .replace(/,/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeAddress(addr: string): string {
  return addr.toLowerCase()
    .replace(/,?\s*(saskatoon|regina|prince albert|moose jaw|swift current|north battleford|yorkton|sk|saskatchewan).*$/i, '')
    .replace(/\bave\b/gi, 'avenue')
    .replace(/\bst\b/gi, 'street')
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

// Load all companies
const companies = db.prepare("SELECT id, name FROM companies").all() as { id: number; name: string }[];
const companyMap = new Map<string, number>();
for (const c of companies) {
  companyMap.set(normalizeCompanyName(c.name), c.id);
}
console.log(`Loaded ${companies.length} companies`);

// Load all properties
const properties = db.prepare("SELECT id, address FROM properties").all() as { id: number; address: string }[];
const propertyMap = new Map<string, number>();
for (const p of properties) {
  if (p.address) {
    propertyMap.set(normalizeAddress(p.address), p.id);
  }
}
console.log(`Loaded ${properties.length} properties`);

// Load all comps
const comps = db.prepare("SELECT id, type, address, city, province, property_type, seller, purchaser, landlord, tenant FROM comps").all() as {
  id: number; type: string; address: string; city: string; province: string; property_type: string;
  seller: string | null; purchaser: string | null; landlord: string | null; tenant: string | null;
}[];
console.log(`Loaded ${comps.length} comps`);

// Step 2a: Link companies
const updateCompanyStmt = db.prepare(`
  UPDATE comps SET seller_company_id = ?, purchaser_company_id = ?, landlord_company_id = ?, tenant_company_id = ?
  WHERE id = ?
`);

let sellerLinked = 0, purchaserLinked = 0, landlordLinked = 0, tenantLinked = 0;

const companyLinkTx = db.transaction(() => {
  for (const comp of comps) {
    const sellerId = comp.seller ? companyMap.get(normalizeCompanyName(comp.seller)) ?? null : null;
    const purchaserId = comp.purchaser ? companyMap.get(normalizeCompanyName(comp.purchaser)) ?? null : null;
    const landlordId = comp.landlord ? companyMap.get(normalizeCompanyName(comp.landlord)) ?? null : null;
    const tenantId = comp.tenant ? companyMap.get(normalizeCompanyName(comp.tenant)) ?? null : null;

    if (sellerId || purchaserId || landlordId || tenantId) {
      updateCompanyStmt.run(sellerId, purchaserId, landlordId, tenantId, comp.id);
    }
    if (sellerId) sellerLinked++;
    if (purchaserId) purchaserLinked++;
    if (landlordId) landlordLinked++;
    if (tenantId) tenantLinked++;
  }
});
companyLinkTx();

console.log(`\nCompanies linked: ${sellerLinked} sellers, ${purchaserLinked} purchasers, ${landlordLinked} landlords, ${tenantLinked} tenants`);

// Step 2b: Match comps to existing properties
const updatePropertyStmt = db.prepare("UPDATE comps SET property_id = ? WHERE id = ?");
let existingMatched = 0;
const unmatchedComps: typeof comps = [];

const propertyMatchTx = db.transaction(() => {
  for (const comp of comps) {
    const normAddr = normalizeAddress(comp.address);
    const propId = propertyMap.get(normAddr);
    if (propId) {
      updatePropertyStmt.run(propId, comp.id);
      existingMatched++;
    } else {
      unmatchedComps.push(comp);
    }
  }
});
propertyMatchTx();

console.log(`\nProperties matched to existing: ${existingMatched}`);
console.log(`Unmatched comps: ${unmatchedComps.length}`);

// Step 2c: Auto-create properties for unmatched comps
const addressGroups = new Map<string, typeof comps>();
for (const comp of unmatchedComps) {
  const normAddr = normalizeAddress(comp.address);
  const group = addressGroups.get(normAddr) || [];
  group.push(comp);
  addressGroups.set(normAddr, group);
}

const insertPropertyStmt = db.prepare(`
  INSERT INTO properties (address, city, province, property_type, created_at, updated_at)
  VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
`);

let newlyCreated = 0;

const createPropertiesTx = db.transaction(() => {
  for (const [, group] of addressGroups) {
    const first = group[0];
    const result = insertPropertyStmt.run(
      first.address,
      first.city || "Saskatoon",
      first.province || "Saskatchewan",
      first.property_type
    );
    const newPropId = result.lastInsertRowid as number;
    newlyCreated++;
    for (const comp of group) {
      updatePropertyStmt.run(newPropId, comp.id);
    }
  }
});
createPropertiesTx();

console.log(`Newly created properties: ${newlyCreated}`);

// Final counts
const totalLinked = db.prepare("SELECT COUNT(*) as c FROM comps WHERE property_id IS NOT NULL").get() as { c: number };
const totalComps = db.prepare("SELECT COUNT(*) as c FROM comps").get() as { c: number };
const totalProperties = db.prepare("SELECT COUNT(*) as c FROM properties").get() as { c: number };

console.log(`\n=== Summary ===`);
console.log(`Companies linked: ${sellerLinked} sellers, ${purchaserLinked} purchasers, ${landlordLinked} landlords, ${tenantLinked} tenants`);
console.log(`Properties matched: ${existingMatched} existing, ${newlyCreated} newly created`);
console.log(`Comps linked to properties: ${totalLinked.c} of ${totalComps.c}`);
console.log(`Total properties now: ${totalProperties.c}`);
