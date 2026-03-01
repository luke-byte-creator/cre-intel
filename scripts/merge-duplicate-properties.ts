/**
 * Merge duplicate properties (same normalized address + city).
 * Keeps the lowest ID, reassigns all FKs, deletes duplicates.
 */
import Database from 'better-sqlite3';

const db = new Database('data/cre-intel.db');

const dupes = db.prepare(`
  SELECT address_normalized, city_normalized, GROUP_CONCAT(id) as ids
  FROM properties 
  WHERE address_normalized IS NOT NULL
  GROUP BY address_normalized, city_normalized
  HAVING COUNT(*) > 1
`).all() as { address_normalized: string; city_normalized: string; ids: string }[];

console.log(`Found ${dupes.length} duplicate property groups\n`);

let totalMerged = 0;
let totalDeleted = 0;
let compsReassigned = 0;
let permitsReassigned = 0;
let watchlistReassigned = 0;

for (const dupe of dupes) {
  const ids = dupe.ids.split(',').map(Number).sort((a, b) => a - b);
  const keepId = ids[0];
  const deleteIds = ids.slice(1);

  for (const delId of deleteIds) {
    // Reassign comps
    const cr = db.prepare('UPDATE comps SET property_id = ? WHERE property_id = ?').run(keepId, delId);
    compsReassigned += cr.changes;

    // Reassign permits
    const pr = db.prepare('UPDATE permits SET property_id = ? WHERE property_id = ?').run(keepId, delId);
    permitsReassigned += pr.changes;

    // Reassign watchlist
    const wr = db.prepare("UPDATE watchlist SET entity_id = ? WHERE entity_type = 'property' AND entity_id = ?").run(keepId, delId);
    watchlistReassigned += wr.changes;

    // Delete duplicate
    db.prepare('DELETE FROM properties WHERE id = ?').run(delId);
    totalDeleted++;
  }
  totalMerged++;
}

console.log(`Merged: ${totalMerged} groups`);
console.log(`Deleted: ${totalDeleted} duplicate properties`);
console.log(`Comps reassigned: ${compsReassigned}`);
console.log(`Permits reassigned: ${permitsReassigned}`);
console.log(`Watchlist entries reassigned: ${watchlistReassigned}`);

// Final count
const propCount = db.prepare('SELECT COUNT(*) as c FROM properties').get() as any;
console.log(`\nProperties remaining: ${propCount.c}`);

db.close();
