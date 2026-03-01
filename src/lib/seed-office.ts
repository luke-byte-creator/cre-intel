import XLSX from "xlsx";
import path from "path";
import { db, schema } from "@/db";
import { sql } from "drizzle-orm";

interface RawBuilding {
  address: string;
  streetNumber: string;
  neighborhood: string;
  buildingName: string;
  buildingClass: string;
  floors: number | null;
  yearBuilt: number | null;
  totalSF: number | null;
  contiguousBlock: number | null;
  directVacantSF: number | null;
  subleaseSF: number | null;
  totalVacantSF: number | null;
  totalAvailableSF: number | null;
  vacancyRate: number | null;
  netAskingRate: number | null;
  opCost: number | null;
  grossRate: number | null;
  listingAgent: string | null;
  parkingType: string | null;
  parkingRatio: string | null;
  owner: string | null;
  parcelNumber: string | null;
  units: RawUnit[];
}

interface RawUnit {
  floor: string;
  areaSF: number | null;
  tenantName: string | null;
  isVacant: boolean;
  listingAgent: string | null;
}

function parseOfficeExcel(filePath: string, source: string): RawBuilding[] {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets["Survey Saskatoon"];
  if (!ws) throw new Error(`No 'Survey Saskatoon' sheet in ${filePath}`);

  const data: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const buildings: RawBuilding[] = [];
  let current: RawBuilding | null = null;

  for (let i = 3; i < data.length; i++) {
    const row = data[i] as (string | number | null)[];
    if (!row || row.length < 2) continue;

    // Building header row: col 1 has address string
    if (row[1] && typeof row[1] === "string" && row[1].length > 3) {
      if (current) buildings.push(current);

      const num = row[2] != null ? String(row[2]).trim() : "";
      current = {
        address: row[1] as string,
        streetNumber: num,
        neighborhood: (row[3] as string) || "CBD",
        buildingName: (row[4] as string) || "",
        buildingClass: (row[5] as string) || "",
        floors: typeof row[6] === "number" ? row[6] : null,
        yearBuilt: typeof row[7] === "number" ? row[7] : null,
        totalSF: typeof row[8] === "number" ? Math.round(row[8]) : null,
        contiguousBlock: typeof row[9] === "number" ? Math.round(row[9]) : null,
        directVacantSF: typeof row[10] === "number" ? Math.round(row[10]) : null,
        subleaseSF: typeof row[11] === "number" ? Math.round(row[11]) : null,
        totalVacantSF: typeof row[12] === "number" ? Math.round(row[12]) : null,
        totalAvailableSF: typeof row[13] === "number" ? Math.round(row[13]) : null,
        vacancyRate: typeof row[15] === "number" ? Math.round(row[15] * 10000) / 100 : null, // to percent
        netAskingRate: typeof row[16] === "number" ? row[16] : null,
        opCost: typeof row[17] === "number" ? row[17] : null,
        grossRate: typeof row[18] === "number" ? row[18] : null,
        listingAgent: typeof row[22] === "string" ? row[22].trim() : null,
        parkingType: typeof row[23] === "string" ? row[23] : null,
        parkingRatio: typeof row[24] === "string" ? String(row[24]) : null,
        owner: typeof row[27] === "string" ? row[27].trim() : null,
        parcelNumber: row[26] != null ? String(row[26]) : null,
        units: [],
      };
    }
    // Unit/tenant row: col 10 has floor/suite
    else if (current && row[10] != null) {
      const floorVal = String(row[10]);
      const vacantSF = typeof row[12] === "number" ? Math.round(row[12]) : null;
      const occupiedSF = typeof row[13] === "number" ? Math.round(row[13]) : null;
      const tenantName = typeof row[14] === "string" ? row[14].trim() : null;
      const isVacant = tenantName === "Vacant" || tenantName === null;
      const agent = typeof row[22] === "string" ? row[22].trim() : null;

      current.units.push({
        floor: floorVal,
        areaSF: vacantSF || occupiedSF || null,
        tenantName: isVacant ? null : tenantName,
        isVacant,
        listingAgent: agent,
      });
    }
  }
  if (current) buildings.push(current);

  console.log(`  Parsed ${buildings.length} buildings, ${buildings.reduce((s, b) => s + b.units.length, 0)} units from ${source}`);
  return buildings;
}

export async function seedOffice() {
  console.log("Seeding office buildings...");

  // Check if already seeded
  const [{ count }] = db.select({ count: sql<number>`count(*)` }).from(schema.officeBuildings).all();
  if (count > 0) {
    console.log(`  Already have ${count} office buildings, skipping`);
    return;
  }

  const dir = path.join(process.env.HOME || "", "Documents/Nova/Office");

  // Parse Q4 2024 (most recent = primary)
  const buildings = parseOfficeExcel(path.join(dir, "CBD Office Inventory Q4 2024 (LJJ).xlsx"), "Q4 2024");

  // Insert buildings and units
  let unitCount = 0;
  for (const b of buildings) {
    const result = db.insert(schema.officeBuildings).values({
      address: b.address,
      streetNumber: b.streetNumber,
      neighborhood: b.neighborhood,
      buildingName: b.buildingName,
      buildingClass: b.buildingClass,
      floors: b.floors,
      yearBuilt: b.yearBuilt,
      totalSF: b.totalSF,
      contiguousBlock: b.contiguousBlock,
      directVacantSF: b.directVacantSF,
      subleaseSF: b.subleaseSF,
      totalVacantSF: b.totalVacantSF,
      totalAvailableSF: b.totalAvailableSF,
      vacancyRate: b.vacancyRate,
      netAskingRate: b.netAskingRate,
      opCost: b.opCost,
      grossRate: b.grossRate,
      listingAgent: b.listingAgent,
      parkingType: b.parkingType,
      parkingRatio: b.parkingRatio,
      owner: b.owner,
      parcelNumber: b.parcelNumber,
      dataSource: "Q4 2024",
    }).run();

    const inserted = db.select({ id: schema.officeBuildings.id }).from(schema.officeBuildings)
      .where(sql`${schema.officeBuildings.address} = ${b.address}`).all();
    const buildingId = inserted[inserted.length - 1].id;

    for (const u of b.units) {
      db.insert(schema.officeUnits).values({
        buildingId,
        floor: u.floor,
        areaSF: u.areaSF,
        tenantName: u.tenantName,
        isVacant: u.isVacant ? 1 : 0,
        listingAgent: u.listingAgent,
      }).run();
      unitCount++;
    }
  }

  console.log(`  Inserted ${buildings.length} buildings, ${unitCount} units`);
}
