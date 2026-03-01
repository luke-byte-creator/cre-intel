import XLSX from "xlsx";
import type { CompRecord } from "./comps-compfolio";

const NA_VALUE = -2146826246;

function mapPPT(desc: string | null | undefined): string | null {
  if (!desc) return null;
  const d = desc.toLowerCase();
  if (/warehouse|industrial|flex|manufactur/.test(d)) return "Industrial";
  if (/office/.test(d)) return "Office";
  if (/retail|store|shopping|commercial/.test(d)) return "Retail";
  if (/multi\s*res|apartment|townhouse|condo/.test(d)) return "Investment";
  if (/land|vacant/.test(d)) return "Land";
  return "Other";
}

function clean(s: unknown): string | null {
  if (s == null || s === NA_VALUE) return null;
  if (typeof s === "number" && s === NA_VALUE) return null;
  const str = String(s).replace(/\r\n|\r|\n/g, " ").trim();
  return str || null;
}

function excelDateToISO(serial: number): string | null {
  if (!serial || serial < 1) return null;
  const d = new Date((serial - 25569) * 86400000);
  return d.toISOString().split("T")[0];
}

function parseDateCell(row: unknown[], dateCol: number): string | null {
  const val = row[dateCol];
  if (val == null || val === NA_VALUE) return null;

  // Excel serial number
  if (typeof val === "number" && val > 32) {
    return excelDateToISO(val);
  }

  // Broken date: small number + adjacent string starting with "/"
  if (typeof val === "number" && val <= 31 && val >= 1) {
    const next = row[dateCol + 1];
    if (typeof next === "string" && next.startsWith("/")) {
      // e.g. 3 + "/18/2024" → "3/18/2024"
      const combined = `${val}${next}`;
      const m = combined.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    }
    return null;
  }

  // String date
  if (typeof val === "string") {
    const m = val.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  return null;
}

function isHeaderRow(row: unknown[]): boolean {
  const vals = row.map(v => (v != null ? String(v) : ""));
  const hasRoll = vals.some(v => v === "Roll" || v === "Roll #" || v === "Roll#");
  const hasAddr = vals.some(v => v.includes("Civic Address") || v.includes("Civic_Address"));
  return hasRoll && hasAddr;
}

function findCol(row: unknown[], ...patterns: string[]): number {
  for (let i = 0; i < row.length; i++) {
    const v = row[i] != null ? String(row[i]) : "";
    for (const p of patterns) {
      if (v.includes(p)) return i;
    }
  }
  return -1;
}

interface Layout {
  roll: number;
  address: number;
  date: number;
  price: number;
  ppt: number;
  desc: number;
  vendor: number;
  purchaser: number;
}

function updateLayout(row: unknown[], prev: Layout): Layout {
  const l = { ...prev };
  const rollC = findCol(row, "Roll");
  if (rollC >= 0) l.roll = rollC;
  const addrC = findCol(row, "Civic Address", "Civic_Address");
  if (addrC >= 0) l.address = addrC;
  const dateC = findCol(row, "Sales Date", "Sales_Date", "Sale Date");
  if (dateC >= 0) l.date = dateC;
  const priceC = findCol(row, "Sales Price", "Sales_Price", "Sale Price");
  if (priceC >= 0) l.price = priceC;
  const pptC = findCol(row, "PPT");
  if (pptC >= 0) l.ppt = pptC;
  const descC = findCol(row, "Descriptor", "PPT_Descriptor");
  if (descC >= 0) l.desc = descC;
  const vendC = findCol(row, "Vendor");
  if (vendC >= 0) l.vendor = vendC;
  const purchC = findCol(row, "Purchaser");
  if (purchC >= 0) l.purchaser = purchC;
  return l;
}

function findRoll(row: unknown[], expected: number): string | null {
  // Check expected position and ±1
  for (const col of [expected, expected - 1, expected + 1]) {
    if (col < 0 || col >= row.length) continue;
    const v = row[col];
    if (v == null || v === NA_VALUE) continue;
    const n = typeof v === "number" ? v : parseInt(String(v));
    if (!isNaN(n) && n > 100000) return String(n);
  }
  return null;
}

function countNonEmpty(row: unknown[]): number {
  let c = 0;
  for (const v of row) {
    if (v != null && v !== "" && v !== NA_VALUE) c++;
  }
  return c;
}

function getPrice(row: unknown[], priceCol: number): number | null {
  // Check priceCol and nearby
  for (const col of [priceCol, priceCol + 1, priceCol - 1, priceCol + 2, priceCol + 3]) {
    if (col < 0 || col >= row.length) continue;
    const v = row[col];
    if (v == null || v === NA_VALUE) continue;
    if (typeof v === "number" && v > 0) return v;
    if (typeof v === "string") {
      const n = parseFloat(v.replace(/[$,]/g, ""));
      if (!isNaN(n) && n > 0) return n;
    }
  }
  return null;
}

function getPPT(row: unknown[], pptCol: number): { code: number | null; desc: string | null } {
  let code: number | null = null;
  let desc: string | null = null;
  for (const col of [pptCol, pptCol - 1, pptCol + 1]) {
    if (col < 0 || col >= row.length) continue;
    const v = row[col];
    if (v == null || v === NA_VALUE) continue;
    if (typeof v === "number" && v > 0 && v < 1000 && code == null) code = v;
  }
  for (const col of [pptCol + 4, pptCol + 3, pptCol + 2, pptCol + 1]) {
    // desc is usually a few cols after ppt
  }
  // Use the desc column directly
  return { code, desc };
}

export function parseTransfer2023(filePath: string): CompRecord[] {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets["Table 1"];
  if (!ws) throw new Error("Sheet 'Table 1' not found");

  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
  const results: CompRecord[] = [];

  let layout: Layout = {
    roll: 2, address: 8, date: 44, price: 51,
    ppt: 59, desc: 63, vendor: 16, purchaser: 29,
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    if (!row) continue;

    const nonEmpty = countNonEmpty(row);
    if (nonEmpty === 0) continue;

    // Header row detection
    if (isHeaderRow(row)) {
      layout = updateLayout(row, layout);
      continue;
    }

    // Try to find roll number
    const roll = findRoll(row, layout.roll);

    if (!roll) {
      // Orphan row — append to last record
      if (results.length > 0 && nonEmpty <= 3) {
        const last = results[results.length - 1];
        const vendorText = clean(row[layout.vendor]);
        const purchText = clean(row[layout.purchaser]);
        if (vendorText) {
          last.seller = last.seller ? `${last.seller} ${vendorText}` : vendorText;
        }
        if (purchText) {
          last.purchaser = last.purchaser ? `${last.purchaser} ${purchText}` : purchText;
        }
      }
      continue;
    }

    const address = clean(row[layout.address]);
    if (!address) continue;

    const isAL = clean(row[0]) === "AL";

    let pptCode: number | null = null;
    const pptVal = row[layout.ppt];
    if (pptVal != null && pptVal !== NA_VALUE && typeof pptVal === "number" && pptVal > 0 && pptVal < 1000) {
      pptCode = pptVal;
    } else {
      // Check nearby
      for (const c of [layout.ppt - 1, layout.ppt + 1]) {
        const v = row[c];
        if (v != null && typeof v === "number" && v > 0 && v < 1000) { pptCode = v; break; }
      }
    }

    let pptDesc = clean(row[layout.desc]);
    if (!pptDesc) {
      for (const c of [layout.desc - 1, layout.desc - 2, layout.desc + 1, layout.desc + 2]) {
        const v = clean(row[c]);
        if (v && v.length > 3 && !/^\d+$/.test(v)) { pptDesc = v; break; }
      }
    }

    results.push({
      type: "Sale",
      propertyType: mapPPT(pptDesc),
      investmentType: null,
      leaseType: null,
      propertyName: null,
      address,
      unit: null,
      city: "Saskatoon",
      province: "Saskatchewan",
      portfolio: null,
      seller: clean(row[layout.vendor]),
      purchaser: clean(row[layout.purchaser]),
      landlord: null,
      tenant: null,
      saleDate: parseDateCell(row, layout.date),
      salePrice: getPrice(row, layout.price),
      pricePSF: null,
      pricePerAcre: null,
      isRenewal: null,
      leaseStart: null,
      leaseExpiry: null,
      termMonths: null,
      netRentPSF: null,
      annualRent: null,
      rentSteps: null,
      areaSF: null,
      officeSF: null,
      ceilingHeight: null,
      loadingDocks: null,
      driveInDoors: null,
      landAcres: null,
      landSF: null,
      yearBuilt: null,
      zoning: null,
      noi: null,
      capRate: null,
      stabilizedNOI: null,
      stabilizedCapRate: null,
      vacancyRate: null,
      pricePerUnit: null,
      opexRatio: null,
      numUnits: null,
      numBuildings: null,
      numStories: null,
      constructionClass: null,
      retailSalesPerAnnum: null,
      retailSalesPSF: null,
      operatingCost: null,
      improvementAllowance: null,
      freeRentPeriod: null,
      fixturingPeriod: null,
      comments: null,
      source: "transfer-2023-2025",
      rollNumber: roll,
      pptCode,
      pptDescriptor: pptDesc,
      armsLength: isAL || null,
    });
  }

  return results;
}
