import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { parseCorporateRegistry } from "@/lib/parsers/corporate-registry";
import { parseBuildingPermits } from "@/lib/parsers/building-permits";
import { parseTransferList } from "@/lib/parsers/transfer-list";
import {
  matchCompany,
  matchPerson,
  matchAddress,
} from "@/lib/parsers/entity-matcher";

export const dynamic = "force-dynamic";

type FileType = "corporate_registry" | "building_permit" | "transfer_list" | "unknown";

function detectFileType(filename: string, ext: string): FileType {
  const lower = filename.toLowerCase();
  if (ext === "xlsx" || ext === "xls" || ext === "csv") {
    if (lower.includes("transfer")) return "transfer_list";
    return "transfer_list"; // default for spreadsheets
  }
  if (ext === "pdf") {
    if (lower.includes("permit")) return "building_permit";
    if (lower.includes("corporate") || lower.includes("registry")) return "corporate_registry";
  }
  return "unknown";
}

interface ImportResult {
  success: boolean;
  fileType: FileType;
  filename: string;
  stats: {
    companiesFound: number;
    companiesCreated: number;
    companiesMatched: number;
    peopleFound: number;
    peopleCreated: number;
    peopleMatched: number;
    propertiesFound: number;
    propertiesCreated: number;
    propertiesMatched: number;
    transactionsCreated: number;
    permitsCreated: number;
  };
  warnings: string[];
  matches: { source: string; matched: string; score: number; type: string }[];
}

async function getExistingCompanies() {
  return db.select({ id: schema.companies.id, name: schema.companies.name }).from(schema.companies).all();
}

async function getExistingPeople() {
  return db.select({ id: schema.people.id, name: schema.people.fullName }).from(schema.people).all();
}

async function getExistingProperties() {
  return db.select({ id: schema.properties.id, address: schema.properties.address }).from(schema.properties).all();
}

async function findOrCreateCompany(
  name: string,
  existing: { id: number; name: string }[],
  stats: ImportResult["stats"],
  matches: ImportResult["matches"],
  extra: Partial<typeof schema.companies.$inferInsert> = {}
): Promise<number> {
  // Try fuzzy match
  const matched = matchCompany(name, existing, 0.80);
  if (matched.length > 0 && matched[0].id) {
    stats.companiesMatched++;
    matches.push({ source: name, matched: matched[0].name, score: matched[0].score, type: "company" });
    return matched[0].id;
  }

  // Create new
  const result = db
    .insert(schema.companies)
    .values({ name, ...extra })
    .returning({ id: schema.companies.id })
    .get();
  stats.companiesCreated++;
  existing.push({ id: result.id, name });
  return result.id;
}

async function findOrCreatePerson(
  fullName: string,
  existing: { id: number; name: string }[],
  stats: ImportResult["stats"],
  matches: ImportResult["matches"],
  extra: Partial<typeof schema.people.$inferInsert> = {}
): Promise<number> {
  const matched = matchPerson(fullName, existing, 0.85);
  if (matched.length > 0 && matched[0].id) {
    stats.peopleMatched++;
    matches.push({ source: fullName, matched: matched[0].name, score: matched[0].score, type: "person" });
    return matched[0].id;
  }

  const parts = fullName.trim().split(/\s+/);
  const firstName = parts[0] || "";
  const lastName = parts.slice(1).join(" ") || "";

  const result = db
    .insert(schema.people)
    .values({ firstName, lastName, fullName, ...extra })
    .returning({ id: schema.people.id })
    .get();
  stats.peopleCreated++;
  existing.push({ id: result.id, name: fullName });
  return result.id;
}

async function findOrCreateProperty(
  address: string,
  existing: { id: number; address: string | null }[],
  stats: ImportResult["stats"],
  matches: ImportResult["matches"],
  extra: Partial<typeof schema.properties.$inferInsert> = {}
): Promise<number> {
  const validCandidates = existing.filter((e): e is { id: number; address: string } => !!e.address);
  const matched = matchAddress(address, validCandidates, 0.75);
  if (matched.length > 0 && matched[0].id) {
    stats.propertiesMatched++;
    matches.push({ source: address, matched: matched[0].address, score: matched[0].score, type: "property" });
    return matched[0].id;
  }

  const { normalizeAddress, normalizeCity, displayAddress } = await import("@/lib/address");
  const normAddr = normalizeAddress(address);
  const cleanAddr = normAddr ? displayAddress(normAddr) || address : address;
  const result = db
    .insert(schema.properties)
    .values({ address: cleanAddr, city: "Saskatoon", province: "SK", addressNormalized: normAddr, cityNormalized: normalizeCity("Saskatoon"), ...extra })
    .returning({ id: schema.properties.id })
    .get();
  stats.propertiesCreated++;
  existing.push({ id: result.id, address });
  return result.id;
}

function isCompanyName(name: string): boolean {
  const lower = name.toLowerCase();
  return /\b(inc|ltd|corp|co|llc|llp|lp|group|properties|investments|construction|development|holdings|realty|trust|association|enterprises?)\b/i.test(lower)
    || /^\d{6,}/.test(name);
}

async function importCorporateRegistry(buffer: Uint8Array, filename: string): Promise<ImportResult> {
  const data = await parseCorporateRegistry(Buffer.from(buffer));
  const stats: ImportResult["stats"] = {
    companiesFound: 1, companiesCreated: 0, companiesMatched: 0,
    peopleFound: 0, peopleCreated: 0, peopleMatched: 0,
    propertiesFound: 0, propertiesCreated: 0, propertiesMatched: 0,
    transactionsCreated: 0, permitsCreated: 0,
  };
  const matchResults: ImportResult["matches"] = [];
  const warnings: string[] = [];

  if (!data.entityName) {
    return { success: false, fileType: "corporate_registry", filename, stats, warnings: ["Could not extract entity name from PDF"], matches: [] };
  }

  const existingCompanies = await getExistingCompanies();
  const existingPeople = await getExistingPeople();

  // Create/match company
  const companyId = await findOrCreateCompany(data.entityName, existingCompanies, stats, matchResults, {
    entityNumber: data.entityNumber,
    type: data.entityType,
    status: data.status,
    registrationDate: data.incorporationDate,
    jurisdiction: data.entitySubtype,
    registeredAddress: data.registeredAddress,
    rawSource: filename,
  });

  // Process directors, officers, shareholders
  const allPeople = [
    ...data.directors.map((d) => ({ ...d, role: "Director" as const })),
    ...data.officers.map((o) => ({ ...o, role: "Officer" as const })),
  ];
  stats.peopleFound = allPeople.length + data.shareholders.length;

  for (const person of allPeople) {
    const personId = await findOrCreatePerson(person.name, existingPeople, stats, matchResults, {
      address: person.address,
      rawSource: filename,
    });

    // Create company-person relationship
    db.insert(schema.companyPeople).values({
      companyId,
      personId,
      role: person.role,
      title: person.title,
      startDate: person.effectiveDate,
      rawSource: filename,
    }).run();
  }

  for (const sh of data.shareholders) {
    const personId = await findOrCreatePerson(sh.name, existingPeople, stats, matchResults, {
      address: sh.address,
      rawSource: filename,
    });
    db.insert(schema.companyPeople).values({
      companyId,
      personId,
      role: "Shareholder",
      rawSource: filename,
    }).run();
  }

  return { success: true, fileType: "corporate_registry", filename, stats, warnings, matches: matchResults };
}

async function importBuildingPermits(buffer: Uint8Array, filename: string): Promise<ImportResult> {
  const permits = await parseBuildingPermits(Buffer.from(buffer));
  const stats: ImportResult["stats"] = {
    companiesFound: 0, companiesCreated: 0, companiesMatched: 0,
    peopleFound: 0, peopleCreated: 0, peopleMatched: 0,
    propertiesFound: 0, propertiesCreated: 0, propertiesMatched: 0,
    transactionsCreated: 0, permitsCreated: 0,
  };
  const matchResults: ImportResult["matches"] = [];
  const warnings: string[] = [];

  if (permits.length === 0) {
    warnings.push("No commercial permits >= $350,000 found in PDF");
  }

  const existingCompanies = await getExistingCompanies();
  const existingProperties = await getExistingProperties();

  for (const permit of permits) {
    let propertyId: number | null = null;
    if (permit.address) {
      stats.propertiesFound++;
      propertyId = await findOrCreateProperty(permit.address, existingProperties, stats, matchResults);
    }

    let applicantCompanyId: number | null = null;
    if (permit.owner) {
      stats.companiesFound++;
      applicantCompanyId = await findOrCreateCompany(permit.owner, existingCompanies, stats, matchResults);
    }

    const { normalizeAddress: normAddr2, displayAddress: dispAddr2 } = await import("@/lib/address");
    const permitNorm = normAddr2(permit.address);
    const permitDisplay = permitNorm ? dispAddr2(permitNorm) || permit.address : permit.address;
    db.insert(schema.permits).values({
      permitNumber: permit.permitNumber,
      propertyId,
      address: permitDisplay,
      addressNormalized: permitNorm,
      applicant: permit.owner,
      applicantCompanyId,
      description: permit.scope,
      workType: permit.workType,
      buildingType: permit.buildingType,
      estimatedValue: permit.value,
      issueDate: permit.issueDate,
      rawSource: filename,
    }).run();
    stats.permitsCreated++;
  }

  return { success: true, fileType: "building_permit", filename, stats, warnings, matches: matchResults };
}

async function importTransferList(buffer: Buffer | Uint8Array, filename: string): Promise<ImportResult> {
  const records = parseTransferList(buffer);
  const stats: ImportResult["stats"] = {
    companiesFound: 0, companiesCreated: 0, companiesMatched: 0,
    peopleFound: 0, peopleCreated: 0, peopleMatched: 0,
    propertiesFound: 0, propertiesCreated: 0, propertiesMatched: 0,
    transactionsCreated: 0, permitsCreated: 0,
  };
  const matchResults: ImportResult["matches"] = [];
  const warnings: string[] = [];

  if (records.length === 0) {
    warnings.push("No transfer records found in spreadsheet");
  }

  const existingCompanies = await getExistingCompanies();
  const existingPeople = await getExistingPeople();
  const existingProperties = await getExistingProperties();

  for (const rec of records) {
    // Property
    let propertyId: number | null = null;
    if (rec.address) {
      stats.propertiesFound++;
      propertyId = await findOrCreateProperty(rec.address, existingProperties, stats, matchResults, {
        propertyType: rec.propertyType,
        parcelId: rec.rollNumber,
      });
    }

    // Vendor - could be company or person
    let grantorCompanyId: number | null = null;
    let grantorPersonId: number | null = null;
    if (rec.vendor) {
      if (isCompanyName(rec.vendor)) {
        stats.companiesFound++;
        grantorCompanyId = await findOrCreateCompany(rec.vendor, existingCompanies, stats, matchResults);
      } else {
        stats.peopleFound++;
        grantorPersonId = await findOrCreatePerson(rec.vendor, existingPeople, stats, matchResults);
      }
    }

    // Purchaser
    let granteeCompanyId: number | null = null;
    let granteePersonId: number | null = null;
    if (rec.purchaser) {
      if (isCompanyName(rec.purchaser)) {
        stats.companiesFound++;
        granteeCompanyId = await findOrCreateCompany(rec.purchaser, existingCompanies, stats, matchResults);
      } else {
        stats.peopleFound++;
        granteePersonId = await findOrCreatePerson(rec.purchaser, existingPeople, stats, matchResults);
      }
    }

    db.insert(schema.transactions).values({
      propertyId,
      transferDate: rec.salesDate,
      transactionType: "Sale",
      price: rec.salesPrice,
      grantor: rec.vendor,
      grantee: rec.purchaser,
      grantorCompanyId,
      granteeCompanyId,
      grantorPersonId,
      granteePersonId,
      rawSource: filename,
    }).run();
    stats.transactionsCreated++;
  }

  return { success: true, fileType: "transfer_list", filename, stats, warnings, matches: matchResults };
}

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const ALLOWED_EXTENSIONS = ["pdf", "xlsx", "xls", "csv"];

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    // File size limit
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large. Maximum size is 20 MB." }, { status: 400 });
    }

    // Extension whitelist
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json({ error: "Unsupported file type. Allowed: PDF, XLSX, XLS, CSV." }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = new Uint8Array(bytes);
    const fileType = detectFileType(file.name, ext);

    let result: ImportResult;

    switch (fileType) {
      case "corporate_registry":
        result = await importCorporateRegistry(buffer, file.name);
        break;
      case "building_permit":
        result = await importBuildingPermits(buffer, file.name);
        break;
      case "transfer_list":
        result = await importTransferList(Buffer.from(buffer), file.name);
        break;
      default:
        return NextResponse.json({
          success: false,
          error: "Unsupported file type. Upload PDF (corporate registry or building permits) or Excel (transfer list).",
        }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json({
      success: false,
      error: "Import failed. Please check the file format and try again.",
    }, { status: 500 });
  }
}
