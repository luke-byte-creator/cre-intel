import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";

const OCCUPIER_INDUSTRIES = [
  "Accommodation, Tourism & Leisure", "Aerospace & Defense", "Agriculture, Forestry, Fishing & Hunting",
  "Arts and Culture", "Automotive", "Building Materials & Construction, Architects & Engineers",
  "Business Services – Administration, Employment Services", "Business Services – Repairs, Maintenance, Waste Removal",
  "Business Services – Accounting, Marketing and Consulting", "E-Commerce", "Education",
  "FIRE (Finance, Insurance & Real Estate)", "Food & Beverage Processing", "Government",
  "Healthcare & Social Assistance", "Legal", "Life Sciences/Scientific & Technical", "Lobbyist",
  "Machinery, Automation & Appliances", "Materials Manufacturing", "Metals Manufacturing", "Mining",
  "Oil & Gas", "Other Services", "Paper, Pulp, Packaging & Printing", "Power & Utilities",
  "Religious & Non-Profits", "Retail", "Technology", "Telecommunications",
  "Transportation/Distribution/Logistics", "Warehousing/Storage", "Wholesale Trade",
];

function addOccupierIndustrySheet(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet("Occupier Industry");
  ws.getCell("A1").value = "OCCUPIER (TENANT) INDUSTRY)";
  ws.getCell("B1").value = "OCCUPIER (TENANT) INDUSTRY)";
  ws.getCell("A1").font = { bold: true };
  ws.getCell("B1").font = { bold: true };
  OCCUPIER_INDUSTRIES.forEach((ind, i) => {
    ws.getCell(`B${i + 2}`).value = ind;
  });
  ws.getColumn(2).width = 55;
}

const headerFont: Partial<ExcelJS.Font> = { bold: true, size: 10, name: "Arial" };
const dataFont: Partial<ExcelJS.Font> = { size: 10, name: "Arial" };
const headerFill: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };
const sectionFill: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2EFDA" } };
const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" },
};

// Track merged ranges to avoid double-merging
const mergedRanges = new Set<string>();

function safeMerge(ws: ExcelJS.Worksheet, r1: number, c1: number, r2: number, c2: number) {
  const key = `${r1}:${c1}:${r2}:${c2}`;
  if (mergedRanges.has(key)) return;
  // Check if any cell in the range is already part of a merge
  try {
    safeMerge(ws, r1, c1, r2, c2);
    mergedRanges.add(key);
  } catch {
    // Already merged — skip silently
  }
}

function setCell(ws: ExcelJS.Worksheet, row: number, col: number, value: string | number | null | undefined, opts?: { font?: Partial<ExcelJS.Font>; fill?: ExcelJS.FillPattern; bold?: boolean }) {
  const cell = ws.getCell(row, col);
  cell.value = value ?? "";
  cell.font = opts?.font || (opts?.bold ? { ...dataFont, bold: true } : dataFont);
  if (opts?.fill) cell.fill = opts.fill;
  cell.border = thinBorder;
}

function setMergedLabel(ws: ExcelJS.Worksheet, row: number, colStart: number, colEnd: number, value: string, fill?: ExcelJS.FillPattern) {
  safeMerge(ws, row, colStart, row, colEnd);
  const cell = ws.getCell(row, colStart);
  cell.value = value;
  cell.font = headerFont;
  if (fill) cell.fill = fill;
  cell.border = thinBorder;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function generateLeaseWorkbook(data: any, commission: any): ExcelJS.Workbook {
  mergedRanges.clear();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("LEASE TR");

  // Set column widths
  [15, 12, 12, 15, 12, 15, 10, 15, 12, 12, 12].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  // Row 1: Title
  setMergedLabel(ws, 1, 1, 7, "LEASE AND LEASE RENEWAL TRADE RECORD:", headerFill);

  // Row 2: Asset/Property Manager
  setMergedLabel(ws, 2, 6, 7, "ASSET/PROPERTY MANAGER:   ");
  safeMerge(ws, 2, 8, 2, 11);
  setCell(ws, 2, 8, data.assetPropertyManager || "");

  // Row 3-5: Beneficial Owner
  setMergedLabel(ws, 3, 6, 7, "BENEFICIAL OWNER                         (up to three):");
  safeMerge(ws, 3, 8, 3, 11);
  setCell(ws, 3, 8, data.beneficialOwner || "");

  // Row 3: Deal type checkmarks
  setCell(ws, 3, 1, data.dealType === "New" ? "NEW ✓" : "NEW", { bold: data.dealType === "New" });
  safeMerge(ws, 3, 2, 3, 3); setCell(ws, 3, 2, "RENEWAL" + (data.dealType === "Renewal" ? " ✓" : ""));
  safeMerge(ws, 3, 4, 3, 5); setCell(ws, 3, 4, "EXTENSION" + (data.dealType === "Extension" ? " ✓" : ""));

  // Row 5: Space type
  safeMerge(ws, 5, 1, 5, 2); setCell(ws, 5, 1, "RAW SPACE" + (data.spaceType === "Raw" ? " ✓" : ""));
  safeMerge(ws, 5, 3, 5, 5); setCell(ws, 5, 3, "IMPROVED SPACE" + (data.spaceType === "Improved" ? " ✓" : ""));

  // Row 6: Lease type + headers
  setCell(ws, 6, 1, "DIRECT LEASE:" + (data.leaseType === "Direct" ? " ✓" : ""));
  safeMerge(ws, 6, 3, 6, 5); setCell(ws, 6, 3, "TERM:");
  setCell(ws, 6, 4, "DAY"); setCell(ws, 6, 5, "MONTH"); setCell(ws, 6, 6, "YEAR");
  safeMerge(ws, 6, 8, 6, 9); setCell(ws, 6, 8, "(SUB)   LANDLORD", { fill: sectionFill, bold: true });
  safeMerge(ws, 6, 10, 6, 11); setCell(ws, 6, 10, "(SUB)   TENANT", { fill: sectionFill, bold: true });

  // Row 7: Sublease + FROM
  safeMerge(ws, 7, 1, 7, 2); setCell(ws, 7, 1, "SUBLEASE:" + (data.leaseType === "Sublease" ? " ✓" : ""));
  setCell(ws, 7, 3, "FROM:");
  setCell(ws, 7, 4, data.termStart?.day ?? "");
  setCell(ws, 7, 5, data.termStart?.month ?? "");
  setCell(ws, 7, 6, data.termStart?.year ?? "");
  setCell(ws, 7, 8, "ENGAGED BY");

  // Row 8: TO
  setCell(ws, 8, 3, "TO:");
  setCell(ws, 8, 4, data.termEnd?.day ?? "");
  setCell(ws, 8, 5, data.termEnd?.month ?? "");
  setCell(ws, 8, 6, data.termEnd?.year ?? "");
  setCell(ws, 8, 8, "PAID BY");

  // Row 9-10: Renewal option
  safeMerge(ws, 9, 1, 9, 2); setCell(ws, 9, 1, "RENEWAL OPTION");
  safeMerge(ws, 9, 3, 9, 4); setCell(ws, 9, 3, "YES" + (data.renewalOption ? " ✓" : ""));
  safeMerge(ws, 9, 5, 9, 6); setCell(ws, 9, 5, data.renewalDate ? `RENEWAL DATE: ${data.renewalDate}` : "");
  safeMerge(ws, 10, 1, 10, 2); setCell(ws, 10, 1, "");
  safeMerge(ws, 10, 3, 10, 4); setCell(ws, 10, 3, "NO" + (!data.renewalOption ? " ✓" : ""));

  // Row 11: Landlord/Tenant names
  safeMerge(ws, 11, 1, 11, 3); setCell(ws, 11, 1, "(SUB)    LANDLORD NAME: ", { bold: true });
  safeMerge(ws, 11, 4, 11, 6); setCell(ws, 11, 4, data.landlord?.name || "");
  safeMerge(ws, 11, 7, 11, 8); setCell(ws, 11, 7, "(SUB)   TENANT NAME:  ", { bold: true });
  safeMerge(ws, 11, 9, 11, 11); setCell(ws, 11, 9, data.tenant?.name || "");

  // Row 12: Contact names
  safeMerge(ws, 12, 1, 12, 3); setCell(ws, 12, 1, "CONTACT NAME(REQUIRED): ");
  safeMerge(ws, 12, 4, 12, 6); setCell(ws, 12, 4, data.landlord?.contactName || "");
  safeMerge(ws, 12, 7, 12, 8); setCell(ws, 12, 7, "CONTACT NAME(REQUIRED): ");
  safeMerge(ws, 12, 9, 12, 11); setCell(ws, 12, 9, data.tenant?.contactName || "");

  // Row 13: Phones
  setCell(ws, 13, 1, "PHONE:  ");
  setCell(ws, 13, 2, data.landlord?.phone || "");
  safeMerge(ws, 13, 4, 13, 5); setCell(ws, 13, 4, "Fax/Email: ");
  setCell(ws, 13, 6, data.landlord?.email || "");
  setCell(ws, 13, 7, "PHONE:  ");
  setCell(ws, 13, 8, data.tenant?.phone || "");
  setCell(ws, 13, 9, "Fax/Email: ");
  safeMerge(ws, 13, 10, 13, 11); setCell(ws, 13, 10, data.tenant?.email || "");

  // Row 14-15: Mailing addresses
  setMergedLabel(ws, 14, 1, 6, "MAILING ADDRESS: (INCLUDING SUITE #)");
  setMergedLabel(ws, 14, 7, 11, "MAILING ADDRESS: (INCLUDING SUITE #)");
  safeMerge(ws, 15, 1, 15, 6); setCell(ws, 15, 1, data.landlord?.address || "");
  safeMerge(ws, 15, 7, 15, 11); setCell(ws, 15, 7, data.tenant?.address || "");

  // Row 16-17: City/Province/Postal
  setCell(ws, 16, 1, "CITY:"); setCell(ws, 16, 4, "PROVINCE:"); setCell(ws, 16, 6, "POSTAL CODE:");
  setCell(ws, 16, 7, "CITY:"); setCell(ws, 16, 9, "PROVINCE:"); setCell(ws, 16, 11, "POSTAL CODE:");
  setCell(ws, 17, 1, data.landlord?.city || ""); setCell(ws, 17, 4, data.landlord?.province || ""); setCell(ws, 17, 6, data.landlord?.postalCode || "");
  setCell(ws, 17, 7, data.tenant?.city || ""); setCell(ws, 17, 9, data.tenant?.province || ""); setCell(ws, 17, 11, data.tenant?.postalCode || "");

  // Row 19-22: Property address
  setMergedLabel(ws, 19, 1, 6, "PROPERTY ADDRESS: (INCLUDING SUITE #)");
  setCell(ws, 19, 7, "PROPERTY TYPE:", { bold: true });
  setCell(ws, 19, 8, "LAND" + (data.propertyType === "Land" ? " ✓" : ""));
  setCell(ws, 19, 9, "OFFICE" + (data.propertyType === "Office" ? " ✓" : ""));
  setCell(ws, 19, 11, "RES" + (data.propertyType === "Residential" ? " ✓" : ""));

  safeMerge(ws, 20, 1, 20, 6); setCell(ws, 20, 1, data.property?.address || "");
  setCell(ws, 20, 7, ""); setCell(ws, 20, 8, "RETAIL" + (data.propertyType === "Retail" ? " ✓" : ""));
  setCell(ws, 20, 9, "INDUSTRIAL" + (data.propertyType === "Industrial" ? " ✓" : ""));
  setCell(ws, 20, 11, "SP.USE" + (data.propertyType === "Special Use" ? " ✓" : ""));

  setCell(ws, 21, 1, "CITY:"); setCell(ws, 21, 4, "PROVINCE:"); setCell(ws, 21, 6, "POSTAL CODE:");
  setCell(ws, 22, 1, data.property?.city || ""); setCell(ws, 22, 4, data.property?.province || ""); setCell(ws, 22, 6, data.property?.postalCode || "");

  // Row 22: Deal details header
  safeMerge(ws, 22, 7, 22, 11); setCell(ws, 22, 7, "DEAL DETAILS:", { fill: sectionFill, bold: true });

  // Row 23-27: CBRE Listing + Deal details
  setCell(ws, 23, 1, "CBRE LISTING:"); setCell(ws, 23, 3, data.cbreListing ? "YES: ✓" : "YES:"); setCell(ws, 23, 5, !data.cbreListing ? "NO: ✓" : "NO:");
  safeMerge(ws, 23, 7, 23, 8); setCell(ws, 23, 7, "Total SF of Leased Space:");
  safeMerge(ws, 23, 9, 23, 11); setCell(ws, 23, 9, data.totalSF ?? "");

  safeMerge(ws, 24, 7, 24, 8); setCell(ws, 24, 7, "Base Annual Rent PSF:");
  safeMerge(ws, 24, 9, 24, 11); setCell(ws, 24, 9, data.baseAnnualRentPSF ?? "");

  safeMerge(ws, 25, 7, 25, 8); setCell(ws, 25, 7, "Months of Free Rent:");
  safeMerge(ws, 25, 9, 25, 11); setCell(ws, 25, 9, data.monthsFreeRent ?? "");

  safeMerge(ws, 26, 7, 26, 8); setCell(ws, 26, 7, "Tenant Inducement:");
  safeMerge(ws, 26, 9, 26, 11); setCell(ws, 26, 9, data.tenantInducementPSF ?? "");

  safeMerge(ws, 27, 7, 27, 8); setCell(ws, 27, 7, "Taxes & Operating Costs:");
  safeMerge(ws, 27, 9, 27, 11); setCell(ws, 27, 9, data.taxesOperatingCostsPSF ?? "");

  // Row 30: Invoice request
  safeMerge(ws, 30, 7, 30, 8); setCell(ws, 30, 7, "INVOICE REQUEST DATE:");
  safeMerge(ws, 30, 9, 30, 11); setCell(ws, 30, 9, "Immediate");

  // Row 31-32: Occupier industry label
  safeMerge(ws, 31, 7, 32, 11); setCell(ws, 31, 7, "OCCUPIER INDUSTRY: CHOOSE APPLICABLE OCCUPIER FROM LIST", { bold: true });

  // Row 33: Occupier industry value
  safeMerge(ws, 33, 7, 33, 8); setCell(ws, 33, 7, "Occupier Industry: ");
  safeMerge(ws, 33, 9, 33, 11); setCell(ws, 33, 9, data.occupierIndustry || "");

  // Row 34: Building classification
  safeMerge(ws, 34, 7, 34, 8); setCell(ws, 34, 7, "Building Classification:");
  safeMerge(ws, 34, 9, 34, 11); setCell(ws, 34, 9, data.buildingClassification || "");

  // Row 35: Space use
  safeMerge(ws, 35, 7, 35, 8); setCell(ws, 35, 7, "Space Use:");
  safeMerge(ws, 35, 9, 35, 11); setCell(ws, 35, 9, data.spaceUse || "");

  // Row 36: Reason for transaction
  safeMerge(ws, 36, 7, 36, 8); setCell(ws, 36, 7, "Reason for Transaction:");
  safeMerge(ws, 36, 9, 36, 11); setCell(ws, 36, 9, data.reasonForTransaction || "");

  // Row 40: Commission header
  setMergedLabel(ws, 40, 1, 11, "COMMISSION CALCULATION FOR BILLING:", headerFill);

  // Row 41: Column headers
  safeMerge(ws, 41, 1, 41, 2); setCell(ws, 41, 1, "TOTAL SQ. FT", { bold: true });
  setCell(ws, 41, 3, "@");
  safeMerge(ws, 41, 4, 41, 5); setCell(ws, 41, 4, "$ RATE PSF", { bold: true });
  setCell(ws, 41, 6, "@");
  setCell(ws, 41, 7, "TERM", { bold: true });
  setCell(ws, 41, 8, "TOTAL", { bold: true });
  setCell(ws, 41, 9, "LEASE RATE:", { bold: true });
  safeMerge(ws, 41, 10, 41, 11); setCell(ws, 41, 10, "TOTAL COMMISSION", { bold: true });

  // Commission calculation rows based on lease schedule
  const schedule = data.leaseSchedule || [];
  const totalSF = data.totalSF || 0;
  const commRate = data.commissionRate || 0.05;
  let totalDealValue = 0;
  let totalBilling = 0;

  // Filter to rent-paying periods only for commission calc
  const rentPeriods = schedule.filter((s: { rentPSF: number }) => s.rentPSF > 0);

  for (let i = 0; i < Math.max(rentPeriods.length, 1); i++) {
    const row = 42 + i;
    const period = rentPeriods[i];
    if (period) {
      const start = new Date(period.startDate);
      const end = new Date(period.endDate);
      const years = Math.round((end.getTime() - start.getTime()) / (365.25 * 24 * 3600 * 1000));
      const dealVal = totalSF * period.rentPSF * years;
      const commVal = dealVal * commRate;
      totalDealValue += dealVal;
      totalBilling += commVal;

      safeMerge(ws, row, 1, row, 2); setCell(ws, row, 1, totalSF);
      setCell(ws, row, 3, "@");
      safeMerge(ws, row, 4, row, 5); setCell(ws, row, 4, period.rentPSF);
      setCell(ws, row, 6, "@");
      setCell(ws, row, 7, years);
      setCell(ws, row, 8, { formula: `A${row}*D${row}*G${row}` } as unknown as number);
      setCell(ws, row, 9, commRate);
      safeMerge(ws, row, 10, row, 11); setCell(ws, row, 10, { formula: `H${row}*I${row}` } as unknown as number);
    }
  }

  const lastCalcRow = 42 + Math.max(rentPeriods.length, 1) - 1;
  const totalsRow = lastCalcRow + 2;

  // Totals row
  safeMerge(ws, totalsRow, 1, totalsRow, 4); setCell(ws, totalsRow, 1, "TOTAL DEAL VALUE:", { bold: true });
  safeMerge(ws, totalsRow, 5, totalsRow, 6); setCell(ws, totalsRow, 5, { formula: `SUM(H42:H${lastCalcRow})` } as unknown as number);
  setCell(ws, totalsRow, 8, "TOTAL BILLING:", { bold: true });
  safeMerge(ws, totalsRow, 10, totalsRow, 11); setCell(ws, totalsRow, 10, { formula: `SUM(J42:K${lastCalcRow})` } as unknown as number);

  // Commission distribution
  const distRow = totalsRow + 1;
  setMergedLabel(ws, distRow, 1, 7, "CBRE COMMISSION DISTRIBUTION (TO INCLUDE ALL CANADIAN OFFICES):", headerFill);

  const hdrRow = distRow + 1;
  safeMerge(ws, hdrRow, 1, hdrRow, 3); setCell(ws, hdrRow, 1, "BRANCH NAME:", { bold: true });
  safeMerge(ws, hdrRow, 4, hdrRow, 5); setCell(ws, hdrRow, 4, "SALES PERSON:", { bold: true });
  setCell(ws, hdrRow, 6, "AMOUNT:", { bold: true });
  setCell(ws, hdrRow, 7, "Initials:", { bold: true });

  // Branch total row
  const brRow = hdrRow + 1;
  safeMerge(ws, brRow, 1, brRow, 3); setCell(ws, brRow, 1, "CBRE Saskatchewan");
  setCell(ws, brRow, 6, { formula: `J${totalsRow}/2` } as unknown as number);

  // Individual splits
  const splits = commission?.splits || [
    { name: "Michael Bratvold", pct: 0.385 },
    { name: "Ben Kelley", pct: 0.265 },
    { name: "Shane Endicott", pct: 0.12 },
    { name: "Dallon Kuprowski", pct: 0.16 },
    { name: "Luke Jansen", pct: 0.07 },
  ];

  splits.forEach((s: { name: string; pct: number }, i: number) => {
    const r = brRow + 1 + i;
    safeMerge(ws, r, 1, r, 3); setCell(ws, r, 1, "CBRE Saskatchewan");
    safeMerge(ws, r, 4, r, 5); setCell(ws, r, 4, s.name);
    setCell(ws, r, 6, { formula: `$F$${brRow}*${s.pct}` } as unknown as number);
  });

  const lastSplitRow = brRow + splits.length;
  const totalRow = lastSplitRow + 2;
  safeMerge(ws, totalRow, 1, totalRow, 5); setCell(ws, totalRow, 1, "CBRE & AGENTS TOTAL:", { bold: true });
  setCell(ws, totalRow, 6, { formula: `SUM(F${brRow}:F${lastSplitRow})` } as unknown as number);

  // Lease schedule section (right side)
  const lsRow = distRow;
  safeMerge(ws, lsRow, 8, lsRow, 11); setCell(ws, lsRow, 8, "LEASE SCHEDULE PER TERM AS PER OTL:", { fill: sectionFill, bold: true });
  setCell(ws, lsRow + 1, 8, "Date Start", { bold: true }); setCell(ws, lsRow + 1, 9, "Date Finish", { bold: true });
  setCell(ws, lsRow + 1, 10, "Rent PSF", { bold: true });

  schedule.forEach((s: { startDate: string; endDate: string; rentPSF: number }, i: number) => {
    const r = lsRow + 2 + i;
    setCell(ws, r, 8, s.startDate);
    setCell(ws, r, 9, s.endDate);
    setCell(ws, r, 10, s.rentPSF);
  });

  // GST/PST note
  const noteRow = totalRow + 2;
  safeMerge(ws, noteRow, 1, noteRow + 2, 6);
  setCell(ws, noteRow, 1, "We will be collecting GST and PST CBRE Listing");

  // Broker signature
  setCell(ws, noteRow + 4, 8, "CBRE BROKER:");
  setCell(ws, noteRow + 4, 9, splits[0]?.name || "Michael Bratvold");

  addOccupierIndustrySheet(wb);
  return wb;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function generateSaleWorkbook(data: any, commission: any): ExcelJS.Workbook {
  mergedRanges.clear();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Trade Record");

  [12, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  // Row 1: Title
  safeMerge(ws, 1, 1, 1, 8); setCell(ws, 1, 1, "SALE TRADE RECORD", { fill: headerFill, bold: true });
  safeMerge(ws, 1, 9, 1, 11); setCell(ws, 1, 9, "Deal #", { bold: true });

  // Row 2: FINTRAC
  safeMerge(ws, 2, 1, 2, 2); setCell(ws, 2, 1, "FINTRAC REPRESENTATION:", { bold: true });
  safeMerge(ws, 2, 3, 2, 5); setCell(ws, 2, 3, "Vendor:  " + (data.fintracRepresentation === "Vendor" || data.fintracRepresentation === "Both" ? "✓" : ""));
  safeMerge(ws, 2, 6, 2, 11); setCell(ws, 2, 6, "BUYER: " + (data.fintracRepresentation === "Buyer" || data.fintracRepresentation === "Both" ? "✓" : ""));

  // Row 3-4: Asset/Property Manager
  safeMerge(ws, 3, 1, 4, 2); setCell(ws, 3, 1, "ASSET/PROPERTY MANAGER", { bold: true });
  safeMerge(ws, 3, 3, 4, 8); setCell(ws, 3, 3, data.assetPropertyManager || "");
  setCell(ws, 3, 10, "BUYER"); setCell(ws, 3, 11, "VENDOR");

  // Row 5-7: Beneficial Owner + Engaged/Paid By
  safeMerge(ws, 5, 1, 7, 2); setCell(ws, 5, 1, "BENEFICIAL OWNER (up to three)", { bold: true });
  safeMerge(ws, 5, 3, 7, 7); setCell(ws, 5, 3, data.beneficialOwner || "");
  safeMerge(ws, 5, 8, 5, 9); setCell(ws, 5, 8, "CBRE Engaged By:");
  setCell(ws, 5, 10, data.engagedBy === "Buyer" ? "✓" : "");
  setCell(ws, 5, 11, data.engagedBy === "Vendor" ? "✓" : "");
  safeMerge(ws, 6, 8, 6, 9); setCell(ws, 6, 8, "CBRE Paid BY:");
  setCell(ws, 6, 10, data.paidBy === "Buyer" ? "✓" : "");
  setCell(ws, 6, 11, data.paidBy === "Vendor" ? "✓" : "");

  // Row 8: Vendor / Purchaser
  setCell(ws, 8, 1, "VENDOR: ", { bold: true });
  safeMerge(ws, 8, 2, 8, 5); setCell(ws, 8, 2, data.vendor?.name || "");
  setCell(ws, 8, 6, "PURCHASER: ", { bold: true });
  safeMerge(ws, 8, 7, 8, 11); setCell(ws, 8, 7, data.purchaser?.name || "");

  // Row 9: Contacts
  setCell(ws, 9, 1, "Contact Name: ");
  safeMerge(ws, 9, 2, 9, 5); setCell(ws, 9, 2, data.vendor?.contactName || "");
  setCell(ws, 9, 6, "Contact Name: ");
  safeMerge(ws, 9, 7, 9, 11); setCell(ws, 9, 7, data.purchaser?.contactName || "");

  // Row 10: Phones
  setCell(ws, 10, 1, "Phone:  ");
  safeMerge(ws, 10, 2, 10, 3); setCell(ws, 10, 2, data.vendor?.phone || "");
  setCell(ws, 10, 4, "Fax: ");
  setCell(ws, 10, 6, "Phone:  ");
  safeMerge(ws, 10, 7, 10, 8); setCell(ws, 10, 7, data.purchaser?.phone || "");
  setCell(ws, 10, 9, "Fax: ");

  // Row 11-12: Addresses
  safeMerge(ws, 11, 1, 12, 4); setCell(ws, 11, 1, `Mailing Address:\n${data.vendor?.address || ""}`);
  setCell(ws, 11, 5, "SUITE #");
  safeMerge(ws, 11, 6, 12, 9); setCell(ws, 11, 6, `Mailing Address:\n${data.purchaser?.address || ""}`);
  safeMerge(ws, 11, 10, 11, 11); setCell(ws, 11, 10, "SUITE #");

  // Row 13-14: City/Province/Postal
  setCell(ws, 13, 1, "City:"); setCell(ws, 13, 3, "Province:"); safeMerge(ws, 13, 4, 13, 5); setCell(ws, 13, 4, "Postal Code:");
  setCell(ws, 13, 6, "City:"); setCell(ws, 13, 8, "Province:"); safeMerge(ws, 13, 10, 13, 11); setCell(ws, 13, 10, "Postal Code:");
  setCell(ws, 14, 1, data.vendor?.city || ""); setCell(ws, 14, 3, data.vendor?.province || ""); setCell(ws, 14, 4, data.vendor?.postalCode || "");
  setCell(ws, 14, 6, data.purchaser?.city || ""); setCell(ws, 14, 8, data.purchaser?.province || ""); setCell(ws, 14, 10, data.purchaser?.postalCode || "");

  // Row 16-17: Property
  safeMerge(ws, 16, 1, 17, 5); setCell(ws, 16, 1, `Property Name & Address: \n${data.property?.nameAddress || ""}`);
  safeMerge(ws, 16, 6, 16, 9); setCell(ws, 16, 6, "Deal Status:", { bold: true });
  setCell(ws, 16, 10, "Conditional" + (data.dealStatus === "Conditional" ? " ✓" : ""));
  safeMerge(ws, 17, 6, 17, 9); setCell(ws, 17, 6, "");
  setCell(ws, 17, 10, "Firm:" + (data.dealStatus === "Firm" ? " ✓" : ""));
  setCell(ws, 18, 1, "City:"); setCell(ws, 18, 3, "Province:"); setCell(ws, 18, 4, "Postal Code:");
  safeMerge(ws, 18, 6, 18, 9); setCell(ws, 18, 6, "");
  setCell(ws, 18, 10, "Closed:" + (data.dealStatus === "Closed" ? " ✓" : ""));
  setCell(ws, 19, 1, data.property?.city || ""); setCell(ws, 19, 3, data.property?.province || "");
  safeMerge(ws, 19, 6, 19, 9); setCell(ws, 19, 6, "Deal Closing Date:");
  safeMerge(ws, 19, 10, 19, 11); setCell(ws, 19, 10, data.closingDate || "");

  // Row 21-22: Property type
  setCell(ws, 21, 1, "Property Type", { bold: true });
  setCell(ws, 21, 2, "Retail " + (data.propertyType === "Retail" ? "✓" : ""));
  setCell(ws, 21, 3, "Office" + (data.propertyType === "Office" ? " ✓" : ""));
  safeMerge(ws, 21, 4, 21, 5); setCell(ws, 21, 4, "Multi Housing" + (data.propertyType === "Multi Housing" ? " ✓" : ""));
  safeMerge(ws, 21, 6, 21, 7); setCell(ws, 21, 6, "Interest Account?");
  safeMerge(ws, 21, 8, 21, 9); setCell(ws, 21, 8, "Deposit Amount:");
  safeMerge(ws, 21, 10, 21, 11); setCell(ws, 21, 10, data.depositAmount ?? "");

  setCell(ws, 22, 1, "");
  setCell(ws, 22, 2, "Land " + (data.propertyType === "Land" ? "✓" : ""));
  setCell(ws, 22, 3, "Sp. Use" + (data.propertyType === "Special Use" ? " ✓" : ""));
  setCell(ws, 22, 4, "Industrial" + (data.propertyType === "Industrial" ? " ✓" : ""));
  setCell(ws, 22, 6, "Yes" + (data.interestBearing ? " ✓" : ""));
  setCell(ws, 22, 7, "No" + (!data.interestBearing ? " ✓" : ""));
  setCell(ws, 22, 9, "Held By:");
  setCell(ws, 22, 10, "CBRE:");

  setCell(ws, 23, 2, "RES:" + (data.propertyType === "Residential" ? " ✓" : ""));
  safeMerge(ws, 23, 6, 23, 8); setCell(ws, 23, 6, "Deduct for Commission?");
  setCell(ws, 23, 9, "Held By:");
  safeMerge(ws, 23, 10, 23, 11); setCell(ws, 23, 10, "OTHER: " + (data.depositHeldBy || ""));

  // Row 24: Parcel size
  safeMerge(ws, 24, 1, 24, 2); setCell(ws, 24, 1, "Parcel Size in Acres:");
  safeMerge(ws, 24, 3, 24, 5); setCell(ws, 24, 3, data.parcelSizeAcres ? `${data.parcelSizeAcres} AC` : "");

  // Row 26-29: Building details
  safeMerge(ws, 26, 1, 26, 2); setCell(ws, 26, 1, "Total Sq. Ft of Buildings");
  safeMerge(ws, 26, 3, 26, 5); setCell(ws, 26, 3, data.buildingSF ?? 0);
  safeMerge(ws, 27, 1, 27, 2); setCell(ws, 27, 1, "Number of Units");
  safeMerge(ws, 27, 3, 27, 5); setCell(ws, 27, 3, data.numberOfUnits ?? 0);
  safeMerge(ws, 28, 1, 28, 2); setCell(ws, 28, 1, "Portfolio");
  setCell(ws, 28, 3, "Yes" + (data.portfolio ? " ✓" : ""));
  setCell(ws, 28, 4, "No" + (!data.portfolio ? " ✓" : ""));
  safeMerge(ws, 29, 1, 29, 2); setCell(ws, 29, 1, "Number of Buildings:");
  safeMerge(ws, 29, 3, 29, 5); setCell(ws, 29, 3, data.numberOfBuildings ?? 0);

  // Occupier industry section (right side rows 26-39)
  safeMerge(ws, 26, 6, 28, 11); setCell(ws, 26, 6, "OCCUPIER INDUSTRY:  ENTER THE APPROPRIATE OCCUPIER FROM THE OCCUPIER INDUSTRY TAB.", { bold: true });
  safeMerge(ws, 29, 6, 32, 11); setCell(ws, 29, 6, data.occupierIndustry || "");

  // Row 30-32: CBRE Listing
  safeMerge(ws, 30, 1, 30, 2); setCell(ws, 30, 1, "CBRE Listing?");
  setCell(ws, 30, 3, "Yes " + (data.cbreListing ? "✓" : ""));
  setCell(ws, 30, 4, "No " + (!data.cbreListing ? "✓" : ""));
  safeMerge(ws, 31, 1, 31, 2); setCell(ws, 31, 1, "Type of Listing:");
  setCell(ws, 31, 3, "Open" + (data.listingType === "Open" ? " ✓" : ""));
  setCell(ws, 31, 4, "Exclusive" + (data.listingType === "Exclusive" ? " ✓" : ""));
  setCell(ws, 31, 5, "MLS" + (data.listingType === "MLS" ? " ✓" : ""));
  setCell(ws, 32, 1, data.listingType === "Off Market" ? "off market ✓" : "off market");

  // Row 33-39: Vendor Solicitor
  safeMerge(ws, 33, 1, 33, 2); setCell(ws, 33, 1, "VENDOR SOLICITOR: ", { bold: true });
  safeMerge(ws, 33, 3, 33, 5); setCell(ws, 33, 3, data.vendorSolicitor?.name || "");
  setCell(ws, 34, 1, "Contact Name: ");
  safeMerge(ws, 34, 2, 34, 5); setCell(ws, 34, 2, data.vendorSolicitor?.contactName || "");
  setCell(ws, 35, 1, "Phone:  ");
  safeMerge(ws, 35, 2, 35, 3); setCell(ws, 35, 2, data.vendorSolicitor?.phone || "");
  safeMerge(ws, 36, 1, 37, 4); setCell(ws, 36, 1, `Mailing Address:\n${data.vendorSolicitor?.address || ""}`);
  setCell(ws, 36, 5, "SUITE #");
  setCell(ws, 37, 5, data.vendorSolicitor?.suite || "");
  setCell(ws, 38, 1, "City:"); setCell(ws, 38, 3, "Province:"); setCell(ws, 38, 4, "Postal Code:");
  setCell(ws, 39, 1, data.vendorSolicitor?.city || ""); setCell(ws, 39, 3, data.vendorSolicitor?.province || ""); setCell(ws, 39, 4, data.vendorSolicitor?.postalCode || "");

  // Row 41-47: Purchaser Solicitor
  setCell(ws, 41, 1, "PURCHASER SOLICITOR:", { bold: true });
  safeMerge(ws, 41, 3, 41, 5); setCell(ws, 41, 3, data.purchaserSolicitor?.name || "");
  setCell(ws, 41, 6, "OUTSIDE BROKER:", { bold: true });
  setCell(ws, 42, 1, "Contact Name:");
  safeMerge(ws, 42, 2, 42, 5); setCell(ws, 42, 2, data.purchaserSolicitor?.contactName || "");
  setCell(ws, 42, 6, "Contact Name:");
  setCell(ws, 43, 1, "Phone:  ");
  safeMerge(ws, 43, 2, 43, 3); setCell(ws, 43, 2, data.purchaserSolicitor?.phone || "");
  safeMerge(ws, 44, 1, 45, 4); setCell(ws, 44, 1, `Mailing Address:\n${data.purchaserSolicitor?.address || ""}`);
  setCell(ws, 44, 5, "SUITE #");
  setCell(ws, 45, 5, data.purchaserSolicitor?.suite || "");
  setCell(ws, 46, 1, "City:"); setCell(ws, 46, 3, "Province:"); setCell(ws, 46, 4, "Postal Code:");
  setCell(ws, 47, 1, data.purchaserSolicitor?.city || ""); setCell(ws, 47, 3, data.purchaserSolicitor?.province || ""); setCell(ws, 47, 4, data.purchaserSolicitor?.postalCode || "");

  // OSB Commission
  safeMerge(ws, 48, 6, 48, 9); setCell(ws, 48, 6, "OSB COMMISSION AMOUNT:");
  safeMerge(ws, 48, 10, 48, 11); setCell(ws, 48, 10, 0);

  // Row 51: Commission Calculation
  setMergedLabel(ws, 51, 1, 11, "COMMISISON CALCULATION:", headerFill);

  // Row 52: Headers
  safeMerge(ws, 52, 1, 52, 4); setCell(ws, 52, 1, "TOTAL PURCHASE PRICE:", { bold: true });
  safeMerge(ws, 52, 5, 52, 7); setCell(ws, 52, 5, "Percentage Based on Sale Price", { bold: true });
  safeMerge(ws, 52, 8, 52, 11); setCell(ws, 52, 8, "Total Commission", { bold: true });

  // Row 53: Values
  safeMerge(ws, 53, 1, 53, 4); setCell(ws, 53, 1, data.purchasePrice ?? "");
  safeMerge(ws, 53, 5, 53, 7); setCell(ws, 53, 5, data.commissionType === "setFee" ? "Set Fee Agreement" : (data.commissionPercentage || ""));
  safeMerge(ws, 53, 8, 53, 11); setCell(ws, 53, 8, data.commissionSetFee ?? "");

  // Row 54: percentage calc
  if (data.commissionType === "percentage" && data.commissionPercentage) {
    safeMerge(ws, 54, 1, 54, 4); setCell(ws, 54, 1, "");
    safeMerge(ws, 54, 5, 54, 7); setCell(ws, 54, 5, data.commissionPercentage);
    safeMerge(ws, 54, 8, 54, 11); setCell(ws, 54, 8, { formula: `A53*E54` } as unknown as number);
  }

  // Row 55: Total
  safeMerge(ws, 55, 8, 55, 11);
  setCell(ws, 55, 8, { formula: `H53+H54` } as unknown as number);

  // Row 57: Commission Distribution
  setMergedLabel(ws, 57, 1, 11, "CBRE COMMISSION DISBRIBUTION:", headerFill);

  // Row 58: Headers
  setCell(ws, 58, 1, "BRANCH #", { bold: true });
  safeMerge(ws, 58, 2, 58, 4); setCell(ws, 58, 2, "Branch Name:", { bold: true });
  safeMerge(ws, 58, 5, 58, 6); setCell(ws, 58, 5, "Sales Person", { bold: true });
  safeMerge(ws, 58, 7, 58, 8); setCell(ws, 58, 7, "Initials", { bold: true });
  safeMerge(ws, 58, 9, 58, 11); setCell(ws, 58, 9, "Total Commission Due", { bold: true });

  // Main branch
  const offices = commission?.offices || [{ name: "Saskatoon", branchNum: "100101", share: 0.5 }];
  const splits = commission?.splits || [
    { name: "Michael Bratvold", pct: 0.385 },
    { name: "Ben Kelley", pct: 0.265 },
    { name: "Shane Endicott", pct: 0.12 },
    { name: "Dallon Kuprowski", pct: 0.16 },
    { name: "Luke Jansen", pct: 0.07 },
  ];

  let currentRow = 59;
  const mainBranchRow = currentRow;

  // Main branch total
  setCell(ws, currentRow, 1, offices[0]?.branchNum || "100101");
  safeMerge(ws, currentRow, 2, currentRow, 4); setCell(ws, currentRow, 2, offices[0]?.name || "Saskatoon");
  safeMerge(ws, currentRow, 9, currentRow, 11);
  setCell(ws, currentRow, 9, { formula: `(H55*${offices[0]?.share || 0.5})` } as unknown as number);
  currentRow++;

  // Individual splits
  splits.forEach((s: { name: string; pct: number }) => {
    safeMerge(ws, currentRow, 2, currentRow, 4); setCell(ws, currentRow, 2, offices[0]?.name || "Saskatoon");
    safeMerge(ws, currentRow, 5, currentRow, 6); setCell(ws, currentRow, 5, s.name);
    safeMerge(ws, currentRow, 9, currentRow, 11);
    setCell(ws, currentRow, 9, { formula: `$I$${mainBranchRow}*${s.pct}` } as unknown as number);
    currentRow++;
  });

  // Additional offices
  for (let o = 1; o < offices.length; o++) {
    currentRow++;
    const officeRow = currentRow;
    safeMerge(ws, currentRow, 2, currentRow, 4); setCell(ws, currentRow, 2, offices[o].name);
    safeMerge(ws, currentRow, 9, currentRow, 11);
    setCell(ws, currentRow, 9, { formula: `(H55*${offices[o].share})` } as unknown as number);
    currentRow++;

    if (offices[o].people) {
      for (const p of offices[o].people) {
        safeMerge(ws, currentRow, 2, currentRow, 4); setCell(ws, currentRow, 2, offices[o].name);
        safeMerge(ws, currentRow, 5, currentRow, 6); setCell(ws, currentRow, 5, p.name);
        safeMerge(ws, currentRow, 9, currentRow, 11);
        setCell(ws, currentRow, 9, { formula: `I${officeRow}*${p.pct}` } as unknown as number);
        currentRow++;
      }
    }
  }

  // Total row
  currentRow++;
  safeMerge(ws, currentRow, 9, currentRow, 11);
  setCell(ws, currentRow, 9, { formula: `SUM(I${mainBranchRow}:K${currentRow - 1})` } as unknown as number);

  // Invoice section
  currentRow += 2;
  safeMerge(ws, currentRow, 1, currentRow, 4); setCell(ws, currentRow, 1, "Send Invoice To:", { bold: true });
  currentRow++;
  setCell(ws, currentRow, 1, "Vendor" + (data.invoiceRecipient === "Vendor" ? " ✓" : ""));
  safeMerge(ws, currentRow, 3, currentRow, 4); setCell(ws, currentRow, 3, "Vendor's Lawyer" + (data.invoiceRecipient === "Vendor's Lawyer" ? " ✓" : ""));
  currentRow++;
  setCell(ws, currentRow, 1, "Purchaser" + (data.invoiceRecipient === "Purchaser" ? " ✓" : ""));
  safeMerge(ws, currentRow, 3, currentRow, 4); setCell(ws, currentRow, 3, "Purchaser's Lawyer" + (data.invoiceRecipient === "Purchaser's Lawyer" ? " ✓" : ""));
  currentRow++;
  setCell(ws, currentRow, 1, "Outside Broker" + (data.invoiceRecipient === "Outside Broker" ? " ✓" : ""));

  // Broker + GST note
  currentRow++;
  safeMerge(ws, currentRow, 7, currentRow, 11); setCell(ws, currentRow, 7, `Broker:  ${splits[0]?.name || "Michael Bratvold"}`);
  currentRow++;
  safeMerge(ws, currentRow, 1, currentRow, 5); setCell(ws, currentRow, 1, "Include both GST  & PST");

  addOccupierIndustrySheet(wb);
  return wb;
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  try {
    const body = await req.json();
    const { data, type, commission } = body;

    if (!data || !type) {
      return NextResponse.json({ error: "Missing data or type" }, { status: 400 });
    }

    const wb = type === "lease" ? generateLeaseWorkbook(data, commission) : generateSaleWorkbook(data, commission);

    const filename = `TR_${type === "lease" ? "Lease" : "Sale"}_${Date.now()}.xlsx`;
    const outDir = path.join(process.cwd(), "tmp");
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, filename);

    await wb.xlsx.writeFile(outPath);

    return NextResponse.json({ filename, downloadUrl: `/api/trade-records/download?file=${filename}` });
  } catch (err) {
    console.error("Trade record generation error:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
