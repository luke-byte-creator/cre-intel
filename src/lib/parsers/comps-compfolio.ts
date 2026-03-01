import fs from "fs";

const MONTHS: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04",
  may: "05", june: "06", july: "07", august: "08",
  september: "09", october: "10", november: "11", december: "12",
};

export function parseMoneyText(s: string | undefined | null): number | null {
  if (!s || !s.trim()) return null;
  const n = parseFloat(s.replace(/[$,]/g, ""));
  return isNaN(n) ? null : n;
}

export function parsePercentText(s: string | undefined | null): number | null {
  if (!s || !s.trim()) return null;
  const n = parseFloat(s.replace(/%/g, ""));
  return isNaN(n) ? null : n;
}

export function parseDateText(s: string | undefined | null): string | null {
  if (!s || !s.trim()) return null;
  // "September 4, 2025" → "2025-09-04"
  const m = s.trim().match(/^(\w+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (!m) return null;
  const mo = MONTHS[m[1].toLowerCase()];
  if (!mo) return null;
  return `${m[3]}-${mo}-${m[2].padStart(2, "0")}`;
}

export function parseNumberText(s: string | undefined | null): number | null {
  if (!s || !s.trim()) return null;
  const n = parseFloat(s.replace(/[,$]/g, ""));
  return isNaN(n) ? null : n;
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuote = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') { inQuote = true; }
      else if (ch === ',') { row.push(field); field = ""; }
      else if (ch === '\n') { row.push(field); field = ""; rows.push(row); row = []; }
      else if (ch === '\r') { /* skip */ }
      else { field += ch; }
    }
  }
  if (field || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

export interface CompRecord {
  type: string;
  propertyType: string | null;
  investmentType: string | null;
  leaseType: string | null;
  propertyName: string | null;
  address: string;
  unit: string | null;
  city: string | null;
  province: string | null;
  portfolio: string | null;
  seller: string | null;
  purchaser: string | null;
  landlord: string | null;
  tenant: string | null;
  saleDate: string | null;
  salePrice: number | null;
  pricePSF: number | null;
  pricePerAcre: number | null;
  isRenewal: boolean | null;
  leaseStart: string | null;
  leaseExpiry: string | null;
  termMonths: number | null;
  netRentPSF: number | null;
  annualRent: number | null;
  rentSteps: string | null;
  areaSF: number | null;
  officeSF: number | null;
  ceilingHeight: number | null;
  loadingDocks: number | null;
  driveInDoors: number | null;
  landAcres: number | null;
  landSF: number | null;
  yearBuilt: number | null;
  zoning: string | null;
  noi: number | null;
  capRate: number | null;
  stabilizedNOI: number | null;
  stabilizedCapRate: number | null;
  vacancyRate: number | null;
  pricePerUnit: number | null;
  opexRatio: number | null;
  numUnits: number | null;
  numBuildings: number | null;
  numStories: number | null;
  constructionClass: string | null;
  retailSalesPerAnnum: number | null;
  retailSalesPSF: number | null;
  operatingCost: number | null;
  improvementAllowance: string | null;
  freeRentPeriod: string | null;
  fixturingPeriod: string | null;
  comments: string | null;
  source: string;
  rollNumber: string | null;
  pptCode: number | null;
  pptDescriptor: string | null;
  armsLength: boolean | null;
}

export function parseCompfolio(filePath: string): CompRecord[] {
  const text = fs.readFileSync(filePath, "utf-8");
  const rows = parseCSV(text);
  if (rows.length < 2) return [];

  const headers = rows[0];
  const col = (name: string) => headers.indexOf(name);

  const results: CompRecord[] = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 5) continue;

    const g = (name: string) => { const idx = col(name); return idx >= 0 ? (r[idx] || "").trim() : ""; };
    const type = g("Sale/Lease");
    if (!type) continue;
    const address = g("Address");
    if (!address) continue;

    // Rent steps
    const steps: { rate: number | null; annual: number | null; date: string | null }[] = [];
    for (let s = 1; s <= 9; s++) {
      const rate = parseNumberText(g(`Rent Step ${s}`));
      const annual = parseMoneyText(g(`Rent Step ${s} (Annual)`));
      const date = parseDateText(g(`Rent Step Date ${s}`));
      if (rate != null || annual != null || date != null) {
        steps.push({ rate, annual, date });
      }
    }

    results.push({
      type,
      propertyType: g("Property Type") || null,
      investmentType: g("Investment Type") || null,
      leaseType: g("Lease Type") || null,
      propertyName: g("Property Name") || null,
      address,
      unit: g("Unit/Suite/Bay/Floor(s)") || null,
      city: g("City") || null,
      province: g("State/Province") || null,
      portfolio: g("Portfolio") || null,
      seller: g("Seller") || null,
      purchaser: g("Purchaser") || null,
      landlord: g("Landlord") || null,
      tenant: g("Tenant") || null,
      saleDate: parseDateText(g("Sale/Lease Date")),
      salePrice: parseMoneyText(g("Sale Price")),
      pricePSF: parseMoneyText(g("Price / SF")),
      pricePerAcre: parseMoneyText(g("Price / Acre")),
      isRenewal: g("Renewal") ? true : null,
      leaseStart: parseDateText(g("Lease Start")),
      leaseExpiry: parseDateText(g("Lease Expiry")),
      termMonths: parseNumberText(g("Lease Term (months)")) as number | null,
      netRentPSF: parseMoneyText(g("Net Rent (/SF/yr)")),
      annualRent: parseMoneyText(g("Annual Rent")),
      rentSteps: steps.length > 0 ? JSON.stringify(steps) : null,
      areaSF: parseNumberText(g("Building/Leasable Area (SF)")),
      officeSF: parseNumberText(g("Office Area (SF)")),
      ceilingHeight: parseNumberText(g("Ceiling Height (ft)")),
      loadingDocks: parseNumberText(g("Loading Docks")) as number | null,
      driveInDoors: parseNumberText(g("Drive-In Doors")) as number | null,
      landAcres: parseNumberText(g("Land Size (Acres)")),
      landSF: parseNumberText(g("Land Size (SF)")),
      yearBuilt: parseNumberText(g("Year Built")) as number | null,
      zoning: g("Zoning") || null,
      noi: parseMoneyText(g("NOI")),
      capRate: parsePercentText(g("Cap Rate")),
      stabilizedNOI: parseMoneyText(g("Stabilized NOI")),
      stabilizedCapRate: parsePercentText(g("Stabilized Cap Rate")),
      vacancyRate: parsePercentText(g("Vacancy Rate")),
      pricePerUnit: parseMoneyText(g("Price Per Unit")),
      opexRatio: parsePercentText(g("Operating Expense Ratio")),
      numUnits: parseNumberText(g("# of Units")) as number | null,
      numBuildings: parseNumberText(g("# of Buildings")) as number | null,
      numStories: parseNumberText(g("# of Stories")) as number | null,
      constructionClass: g("Construction Class") || null,
      retailSalesPerAnnum: parseMoneyText(g("Retail Sales / Annum")),
      retailSalesPSF: parseMoneyText(g("Retail Sales / SF")),
      operatingCost: parseMoneyText(g("Operating Cost")),
      improvementAllowance: g("Improvement Allowance") || null,
      freeRentPeriod: g("Free Rent Period") || null,
      fixturingPeriod: g("Fixturing Period") || null,
      comments: g("Comments") || null,
      source: "compfolio",
      rollNumber: null,
      pptCode: null,
      pptDescriptor: null,
      armsLength: null,
    });
  }

  return results;
}
