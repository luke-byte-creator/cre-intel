#!/usr/bin/env npx tsx
/**
 * Link permits to city_assessments by address matching.
 * Also flags permits with no match as "potential new supply".
 */
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.resolve(__dirname, '../../data/cre-intel.db');

function normalizeAddr(addr: string): string {
  return addr
    .toUpperCase()
    .replace(/\bSTREET\b/g, 'ST')
    .replace(/\bAVENUE\b/g, 'AVE')
    .replace(/\bDRIVE\b/g, 'DR')
    .replace(/\bCRESCENT\b/g, 'CRES')
    .replace(/\bBOULEVARD\b/g, 'BLVD')
    .replace(/\bPLACE\b/g, 'PL')
    .replace(/\bCOURT\b/g, 'CRT')
    .replace(/\bROAD\b/g, 'RD')
    .replace(/\bTERRACE\b/g, 'TERR')
    .replace(/\bCIRCLE\b/g, 'CIR')
    .replace(/\bWAY\b/g, 'WAY')
    .replace(/\bNORTH\b/g, 'N')
    .replace(/\bSOUTH\b/g, 'S')
    .replace(/\bEAST\b/g, 'E')
    .replace(/\bWEST\b/g, 'W')
    .replace(/\s+UNIT\s+\S+/g, '') // strip unit numbers
    .replace(/[.,#\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function main() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Load city assessments with normalized addresses
  const assessments = db.prepare('SELECT id, full_address FROM city_assessments').all() as any[];
  const byNorm = new Map<string, number>();
  for (const a of assessments) {
    const norm = normalizeAddr(a.full_address || '');
    if (!byNorm.has(norm)) byNorm.set(norm, a.id); // first match wins
  }

  // Get unlinked permits
  const permits = db.prepare('SELECT id, address, address_normalized FROM permits WHERE city_assessment_id IS NULL').all() as any[];
  console.log(`📋 ${permits.length} unlinked permits`);

  const update = db.prepare('UPDATE permits SET city_assessment_id = ? WHERE id = ?');
  let linked = 0;
  let unlinked: any[] = [];

  const tx = db.transaction(() => {
    for (const p of permits) {
      const norm = normalizeAddr(p.address || p.address_normalized || '');
      const caId = byNorm.get(norm);
      if (caId) {
        update.run(caId, p.id);
        linked++;
      } else {
        unlinked.push(p);
      }
    }
  });
  tx();

  const totalLinked = (db.prepare('SELECT COUNT(*) as c FROM permits WHERE city_assessment_id IS NOT NULL').get() as any).c;
  const totalUnlinked = (db.prepare('SELECT COUNT(*) as c FROM permits WHERE city_assessment_id IS NULL').get() as any).c;

  console.log(`✅ Linked ${linked} permits this run`);
  console.log(`📊 Total: ${totalLinked} linked, ${totalUnlinked} unlinked`);

  if (unlinked.length > 0) {
    console.log(`\n⚠️ Still unlinked (potential new supply or address issues):`);
    for (const p of unlinked.slice(0, 20)) {
      console.log(`  ${p.address}`);
    }
  }

  db.close();
}

main();
