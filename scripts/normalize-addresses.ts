/**
 * Backfill address_normalized and city_normalized across all tables.
 * Run once, then normalization happens on every write going forward.
 */
import Database from 'better-sqlite3';
import { normalizeAddress, normalizeCity } from '../src/lib/address';

const db = new Database('data/cre-intel.db');

// Add columns if they don't exist
const addColumnIfNeeded = (table: string, column: string) => {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} TEXT`);
    console.log(`  Added ${column} to ${table}`);
  } catch (e: any) {
    if (e.message.includes('duplicate column')) {
      console.log(`  ${column} already exists on ${table}`);
    } else throw e;
  }
};

console.log('=== Adding columns ===');
for (const table of ['comps', 'properties', 'permits', 'office_buildings', 'multi_buildings', 'industrial_vacancies', 'retail_developments']) {
  addColumnIfNeeded(table, 'address_normalized');
}
// City normalization on tables that have city
for (const table of ['comps', 'properties', 'multi_buildings']) {
  addColumnIfNeeded(table, 'city_normalized');
}

console.log('\n=== Backfilling comps ===');
const comps = db.prepare('SELECT id, address, city FROM comps').all() as any[];
const updateComp = db.prepare('UPDATE comps SET address_normalized = ?, city_normalized = ? WHERE id = ?');
let updated = 0;
for (const c of comps) {
  const an = normalizeAddress(c.address);
  const cn = normalizeCity(c.city);
  updateComp.run(an, cn, c.id);
  updated++;
}
console.log(`  ${updated} comps normalized`);

console.log('\n=== Backfilling properties ===');
const props = db.prepare('SELECT id, address, city FROM properties').all() as any[];
const updateProp = db.prepare('UPDATE properties SET address_normalized = ?, city_normalized = ? WHERE id = ?');
updated = 0;
for (const p of props) {
  const an = normalizeAddress(p.address);
  const cn = normalizeCity(p.city);
  updateProp.run(an, cn, p.id);
  updated++;
}
console.log(`  ${updated} properties normalized`);

console.log('\n=== Backfilling permits ===');
const permits = db.prepare('SELECT id, address FROM permits').all() as any[];
const updatePermit = db.prepare('UPDATE permits SET address_normalized = ? WHERE id = ?');
updated = 0;
for (const p of permits) {
  const an = normalizeAddress(p.address);
  updatePermit.run(an, p.id);
  updated++;
}
console.log(`  ${updated} permits normalized`);

console.log('\n=== Backfilling office_buildings ===');
const offices = db.prepare('SELECT id, address FROM office_buildings').all() as any[];
const updateOffice = db.prepare('UPDATE office_buildings SET address_normalized = ? WHERE id = ?');
updated = 0;
for (const o of offices) {
  const an = normalizeAddress(o.address);
  updateOffice.run(an, o.id);
  updated++;
}
console.log(`  ${updated} office buildings normalized`);

console.log('\n=== Backfilling multi_buildings ===');
const multis = db.prepare('SELECT id, address, city FROM multi_buildings').all() as any[];
const updateMulti = db.prepare('UPDATE multi_buildings SET address_normalized = ?, city_normalized = ? WHERE id = ?');
updated = 0;
for (const m of multis) {
  const an = normalizeAddress(m.address);
  const cn = normalizeCity(m.city);
  updateMulti.run(an, cn, m.id);
  updated++;
}
console.log(`  ${updated} multi buildings normalized`);

console.log('\n=== Backfilling industrial_vacancies ===');
const indVac = db.prepare('SELECT id, address FROM industrial_vacancies').all() as any[];
const updateInd = db.prepare('UPDATE industrial_vacancies SET address_normalized = ? WHERE id = ?');
updated = 0;
for (const iv of indVac) {
  const an = normalizeAddress(iv.address);
  updateInd.run(an, iv.id);
  updated++;
}
console.log(`  ${updated} industrial vacancies normalized`);

console.log('\n=== Backfilling retail_developments ===');
const retails = db.prepare('SELECT id, address FROM retail_developments').all() as any[];
const updateRetail = db.prepare('UPDATE retail_developments SET address_normalized = ? WHERE id = ?');
updated = 0;
for (const r of retails) {
  const an = normalizeAddress(r.address);
  updateRetail.run(an, r.id);
  updated++;
}
console.log(`  ${updated} retail developments normalized`);

// Also fix city typos in the original city column while we're at it
console.log('\n=== Fixing city typos in comps ===');
const cityFixes: Record<string, string> = {
  'Rega': 'Regina',
  'R.M of Sherwood # 159`': 'RM of Sherwood No. 159',
  'Regina & RM 159': 'Regina',
};
for (const [bad, good] of Object.entries(cityFixes)) {
  const result = db.prepare('UPDATE comps SET city = ? WHERE city = ?').run(good, bad);
  if (result.changes > 0) {
    console.log(`  Fixed "${bad}" → "${good}" (${result.changes} rows)`);
  }
}

// Check match rate after normalization
console.log('\n=== Match Analysis ===');
const matchCount = db.prepare(`
  SELECT COUNT(DISTINCT c.id) 
  FROM comps c 
  JOIN properties p ON c.address_normalized = p.address_normalized 
    AND (c.city_normalized = p.city_normalized OR (c.city_normalized IS NULL AND p.city_normalized IS NULL))
`).get() as any;
console.log(`Comps matching properties: ${Object.values(matchCount)[0]}`);

const totalComps = db.prepare('SELECT COUNT(*) FROM comps').get() as any;
console.log(`Total comps: ${Object.values(totalComps)[0]}`);

const nullNorm = db.prepare('SELECT COUNT(*) FROM comps WHERE address_normalized IS NULL').get() as any;
console.log(`Comps with null normalized address: ${Object.values(nullNorm)[0]}`);

// Sample some matches
console.log('\n=== Sample Matches ===');
const samples = db.prepare(`
  SELECT c.address as comp_addr, p.address as prop_addr, c.city, c.address_normalized
  FROM comps c 
  JOIN properties p ON c.address_normalized = p.address_normalized 
    AND (c.city_normalized = p.city_normalized OR (c.city_normalized IS NULL AND p.city_normalized IS NULL))
  LIMIT 10
`).all() as any[];
for (const s of samples) {
  console.log(`  "${s.comp_addr}" ↔ "${s.prop_addr}" [${s.address_normalized}]`);
}

db.close();
console.log('\nDone!');
