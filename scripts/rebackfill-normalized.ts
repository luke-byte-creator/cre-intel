/**
 * Re-backfill normalized addresses with fixed normalizer (edge cases),
 * then set display addresses from normalized values for consistency.
 */
import Database from 'better-sqlite3';
import { normalizeAddress, normalizeCity, displayAddress } from '../src/lib/address';

const db = new Database('data/cre-intel.db');

function backfillTable(table: string, hasCity: boolean) {
  const cols = hasCity ? 'id, address, city' : 'id, address';
  const rows = db.prepare(`SELECT ${cols} FROM ${table} WHERE address IS NOT NULL`).all() as any[];
  
  const updateNorm = hasCity
    ? db.prepare(`UPDATE ${table} SET address_normalized = ?, city_normalized = ? WHERE id = ?`)
    : db.prepare(`UPDATE ${table} SET address_normalized = ? WHERE id = ?`);
  const updateDisplay = db.prepare(`UPDATE ${table} SET address = ? WHERE id = ?`);
  
  let normChanged = 0, displayChanged = 0;
  for (const r of rows) {
    const norm = normalizeAddress(r.address);
    const display = norm ? displayAddress(norm) : r.address;
    
    if (hasCity) {
      const cn = normalizeCity(r.city);
      updateNorm.run(norm, cn, r.id);
    } else {
      updateNorm.run(norm, r.id);
    }
    
    // Only update display if the normalized display differs from current
    if (display && display !== r.address) {
      updateDisplay.run(display, r.id);
      displayChanged++;
    }
    normChanged++;
  }
  
  console.log(`  ${table}: ${normChanged} normalized, ${displayChanged} display addresses updated`);
}

console.log('=== Re-backfilling with fixed normalizer ===\n');
backfillTable('comps', true);
backfillTable('properties', true);
backfillTable('permits', false);
backfillTable('office_buildings', false);
backfillTable('multi_buildings', true);
backfillTable('industrial_vacancies', false);
backfillTable('retail_developments', false);

// Verify: sample some addresses to check consistency
console.log('\n=== Sample display addresses ===\n');
const samples = db.prepare(`
  SELECT address, address_normalized FROM comps ORDER BY RANDOM() LIMIT 10
`).all() as any[];
for (const s of samples) {
  console.log(`  "${s.address}" [${s.address_normalized}]`);
}

// Check for any remaining inconsistencies
console.log('\n=== Checking address range fixes ===');
const ranges = db.prepare(`
  SELECT address, address_normalized FROM comps 
  WHERE address LIKE '%-%' AND address_normalized LIKE '%UNIT%'
  AND CAST(SUBSTR(address_normalized, INSTR(address_normalized, 'UNIT ') + 5) AS INTEGER) > 100
  LIMIT 10
`).all() as any[];
console.log(`  Address ranges still misclassified as units: ${ranges.length}`);
for (const r of ranges) {
  console.log(`    "${r.address}" → "${r.address_normalized}"`);
}

db.close();
console.log('\nDone!');
