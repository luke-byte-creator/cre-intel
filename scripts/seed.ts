/**
 * Seed script — imports sample data into the SQLite database.
 * Run: npx tsx scripts/seed.ts
 */
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const DB_PATH = path.join(process.cwd(), "data", "cre-intel.db");

// Ensure data dir exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// --- Auth tables ---
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS auth_sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// Seed admin user
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

db.prepare(`
  INSERT OR IGNORE INTO users (email, password_hash, name, role, created_at)
  VALUES (?, ?, ?, ?, ?)
`).run("ljjansen6767@gmail.com", hashPassword("novatest123"), "Luke Jansen", "admin", new Date().toISOString());

// Migrate: add new columns if they don't exist
for (const stmt of [
  "ALTER TABLE people ADD COLUMN email TEXT",
  "ALTER TABLE people ADD COLUMN phone TEXT",
  "ALTER TABLE people ADD COLUMN notes TEXT",
  "ALTER TABLE inquiries ADD COLUMN property_of_interest TEXT",
  "ALTER TABLE inquiries ADD COLUMN business_description TEXT",
]) {
  try { db.exec(stmt); } catch {}
}

// Clear existing data and reset autoincrement
db.exec(`
  DELETE FROM alerts_log;
  DELETE FROM watchlist;
  DELETE FROM company_people;
  DELETE FROM permits;
  DELETE FROM transactions;
  DELETE FROM properties;
  DELETE FROM people;
  DELETE FROM companies;
  DELETE FROM sqlite_sequence;
`);

// --- Companies ---
const insertCompany = db.prepare(`
  INSERT INTO companies (name, entity_number, type, status, registration_date, jurisdiction, registered_agent, registered_address, raw_source, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
`);

const sampleCompanies = [
  ["Prairie Capital Holdings Ltd.", "SK-2019-44521", "Corporation", "Active", "2019-03-15", "Saskatchewan", "McPherson Law", "200-410 22nd St E, Saskatoon, SK S7K 5T6", "corporate_registry.pdf"],
  ["Meridian Properties Inc.", "SK-2017-38912", "Corporation", "Active", "2017-06-22", "Saskatchewan", "Robertson Baird LLP", "500-123 2nd Ave S, Saskatoon, SK S7K 7E6", "corporate_registry.pdf"],
  ["Northgate Development Corp.", "SK-2020-47833", "Corporation", "Active", "2020-01-10", "Saskatchewan", "Wallace Firth", "300-815 1st Ave N, Saskatoon, SK S7K 1Y1", "corporate_registry.pdf"],
  ["Summit Commercial REIT", "SK-2018-41205", "Corporation", "Active", "2018-09-05", "Saskatchewan", "MLT Aikins LLP", "1500-410 22nd St E, Saskatoon, SK S7K 5T6", "corporate_registry.pdf"],
  ["Harvest Land Co. Ltd.", "SK-2016-35644", "Corporation", "Dissolved", "2016-04-18", "Saskatchewan", "McKercher LLP", "374 3rd Ave S, Saskatoon, SK S7K 1M5", "corporate_registry.pdf"],
  ["Birchwood Investments Ltd.", "SK-2021-50112", "Corporation", "Active", "2021-07-01", "Saskatchewan", "Felesky Flynn LLP", "410 22nd St E, Suite 800, Saskatoon, SK", "corporate_registry.pdf"],
  ["CityEdge Builders Inc.", "SK-2015-33211", "Corporation", "Active", "2015-11-20", "Saskatchewan", "Priel Law", "2100 8th St E, Saskatoon, SK S7H 0T6", "corporate_registry.pdf"],
  ["Wascana Holdings Corp.", "SK-2019-45010", "Corporation", "Active", "2019-08-14", "Saskatchewan", "Olive Waller Zinkhan & Fitch", "1100 Broad St, Regina, SK S4R 1Y3", "corporate_registry.pdf"],
];

const companyIds: number[] = [];
for (const c of sampleCompanies) {
  const info = insertCompany.run(...c);
  companyIds.push(Number(info.lastInsertRowid));
}

// --- People ---
const insertPerson = db.prepare(`
  INSERT INTO people (first_name, last_name, full_name, address, raw_source, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
`);

const samplePeople = [
  ["James", "Makarios", "James Makarios", "15 Kloppenburg Ct, Saskatoon, SK", "corporate_registry.pdf"],
  ["Diane", "Makarios", "Diane Makarios", "15 Kloppenburg Ct, Saskatoon, SK", "corporate_registry.pdf"],
  ["Robert", "Chen", "Robert Chen", "422 Blackthorn Cres, Saskatoon, SK", "corporate_registry.pdf"],
  ["Priya", "Sandhu", "Priya Sandhu", "102-510 Saskatchewan Cres, Saskatoon, SK", "corporate_registry.pdf"],
  ["Michael", "Makarios", "Michael Makarios", "88 Brightwater Way, Saskatoon, SK", "corporate_registry.pdf"],
  ["Karen", "Makarios", "Karen Makarios", "88 Brightwater Way, Saskatoon, SK", "corporate_registry.pdf"],
  ["Tyler", "Hughes", "Tyler Hughes", "311 LaRonge Rd, Saskatoon, SK", "corporate_registry.pdf"],
  ["Sandra", "Fehr", "Sandra Fehr", "22 Kloppenburg Link, Saskatoon, SK", "corporate_registry.pdf"],
  ["David", "Makarios", "David Makarios", "900 Spadina Cres E, Saskatoon, SK", "corporate_registry.pdf"],
  ["Amanda", "Chen", "Amanda Chen", "422 Blackthorn Cres, Saskatoon, SK", "corporate_registry.pdf"],
];

const personIds: number[] = [];
for (const p of samplePeople) {
  const info = insertPerson.run(...p);
  personIds.push(Number(info.lastInsertRowid));
}

// --- Company-People relationships ---
const insertCP = db.prepare(`
  INSERT INTO company_people (company_id, person_id, role, title, start_date, raw_source)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const cpRelations = [
  [companyIds[0], personIds[0], "Director", "President", "2019-03-15", "corporate_registry.pdf"],
  [companyIds[0], personIds[1], "Director", "Secretary", "2019-03-15", "corporate_registry.pdf"],
  [companyIds[0], personIds[4], "Shareholder", null, "2019-03-15", "corporate_registry.pdf"],
  [companyIds[1], personIds[2], "Director", "President", "2017-06-22", "corporate_registry.pdf"],
  [companyIds[1], personIds[9], "Director", "Secretary", "2017-06-22", "corporate_registry.pdf"],
  [companyIds[2], personIds[3], "Director", "CEO", "2020-01-10", "corporate_registry.pdf"],
  [companyIds[2], personIds[6], "Director", null, "2020-03-01", "corporate_registry.pdf"],
  [companyIds[3], personIds[7], "Director", "President", "2018-09-05", "corporate_registry.pdf"],
  [companyIds[5], personIds[0], "Director", "President", "2021-07-01", "corporate_registry.pdf"],
  [companyIds[5], personIds[8], "Shareholder", null, "2021-07-01", "corporate_registry.pdf"],
  [companyIds[6], personIds[6], "Director", "President", "2015-11-20", "corporate_registry.pdf"],
];

for (const r of cpRelations) {
  insertCP.run(...r);
}

// --- Properties ---
const insertProp = db.prepare(`
  INSERT INTO properties (address, parcel_id, property_type, neighbourhood, city, province, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
`);

const sampleProperties = [
  ["3510 Millar Ave", "203-456-789", "Industrial", "Agriplace", "Saskatoon", "SK"],
  ["810 Circle Dr E", "204-111-222", "Retail", "Greystone Heights", "Saskatoon", "SK"],
  ["2601 Faithfull Ave", "205-333-444", "Industrial", "North Industrial", "Saskatoon", "SK"],
  ["123 Pinehouse Dr", "301-555-666", "Retail", "Lawson Heights", "Saskatoon", "SK"],
  ["415 51st St E", "302-777-888", "Retail", "North Park", "Saskatoon", "SK"],
  ["900 Spadina Cres E", "100-200-300", "Office", "Nutana", "Saskatoon", "SK"],
  ["222 3rd Ave N", "100-201-301", "Office", "Central Business District", "Saskatoon", "SK"],
  ["1515 Idylwyld Dr N", "100-202-302", "Retail", "Caswell Hill", "Saskatoon", "SK"],
  ["3830 Thatcher Ave", "400-100-200", "Industrial", "Marquis Industrial", "Saskatoon", "SK"],
  ["710 Cynthia St", "400-101-201", "Multifamily", "Hampton Village", "Saskatoon", "SK"],
  ["320 Lawn Ave", "500-100-100", "Retail", "Sutherland", "Saskatoon", "SK"],
  ["1801 Preston Ave N", "500-200-200", "Retail", "College Park", "Saskatoon", "SK"],
];

const propIds: number[] = [];
for (const p of sampleProperties) {
  const info = insertProp.run(...p);
  propIds.push(Number(info.lastInsertRowid));
}

// --- Transactions ---
const insertTx = db.prepare(`
  INSERT INTO transactions (property_id, transfer_date, title_number, transaction_type, price, grantor, grantee, grantor_company_id, grantee_company_id, raw_source, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
`);

const sampleTx = [
  [propIds[0], "2021-04-15", "TN-2021-001", "Sale", 2850000, "Harvest Land Co. Ltd.", "Prairie Capital Holdings Ltd.", companyIds[4], companyIds[0], "transfer_list.xlsx"],
  [propIds[1], "2020-09-22", "TN-2020-015", "Sale", 4200000, "Summit Commercial REIT", "Meridian Properties Inc.", companyIds[3], companyIds[1], "transfer_list.xlsx"],
  [propIds[2], "2021-11-03", "TN-2021-033", "Sale", 1750000, null, "Northgate Development Corp.", null, companyIds[2], "transfer_list.xlsx"],
  [propIds[3], "2019-06-10", "TN-2019-042", "Sale", 3100000, "Birchwood Investments Ltd.", "Prairie Capital Holdings Ltd.", companyIds[5], companyIds[0], "transfer_list.xlsx"],
  [propIds[5], "2022-02-28", "TN-2022-008", "Sale", 5500000, null, "Summit Commercial REIT", null, companyIds[3], "transfer_list.xlsx"],
  [propIds[6], "2021-08-15", "TN-2021-055", "Sale", 8200000, "Wascana Holdings Corp.", "Birchwood Investments Ltd.", companyIds[7], companyIds[5], "transfer_list.xlsx"],
  [propIds[7], "2020-03-12", "TN-2020-022", "Sale", 1200000, null, "CityEdge Builders Inc.", null, companyIds[6], "transfer_list.xlsx"],
  [propIds[8], "2022-05-01", "TN-2022-019", "Sale", 950000, "Meridian Properties Inc.", "Northgate Development Corp.", companyIds[1], companyIds[2], "transfer_list.xlsx"],
  [propIds[9], "2021-12-15", "TN-2021-071", "Sale", 380000, null, "James Makarios", null, null, "transfer_list.xlsx"],
  [propIds[10], "2020-07-20", "TN-2020-038", "Sale", 2100000, null, "Meridian Properties Inc.", null, companyIds[1], "transfer_list.xlsx"],
  [propIds[11], "2022-01-10", "TN-2022-003", "Sale", 6700000, "CityEdge Builders Inc.", "Summit Commercial REIT", companyIds[6], companyIds[3], "transfer_list.xlsx"],
];

for (const tx of sampleTx) {
  insertTx.run(...tx);
}

// --- Permits ---
const insertPermit = db.prepare(`
  INSERT INTO permits (permit_number, property_id, address, applicant, applicant_company_id, description, work_type, building_type, estimated_value, issue_date, status, raw_source, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
`);

const samplePermits = [
  ["COMM-2022-0145", propIds[0], "3510 Millar Ave", "Prairie Capital Holdings Ltd.", companyIds[0], "Interior renovation of commercial warehouse", "Renovation", "Commercial", 850000, "2022-03-15", "Issued", "2022_weekly_permit_report.pdf"],
  ["COMM-2022-0189", propIds[1], "810 Circle Dr E", "Meridian Properties Inc.", companyIds[1], "New commercial retail building", "New Building", "Commercial", 4500000, "2022-04-22", "Issued", "2022_weekly_permit_report.pdf"],
  ["COMM-2022-0201", propIds[2], "2601 Faithfull Ave", "Northgate Development Corp.", companyIds[2], "Warehouse expansion and loading dock addition", "Addition", "Industrial", 1200000, "2022-05-10", "Issued", "2022_weekly_permit_report.pdf"],
  ["COMM-2022-0267", propIds[5], "900 Spadina Cres E", "Summit Commercial REIT", companyIds[3], "Office tower renovation — floors 3-8", "Renovation", "Commercial", 3200000, "2022-06-18", "Issued", "2022_weekly_permit_report.pdf"],
  ["COMM-2022-0312", propIds[6], "222 3rd Ave N", "Birchwood Investments Ltd.", companyIds[5], "Mixed-use building new construction", "New Building", "Commercial", 12000000, "2022-07-25", "Issued", "2022_weekly_permit_report.pdf"],
  ["COMM-2022-0334", propIds[7], "1515 Idylwyld Dr N", "CityEdge Builders Inc.", companyIds[6], "Restaurant fit-up and patio", "Renovation", "Commercial", 450000, "2022-08-05", "Issued", "2022_weekly_permit_report.pdf"],
  ["COMM-2022-0378", propIds[8], "3830 Thatcher Ave", "Northgate Development Corp.", companyIds[2], "New industrial flex space", "New Building", "Industrial", 2800000, "2022-09-12", "Issued", "2022_weekly_permit_report.pdf"],
  ["COMM-2022-0401", propIds[11], "1801 Preston Ave N", "Summit Commercial REIT", companyIds[3], "Strip mall facade renovation", "Renovation", "Commercial", 680000, "2022-10-01", "Issued", "2022_weekly_permit_report.pdf"],
];

for (const p of samplePermits) {
  insertPermit.run(...p);
}

// --- Alerts ---
const insertAlert = db.prepare(`
  INSERT INTO alerts_log (entity_type, entity_id, alert_type, title, description, is_read, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const alerts = [
  ["company", companyIds[0], "new_permit", "New permit: COMM-2022-0145", "Prairie Capital Holdings Ltd. filed a permit for $850K renovation at 3510 Millar Ave", 0, "2022-03-15"],
  ["company", companyIds[1], "new_permit", "New permit: COMM-2022-0189", "Meridian Properties Inc. filed a permit for $4.5M new building at 810 Circle Dr E", 0, "2022-04-22"],
  ["company", companyIds[5], "new_transaction", "Property acquisition: 222 3rd Ave N", "Birchwood Investments Ltd. purchased 222 3rd Ave N for $8.2M", 0, "2021-08-15"],
  ["company", companyIds[2], "new_permit", "New permit: COMM-2022-0378", "Northgate Development Corp. filed a permit for $2.8M industrial flex space", 1, "2022-09-12"],
  ["company", companyIds[3], "new_transaction", "Property acquisition: 900 Spadina Cres E", "Summit Commercial REIT purchased 900 Spadina Cres E for $5.5M", 0, "2022-02-28"],
  ["company", companyIds[5], "new_permit", "New permit: COMM-2022-0312", "Birchwood Investments Ltd. filed a permit for $12M mixed-use building at 222 3rd Ave N", 0, "2022-07-25"],
];

for (const a of alerts) {
  insertAlert.run(...a);
}

// --- Watchlist ---
const insertWatch = db.prepare(`
  INSERT INTO watchlist (entity_type, entity_id, label, notes, created_at)
  VALUES (?, ?, ?, ?, datetime('now'))
`);

const watchItems = [
  ["company", companyIds[0], "Prairie Capital Holdings Ltd.", "Major local player — tracking acquisitions"],
  ["company", companyIds[2], "Northgate Development Corp.", "Active builder — multiple permits"],
  ["property", propIds[6], "222 3rd Ave N", "$12M mixed-use — largest downtown project"],
];

for (const w of watchItems) {
  insertWatch.run(...w);
}

// --- Inquiries ---
db.exec(`
  CREATE TABLE IF NOT EXISTS inquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER,
    tenant_name TEXT NOT NULL,
    tenant_company TEXT,
    tenant_email TEXT,
    tenant_phone TEXT,
    property_of_interest TEXT,
    business_description TEXT,
    space_needs_sf TEXT,
    asset_type_preference TEXT,
    preferred_area TEXT,
    budget_rate TEXT,
    timeline TEXT,
    notes TEXT,
    source TEXT DEFAULT 'form',
    submitted_by TEXT DEFAULT 'tenant',
    status TEXT DEFAULT 'new',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

db.exec(`DELETE FROM inquiries`);

const insertInquiry = db.prepare(`
  INSERT INTO inquiries (tenant_name, tenant_company, tenant_email, tenant_phone, property_of_interest, business_description, space_needs_sf, timeline, source, submitted_by, status, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const sampleInquiries = [
  ["Sarah Chen", "Bright Smile Dental", "sarah@brightsmile.ca", "306-555-1234", "810 Circle Dr E, Unit 102", "Dental clinic — 3 operatories, reception, sterilization room", "2,500-3,500 sf", "3-6 months", "form", "tenant", "new", "2026-02-10T14:30:00.000Z"],
  ["Marcus Johnson", "Prairie Logistics Inc.", "marcus@prairielogistics.ca", "306-555-5678", "3510 Millar Ave", "Third-party logistics and warehousing", "8,000-12,000 sf", "Immediate", "form", "tenant", "contacted", "2026-02-08T09:15:00.000Z"],
  ["Emily Fehr", null, "emily.fehr@gmail.com", "306-555-9012", "200-410 22nd St E", "Accounting firm — 4 partners, 8 staff", "3,000-4,000 sf", "6-12 months", "form", "tenant", "new", "2026-02-05T11:00:00.000Z"],
  ["David Park", "Park & Associates Law", "dpark@parklaw.ca", "306-555-3456", "222 3rd Ave N", "Law firm — litigation and corporate", "5,000-7,000 sf", "1-3 months", "form", "tenant", "qualified", "2026-02-01T10:00:00.000Z"],
];

for (const inq of sampleInquiries) {
  insertInquiry.run(...inq);
}

// --- Deals ---
db.exec(`
  CREATE TABLE IF NOT EXISTS deals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_name TEXT NOT NULL,
    tenant_company TEXT,
    tenant_email TEXT,
    tenant_phone TEXT,
    property_address TEXT NOT NULL,
    asset_type TEXT,
    size_sf TEXT,
    estimated_commission REAL,
    stage TEXT NOT NULL DEFAULT 'prospect',
    stage_entered_at TEXT NOT NULL,
    notes TEXT,
    inquiry_id INTEGER REFERENCES inquiries(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);
try { db.exec(`DELETE FROM tours`); } catch {}
db.exec(`DELETE FROM deals`);

const insertDeal = db.prepare(`
  INSERT INTO deals (tenant_name, property_address, stage, stage_entered_at, notes, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const now = new Date();
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();

const sampleDeals = [
  // 3 prospect
  ["Mike Peters - 51st St Warehouse", "415 51st St E, Saskatoon", "prospect", daysAgo(2),
    JSON.stringify([
      { text: "Initial call — looking for 4,500 sf warehouse space", date: "2026-02-10T09:00:00Z" },
      { text: "Sent listing package for Millar Ave and 51st St options", date: "2026-02-12T14:30:00Z" },
    ]), daysAgo(3), daysAgo(2)],
  ["Lisa Wang - Lawn Ave Bakery", "320 Lawn Ave, Saskatoon", "prospect", daysAgo(1),
    JSON.stringify([
      { text: "Wants retail storefront with commercial kitchen", date: "2026-02-12T11:00:00Z" },
      { text: "Discussed layout needs — minimum 1,800 sf", date: "2026-02-13T10:00:00Z" },
    ]), daysAgo(2), daysAgo(1)],
  ["Emily Fehr - Office Space", "200-410 22nd St E, Saskatoon", "prospect", daysAgo(0),
    JSON.stringify([
      { text: "Accounting firm, 4 partners + 8 staff, needs 3-4K sf", date: "2026-02-14T09:00:00Z" },
    ]), daysAgo(0), daysAgo(0)],

  // 3 ongoing
  ["Tom Makarios - 3rd Ave Office", "222 3rd Ave N, Saskatoon", "ongoing", daysAgo(5),
    JSON.stringify([
      { text: "Initial meeting — needs 6,000 sf for law/consulting firm", date: "2026-02-05T10:00:00Z" },
      { text: "Toured the space, very positive", date: "2026-02-08T14:00:00Z" },
      { text: "Proposal sent — $22/sf net, 5yr term", date: "2026-02-10T09:30:00Z" },
    ]), daysAgo(10), daysAgo(5)],
  ["Prairie Logistics Warehouse", "3510 Millar Ave, Saskatoon", "ongoing", daysAgo(3),
    JSON.stringify([
      { text: "Marcus Johnson — 3PL company needs 10K sf warehouse", date: "2026-02-06T09:00:00Z" },
      { text: "Toured Millar Ave, good fit for loading docks", date: "2026-02-09T13:00:00Z" },
      { text: "Negotiating TI allowance and lease start date", date: "2026-02-11T16:00:00Z" },
    ]), daysAgo(8), daysAgo(3)],
  ["Rachel Fong - Wellness Clinic", "1515 Idylwyld Dr N, Saskatoon", "ongoing", daysAgo(2),
    JSON.stringify([
      { text: "Prairie Wellness Co — retail space for wellness clinic", date: "2026-02-07T10:00:00Z" },
      { text: "Toured north end retail, liked the visibility", date: "2026-02-10T14:00:00Z" },
      { text: "Reviewing lease terms, following up Thursday", date: "2026-02-12T11:00:00Z" },
    ]), daysAgo(7), daysAgo(2)],

  // 2 closed
  ["Bright Smile Dental - Circle Dr", "810 Circle Dr E, Unit 102, Saskatoon", "closed", daysAgo(15),
    JSON.stringify([
      { text: "Sarah Chen — dental clinic, 3 operatories", date: "2026-01-15T09:00:00Z" },
      { text: "Toured unit 102, perfect layout", date: "2026-01-20T14:00:00Z" },
      { text: "Lease signed — 5yr term, $24/sf net", date: "2026-01-30T10:00:00Z" },
      { text: "Possession March 1, TI work starting", date: "2026-02-01T09:00:00Z" },
    ]), daysAgo(30), daysAgo(15)],
  ["Hall Tech - Circle Dr Office", "810 Circle Dr E, Saskatoon", "closed", daysAgo(10),
    JSON.stringify([
      { text: "Derek Hall — tech company, 4,500 sf office", date: "2026-01-20T10:00:00Z" },
      { text: "Final terms reviewed and accepted", date: "2026-02-01T15:00:00Z" },
      { text: "Deal closed — 3yr lease with renewal option", date: "2026-02-04T11:00:00Z" },
    ]), daysAgo(25), daysAgo(10)],
];

for (const d of sampleDeals) {
  insertDeal.run(...d);
}

console.log("✅ Seed complete");
console.log(`   ${sampleCompanies.length} companies`);
console.log(`   ${samplePeople.length} people`);
console.log(`   ${cpRelations.length} company-people relationships`);
console.log(`   ${sampleProperties.length} properties`);
console.log(`   ${sampleTx.length} transactions`);
console.log(`   ${samplePermits.length} permits`);
console.log(`   ${alerts.length} alerts`);
console.log(`   ${watchItems.length} watchlist items`);
console.log(`   ${sampleInquiries.length} inquiries`);

db.close();
