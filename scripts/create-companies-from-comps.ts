/**
 * Create company records from comp party names that don't match existing companies.
 * Only creates for names that look like corporate entities (contain Inc, Ltd, Corp, etc.)
 * Then links the comps to the newly created companies.
 */
import Database from 'better-sqlite3';

const db = new Database('data/cre-intel.db');

function normCompany(name: string): string {
  return name.toLowerCase()
    .replace(/\./g, '')
    .replace(/,/g, '')
    .replace(/\b(inc|ltd|corp|co|llc|llp|lp|limited|incorporated|corporation)\b\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isLikelyCompany(name: string): boolean {
  return /\b(inc|ltd|corp|co|llc|llp|lp|properties|holdings|enterprises|investments|development|construction|management|capital|group|realty|trust|homes|equity|association|society|church|credit union|bank|government|city of|town of|village of|university|college)\b/i.test(name)
    || /^\d{6,}\s+(saskatchewan|alberta|canada|ontario)/i.test(name);
}

// Load existing companies
const existing = db.prepare('SELECT id, name FROM companies').all() as { id: number; name: string }[];
const normMap = new Map<string, number>();
for (const c of existing) {
  normMap.set(normCompany(c.name), c.id);
}

// Collect all unique party names from comps
const roles = [
  { col: 'seller', fk: 'seller_company_id' },
  { col: 'purchaser', fk: 'purchaser_company_id' },
  { col: 'landlord', fk: 'landlord_company_id' },
  { col: 'tenant', fk: 'tenant_company_id' },
] as const;

// First pass: collect unique company names to create
const toCreate = new Map<string, string>(); // norm → original name (best version)

for (const role of roles) {
  const unlinked = db.prepare(`
    SELECT DISTINCT ${role.col} as name FROM comps 
    WHERE ${role.col} IS NOT NULL AND ${role.col} != '' AND ${role.fk} IS NULL
  `).all() as { name: string }[];

  for (const { name } of unlinked) {
    if (!isLikelyCompany(name)) continue;
    const norm = normCompany(name);
    if (normMap.has(norm)) continue; // Already exists
    
    // Keep the version with proper punctuation (e.g., "Inc." over "Inc")
    const existing = toCreate.get(norm);
    if (!existing || name.length > existing.length) {
      toCreate.set(norm, name);
    }
  }
}

console.log(`=== Creating ${toCreate.size} new companies from comp party names ===\n`);

const insertCompany = db.prepare('INSERT INTO companies (name, status, created_at, updated_at) VALUES (?, ?, ?, ?)');
const now = new Date().toISOString();
let created = 0;

for (const [norm, name] of toCreate) {
  const result = insertCompany.run(name, 'Active', now, now);
  normMap.set(norm, Number(result.lastInsertRowid));
  created++;
}
console.log(`Created: ${created} companies`);

// Second pass: link all comps
console.log('\n=== Linking comps to companies ===\n');
let totalLinked = 0;

for (const role of roles) {
  const unlinked = db.prepare(`
    SELECT id, ${role.col} as name FROM comps 
    WHERE ${role.col} IS NOT NULL AND ${role.col} != '' AND ${role.fk} IS NULL
  `).all() as { id: number; name: string }[];

  const update = db.prepare(`UPDATE comps SET ${role.fk} = ? WHERE id = ?`);
  let linked = 0;

  for (const comp of unlinked) {
    const norm = normCompany(comp.name);
    const companyId = normMap.get(norm);
    if (companyId) {
      update.run(companyId, comp.id);
      linked++;
    }
  }

  totalLinked += linked;
  console.log(`  ${role.col}: ${linked} linked (${unlinked.length - linked} still unlinked — likely personal names)`);
}

console.log(`\nTotal newly linked: ${totalLinked}`);

// Final stats
const stats = db.prepare(`
  SELECT 
    (SELECT COUNT(*) FROM companies) as total_companies,
    (SELECT COUNT(*) FROM comps WHERE seller_company_id IS NOT NULL) as sellers_linked,
    (SELECT COUNT(*) FROM comps WHERE purchaser_company_id IS NOT NULL) as purchasers_linked,
    (SELECT COUNT(*) FROM comps WHERE landlord_company_id IS NOT NULL) as landlords_linked,
    (SELECT COUNT(*) FROM comps WHERE tenant_company_id IS NOT NULL) as tenants_linked
`).get() as any;

console.log('\n=== Final Stats ===');
console.log(`  Companies: ${stats.total_companies}`);
console.log(`  Seller links: ${stats.sellers_linked} / ${db.prepare("SELECT COUNT(*) as c FROM comps WHERE seller IS NOT NULL AND seller != ''").get()?.c}`);
console.log(`  Purchaser links: ${stats.purchasers_linked} / ${db.prepare("SELECT COUNT(*) as c FROM comps WHERE purchaser IS NOT NULL AND purchaser != ''").get()?.c}`);
console.log(`  Landlord links: ${stats.landlords_linked} / ${db.prepare("SELECT COUNT(*) as c FROM comps WHERE landlord IS NOT NULL AND landlord != ''").get()?.c}`);
console.log(`  Tenant links: ${stats.tenants_linked} / ${db.prepare("SELECT COUNT(*) as c FROM comps WHERE tenant IS NOT NULL AND tenant != ''").get()?.c}`);

db.close();
