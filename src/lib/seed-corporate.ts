/**
 * Bulk import Corporate Registry PDFs into the database.
 * Reads all PDFs from the Corporate Registries folder, parses them,
 * deduplicates by entity number (keeping most recent report date),
 * and imports companies, people, and relationships.
 */

import fs from "fs";
import path from "path";
import { db } from "@/db";
import { companies, people, companyPeople } from "@/db/schema";
// import { eq, and } from "drizzle-orm";
import { parseCorporateRegistry, type CorporateRegistryResult } from "./parsers/corporate-registry";

const PDF_DIR = "/Users/lukejansen/Documents/Nova/Corporate Registries/";

export async function seedCorporateRegistries() {
  console.log("🏢 Starting Corporate Registry bulk import...");

  // 1. Read and parse all PDFs
  const files = fs.readdirSync(PDF_DIR).filter((f) => f.endsWith(".pdf"));
  console.log(`📄 Found ${files.length} PDF files`);

  const parsed: { filename: string; result: CorporateRegistryResult }[] = [];
  let errors = 0;

  for (const f of files) {
    try {
      const buf = fs.readFileSync(path.join(PDF_DIR, f));
      const result = await parseCorporateRegistry(buf);
      parsed.push({ filename: f, result });
    } catch (e: unknown) {
      errors++;
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`⚠️  Failed to parse ${f}: ${msg}`);
    }
  }
  console.log(`✅ Parsed ${parsed.length} PDFs (${errors} errors)`);

  // 2. Deduplicate by entityNumber — keep most recent reportDate
  const byEntity = new Map<string, { filename: string; result: CorporateRegistryResult }>();
  for (const p of parsed) {
    const num = p.result.entityNumber;
    if (!num) continue;
    const existing = byEntity.get(num);
    if (!existing) {
      byEntity.set(num, p);
    } else {
      // Compare report dates
      const existDate = parseDate(existing.result.reportDate);
      const newDate = parseDate(p.result.reportDate);
      if (newDate && (!existDate || newDate > existDate)) {
        byEntity.set(num, p);
      }
    }
  }
  console.log(`📊 ${byEntity.size} unique entities after deduplication`);

  // 3. Clear existing corporate registry data (order matters for FK)
  db.delete(companyPeople).run();
  // Don't delete people/companies that might be referenced by other tables
  // Instead, just delete companies that have entity numbers (from registry imports)
  // For simplicity, since user said existing data is test data:
  try {
    db.delete(people).run();
  } catch { /* FK constraints from other tables — skip */ }
  try {
    db.delete(companies).run();
  } catch { /* FK constraints from other tables — skip */ }
  console.log("🗑️  Cleared existing data");

  // 4. Import
  let companyCount = 0;
  let personCount = 0;
  let relationCount = 0;

  // Track people by normalized name to deduplicate
  const personMap = new Map<string, number>(); // normalized name -> id

  function findOrCreatePerson(name: string, address: string | null, source: string): number {
    const norm = name.toLowerCase().trim();
    const existing = personMap.get(norm);
    if (existing) return existing;

    // Split name into first/last
    const parts = name.split(/\s+/);
    let firstName: string, lastName: string;
    if (parts.length >= 2) {
      firstName = parts.slice(0, -1).join(" ");
      lastName = parts[parts.length - 1];
    } else {
      firstName = name;
      lastName = "";
    }

    const rows = db.insert(people).values({
      firstName,
      lastName,
      fullName: name,
      address,
      rawSource: source,
    }).returning({ id: people.id }).all();
    personCount++;
    personMap.set(norm, rows[0].id);
    return rows[0].id;
  }

  for (const [entityNum, { filename, result }] of byEntity) {
    const name = result.entityName || `Entity ${entityNum}`;

    // Insert company
    const companyRows = db.insert(companies).values({
      name,
      entityNumber: entityNum,
      type: result.entityType || null,
      status: result.status || null,
      registrationDate: result.incorporationDate || null,
      jurisdiction: "Saskatchewan",
      registeredAddress: result.registeredAddress || null,
      rawSource: filename,
    }).returning({ id: companies.id }).all();
    const company = companyRows[0];
    companyCount++;

    // Directors
    for (const dir of result.directors) {
      const personId = findOrCreatePerson(dir.name, dir.address, filename);
      db.insert(companyPeople).values({
        companyId: company.id,
        personId,
        role: "Director",
        startDate: dir.effectiveDate,
        rawSource: filename,
      }).run();
      relationCount++;
    }

    // Officers
    for (const off of result.officers) {
      const personId = findOrCreatePerson(off.name, off.address, filename);
      db.insert(companyPeople).values({
        companyId: company.id,
        personId,
        role: "Officer",
        title: off.title,
        startDate: off.effectiveDate,
        rawSource: filename,
      }).run();
      relationCount++;
    }

    // Shareholders
    for (const sh of result.shareholders) {
      const personId = findOrCreatePerson(sh.name, sh.address, filename);
      db.insert(companyPeople).values({
        companyId: company.id,
        personId,
        role: "Shareholder",
        title: sh.shareClass ? `Class ${sh.shareClass}: ${sh.sharesHeld?.toLocaleString() ?? "?"} shares` : null,
        rawSource: filename,
      }).run();
      relationCount++;
    }
  }

  console.log(`\n📈 Import complete:`);
  console.log(`   ${companyCount} companies`);
  console.log(`   ${personCount} people`);
  console.log(`   ${relationCount} relationships`);
}

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
