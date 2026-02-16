/**
 * Clean up display addresses on properties to look consistent.
 * Strips "Saskatoon, SK" suffixes, expands abbreviations in the display address.
 * Also removes orphan properties (no comps, no permits, no transactions).
 */
import Database from 'better-sqlite3';

const db = new Database('data/cre-intel.db');

// Street type expansions for display (lowercase-friendly)
const DISPLAY_EXPANSIONS: [RegExp, string][] = [
  [/\bST\b(?!\w)/gi, 'Street'],
  [/\bAVE\b/gi, 'Avenue'],
  [/\bAV\b/gi, 'Avenue'],
  [/\bDR\b/gi, 'Drive'],
  [/\bBLVD\b/gi, 'Boulevard'],
  [/\bRD\b/gi, 'Road'],
  [/\bCRES\b/gi, 'Crescent'],
  [/\bCR\b/gi, 'Crescent'],
  [/\bCT\b/gi, 'Court'],
  [/\bCRT\b/gi, 'Court'],
  [/\bPL\b/gi, 'Place'],
  [/\bCIRC?\b/gi, 'Circle'],
  [/\bHWY\b/gi, 'Highway'],
  [/\bPKWY\b/gi, 'Parkway'],
  [/\bPKY\b/gi, 'Parkway'],
  [/\bLN\b/gi, 'Lane'],
  [/\bTR\b/gi, 'Trail'],
  [/\bTERR?\b/gi, 'Terrace'],
  [/\bGR\b/gi, 'Green'],
  [/\bGV\b/gi, 'Grove'],
  [/\bGT\b/gi, 'Gate'],
  [/\bPT\b/gi, 'Point'],
  [/\bCV\b/gi, 'Cove'],
  [/\bBND\b/gi, 'Bend'],
  [/\bSQ\b/gi, 'Square'],
  [/\bHTS\b/gi, 'Heights'],
  [/\bCL\b/gi, 'Close'],
];

function cleanDisplayAddress(addr: string): string {
  let clean = addr;
  
  // Strip ", Saskatoon, SK" or ", Saskatoon, Saskatchewan" or ", SK" suffixes
  clean = clean.replace(/,?\s*(Saskatoon|Regina|Prince Albert|Moose Jaw|Swift Current|Yorkton|Martensville|Warman),?\s*(SK|Saskatchewan)?\s*$/i, '');
  
  // Strip postal codes
  clean = clean.replace(/\s+[A-Z]\d[A-Z]\s*\d[A-Z]\d\s*$/i, '');
  
  // Expand abbreviations
  for (const [pattern, replacement] of DISPLAY_EXPANSIONS) {
    clean = clean.replace(pattern, replacement);
  }
  
  // Remove trailing periods
  clean = clean.replace(/\.\s*/g, ' ');
  
  // Normalize spacing
  clean = clean.replace(/\s+/g, ' ').trim();
  
  return clean;
}

// Clean property display addresses
console.log('=== Cleaning property display addresses ===');
const props = db.prepare('SELECT id, address FROM properties WHERE address IS NOT NULL').all() as any[];
const updateProp = db.prepare('UPDATE properties SET address = ? WHERE id = ?');
let changed = 0;
for (const p of props) {
  const clean = cleanDisplayAddress(p.address);
  if (clean !== p.address) {
    updateProp.run(clean, p.id);
    changed++;
  }
}
console.log(`  ${changed} of ${props.length} property addresses cleaned`);

// Clean comp display addresses
console.log('\n=== Cleaning comp display addresses ===');
const comps = db.prepare('SELECT id, address FROM comps WHERE address IS NOT NULL').all() as any[];
const updateComp = db.prepare('UPDATE comps SET address = ? WHERE id = ?');
changed = 0;
for (const c of comps) {
  const clean = cleanDisplayAddress(c.address);
  if (clean !== c.address) {
    updateComp.run(clean, c.id);
    changed++;
  }
}
console.log(`  ${changed} of ${comps.length} comp addresses cleaned`);

// Remove orphan properties (no comps, no permits, no transactions, no watchlist)
console.log('\n=== Removing orphan properties ===');
const orphans = db.prepare(`
  SELECT p.id, p.address FROM properties p
  WHERE NOT EXISTS (SELECT 1 FROM comps WHERE property_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM permits WHERE property_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM transactions WHERE property_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM watchlist WHERE entity_type = 'property' AND entity_id = p.id)
`).all() as any[];
console.log(`  Found ${orphans.length} orphan properties`);

if (orphans.length > 0) {
  const deleteOrphan = db.prepare('DELETE FROM properties WHERE id = ?');
  for (const o of orphans) {
    deleteOrphan.run(o.id);
  }
  console.log(`  Deleted ${orphans.length} orphan properties`);
}

// Final stats
const propCount = db.prepare('SELECT COUNT(*) as c FROM properties').get() as any;
const propsWithComps = db.prepare('SELECT COUNT(DISTINCT property_id) as c FROM comps WHERE property_id IS NOT NULL').get() as any;
console.log(`\n=== Final Stats ===`);
console.log(`  Properties remaining: ${propCount.c}`);
console.log(`  Properties with comps: ${propsWithComps.c}`);

db.close();
