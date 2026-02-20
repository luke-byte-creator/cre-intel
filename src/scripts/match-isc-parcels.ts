#!/usr/bin/env npx tsx
/**
 * Phase 3: Match ISC parcels to city assessments via city_parcels bridge
 * 
 * Chain: city_assessments ←(site_id)→ city_parcels ←(block/lot)→ isc_parcels
 * 
 * Match strategies:
 * 1. block_lot_unique: block+lot combo maps to exactly 1 ISC parcel (high confidence)
 * 2. block_lot_section: block+lot has multiple ISC matches, narrowed by section proximity (medium confidence)
 * 3. block_lot_ambiguous: multiple ISC matches, can't disambiguate (low confidence, needs review)
 */

import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.resolve(__dirname, '../../data/cre-intel.db');

function main() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Clear existing matches (re-runnable)
  db.exec('DELETE FROM isc_parcel_matches');

  // Get all CRE assessments that have city parcels with block/lot numbers
  const assessments = db.prepare(`
    SELECT ca.id as assessment_id, ca.full_address, ca.site_id,
           cp.id as parcel_id, cp.block_number, cp.lot_number, 
           cp.latitude, cp.longitude
    FROM city_assessments ca
    JOIN city_parcels cp ON ca.site_id = cp.site_id
    WHERE cp.block_number != '' AND cp.lot_number != ''
  `).all() as any[];

  console.log(`📊 ${assessments.length} CRE assessments with block/lot numbers`);

  // For each assessment, find ISC parcels with matching block/lot
  const findISC = db.prepare(`
    SELECT id, parcel_number, block_number, lot_number, plan_number, 
           legal_description, section, township, range_num
    FROM isc_parcels 
    WHERE block_number = ? AND lot_number = ?
  `);

  const insertMatch = db.prepare(`
    INSERT INTO isc_parcel_matches 
    (city_assessment_id, isc_parcel_id, city_parcel_id, match_method, confidence, status, notes)
    VALUES (?, ?, ?, ?, ?, 'pending', ?)
  `);

  let stats = { unique: 0, section: 0, ambiguous: 0, noMatch: 0 };

  const insertMany = db.transaction(() => {
    for (const a of assessments) {
      const iscMatches = findISC.all(a.block_number, a.lot_number) as any[];

      if (iscMatches.length === 0) {
        stats.noMatch++;
        continue;
      }

      if (iscMatches.length === 1) {
        // Clean 1:1 match
        const m = iscMatches[0];
        insertMatch.run(a.assessment_id, m.id, a.parcel_id, 'block_lot_unique', 0.95,
          `Block ${a.block_number} Lot ${a.lot_number} → ${m.parcel_number} (${m.plan_number})`);
        stats.unique++;
        continue;
      }

      // Multiple matches — try to disambiguate
      // For now, insert all as ambiguous with lower confidence
      // TODO: Use lat/lon + section boundaries to narrow down
      for (const m of iscMatches) {
        insertMatch.run(a.assessment_id, m.id, a.parcel_id, 'block_lot_ambiguous', 0.5,
          `Block ${a.block_number} Lot ${a.lot_number} → ${m.parcel_number} (${m.plan_number}) [${iscMatches.length} candidates]`);
      }
      stats.ambiguous++;
    }
  });

  insertMany();

  // Summary
  const total = db.prepare('SELECT COUNT(*) as c FROM isc_parcel_matches').get() as any;
  const byMethod = db.prepare(`
    SELECT match_method, COUNT(*) as c, AVG(confidence) as avg_conf 
    FROM isc_parcel_matches GROUP BY match_method
  `).all();

  console.log(`\n✅ Matching complete`);
  console.log(`  Unique (1:1): ${stats.unique}`);
  console.log(`  Ambiguous (multi): ${stats.ambiguous}`);
  console.log(`  No ISC match: ${stats.noMatch}`);
  console.log(`  Total match rows: ${total.c}`);
  console.log(`\nBy method:`, byMethod);

  // Show coverage
  const iscTotal = db.prepare('SELECT COUNT(*) as c FROM isc_parcels').get() as any;
  const assessed = assessments.length;
  const matched = stats.unique + stats.ambiguous;
  console.log(`\n📈 Coverage: ${matched}/${assessed} assessments matched (${(matched/assessed*100).toFixed(1)}%)`);
  console.log(`   ISC parcels in DB: ${iscTotal.c} (${((93-10)/93*100).toFixed(0)}% of sections remaining)`);

  db.close();
}

main();
