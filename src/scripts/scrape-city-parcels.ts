/**
 * City of Saskatoon Parcel Scraper + Property Matcher
 * Pulls from OD/LandSurface ArcGIS layer, stores in city_parcels, matches to properties
 * 
 * Usage: npx tsx src/scripts/scrape-city-parcels.ts
 */

import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'cre-intel.db');
const API_URL = 'https://gisext.saskatoon.ca/arcgis/rest/services/OD/LandSurface/MapServer/1/query';
const PAGE_SIZE = 1000;
const DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function computeCentroid(geometry: any): { lat: number; lon: number } | null {
  try {
    const rings = geometry?.rings;
    if (!rings || rings.length === 0) return null;
    let sumX = 0, sumY = 0, count = 0;
    for (const ring of rings) {
      for (const [x, y] of ring) {
        sumX += x;
        sumY += y;
        count++;
      }
    }
    if (count === 0) return null;
    return { lat: sumY / count, lon: sumX / count };
  } catch {
    return null;
  }
}

// ============ SCRAPER ============

async function scrapeAllParcels(db: Database.Database): Promise<number> {
  // Create table if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS city_parcels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id INTEGER,
      full_address TEXT NOT NULL,
      block_number TEXT,
      lot_number TEXT,
      zone TEXT,
      site_area REAL,
      frontage REAL,
      postal_code TEXT,
      ward TEXT,
      neighbourhood TEXT,
      active_status TEXT,
      site_status TEXT,
      street_number TEXT,
      street_name TEXT,
      street_suffix TEXT,
      street_post_dir TEXT,
      latitude REAL,
      longitude REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_city_parcels_site_id ON city_parcels(site_id);
    CREATE INDEX IF NOT EXISTS idx_city_parcels_full_address ON city_parcels(full_address);
    CREATE INDEX IF NOT EXISTS idx_city_parcels_block_lot ON city_parcels(block_number, lot_number);
    CREATE INDEX IF NOT EXISTS idx_city_parcels_neighbourhood ON city_parcels(neighbourhood);

    CREATE TABLE IF NOT EXISTS city_parcel_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      city_parcel_id INTEGER NOT NULL REFERENCES city_parcels(id),
      property_id INTEGER NOT NULL REFERENCES properties(id),
      match_method TEXT NOT NULL,
      confidence REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_city_parcel_matches_parcel_id ON city_parcel_matches(city_parcel_id);
    CREATE INDEX IF NOT EXISTS idx_city_parcel_matches_property_id ON city_parcel_matches(property_id);
    CREATE INDEX IF NOT EXISTS idx_city_parcel_matches_status ON city_parcel_matches(status);
  `);

  // Clear existing data for re-run
  db.exec('DELETE FROM city_parcel_matches');
  db.exec('DELETE FROM city_parcels');

  const insert = db.prepare(`
    INSERT INTO city_parcels (site_id, full_address, block_number, lot_number, zone, site_area, frontage,
      postal_code, ward, neighbourhood, active_status, site_status, street_number, street_name,
      street_suffix, street_post_dir, latitude, longitude, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);

  let offset = 0;
  let totalInserted = 0;

  while (true) {
    const params = new URLSearchParams({
      where: '1=1',
      outFields: '*',
      returnGeometry: 'true',
      outSR: '4326',
      resultOffset: String(offset),
      resultRecordCount: String(PAGE_SIZE),
      f: 'json',
    });

    const url = `${API_URL}?${params}`;
    console.log(`📥 Fetching offset=${offset}...`);

    let data: any;
    try {
      const resp = await fetch(url);
      data = await resp.json();
    } catch (err) {
      console.error(`❌ Fetch error at offset ${offset}:`, err);
      break;
    }

    const features = data.features;
    if (!features || features.length === 0) {
      console.log('   No more features.');
      break;
    }

    const insertMany = db.transaction(() => {
      for (const f of features) {
        const a = f.attributes || {};
        const centroid = computeCentroid(f.geometry);
        insert.run(
          a.SiteId ?? null,
          a.FullAddress || '',
          a.BlockNumber ?? null,
          a.LotNumber ?? null,
          a.Zone ?? null,
          a.SiteArea ?? null,
          a.Frontage ?? null,
          a.PostalCode ?? null,
          a.Ward ?? null,
          a.Neighbourhood ?? null,
          a.ActiveStatus ?? null,
          a.SiteStatus ?? null,
          a.StreetNumber ?? null,
          a.StreetName ?? null,
          a.StreetSuff ?? null,
          a.StreetPostDir ?? null,
          centroid?.lat ?? null,
          centroid?.lon ?? null,
        );
      }
    });
    insertMany();

    totalInserted += features.length;
    console.log(`   ✅ ${features.length} parcels (total: ${totalInserted})`);

    if (!data.exceededTransferLimit && features.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    await sleep(DELAY_MS);
  }

  return totalInserted;
}

// ============ MATCHER ============

const STREET_TYPES: Record<string, string> = {
  'st': 'street', 'str': 'street', 'ave': 'avenue', 'av': 'avenue',
  'blvd': 'boulevard', 'boul': 'boulevard', 'dr': 'drive', 'cres': 'crescent',
  'cr': 'crescent', 'crt': 'court', 'ct': 'court', 'pl': 'place',
  'rd': 'road', 'way': 'way', 'ln': 'lane', 'terr': 'terrace',
  'ter': 'terrace', 'cir': 'circle', 'pk': 'park', 'pkwy': 'parkway',
  'hwy': 'highway', 'hw': 'highway',
};

const DIRECTIONALS: Record<string, string> = {
  'n': 'north', 's': 'south', 'e': 'east', 'w': 'west',
  'ne': 'northeast', 'nw': 'northwest', 'se': 'southeast', 'sw': 'southwest',
};

function normalizeAddress(addr: string): string {
  let s = addr.toLowerCase().trim();
  s = s.replace(/,?\s*saskatoon\s*/gi, '').replace(/,?\s*sk\s*/gi, '').replace(/,?\s*saskatchewan\s*/gi, '');
  s = s.replace(/[a-z]\d[a-z]\s*\d[a-z]\d/gi, '');
  s = s.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  const words = s.split(' ');
  return words.map(w => STREET_TYPES[w] || DIRECTIONALS[w] || w).join(' ');
}

function aggressiveNormalize(addr: string): string {
  let s = normalizeAddress(addr);
  s = s.replace(/^(unit|suite|ste|apt|#)\s*\S+\s*/i, '');
  s = s.replace(/\s+(unit|suite|ste|apt|#)\s*\S+/i, '');
  s = s.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  return s;
}

function extractStreetNumber(addr: string): string | null {
  const m = addr.match(/(\d+)/);
  return m ? m[1] : null;
}

function extractStreetName(addr: string): string {
  return addr.replace(/^[\s\d-]+/, '').toLowerCase().trim().split(' ')[0] || '';
}

function matchParcels(db: Database.Database): { matched: number; exact: number; normalized: number; fuzzy: number; total: number } {
  const parcels = db.prepare('SELECT id, full_address FROM city_parcels').all() as any[];
  const props = db.prepare('SELECT id, address FROM properties WHERE address IS NOT NULL').all() as any[];

  console.log(`\n🔗 Matching ${parcels.length} parcels → ${props.length} properties...`);

  db.exec('DELETE FROM city_parcel_matches');

  // Build parcel lookup maps
  const exactMap = new Map<string, any[]>();
  const normMap = new Map<string, any[]>();
  const fuzzyMap = new Map<string, Map<string, any[]>>();

  for (const p of parcels) {
    const ek = normalizeAddress(p.full_address);
    if (!exactMap.has(ek)) exactMap.set(ek, []);
    exactMap.get(ek)!.push(p);

    const nk = aggressiveNormalize(p.full_address);
    if (!normMap.has(nk)) normMap.set(nk, []);
    normMap.get(nk)!.push(p);

    const num = extractStreetNumber(p.full_address);
    const name = extractStreetName(p.full_address);
    if (num && name) {
      if (!fuzzyMap.has(num)) fuzzyMap.set(num, new Map());
      const nm = fuzzyMap.get(num)!;
      if (!nm.has(name)) nm.set(name, []);
      nm.get(name)!.push(p);
    }
  }

  const insertMatch = db.prepare(`
    INSERT INTO city_parcel_matches (city_parcel_id, property_id, match_method, confidence, status, created_at)
    VALUES (?, ?, ?, ?, 'pending', datetime('now'))
  `);

  let matched = 0, exact = 0, normalized = 0, fuzzy = 0;

  const runMatching = db.transaction(() => {
    for (const prop of props) {
      const addr = prop.address;

      // Exact
      const ek = normalizeAddress(addr);
      let hits = exactMap.get(ek);
      if (hits?.length) {
        for (const h of hits) insertMatch.run(h.id, prop.id, 'exact', 1.0);
        matched++; exact++;
        continue;
      }

      // Normalized
      const nk = aggressiveNormalize(addr);
      hits = normMap.get(nk);
      if (hits?.length) {
        for (const h of hits) insertMatch.run(h.id, prop.id, 'normalized', 0.85);
        matched++; normalized++;
        continue;
      }

      // Fuzzy
      const num = extractStreetNumber(addr);
      const name = extractStreetName(addr);
      if (num && name) {
        const nm = fuzzyMap.get(num);
        if (nm) {
          const fhits: any[] = [];
          for (const [n, cas] of nm) {
            if (n.startsWith(name.substring(0, 3)) || name.startsWith(n.substring(0, 3))) {
              fhits.push(...cas);
            }
          }
          if (fhits.length > 0 && fhits.length <= 5) {
            for (const h of fhits) insertMatch.run(h.id, prop.id, 'fuzzy', 0.6);
            matched++; fuzzy++;
          }
        }
      }
    }
  });
  runMatching();

  return { matched, exact, normalized, fuzzy, total: props.length };
}

// ============ MAIN ============

async function main() {
  console.log('🏗️  City Parcel Scraper + Matcher');
  console.log('================================\n');

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Step 1: Scrape
  const totalParcels = await scrapeAllParcels(db);
  console.log(`\n📊 Total parcels pulled: ${totalParcels}`);

  // Stats
  const withBlock = (db.prepare("SELECT COUNT(*) as c FROM city_parcels WHERE block_number IS NOT NULL AND block_number != ''").get() as any).c;
  const withLot = (db.prepare("SELECT COUNT(*) as c FROM city_parcels WHERE lot_number IS NOT NULL AND lot_number != ''").get() as any).c;
  const withBoth = (db.prepare("SELECT COUNT(*) as c FROM city_parcels WHERE block_number IS NOT NULL AND block_number != '' AND lot_number IS NOT NULL AND lot_number != ''").get() as any).c;
  const withGeo = (db.prepare("SELECT COUNT(*) as c FROM city_parcels WHERE latitude IS NOT NULL").get() as any).c;

  console.log(`   Block numbers: ${withBlock}`);
  console.log(`   Lot numbers: ${withLot}`);
  console.log(`   Both block+lot: ${withBoth} (ISC-ready)`);
  console.log(`   With coordinates: ${withGeo}`);

  // Step 2: Match
  const matchResult = matchParcels(db);
  console.log(`\n✅ Matching complete:`);
  console.log(`   Properties: ${matchResult.total}`);
  console.log(`   Matched: ${matchResult.matched}`);
  console.log(`     - Exact: ${matchResult.exact}`);
  console.log(`     - Normalized: ${matchResult.normalized}`);
  console.log(`     - Fuzzy: ${matchResult.fuzzy}`);
  console.log(`   Unmatched: ${matchResult.total - matchResult.matched}`);

  db.close();
  console.log('\n🎉 Done!');
}

main().catch(console.error);
