import XLSX from "xlsx";
import path from "path";
import { db, schema } from "@/db";
import { sql } from "drizzle-orm";

function num(v: unknown): number | null {
  if (v == null || v === "" || v === "N/A" || v === "CONDO") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[$,]/g, ""));
  return isNaN(n) ? null : n;
}

function str(v: unknown): string | null {
  if (v == null || v === "" || v === "N/A") return null;
  return String(v).trim();
}

function excelDate(v: unknown): string | null {
  if (v == null || v === "N/A" || v === "CONDO") return null;
  if (typeof v === "number" && v > 30000 && v < 60000) {
    const d = new Date((v - 25569) * 86400000);
    return d.toISOString().split("T")[0];
  }
  return null;
}

function parseRent(v: unknown): { low: number | null; high: number | null } {
  if (v == null || v === "N/A" || v === "") return { low: null, high: null };
  const s = String(v).replace(/\$/g, "").trim();
  const parts = s.split(/\s*-\s*/);
  if (parts.length === 2) {
    return { low: parseFloat(parts[0].replace(/,/g, "")) || null, high: parseFloat(parts[1].replace(/,/g, "")) || null };
  }
  const n = parseFloat(s.replace(/,/g, ""));
  return { low: isNaN(n) ? null : n, high: isNaN(n) ? null : n };
}

export async function seedMulti() {
  console.log("Seeding multifamily buildings...");

  const [{ count }] = db.select({ count: sql<number>`count(*)` }).from(schema.multiBuildings).all();
  if (count > 0) {
    console.log(`  Already have ${count} multi buildings, skipping`);
    return;
  }

  const filePath = path.join(process.env.HOME || "", "Documents/Nova/Multi/Master Multi Inventory.xlsx");
  const wb = XLSX.readFile(filePath);

  // Build rent lookup from East Side Rent (keyed by address)
  const rentMap = new Map<string, Record<string, unknown>>();
  const rentSheet = wb.Sheets["East Side Rent"];
  if (rentSheet) {
    const rentData: unknown[][] = XLSX.utils.sheet_to_json(rentSheet, { header: 1 });
    for (let i = 1; i < rentData.length; i++) {
      const r = rentData[i] as (string | number | null)[];
      if (!r || !r[1]) continue;
      const key = `${r[0]} ${r[1]}`.toLowerCase().trim();
      const oneBed = parseRent(r[8]);
      const twoBed = parseRent(r[9]);
      rentMap.set(key, {
        bachSF: num(r[10]),
        bachRentLow: num(r[12]), bachRentHigh: num(r[13]),
        oneBedSF: num(r[14]),
        oneBedRentLow: oneBed.low || num(r[15]), oneBedRentHigh: oneBed.high || num(r[16]),
        twoBedSF: num(r[18]),
        twoBedRentLow: twoBed.low || num(r[19]), twoBedRentHigh: twoBed.high || num(r[20]),
        threeBedSF: num(r[22]),
        threeBedRentLow: num(r[23]), threeBedRentHigh: num(r[24]),
        rentSource: str(r[26]),
        yearBuilt: num(r[6]),
      });
    }
    console.log(`  Rent data: ${rentMap.size} buildings`);
  }

  let total = 0;
  const regions: [string, string][] = [
    ["East Side Multi Inventory", "East"],
    ["North Side Multi Inventory", "North"],
    ["West Side Multi Inventory", "West"],
  ];

  for (const [sheetName, region] of regions) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const data: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    let regionCount = 0;

    for (let i = 1; i < data.length; i++) {
      const r = data[i] as (string | number | null)[];
      if (!r || !r[2]) continue; // need street name

      const streetNum = str(r[1]);
      const streetName = str(r[2]);
      if (!streetName) continue;
      const address = `${streetNum || ""} ${streetName}`.trim();
      const isCondo = r[9] === "CONDO" || r[6] === "CONDO";

      // Look up rent data
      const rentKey = address.toLowerCase();
      const rent = rentMap.get(rentKey) || {};

      const assessedVal = num(r[8]);
      const titleVal = num(r[11]);
      const titleDate = excelDate(r[12]);
      const contactDate = excelDate(r[20]);

      db.insert(schema.multiBuildings).values({
        streetNumber: streetNum,
        streetName: streetName,
        address,
        city: str(r[3]) || "Saskatoon",
        postal: str(r[4]),
        buildingName: str(r[5]),
        cmhcZone: str(r[0]),
        region,
        units: num(r[6]) as number | null,
        zoning: str(r[7]),
        assessedValue: assessedVal ? Math.round(assessedVal) : null,
        buildingOwner: str(r[9]),
        parcelNumber: str(r[10]),
        titleValue: titleVal ? Math.round(titleVal) : null,
        titleTransferDate: titleDate,
        propertyManager: str(r[13]),
        managerContact: str(r[14]),
        propertyOwner: str(r[15]),
        ownerContact: str(r[16]),
        ownerEmail: str(r[17]),
        contactInfo: r[19] === "Y" ? 1 : 0,
        contactDate,
        comments: str(r[21]),
        isCondo: isCondo ? 1 : 0,
        isSalesComp: r[22] === "Sales Comp" ? 1 : 0,
        // Rent data (if available)
        bachSF: num(rent.bachSF) as number | null,
        bachRentLow: num(rent.bachRentLow) as number | null,
        bachRentHigh: num(rent.bachRentHigh) as number | null,
        oneBedSF: num(rent.oneBedSF) as number | null,
        oneBedRentLow: num(rent.oneBedRentLow) as number | null,
        oneBedRentHigh: num(rent.oneBedRentHigh) as number | null,
        twoBedSF: num(rent.twoBedSF) as number | null,
        twoBedRentLow: num(rent.twoBedRentLow) as number | null,
        twoBedRentHigh: num(rent.twoBedRentHigh) as number | null,
        threeBedSF: num(rent.threeBedSF) as number | null,
        threeBedRentLow: num(rent.threeBedRentLow) as number | null,
        threeBedRentHigh: num(rent.threeBedRentHigh) as number | null,
        rentSource: str(rent.rentSource) as string | null,
      }).run();
      regionCount++;
    }
    console.log(`  ${region}: ${regionCount} buildings`);
    total += regionCount;
  }

  console.log(`  Total: ${total} multifamily buildings`);
}
