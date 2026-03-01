/**
 * Migration script to add scraped data tables to existing database
 * Run this once to create the new tables without affecting existing data
 */

import Database from 'better-sqlite3';
import path from 'path';

export async function createScrapedDataTables() {
  const dbPath = path.join(process.cwd(), 'data/cre-intel.db');
  const db = new Database(dbPath);

  console.log('Creating scraped data tables...');

  // Create scraped_listings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS scraped_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      sourceUrl TEXT NOT NULL,
      address TEXT NOT NULL,
      propertyType TEXT NOT NULL,
      listingType TEXT NOT NULL,
      askingPrice REAL,
      askingRent REAL,
      squareFeet INTEGER,
      description TEXT,
      broker TEXT,
      brokerageFirm TEXT,
      status TEXT DEFAULT 'active',
      rawData TEXT,
      firstSeen TEXT NOT NULL,
      lastSeen TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_scraped_listings_source ON scraped_listings(source)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_scraped_listings_property_type ON scraped_listings(propertyType)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_scraped_listings_listing_type ON scraped_listings(listingType)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_scraped_listings_address ON scraped_listings(address)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_scraped_listings_status ON scraped_listings(status)`);

  // Create scraped_permits table
  db.exec(`
    CREATE TABLE IF NOT EXISTS scraped_permits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL DEFAULT 'saskatoon-epermitting',
      permitNumber TEXT NOT NULL,
      permitDate TEXT,
      address TEXT NOT NULL,
      owner TEXT,
      permitValue REAL,
      description TEXT,
      permitStatus TEXT,
      workType TEXT,
      rawData TEXT,
      firstSeen TEXT NOT NULL,
      lastSeen TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_scraped_permits_permit_number ON scraped_permits(permitNumber)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_scraped_permits_address ON scraped_permits(address)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_scraped_permits_permit_value ON scraped_permits(permitValue)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_scraped_permits_permit_date ON scraped_permits(permitDate)`);

  // Create scraped_tenders table
  db.exec(`
    CREATE TABLE IF NOT EXISTS scraped_tenders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL DEFAULT 'sasktenders',
      sourceUrl TEXT NOT NULL,
      tenderName TEXT NOT NULL,
      organization TEXT NOT NULL,
      closingDate TEXT,
      description TEXT,
      category TEXT,
      status TEXT DEFAULT 'active',
      rawData TEXT,
      firstSeen TEXT NOT NULL,
      lastSeen TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_scraped_tenders_organization ON scraped_tenders(organization)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_scraped_tenders_closing_date ON scraped_tenders(closingDate)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_scraped_tenders_category ON scraped_tenders(category)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_scraped_tenders_status ON scraped_tenders(status)`);

  // Create scraped_assessments table
  db.exec(`
    CREATE TABLE IF NOT EXISTS scraped_assessments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL DEFAULT 'saskatoon-assessment',
      address TEXT NOT NULL,
      assessedValue REAL,
      lotSize REAL,
      zoning TEXT,
      yearBuilt INTEGER,
      propertyType TEXT,
      rollNumber TEXT,
      rawData TEXT,
      scrapedAt TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_scraped_assessments_address ON scraped_assessments(address)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_scraped_assessments_assessed_value ON scraped_assessments(assessedValue)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_scraped_assessments_roll_number ON scraped_assessments(rollNumber)`);

  // Create scraper_runs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS scraper_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      itemsFound INTEGER DEFAULT 0,
      itemsProcessed INTEGER DEFAULT 0,
      itemsNew INTEGER DEFAULT 0,
      itemsUpdated INTEGER DEFAULT 0,
      errors TEXT,
      duration INTEGER,
      metadata TEXT,
      startedAt TEXT NOT NULL,
      completedAt TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_scraper_runs_source ON scraper_runs(source)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_scraper_runs_status ON scraper_runs(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_scraper_runs_started_at ON scraper_runs(startedAt)`);

  // Add released_to and released_at columns to scraped_listings
  const cols = db.pragma('table_info(scraped_listings)') as { name: string }[];
  const colNames = cols.map(c => c.name);
  if (!colNames.includes('released_to')) {
    db.exec(`ALTER TABLE scraped_listings ADD COLUMN released_to TEXT`);
    console.log('  Added released_to column to scraped_listings');
  }
  if (!colNames.includes('released_at')) {
    db.exec(`ALTER TABLE scraped_listings ADD COLUMN released_at TEXT`);
    console.log('  Added released_at column to scraped_listings');
  }

  // Create suburban_office_listings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS suburban_office_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      address TEXT NOT NULL,
      address_normalized TEXT,
      square_feet INTEGER,
      asking_rent REAL,
      asking_price REAL,
      listing_type TEXT,
      broker TEXT,
      brokerage_firm TEXT,
      source TEXT,
      source_url TEXT,
      source_listing_id INTEGER,
      status TEXT DEFAULT 'active',
      first_seen TEXT,
      last_seen TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_suburban_office_address ON suburban_office_listings(address)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_suburban_office_status ON suburban_office_listings(status)`);

  // Add new columns to scraped_listings (suite, rent_basis, property_type_flag, dismissed)
  const slCols = db.pragma('table_info(scraped_listings)') as { name: string }[];
  const slColNames = slCols.map(c => c.name);
  if (!slColNames.includes('suite')) {
    db.exec(`ALTER TABLE scraped_listings ADD COLUMN suite TEXT`);
    console.log('  Added suite column to scraped_listings');
  }
  if (!slColNames.includes('rent_basis')) {
    db.exec(`ALTER TABLE scraped_listings ADD COLUMN rent_basis TEXT`);
    console.log('  Added rent_basis column to scraped_listings');
  }
  if (!slColNames.includes('property_type_flag')) {
    db.exec(`ALTER TABLE scraped_listings ADD COLUMN property_type_flag TEXT`);
    console.log('  Added property_type_flag column to scraped_listings');
  }
  if (!slColNames.includes('dismissed')) {
    db.exec(`ALTER TABLE scraped_listings ADD COLUMN dismissed INTEGER DEFAULT 0`);
    console.log('  Added dismissed column to scraped_listings');
  }

  // Create muted_addresses table
  db.exec(`
    CREATE TABLE IF NOT EXISTS muted_addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      address TEXT NOT NULL UNIQUE,
      address_normalized TEXT,
      reason TEXT,
      muted_at TEXT NOT NULL DEFAULT (datetime('now')),
      muted_by TEXT
    )
  `);
  console.log('  Created muted_addresses table');

  db.close();
  console.log('✅ Scraped data tables created successfully!');
}

// Run the migration if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createScrapedDataTables().catch(console.error);
}