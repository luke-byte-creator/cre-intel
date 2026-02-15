import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";

// Template approach: clone the CBRE template and fill in values at exact cell positions.
// This preserves all formatting, merged cells, column widths, and layout exactly.

const TEMPLATE_DIR = path.join(process.cwd(), "data/templates");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generateLeaseFromTemplate(data: any, commission: any): Promise<Buffer> {
  const templatePath = path.join(TEMPLATE_DIR, "lease-tr-template.xlsx");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(templatePath);
  const ws = wb.getWorksheet("LEASE TR");
  if (!ws) throw new Error("LEASE TR sheet not found in template");

  // Helper to set a cell value without touching formatting
  const set = (cell: string, value: string | number | null | undefined) => {
    if (value === null || value === undefined) return;
    ws.getCell(cell).value = value;
  };

  // Helper for date cells
  const setDate = (cell: string, value: string | Date | null | undefined) => {
    if (!value) return;
    const d = typeof value === "string" ? new Date(value) : value;
    if (!isNaN(d.getTime())) ws.getCell(cell).value = d;
  };

  // Helper for formula cells
  const setFormula = (cell: string, formula: string) => {
    ws.getCell(cell).value = { formula } as ExcelJS.CellFormulaValue;
  };

  // Row 1: Title — already set in template

  // Row 2: Asset/Property Manager (H2)
  set("H2", data.assetPropertyManager || "");

  // Row 3: Deal type checkmarks — A3 (NEW), B3 (RENEWAL), D3 (EXTENSION)
  // Clear existing and set the active one
  set("A3", data.dealType === "New" ? "NEW  ✓" : "NEW");
  set("B3", data.dealType === "Renewal" ? "RENEWAL  ✓" : "RENEWAL");
  set("D3", data.dealType === "Extension" ? "EXTENSION  ✓" : "EXTENSION");

  // Row 3: Beneficial Owner (H3)
  set("H3", data.beneficialOwner || "");

  // Row 5: Space type — A5 (RAW SPACE), C5 (IMPROVED SPACE)
  set("A5", data.spaceType === "Raw" ? "RAW SPACE  ✓" : "RAW SPACE");
  set("C5", data.spaceType === "Improved" ? "IMPROVED SPACE  ✓" : "IMPROVED SPACE");

  // Row 6: Lease type — A6
  set("A6", data.leaseType === "Direct" ? "DIRECT LEASE:  ✓" : "DIRECT LEASE:");

  // Row 7: Sublease + FROM dates
  set("A7", data.leaseType === "Sublease" ? "SUBLEASE:  ✓" : "SUBLEASE:");
  set("D7", data.termStart?.day ?? "");
  set("E7", data.termStart?.month ?? "");
  set("F7", data.termStart?.year ?? "");

  // Row 8: TO dates
  set("D8", data.termEnd?.day ?? "");
  set("E8", data.termEnd?.month ?? "");
  set("F8", data.termEnd?.year ?? "");

  // Row 9-10: Renewal option
  set("C9", data.renewalOption ? "YES  ✓" : "YES");
  set("E9", data.renewalDate ? `RENEWAL DATE: ${data.renewalDate}` : "");
  set("C10", !data.renewalOption ? "NO  ✓" : "NO");

  // Row 11: Landlord/Tenant names
  set("D11", data.landlord?.name || "");
  set("I11", data.tenant?.name || "");

  // Row 12: Contact names
  set("D12", data.landlord?.contactName || "");
  set("I12", data.tenant?.contactName || "");

  // Row 13: Phones and emails
  set("B13", data.landlord?.phone || "");
  set("E13", data.landlord?.email || "");
  set("H13", data.tenant?.phone || "");
  set("J13", data.tenant?.email || "");

  // Row 15: Mailing addresses
  set("A15", data.landlord?.address || "");
  set("G15", data.tenant?.address || "");

  // Row 17: City/Province/Postal
  set("A17", data.landlord?.city || "");
  set("D17", data.landlord?.province || "");
  set("F17", data.landlord?.postalCode || "");
  set("G17", data.tenant?.city || "");
  set("I17", data.tenant?.province || "");
  set("K17", data.tenant?.postalCode || "");

  // Row 19-20: Property type checkmarks
  // Clear all and set the active one
  set("H19", data.propertyType === "Land" ? "LAND  ✓" : "LAND");
  set("I19", data.propertyType === "Office" ? "OFFICE  ✓" : "OFFICE");
  set("K19", data.propertyType === "Residential" ? "RES  ✓" : "RES");
  set("H20", data.propertyType === "Retail" ? "RETAIL  ✓" : "RETAIL");
  set("I20", data.propertyType === "Industrial" ? "INDUSTRIAL  ✓" : "INDUSTRIAL");
  set("K20", data.propertyType === "Special Use" ? "SP.USE  ✓" : "SP.USE");

  // Row 20: Property address
  set("A20", data.property?.address || "");

  // Row 22: Property city/province/postal
  set("A22", data.property?.city || "");
  set("D22", data.property?.province || "");
  set("F22", data.property?.postalCode || "");

  // Row 23: CBRE Listing + Deal details
  set("C23", data.cbreListing ? "YES:  ✓" : "YES:");
  set("E23", !data.cbreListing ? "NO:  ✓" : "NO:");
  set("I23", data.totalSF ?? "");

  // Row 24-27: Deal details
  set("I24", data.baseAnnualRentPSF ?? "");
  set("I25", data.monthsFreeRent ?? "");
  set("I26", data.tenantInducementPSF ?? "");
  set("I27", data.taxesOperatingCostsPSF ?? "");

  // Row 24-30: Outside broker info
  set("D24", data.outsideBrokerCompany || "");
  set("D25", data.outsideBrokerContact || "");
  set("A27", data.outsideBrokerAddress || "");
  set("A30", data.outsideBrokerCity || "");
  set("D30", data.outsideBrokerProvince || "");
  set("F30", data.outsideBrokerPostalCode || "");

  // Row 30: Invoice request date
  set("I30", data.invoiceRequestDate || "Immediate");

  // Row 31: Outside broker commission
  set("E31", data.outsideBrokerCommission || "");

  // Row 33: Invoice destination (if not landlord)
  set("A35", data.invoiceAddress || "");
  set("A38", data.invoiceCity || "");
  set("D38", data.invoiceProvince || "");
  set("F38", data.invoicePostalCode || "");

  // Row 33-36: Occupier industry + classification
  set("I33", data.occupierIndustry || "");
  set("I34", data.buildingClassification || "");
  set("I35", data.spaceUse || "");
  set("I36", data.reasonForTransaction || "");
  set("I38", data.previousProperty || "");

  // === COMMISSION CALCULATION (rows 42-47) ===
  // The template has rows 42-47 for up to 6 commission lines
  // Each row: A=SF (=$I$23), C=@, D=Rate PSF, F=@, G=Term (years), H=Total formula, I=Commission %, J=Commission formula
  
  const schedule = data.leaseSchedule || [];
  const commissionLines = data.commissionLines || [];
  
  // If commission lines provided from the review form, use those
  // Otherwise build from lease schedule
  const lines = commissionLines.length > 0 ? commissionLines : schedule
    .filter((s: { rentPSF: number }) => s.rentPSF > 0)
    .map((s: { startDate: string; endDate: string; rentPSF: number }, i: number) => {
      const start = new Date(s.startDate);
      const end = new Date(s.endDate);
      const years = Math.max(1, Math.round((end.getTime() - start.getTime()) / (365.25 * 24 * 3600 * 1000)));
      return {
        ratePSF: s.rentPSF,
        termYears: years,
        commissionRate: i === 0 ? 0.05 : 0.02, // Default: 5% first period, 2% thereafter
      };
    });

  for (let i = 0; i < 6; i++) {
    const row = 42 + i;
    if (i < lines.length) {
      const line = lines[i];
      setFormula(`A${row}`, "=$I$23");
      set(`D${row}`, line.ratePSF);
      set(`G${row}`, line.termYears);
      setFormula(`H${row}`, `=A${row}*D${row}*G${row}`);
      set(`I${row}`, line.commissionRate);
      setFormula(`J${row}`, `=H${row}*I${row}`);
    } else {
      // Clear unused rows but keep formulas for manual entry
      set(`A${row}`, "");
      set(`D${row}`, "");
      set(`G${row}`, "");
      setFormula(`H${row}`, `=A${row}*D${row}*G${row}`);
      set(`I${row}`, "");
      setFormula(`J${row}`, `=H${row}*I${row}`);
    }
    // @ signs in C and F columns
    set(`C${row}`, "@");
    set(`F${row}`, "@");
  }

  // Row 48: Totals (already has formulas in template)

  // === COMMISSION DISTRIBUTION (rows 51-69) ===
  const splits = commission?.splits || [
    { name: "Michael Bratvold", pct: 0.385 },
    { name: "Ben Kelley", pct: 0.265 },
    { name: "Shane Endicott", pct: 0.12 },
    { name: "Dallon Kuprowski", pct: 0.16 },
    { name: "Luke Jansen", pct: 0.07 },
  ];

  // Row 51: Branch total (already has formula =(J48/2))
  // Rows 52-56: Individual agents
  for (let i = 0; i < splits.length && i < 18; i++) {
    const row = 52 + i;
    set(`A${row}`, "CBRE Saskatchewan");
    set(`D${row}`, splits[i].name);
    setFormula(`F${row}`, `=$F$51*${splits[i].pct}`);
  }
  // Clear remaining rows
  for (let i = splits.length; i < 18; i++) {
    const row = 52 + i;
    set(`A${row}`, "");
    set(`D${row}`, "");
    set(`F${row}`, "");
  }

  // Row 70: Total (already has formula =SUM(F51:F69))

  // === RIGHT SIDE: CLOSING CONTINGENCY + LEASE SCHEDULE ===

  // Row 49: Closing contingency
  set("J49", data.closingContingency || "Lease Exec: \nOpening:");
  set("K49", data.closingContingencyOccupancy || "Occupancy:           Cash:");

  // Row 51: Deposits held
  set("J51", data.depositsHeld ?? "");
  set("J53", data.depositHeldBy || "");

  // Row 58-59: Deal status
  set("I58", data.dealStatus === "Conditional" ? "Conditional:  ✓" : "Conditional:");
  set("I59", data.dealStatus === "Firm" ? "Firm:  ✓" : "Firm:");

  // Row 60: Expected firm date
  setDate("K60", data.expectedFirmDate);

  // Row 63-68: Lease schedule
  for (let i = 0; i < Math.min(schedule.length, 6); i++) {
    const row = 63 + i;
    setDate(`H${row}`, schedule[i].startDate);
    setDate(`I${row}`, schedule[i].endDate);
    set(`J${row}`, schedule[i].rentPSF ?? 0);
  }

  // Row 72: CBRE Broker
  set("I72", splits[0]?.name || "Michael Bratvold");

  // Generate buffer
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generateSaleFromTemplate(data: any, commission: any): Promise<Buffer> {
  const templatePath = path.join(TEMPLATE_DIR, "sale-tr-template.xlsx");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(templatePath);
  const ws = wb.getWorksheet("Trade Record");
  if (!ws) throw new Error("Trade Record sheet not found in template");

  const set = (cell: string, value: string | number | null | undefined) => {
    if (value === null || value === undefined) return;
    ws.getCell(cell).value = value;
  };
  const setDate = (cell: string, value: string | Date | null | undefined) => {
    if (!value) return;
    const d = typeof value === "string" ? new Date(value) : value;
    if (!isNaN(d.getTime())) ws.getCell(cell).value = d;
  };
  const setFormula = (cell: string, formula: string) => {
    ws.getCell(cell).value = { formula } as ExcelJS.CellFormulaValue;
  };

  // Row 2: FINTRAC
  set("D2", data.fintracRepresentation === "Vendor" || data.fintracRepresentation === "Both" ? "√" : "");
  set("G2", data.fintracRepresentation === "Buyer" || data.fintracRepresentation === "Both" ? "√" : "");

  // Row 3: Asset/Property Manager + Engaged/Paid checkmarks
  set("A3", data.assetPropertyManager || "");
  set("J3", data.engagedBy === "Buyer" ? "" : "");
  set("K3", data.engagedBy === "Vendor" ? "" : "");

  // Row 5: Beneficial Owner + Engaged By
  set("A5", data.beneficialOwner || "");
  set("J5", data.engagedBy === "Buyer" ? "√" : "");
  set("K5", data.engagedBy === "Vendor" ? "√" : "");

  // Row 6: Paid By
  set("J6", data.paidBy === "Buyer" ? "√" : "");
  set("K6", data.paidBy === "Vendor" ? "√" : "");

  // Row 8: Vendor / Purchaser names
  set("B8", data.vendor?.name || "");
  set("G8", data.purchaser?.name || "");

  // Row 9: Contacts
  set("B9", data.vendor?.contactName || "");
  set("G9", data.purchaser?.contactName || "");

  // Row 10: Phones
  set("B10", data.vendor?.phone || "");
  set("G10", data.purchaser?.phone || "");

  // Row 11: Addresses
  set("A11", `Mailing Address:\n${data.vendor?.address || ""}`);
  set("F11", `Mailing Address:\n${data.purchaser?.address || ""}`);
  set("J12", data.purchaser?.suite || "");

  // Row 14: City/Province/Postal
  set("A14", data.vendor?.city || "");
  set("C14", data.vendor?.province || "");
  set("D14", data.vendor?.postalCode || "");
  set("F14", data.purchaser?.city || "");
  set("H14", data.purchaser?.province || "");
  set("J14", data.purchaser?.postalCode || "");

  // Row 16: Property name & address
  set("A16", `Property Name & Address: \n${data.property?.nameAddress || ""}`);

  // Row 16-18: Deal status
  set("J16", data.dealStatus === "Conditional" ? "Conditional  √" : "Conditional");
  set("J17", data.dealStatus === "Firm" ? "Firm:  √" : "Firm:");
  set("J18", data.dealStatus === "Closed" ? "Closed:  √" : "Closed:");

  // Row 19: City/Province + Closing date
  set("A19", data.property?.city || "");
  set("C19", data.property?.province || "");
  setDate("J19", data.closingDate);

  // Row 21-23: Property type checkmarks
  set("B21", data.propertyType === "Retail" ? "Retail √" : "Retail ");
  set("C21", data.propertyType === "Office" ? "Office √" : "Office");
  set("D21", data.propertyType === "Multi Housing" ? "Multi Housing √" : "Multi Housing");
  set("B22", data.propertyType === "Land" ? "Land √" : "Land");
  set("C22", data.propertyType === "Special Use" ? "Sp. Use √" : "Sp. Use");
  set("D22", data.propertyType === "Industrial" ? "Industrial √" : "Industrial");
  set("B23", data.propertyType === "Residential" ? "RES: √" : "RES:");

  // Row 21-23: Deposit info
  set("J21", data.depositAmount ?? "");
  set("G22", data.interestBearing === false ? "No √" : "No");
  set("F22", data.interestBearing === true ? "Yes √" : "Yes");
  set("J22", data.depositHeldByCBRE ? "CBRE:" : "");
  set("K23", data.depositHeldBy || "");

  // Row 24: Parcel size
  set("C24", data.parcelSizeAcres ? `${data.parcelSizeAcres} AC` : "");

  // Row 26-29: Building details
  set("C26", data.buildingSF ?? 0);
  set("C27", data.numberOfUnits ?? 0);
  set("C28", data.portfolio ? "Yes  √" : "Yes");
  set("D28", !data.portfolio ? "No  √" : "No");
  set("C29", data.numberOfBuildings ?? 0);

  // Row 29: Occupier industry
  set("F29", data.occupierIndustry || "");

  // Row 30-32: CBRE Listing
  set("C30", data.cbreListing ? "Yes √" : "Yes ");
  set("D30", !data.cbreListing ? "No √" : "No");
  set("C31", data.listingType === "Open" ? "Open √" : "Open");
  set("D31", data.listingType === "Exclusive" ? "Exclusive √" : "Exclusive");
  set("E31", data.listingType === "MLS" ? "MLS √" : "MLS");
  set("A32", data.listingType === "Off Market" ? "off market √" : "off market");

  // Row 33-39: Vendor solicitor
  set("C33", data.vendorSolicitor?.name || "");
  set("B34", data.vendorSolicitor?.contactName || "");
  set("B35", data.vendorSolicitor?.phone || "");
  set("A36", `Mailing Address:\n${data.vendorSolicitor?.address || ""}`);
  set("A39", data.vendorSolicitor?.city || "");
  set("C39", data.vendorSolicitor?.province || "");
  set("D39", data.vendorSolicitor?.postalCode || "");

  // Row 41-47: Purchaser solicitor + outside broker
  set("C41", data.purchaserSolicitor?.name || "");
  set("B42", data.purchaserSolicitor?.contactName || "");
  set("B43", data.purchaserSolicitor?.phone || "");
  set("A44", `Mailing Address:\n${data.purchaserSolicitor?.address || ""}`);
  set("E45", data.purchaserSolicitor?.suite || "");
  set("A47", data.purchaserSolicitor?.city || "");
  set("C47", data.purchaserSolicitor?.province || "");
  set("D47", data.purchaserSolicitor?.postalCode || "");

  // Outside broker
  set("F42", data.outsideBrokerContact || "");
  set("J48", data.outsideBrokerCommission ?? 0);

  // Row 53: Commission calculation
  set("A53", data.purchasePrice ?? "");
  if (data.commissionType === "setFee") {
    set("E53", "Set Fee Agreement");
    set("H53", data.commissionSetFee ?? "");
  } else {
    set("E53", data.commissionPercentage || "");
    setFormula("H53", `=A53*E53`);
  }

  // Commission distribution
  const splits = commission?.splits || [
    { name: "Michael Bratvold", pct: 0.395 },
    { name: "Ben Kelley", pct: 0.265 },
    { name: "Shane Endicott", pct: 0.12 },
    { name: "Dallon Kuprowski", pct: 0.16 },
    { name: "Luke Jansen", pct: 0.06 },
  ];

  const offices = commission?.offices || [];

  // Row 59: Main branch total
  setFormula("I59", `=(H55*0.5)/2`);

  // Rows 60-64: Individual splits
  for (let i = 0; i < splits.length && i < 10; i++) {
    const row = 60 + i;
    set(`B${row}`, "Saskatoon");
    set(`E${row}`, splits[i].name);
    setFormula(`I${row}`, `=$I$59*${splits[i].pct}`);
  }

  // Additional offices
  if (offices.length > 0) {
    let row = 60 + splits.length + 1;
    for (const office of offices) {
      set(`B${row}`, office.name);
      setFormula(`I${row}`, `=(H55*${office.share})/2`);
      row++;
      if (office.people) {
        for (const p of office.people) {
          set(`B${row}`, office.name);
          set(`E${row}`, p.name);
          setFormula(`I${row}`, `=I${row - 1 - office.people.indexOf(p)}*${p.pct}`);
          row++;
        }
      }
    }
  }

  // Invoice recipient
  set("A72", data.invoiceRecipient === "Vendor" ? "Vendor     √" : "Vendor     ");
  set("C72", data.invoiceRecipient === "Vendor's Lawyer" ? "Vendor's Lawyer √" : "Vendor's Lawyer");
  set("A73", data.invoiceRecipient === "Purchaser" ? "Purchaser √" : "Purchaser");
  set("C73", data.invoiceRecipient === "Purchaser's Lawyer" ? "Purchaser's Lawyer √" : "Purchaser's Lawyer");
  set("A74", data.invoiceRecipient === "Outside Broker" ? "Outside Broker √" : "Outside Broker ");

  // Broker name
  set("G75", `Broker:  ${splits[0]?.name || "Michael Bratvold"}`);

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
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

    const buffer = type === "lease"
      ? await generateLeaseFromTemplate(data, commission)
      : await generateSaleFromTemplate(data, commission);

    const filename = `TR_${type === "lease" ? "Lease" : "Sale"}_${Date.now()}.xlsx`;
    const outDir = path.join(process.cwd(), "tmp");
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, filename);

    fs.writeFileSync(outPath, buffer);

    return NextResponse.json({ filename, downloadUrl: `/api/trade-records/download?file=${filename}` });
  } catch (err) {
    console.error("Trade record generation error:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
