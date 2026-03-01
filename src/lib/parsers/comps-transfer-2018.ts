import XLSX from "xlsx";
import type { CompRecord } from "./comps-compfolio";

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

function excelDateToISO(serial: number): string | null {
  if (!serial || serial < 1) return null;
  const d = new Date((serial - 25569) * 86400000);
  return d.toISOString().split("T")[0];
}

function clean(s: unknown): string | null {
  if (s == null) return null;
  const str = String(s).replace(/\r\n|\r|\n/g, " ").trim();
  return str || null;
}

export function parseTransfer2018(filePath: string): CompRecord[] {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets["Sales"];
  if (!ws) throw new Error("Sheet 'Sales' not found");

  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
  const results: CompRecord[] = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] as unknown[];
    if (!r || r.length < 2) continue;

    const roll = clean(r[0]);
    const address = clean(r[1]);
    if (!address) continue;

    const price = typeof r[5] === "number" ? r[5] : null;
    const dateVal = typeof r[4] === "number" ? r[4] : null;

    results.push({
      type: "Sale",
      propertyType: mapPPT(clean(r[7])),
      investmentType: null,
      leaseType: null,
      propertyName: null,
      address,
      unit: null,
      city: "Saskatoon",
      province: "Saskatchewan",
      portfolio: null,
      seller: clean(r[2]),
      purchaser: clean(r[3]),
      landlord: null,
      tenant: null,
      saleDate: dateVal ? excelDateToISO(dateVal) : null,
      salePrice: price,
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
      source: "transfer-2018-2022",
      rollNumber: roll,
      pptCode: typeof r[6] === "number" ? r[6] : null,
      pptDescriptor: clean(r[7]),
      armsLength: null,
    });
  }

  return results;
}
