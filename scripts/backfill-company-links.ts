/**
 * Fuzzy-match comp party names to companies.
 * Uses normalized name matching with common suffix stripping.
 */
import Database from 'better-sqlite3';

const db = new Database('data/cre-intel.db');

// Load all companies
const companies = db.prepare('SELECT id, name FROM companies').all() as { id: number; name: string }[];

// Normalize company name: strip suffixes, lowercase, remove punctuation
function normCompany(name: string): string {
  return name.toLowerCase()
    .replace(/\./g, '')
    .replace(/,/g, '')
    // Strip common corporate suffixes
    .replace(/\b(inc|ltd|corp|co|llc|llp|lp|limited|incorporated|corporation)\b\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Build lookup maps
const exactMap = new Map<string, number>();
const normMap = new Map<string, number>();
for (const c of companies) {
  exactMap.set(c.name.toLowerCase(), c.id);
  const norm = normCompany(c.name);
  if (norm.length >= 3) {
    normMap.set(norm, c.id);
  }
}

// Simple word overlap score for fuzzy matching
function wordOverlap(a: string, b: string): number {
  const wordsA = new Set(a.split(' ').filter(w => w.length > 2));
  const wordsB = new Set(b.split(' ').filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let overlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++;
  }
  return overlap / Math.max(wordsA.size, wordsB.size);
}

function findCompany(name: string): number | null {
  if (!name || name.trim().length < 3) return null;
  
  // Exact match
  const exact = exactMap.get(name.toLowerCase());
  if (exact) return exact;
  
  // Normalized match (strip suffixes)
  const norm = normCompany(name);
  const normMatch = normMap.get(norm);
  if (normMatch) return normMatch;
  
  // Fuzzy: check if normalized name starts with or contains a company's normalized name
  // Only for names that look like companies (contain corporate suffixes or are numbered corps)
  if (!/\b(inc|ltd|corp|co|llc|properties|holdings|enterprises|investments|development|construction|management|capital|group|realty|trust)\b/i.test(name) 
      && !/^\d{6,}/.test(name)) {
    return null; // Skip personal names
  }
  
  // Try word overlap matching (>= 60% word match)
  let bestId: number | null = null;
  let bestScore = 0;
  for (const c of companies) {
    const score = wordOverlap(norm, normCompany(c.name));
    if (score > bestScore && score >= 0.6) {
      bestScore = score;
      bestId = c.id;
    }
  }
  
  return bestId;
}

// Process each party role
const roles = [
  { col: 'seller', fk: 'seller_company_id' },
  { col: 'purchaser', fk: 'purchaser_company_id' },
  { col: 'landlord', fk: 'landlord_company_id' },
  { col: 'tenant', fk: 'tenant_company_id' },
] as const;

let totalLinked = 0;
const linkDetails: Record<string, { exact: number; norm: number; fuzzy: number; missed: number }> = {};

for (const role of roles) {
  const unlinked = db.prepare(`
    SELECT id, ${role.col} as name FROM comps 
    WHERE ${role.col} IS NOT NULL AND ${role.col} != '' AND ${role.fk} IS NULL
  `).all() as { id: number; name: string }[];

  const update = db.prepare(`UPDATE comps SET ${role.fk} = ? WHERE id = ?`);
  let exact = 0, norm = 0, fuzzy = 0, missed = 0;

  for (const comp of unlinked) {
    // Track which method matched
    const exactId = exactMap.get(comp.name.toLowerCase());
    if (exactId) {
      update.run(exactId, comp.id);
      exact++;
      totalLinked++;
      continue;
    }

    const normN = normCompany(comp.name);
    const normId = normMap.get(normN);
    if (normId) {
      update.run(normId, comp.id);
      norm++;
      totalLinked++;
      continue;
    }

    const fuzzyId = findCompany(comp.name);
    if (fuzzyId) {
      update.run(fuzzyId, comp.id);
      fuzzy++;
      totalLinked++;
      continue;
    }

    missed++;
  }

  linkDetails[role.col] = { exact, norm, fuzzy, missed };
  console.log(`${role.col}: exact=${exact}, normalized=${norm}, fuzzy=${fuzzy}, missed=${missed}`);
}

console.log(`\nTotal linked: ${totalLinked}`);

// Show top missed names
console.log('\n=== Top Unlinked Sellers ===');
const topMissed = db.prepare(`
  SELECT seller, COUNT(*) as cnt FROM comps 
  WHERE seller IS NOT NULL AND seller != '' AND seller_company_id IS NULL
  GROUP BY seller ORDER BY cnt DESC LIMIT 10
`).all() as any[];
for (const m of topMissed) {
  console.log(`  ${m.cnt}x "${m.seller}"`);
}

console.log('\n=== Top Unlinked Purchasers ===');
const topMissed2 = db.prepare(`
  SELECT purchaser, COUNT(*) as cnt FROM comps 
  WHERE purchaser IS NOT NULL AND purchaser != '' AND purchaser_company_id IS NULL
  GROUP BY purchaser ORDER BY cnt DESC LIMIT 10
`).all() as any[];
for (const m of topMissed2) {
  console.log(`  ${m.cnt}x "${m.purchaser}"`);
}

db.close();
