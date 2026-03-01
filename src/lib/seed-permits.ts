import { db, schema } from "@/db";
import { parseBuildingPermits, PermitRecord } from "./parsers/building-permits";
import { eq, sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

const PDF_ROOT = "/Users/lukejansen/Documents/Nova/Building Permits/";

function findPdfs(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findPdfs(full));
    } else if (entry.name.toLowerCase().endsWith(".pdf")) {
      results.push(full);
    }
  }
  return results;
}

function normalizeAddress(addr: string): string {
  return addr
    .toLowerCase()
    .replace(/,?\s*saskatoon,?\s*sk\b/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function seedPermits() {
  const pdfs = findPdfs(PDF_ROOT);
  console.log(`Found ${pdfs.length} PDFs`);

  let totalExtracted = 0;
  const allPermits: (PermitRecord & { source: string })[] = [];
  const failed: string[] = [];

  for (const pdfPath of pdfs) {
    try {
      const buf = fs.readFileSync(pdfPath);
      const permits = await parseBuildingPermits(buf, 350_000);
      totalExtracted += permits.length;
      for (const p of permits) {
        allPermits.push({ ...p, source: path.basename(pdfPath) });
      }
    } catch (err) {
      failed.push(pdfPath);
      console.warn(`Failed to parse: ${path.basename(pdfPath)} - ${(err as Error).message}`);
    }
  }

  // Dedup by permitNumber
  const unique = new Map<string, (typeof allPermits)[0]>();
  for (const p of allPermits) {
    if (!unique.has(p.permitNumber)) {
      unique.set(p.permitNumber, p);
    }
  }

  console.log(`Extracted ${totalExtracted} permits, ${unique.size} unique after dedup`);

  // Load existing companies for matching
  const existingCompanies = db.select().from(schema.companies).all();

  // Load existing permits to skip duplicates on re-run
  const existingPermitNumbers = new Set(
    db.select({ pn: schema.permits.permitNumber }).from(schema.permits).all().map(r => r.pn)
  );

  // Property cache: normalized address -> id
  const propertyCache = new Map<string, number>();
  for (const prop of db.select().from(schema.properties).all()) {
    if (prop.address) {
      propertyCache.set(normalizeAddress(prop.address), prop.id);
    }
  }

  let inserted = 0;
  let skipped = 0;
  let propertiesCreated = 0;

  for (const [, permit] of unique) {
    if (existingPermitNumbers.has(permit.permitNumber)) {
      skipped++;
      continue;
    }

    // Find or create property
    let propertyId: number | null = null;
    if (permit.address) {
      const normAddr = normalizeAddress(permit.address);
      if (propertyCache.has(normAddr)) {
        propertyId = propertyCache.get(normAddr)!;
      } else {
        const [newProp] = db.insert(schema.properties).values({
          address: permit.address,
          propertyType: "Commercial",
          city: "Saskatoon",
          province: "Saskatchewan",
        }).returning({ id: schema.properties.id }).all();
        propertyId = newProp.id;
        propertyCache.set(normAddr, propertyId);
        propertiesCreated++;
      }
    }

    // Match company
    let applicantCompanyId: number | null = null;
    if (permit.owner) {
      const ownerLower = permit.owner.toLowerCase();
      const match = existingCompanies.find(c => 
        c.name.toLowerCase() === ownerLower ||
        ownerLower.includes(c.name.toLowerCase()) ||
        c.name.toLowerCase().includes(ownerLower)
      );
      if (match) applicantCompanyId = match.id;
    }

    db.insert(schema.permits).values({
      permitNumber: permit.permitNumber,
      propertyId,
      address: permit.address,
      applicant: permit.owner,
      applicantCompanyId,
      description: permit.scope,
      workType: permit.workType,
      buildingType: "Commercial",
      estimatedValue: permit.value,
      issueDate: permit.issueDate,
      rawSource: permit.source,
    }).run();

    inserted++;
  }

  console.log(`\n=== Permit Seed Summary ===`);
  console.log(`PDFs processed: ${pdfs.length}`);
  console.log(`Parse failures: ${failed.length}`);
  console.log(`Permits extracted: ${totalExtracted}`);
  console.log(`Unique permits: ${unique.size}`);
  console.log(`Skipped (already exist): ${skipped}`);
  console.log(`Inserted: ${inserted}`);
  console.log(`Properties created: ${propertiesCreated}`);
  if (failed.length) {
    console.log(`\nFailed files:`);
    failed.forEach(f => console.log(`  - ${path.basename(f)}`));
  }
}
