/**
 * Re-import all corporate registry PDFs using the v2 parser.
 */

import { readdirSync } from "fs";
import { join } from "path";
import Database from "better-sqlite3";
import { parseCorporateRegistryFromFile } from "../src/lib/parsers/corporate-registry-v2";

const PDF_DIR = "/Users/lukejansen/Documents/Nova/Corporate Registries";
const DB_PATH = join(__dirname, "..", "data", "cre-intel.db");

async function main() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = OFF"); // disable during bulk import

  // Wipe existing data
  db.exec("DELETE FROM company_people");
  db.exec("DELETE FROM people");
  db.exec("DELETE FROM companies");
  console.log("Cleared existing data.");

  const files = readdirSync(PDF_DIR).filter((f) => f.toLowerCase().endsWith(".pdf"));
  console.log(`Found ${files.length} PDFs to process.`);

  // Prepare statements
  const insertCompany = db.prepare(`
    INSERT INTO companies (name, entity_number, type, status, registration_date, jurisdiction, registered_agent, registered_address, raw_source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);

  const insertPerson = db.prepare(`
    INSERT INTO people (first_name, last_name, full_name, address, raw_source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);

  const insertRelation = db.prepare(`
    INSERT INTO company_people (company_id, person_id, role, title, start_date, raw_source)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  // Dedup maps
  const companyMap = new Map<string, number>(); // entity_number -> id
  const personMap = new Map<string, number>(); // "fullName|address" -> id

  let totalCompanies = 0;
  let totalPeople = 0;
  let totalRelations = 0;
  const failures: { file: string; error: string }[] = [];

  function splitName(fullName: string): { first: string; last: string } {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length <= 1) return { first: fullName, last: fullName };
    const last = parts[parts.length - 1];
    const first = parts.slice(0, -1).join(" ");
    return { first, last };
  }

  function getOrCreatePerson(fullName: string, address: string | null, rawSource: string): number {
    const key = fullName.toLowerCase();
    const existing = personMap.get(key);
    if (existing) return existing;

    const { first, last } = splitName(fullName);
    const result = insertPerson.run(first, last, fullName, address, rawSource);
    const id = Number(result.lastInsertRowid);
    personMap.set(key, id);
    totalPeople++;
    return id;
  }

  const importAll = db.transaction(() => {
    for (const file of files) {
      try {
        const filePath = join(PDF_DIR, file);
        // parseCorporateRegistryFromFile returns a promise but pdftotext is sync underneath
        // We'll use the sync approach directly
        const { execSync } = require("child_process");
        const text = execSync(`/opt/homebrew/bin/pdftotext "${filePath}" -`, {
          maxBuffer: 10 * 1024 * 1024,
        }).toString("utf-8");

        // We need to call the parser - but it's async. Let's just import synchronously.
        // Actually, parseCorporateRegistry is async only by signature. The work is sync.
        // Let's just duplicate the minimal parsing inline... No, let's restructure.
        // We'll collect promises and run outside transaction.
        // Actually easier: just make a sync version.
        throw new Error("RESTRUCTURE_NEEDED");
      } catch {
        // Will restructure below
        break;
      }
    }
  });

  // Actually, since pdftotext is sync, let's make the parser sync and call directly.
  // Re-approach: parse all files first, then insert in transaction.

  interface ParsedFile {
    file: string;
    data: Awaited<ReturnType<typeof parseCorporateRegistryFromFile>>;
  }

  const parsed: ParsedFile[] = [];

  for (const file of files) {
    try {
      const filePath = join(PDF_DIR, file);
      const data = await parseCorporateRegistryFromFile(filePath);
      parsed.push({ file, data });
    } catch (err: any) {
      failures.push({ file, error: err.message || String(err) });
    }
  }

  console.log(`Parsed ${parsed.length} PDFs successfully, ${failures.length} failures.`);

  // Insert in transaction
  const doInsert = db.transaction(() => {
    for (const { file, data } of parsed) {
      // Company
      let companyId: number;
      const entityNum = data.entityNumber || file;

      if (companyMap.has(entityNum)) {
        companyId = companyMap.get(entityNum)!;
      } else {
        const r = insertCompany.run(
          data.entityName || file,
          data.entityNumber,
          data.entityType || null,
          data.status || null,
          data.incorporationDate || null,
          "Saskatchewan",
          null, // registered_agent
          data.registeredAddress || null,
          file
        );
        companyId = Number(r.lastInsertRowid);
        companyMap.set(entityNum, companyId);
        totalCompanies++;
      }

      // Directors
      for (const d of data.directors) {
        const personId = getOrCreatePerson(d.name, d.address, file);
        insertRelation.run(companyId, personId, "Director", d.title, d.effectiveDate, file);
        totalRelations++;
      }

      // Officers
      for (const o of data.officers) {
        const personId = getOrCreatePerson(o.name, o.address, file);
        insertRelation.run(companyId, personId, "Officer", o.title, o.effectiveDate, file);
        totalRelations++;
      }

      // Shareholders
      for (const s of data.shareholders) {
        const personId = getOrCreatePerson(s.name, s.address, file);
        const shareInfo = [s.shareClass, s.sharesHeld != null ? `${s.sharesHeld} shares` : null].filter(Boolean).join(" - ");
        insertRelation.run(companyId, personId, "Shareholder", shareInfo || null, null, file);
        totalRelations++;
      }
    }
  });

  doInsert();

  console.log("\n=== Import Complete ===");
  console.log(`PDFs processed: ${parsed.length}`);
  console.log(`Companies created: ${totalCompanies}`);
  console.log(`People created: ${totalPeople}`);
  console.log(`Relationships created: ${totalRelations}`);

  if (failures.length > 0) {
    console.log(`\nFailures (${failures.length}):`);
    for (const f of failures) {
      console.log(`  ${f.file}: ${f.error}`);
    }
  }

  // Verification queries
  console.log("\n=== Verification ===");
  const counts = [
    db.prepare("SELECT COUNT(*) as c FROM companies").get() as any,
    db.prepare("SELECT COUNT(*) as c FROM people").get() as any,
    db.prepare("SELECT COUNT(*) as c FROM company_people").get() as any,
  ];
  console.log(`Companies: ${counts[0].c}`);
  console.log(`People: ${counts[1].c}`);
  console.log(`Relationships: ${counts[2].c}`);

  console.log("\nSample companies:");
  const sampleCompanies = db.prepare("SELECT name FROM companies ORDER BY RANDOM() LIMIT 20").all() as any[];
  for (const c of sampleCompanies) console.log(`  ${c.name}`);

  console.log("\nSample people:");
  const samplePeople = db.prepare("SELECT full_name FROM people ORDER BY RANDOM() LIMIT 20").all() as any[];
  for (const p of samplePeople) console.log(`  ${p.full_name}`);

  console.log("\nPeople without spaces (should be zero):");
  const noSpace = db.prepare("SELECT full_name FROM people WHERE full_name NOT LIKE '% %' LIMIT 10").all() as any[];
  for (const p of noSpace) console.log(`  ${p.full_name}`);
  console.log(`  Count: ${noSpace.length}`);

  console.log("\nCompanies with double spaces (should be zero):");
  const doubleSpace = db.prepare("SELECT name FROM companies WHERE name LIKE '%  %' LIMIT 10").all() as any[];
  for (const c of doubleSpace) console.log(`  ${c.name}`);
  console.log(`  Count: ${doubleSpace.length}`);

  db.close();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
