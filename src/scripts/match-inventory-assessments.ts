#!/usr/bin/env npx tsx
/**
 * Match inventory tables (office_buildings, multi_buildings) to city_assessments by address.
 * Creates pending matches in inventory_assessment_matches for review.
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
    .replace(/\bNORTH\b/g, 'N')
    .replace(/\bSOUTH\b/g, 'S')
    .replace(/\bEAST\b/g, 'E')
    .replace(/\bWEST\b/g, 'W')
    .replace(/[.,#\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function main() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Create matches table
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory_assessment_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL, -- 'office_buildings' or 'multi_buildings'
      inventory_id INTEGER NOT NULL,
      city_assessment_id INTEGER NOT NULL,
      match_method TEXT NOT NULL,
      confidence REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_inv_match_table ON inventory_assessment_matches(table_name, inventory_id);
    CREATE INDEX IF NOT EXISTS idx_inv_match_status ON inventory_assessment_matches(status);
  `);

  // Clear existing
  db.exec('DELETE FROM inventory_assessment_matches');

  // Load all city assessments
  const assessments = db.prepare(`
    SELECT id, full_address, street_number, street_name, street_suffix, street_post_dir
    FROM city_assessments
  `).all() as any[];

  // Build lookup by normalized address
  const byAddr = new Map<string, any[]>();
  for (const a of assessments) {
    const norm = normalizeAddr(a.full_address || '');
    if (!byAddr.has(norm)) byAddr.set(norm, []);
    byAddr.get(norm)!.push(a);
  }

  // Also build by street_number + street_name prefix
  const byNumName = new Map<string, any[]>();
  for (const a of assessments) {
    if (a.street_number && a.street_name) {
      const key = `${a.street_number} ${a.street_name}`.toUpperCase();
      if (!byNumName.has(key)) byNumName.set(key, []);
      byNumName.get(key)!.push(a);
    }
  }

  const insert = db.prepare(`
    INSERT INTO inventory_assessment_matches (table_name, inventory_id, city_assessment_id, match_method, confidence, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `);

  let stats = { office: { exact: 0, normalized: 0, fuzzy: 0, none: 0 }, multi: { exact: 0, normalized: 0, fuzzy: 0, none: 0 } };

  function matchBuilding(tableName: string, id: number, streetNumber: string, address: string, statsObj: any) {
    // Build the full address for matching
    const fullAddr = streetNumber ? `${streetNumber} ${address}` : address;
    const norm = normalizeAddr(fullAddr);

    // Try exact match
    if (byAddr.has(norm)) {
      const matches = byAddr.get(norm)!;
      for (const m of matches) {
        insert.run(tableName, id, m.id, 'exact', 1.0);
      }
      statsObj.exact++;
      return;
    }

    // Try normalized: street_number + first word of street name
    if (streetNumber) {
      const streetName = address.split(/\s+/)[0] || '';
      const key = `${streetNumber} ${streetName}`.toUpperCase();
      const candidates = byNumName.get(key);
      if (candidates && candidates.length > 0) {
        // Filter to most likely (same suffix direction)
        for (const m of candidates.slice(0, 3)) {
          insert.run(tableName, id, m.id, 'normalized', 0.8);
        }
        statsObj.normalized++;
        return;
      }
    }

    // Try fuzzy: just street number match with LIKE
    if (streetNumber && streetNumber.match(/^\d+$/)) {
      const streetWord = normalizeAddr(address).split(/\s+/)[0] || '';
      if (streetWord.length > 2) {
        const fuzzy = db.prepare(`
          SELECT id FROM city_assessments 
          WHERE street_number = ? AND UPPER(street_name) LIKE ?
          LIMIT 3
        `).all(streetNumber, `%${streetWord}%`) as any[];
        if (fuzzy.length > 0) {
          for (const m of fuzzy) {
            insert.run(tableName, id, m.id, 'fuzzy', 0.6);
          }
          statsObj.fuzzy++;
          return;
        }
      }
    }

    statsObj.none++;
  }

  // Match office buildings
  const offices = db.prepare('SELECT id, street_number, address FROM office_buildings').all() as any[];
  const officeInsert = db.transaction(() => {
    for (const o of offices) {
      matchBuilding('office_buildings', o.id, o.street_number || '', o.address || '', stats.office);
    }
  });
  officeInsert();

  // Match multi buildings
  const multis = db.prepare('SELECT id, address, address_normalized FROM multi_buildings').all() as any[];
  const multiInsert = db.transaction(() => {
    for (const m of multis) {
      // Multi buildings have full address in the address field
      const parts = (m.address || '').match(/^(\d+)\s+(.+)/);
      const num = parts ? parts[1] : '';
      const rest = parts ? parts[2] : m.address || '';
      matchBuilding('multi_buildings', m.id, num, rest, stats.multi);
    }
  });
  multiInsert();

  // Summary
  const total = db.prepare('SELECT COUNT(*) as c FROM inventory_assessment_matches').get() as any;
  console.log('✅ Inventory matching complete');
  console.log(`\nOffice Buildings (${offices.length}):`);
  console.log(`  Exact: ${stats.office.exact} | Normalized: ${stats.office.normalized} | Fuzzy: ${stats.office.fuzzy} | No match: ${stats.office.none}`);
  console.log(`\nMulti Buildings (${multis.length}):`);
  console.log(`  Exact: ${stats.multi.exact} | Normalized: ${stats.multi.normalized} | Fuzzy: ${stats.multi.fuzzy} | No match: ${stats.multi.none}`);
  console.log(`\nTotal match rows: ${total.c}`);

  db.close();
}

main();
