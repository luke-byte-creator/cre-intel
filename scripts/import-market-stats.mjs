import Database from 'better-sqlite3';

const dbPath = '/Users/lukejansen/.openclaw/workspace/cre-intel/data/cre-intel.db';
const db = new Database(dbPath);

// Data extracted from Excel: 2026 SK - Stats Forecast - Dec 15 (1).xlsx, sheet "Sask"
// Only 2024 and 2025 (no 2026F)

const records = [
  // === OFFICE DOWNTOWN (rows 3-9) ===
  { category: 'office_downtown', metric: 'inventory_sf', year: 2024, value: 3324564 },
  { category: 'office_downtown', metric: 'inventory_sf', year: 2025, value: 3324564 },
  { category: 'office_downtown', metric: 'occupied_sf', year: 2024, value: 2680866 },
  { category: 'office_downtown', metric: 'occupied_sf', year: 2025, value: 2729416 },
  { category: 'office_downtown', metric: 'vacant_sf', year: 2024, value: 643698 },
  { category: 'office_downtown', metric: 'vacant_sf', year: 2025, value: 595148 },
  { category: 'office_downtown', metric: 'vacancy_rate', year: 2024, value: 19.36 },
  { category: 'office_downtown', metric: 'vacancy_rate', year: 2025, value: 17.90 },
  { category: 'office_downtown', metric: 'absorption', year: 2024, value: 26169 },
  { category: 'office_downtown', metric: 'absorption', year: 2025, value: 48550 },
  { category: 'office_downtown', metric: 'new_supply', year: 2024, value: 0 },
  { category: 'office_downtown', metric: 'new_supply', year: 2025, value: 0 },
  { category: 'office_downtown', metric: 'class_a_net_rent', year: 2024, value: 19.51 },
  { category: 'office_downtown', metric: 'class_a_net_rent', year: 2025, value: 19.53 },

  // === OFFICE SUBURBAN (rows 12-18) — dashboard doesn't show this yet ===
  { category: 'office_suburban', metric: 'inventory_sf', year: 2024, value: 3227680 },
  { category: 'office_suburban', metric: 'inventory_sf', year: 2025, value: 3288120 },
  { category: 'office_suburban', metric: 'occupied_sf', year: 2024, value: 2857909 },
  { category: 'office_suburban', metric: 'occupied_sf', year: 2025, value: 2984394 },
  { category: 'office_suburban', metric: 'vacant_sf', year: 2024, value: 369771 },
  { category: 'office_suburban', metric: 'vacant_sf', year: 2025, value: 303726 },
  { category: 'office_suburban', metric: 'vacancy_rate', year: 2024, value: 11.46 },
  { category: 'office_suburban', metric: 'vacancy_rate', year: 2025, value: 9.24 },
  { category: 'office_suburban', metric: 'absorption', year: 2024, value: 53781 },
  { category: 'office_suburban', metric: 'absorption', year: 2025, value: 66045 },
  { category: 'office_suburban', metric: 'new_supply', year: 2024, value: 0 },
  { category: 'office_suburban', metric: 'new_supply', year: 2025, value: 60440 },
  { category: 'office_suburban', metric: 'class_a_net_rent', year: 2024, value: 23.07 },
  { category: 'office_suburban', metric: 'class_a_net_rent', year: 2025, value: 23.47 },

  // === INDUSTRIAL (rows 30-37) ===
  { category: 'industrial', metric: 'inventory_sf', year: 2024, value: 24560084 },
  { category: 'industrial', metric: 'inventory_sf', year: 2025, value: 24712384 },
  { category: 'industrial', metric: 'vacancy_rate', year: 2024, value: 3.02 },
  { category: 'industrial', metric: 'vacancy_rate', year: 2025, value: 2.85 },
  { category: 'industrial', metric: 'absorption', year: 2024, value: 204510 },
  { category: 'industrial', metric: 'absorption', year: 2025, value: 188579 },
  { category: 'industrial', metric: 'new_supply', year: 2024, value: 109302 },
  { category: 'industrial', metric: 'new_supply', year: 2025, value: 152300 },
  { category: 'industrial', metric: 'avg_lease_rate', year: 2024, value: 12.71 },
  { category: 'industrial', metric: 'avg_lease_rate', year: 2025, value: 12.89 },
  { category: 'industrial', metric: 'avg_sale_psf', year: 2024, value: 193.73 },
  { category: 'industrial', metric: 'avg_sale_psf', year: 2025, value: 194.22 },

  // === RETAIL — Excel only has "New Supply: n/a" — nothing usable ===
];

const del = db.prepare('DELETE FROM market_stats WHERE category = ? AND metric = ? AND year = ?');
const ins = db.prepare('INSERT INTO market_stats (category, metric, year, value, is_forecast, is_override, updated_at) VALUES (?, ?, ?, ?, 0, 0, datetime(\'now\'))');

const tx = db.transaction(() => {
  for (const r of records) {
    del.run(r.category, r.metric, r.year);
    ins.run(r.category, r.metric, r.year, r.value);
  }
});

tx();

console.log(`\n✅ Inserted ${records.length} records into market_stats`);
console.log('\n--- Summary ---');
const categories = [...new Set(records.map(r => r.category))];
for (const cat of categories) {
  const catRecords = records.filter(r => r.category === cat);
  console.log(`\n${cat}:`);
  const metrics = [...new Set(catRecords.map(r => r.metric))];
  for (const m of metrics) {
    const vals = catRecords.filter(r => r.metric === m);
    const line = vals.map(v => `${v.year}: ${v.value}`).join(', ');
    console.log(`  ${m}: ${line}`);
  }
}

console.log('\n⚠️  Notes:');
console.log('  - office_suburban: Data inserted but dashboard does NOT display this section yet');
console.log('  - office_downtown avg_net_rent: Not in Excel (only Class A rent available)');
console.log('  - industrial avg_cap_rate: Not in Excel (implied cap rates exist but not directly)');
console.log('  - retail: Excel only has "New Supply: n/a" — no usable data to insert');

db.close();
