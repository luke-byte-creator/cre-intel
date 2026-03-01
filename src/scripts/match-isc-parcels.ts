#!/usr/bin/env npx tsx
/**
 * Phase 3: Match ISC parcels to city assessments via city_parcels bridge
 * 
 * Chain: city_assessments ←(site_id)→ city_parcels ←(block/lot)→ isc_parcels
 * 
 * Match strategies:
 * 1. bilateral_unique: block+lot maps to exactly 1 ISC parcel AND exactly 1 city parcel (highest confidence)
 * 2. isc_unique_city_nearest: 1 ISC parcel but multiple city parcels share block/lot — pick closest by lat/lon (medium)
 * 3. block_lot_ambiguous: multiple ISC parcels match, can't disambiguate (low confidence, needs review)
 * 
 * Key insight: City parcels reuse block/lot numbers across different land title plans.
 * Block 18 Lot 19 can appear at 3 completely different locations in the city.
 * ISC parcels are plan-specific (e.g., Plan G215). We must check uniqueness in BOTH directions.
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
  // Now includes section/township/range from spatial join with Legal Land Description layer
  const assessments = db.prepare(`
    SELECT ca.id as assessment_id, ca.full_address, ca.site_id,
           cp.id as parcel_id, cp.block_number, cp.lot_number, 
           cp.latitude, cp.longitude,
           cp.section as city_section, cp.township as city_township, cp.range_num as city_range
    FROM city_assessments ca
    JOIN city_parcels cp ON ca.site_id = cp.site_id
    WHERE cp.block_number != '' AND cp.lot_number != ''
  `).all() as any[];

  console.log(`📊 ${assessments.length} CRE assessments with block/lot numbers`);

  // Stats on section coverage
  const withSection = assessments.filter((a: any) => a.city_section && a.city_township).length;
  console.log(`📍 ${withSection}/${assessments.length} city parcels have section info (${(withSection/assessments.length*100).toFixed(1)}%)`);

  // For each assessment, find ISC parcels with matching section+block+lot (3-way match)
  const findISC_section = db.prepare(`
    SELECT id, parcel_number, block_number, lot_number, plan_number, 
           legal_description, section, township, range_num
    FROM isc_parcels 
    WHERE block_number = ? AND lot_number = ? AND section = ? AND township = ? AND range_num = ?
  `);

  // Fallback: block+lot only (for parcels without section info)
  const findISC_blocklot = db.prepare(`
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

  let stats = { bilateral: 0, nearest: 0, ambiguous: 0, noMatch: 0 };

  // First pass: collect all matches with metadata
  type MatchCandidate = {
    assessment: any;
    iscMatches: any[];
    matchType: 'section' | 'blocklot';
  };
  const candidates: MatchCandidate[] = [];

  for (const a of assessments) {
    // Try 3-way match first (section + block + lot) if city parcel has section info
    let iscMatches: any[] = [];
    let matchType: 'section' | 'blocklot' = 'blocklot';

    if (a.city_section && a.city_township && a.city_range) {
      iscMatches = findISC_section.all(a.block_number, a.lot_number, a.city_section, a.city_township, a.city_range) as any[];
      if (iscMatches.length > 0) {
        matchType = 'section';
      }
    }

    // Fallback to block+lot only if no section match
    if (iscMatches.length === 0) {
      iscMatches = findISC_blocklot.all(a.block_number, a.lot_number) as any[];
      matchType = 'blocklot';
    }

    if (iscMatches.length === 0) {
      stats.noMatch++;
      continue;
    }
    candidates.push({ assessment: a, iscMatches, matchType });
  }

  // Insert matches
  const insertMany = db.transaction(() => {
    for (const c of candidates) {
      const { assessment: a, iscMatches, matchType } = c;

      if (matchType === 'section' && iscMatches.length === 1) {
        // Section + block + lot → exactly 1 ISC parcel. This is the gold standard.
        const m = iscMatches[0];
        insertMatch.run(a.assessment_id, m.id, a.parcel_id, 'section_block_lot', 0.95,
          `S${a.city_section}-T${a.city_township}-R${a.city_range} Block ${a.block_number} Lot ${a.lot_number} → ${m.parcel_number} (${m.plan_number})`);
        stats.bilateral++;
        continue;
      }

      if (matchType === 'section' && iscMatches.length > 1) {
        // Multiple ISC parcels in same section with same block/lot.
        // Common case: same plan, dual-title (Ext 0 = base lot, Ext N = shared plan title).
        // Pick the Ext 0 (base) parcel — it holds the individual owner/value.
        const plans = new Set(iscMatches.map((m: any) => m.plan_number));
        
        if (plans.size === 1) {
          // Same plan — strata/dual-title. Pick Ext 0 (base parcel).
          const ext0 = iscMatches.find((m: any) => m.legal_description?.includes('Ext 0'));
          const pick = ext0 || iscMatches[0]; // fallback to first if no Ext 0
          insertMatch.run(a.assessment_id, pick.id, a.parcel_id, 'section_strata_resolved', 0.9,
            `S${a.city_section}-T${a.city_township}-R${a.city_range} Block ${a.block_number} Lot ${a.lot_number} → ${pick.parcel_number} (${pick.plan_number}) [picked Ext 0 from ${iscMatches.length} same-plan parcels]`);
          stats.bilateral++;
        } else {
          // Different plans in same section — genuinely ambiguous
          for (const m of iscMatches) {
            insertMatch.run(a.assessment_id, m.id, a.parcel_id, 'section_ambiguous', 0.6,
              `S${a.city_section} Block ${a.block_number} Lot ${a.lot_number} → ${m.parcel_number} (${m.plan_number}) [${plans.size} plans in section]`);
          }
          stats.ambiguous++;
        }
        continue;
      }

      // Fallback: block+lot only (no section on city parcel, or section didn't match any ISC)
      if (iscMatches.length === 1) {
        const m = iscMatches[0];
        insertMatch.run(a.assessment_id, m.id, a.parcel_id, 'block_lot_only', 0.5,
          `Block ${a.block_number} Lot ${a.lot_number} → ${m.parcel_number} (${m.plan_number}) [no section match, lower confidence]`);
        stats.nearest++;
        continue;
      }

      // Multiple ISC matches with no section to disambiguate
      for (const m of iscMatches) {
        insertMatch.run(a.assessment_id, m.id, a.parcel_id, 'block_lot_ambiguous', 0.3,
          `Block ${a.block_number} Lot ${a.lot_number} → ${m.parcel_number} (${m.plan_number}) [${iscMatches.length} ISC candidates, no section]`);
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
  console.log(`  Section+block+lot (high confidence): ${stats.bilateral}`);
  console.log(`  Block+lot only (lower confidence): ${stats.nearest}`);
  console.log(`  Ambiguous: ${stats.ambiguous}`);
  console.log(`  No ISC match: ${stats.noMatch}`);
  console.log(`  Total match rows: ${total.c}`);
  console.log(`\nBy method:`, byMethod);

  // Show coverage
  const iscTotal = db.prepare('SELECT COUNT(*) as c FROM isc_parcels').get() as any;
  const assessed = assessments.length;
  const matched = stats.bilateral + stats.nearest;
  console.log(`\n📈 Coverage: ${matched}/${assessed} assessments matched (${(matched/assessed*100).toFixed(1)}%)`);
  console.log(`   ISC parcels in DB: ${iscTotal.c}`);

  db.close();
}

main();
