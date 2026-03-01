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

  // Helper for formula cells — strip leading = (ExcelJS doesn't want it)
  const setFormula = (cell: string, formula: string, result?: number) => {
    const f = formula.startsWith("=") ? formula.slice(1) : formula;
    ws.getCell(cell).value = { formula: f, result: result ?? 0 } as ExcelJS.CellFormulaValue;
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

  // Row 7-8: Engaged By / Paid By checkmarks (X under LANDLORD or TENANT columns)
  // Row 6 headers: H-I = LANDLORD, J-K = TENANT
  // Row 7 = ENGAGED BY, Row 8 = PAID BY
  if (data.engagedBy === "Landlord") {
    set("H7", "X");
  } else if (data.engagedBy === "Tenant") {
    set("J7", "X");
  }
  if (data.paidBy === "Landlord") {
    set("H8", "X");
  } else if (data.paidBy === "Tenant") {
    set("J8", "X");
  }

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
  // Template: A=Total SF, C=@, D=Rate PSF, F=@, G=Term (years), H=Total (A*D*G), I=Commission %, J=Commission (H*I)
  // Row 48: J48 = SUM(J42:K47) total billing
  
  const leaseCommType = data.leaseCommissionType || "percentage";
  const schedule = data.leaseSchedule || [];
  const totalSF = data.totalSF || 0;

  // === COMMISSION CALCULATION (rows 42-47) ===
  // Template has formulas in most rows but some cells are null (e.g. H44, J44).
  // Strategy: set INPUT cells (D=rate, G=term, I=commission%), and ensure every row
  // has A (SF ref), H (=A*D*G), and J (=H*I) formulas. Write formulas only for rows
  // that need them; existing shared formulas will work on their own.

  // First, ensure every row 42-47 has the A, H, J formulas (fill gaps in template)
  for (let r = 42; r <= 47; r++) {
    const aCell = ws.getCell(`A${r}`);
    const hCell = ws.getCell(`H${r}`);
    const jCell = ws.getCell(`J${r}`);
    // A column: SF reference — if not a formula, set it
    if (!aCell.value || (typeof aCell.value === 'object' && !('formula' in aCell.value) && !('sharedFormula' in aCell.value))) {
      aCell.value = { formula: '$I$23' } as ExcelJS.CellFormulaValue;
    }
    // H column: Total = SF × Rate × Term
    if (!hCell.value || (typeof hCell.value === 'object' && !('formula' in hCell.value) && !('sharedFormula' in hCell.value))) {
      hCell.value = { formula: `A${r}*D${r}*G${r}` } as ExcelJS.CellFormulaValue;
    }
    // J column: Commission = Total × Rate
    if (!jCell.value || (typeof jCell.value === 'object' && !('formula' in jCell.value) && !('sharedFormula' in jCell.value))) {
      jCell.value = { formula: `H${r}*I${r}` } as ExcelJS.CellFormulaValue;
    }
  }

  if (leaseCommType === "setFee") {
    // Set fee: populate deal value columns (SF, Rent PSF, Term) from lease schedule
    // but leave I (commission rate) blank — commission is just the flat fee in J
    const setFeeSchedule = (data.leaseSchedule || []).filter((s: { rentPSF: number }) => s.rentPSF > 0);
    const setFeeFallbackRent = data.baseAnnualRentPSF || 0;
    for (let i = 0; i < 6; i++) {
      const row = 42 + i;
      if (i < setFeeSchedule.length) {
        const s = setFeeSchedule[i];
        // D = rent PSF from lease schedule
        set(`D${row}`, s.rentPSF || setFeeFallbackRent);
        // G = term years for this period
        const start = new Date(s.startDate);
        const end = new Date(s.endDate);
        const diffMs = end.getTime() - start.getTime();
        const years = isNaN(diffMs) || diffMs <= 0 ? 1 : Math.max(1, Math.round(diffMs / (365.25 * 24 * 3600 * 1000)));
        set(`G${row}`, years);
      } else if (i === 0 && setFeeSchedule.length === 0 && setFeeFallbackRent > 0) {
        // No schedule but have base rent — show single row
        set(`D${row}`, setFeeFallbackRent);
        // Estimate term from termStart/termEnd
        let termYears = 0;
        if (data.termStart && data.termEnd) {
          const s = new Date(`${data.termStart.year}-${data.termStart.month}-${data.termStart.day}`);
          const e = new Date(`${data.termEnd.year}-${data.termEnd.month}-${data.termEnd.day}`);
          const diff = e.getTime() - s.getTime();
          if (!isNaN(diff) && diff > 0) termYears = Math.max(1, Math.round(diff / (365.25 * 24 * 3600 * 1000)));
        }
        set(`G${row}`, termYears);
      } else {
        set(`D${row}`, 0);
        set(`G${row}`, 0);
      }
      // I = no commission rate for set fee — leave blank
      set(`I${row}`, "");
    }
    // Total commission = the set fee, placed in J42
    // Clear J formula so it doesn't try to calculate, just show the flat fee
    ws.getCell("J42").value = data.leaseCommissionSetFee || 0;
    for (let i = 1; i < 6; i++) {
      ws.getCell(`J${42 + i}`).value = null;
    }
  } else if (leaseCommType === "dollarPSF") {
    // $/SF/Year mode:
    //   D = tenant rent PSF (for reference/display)
    //   G = term years
    //   H = A*D*G (deal value = SF × rent × term) — template formula, untouched
    //   I = commission rate in $/SF/Year (e.g. $1.50)
    //   J = SF × commission $/SF × term = A*I*G (override template formula)
    const lines = data.dollarPSFLines && data.dollarPSFLines.length > 0
      ? data.dollarPSFLines
      : [{ ratePSF: data.commissionDollarPSF || 0, termYears: data.commissionDollarPSFTerm || 0 }];
    // Get rent PSF from lease schedule for display in D column
    const leaseRents = (data.leaseSchedule || []).map((s: { rentPSF: number }) => s.rentPSF || 0);
    const fallbackRent = data.baseAnnualRentPSF || 0;
    for (let i = 0; i < 6; i++) {
      const row = 42 + i;
      if (i < lines.length) {
        // D = tenant net rent PSF (from lease schedule, or base rent — never the commission rate)
        set(`D${row}`, leaseRents[i] || fallbackRent);
        set(`G${row}`, lines[i].termYears || 0);
        // I = commission $/SF/Year rate — override cell format from % to currency
        const iCell = ws.getCell(`I${row}`);
        iCell.value = lines[i].ratePSF || 0;
        iCell.numFmt = '$#,##0.00';
        // J = SF × $/SF commission × term (override template's H*I formula)
        setFormula(`J${row}`, `A${row}*I${row}*G${row}`);
      } else {
        set(`D${row}`, 0);
        set(`G${row}`, 0);
        const iCellEmpty = ws.getCell(`I${row}`);
        iCellEmpty.value = 0;
        iCellEmpty.numFmt = '$#,##0.00';
        setFormula(`J${row}`, `A${row}*I${row}*G${row}`);
      }
    }
  } else {
    // Percentage: SF × Rate PSF × Term × Commission %
    // Template formulas handle everything — just fill D (rate), G (term), I (comm %)
    const commissionLines = data.commissionLines || [];
    
    const lines = commissionLines.length > 0 ? commissionLines : schedule
      .filter((s: { rentPSF: number }) => s.rentPSF > 0)
      .map((s: { startDate: string; endDate: string; rentPSF: number }, i: number) => {
        const start = new Date(s.startDate);
        const end = new Date(s.endDate);
        const years = Math.max(1, Math.round((end.getTime() - start.getTime()) / (365.25 * 24 * 3600 * 1000)));
        return {
          ratePSF: s.rentPSF,
          termYears: years,
          commissionRate: i === 0 ? 0.05 : 0.02,
        };
      });

    for (let i = 0; i < 6; i++) {
      const row = 42 + i;
      if (i < lines.length) {
        set(`D${row}`, lines[i].ratePSF || 0);
        set(`G${row}`, lines[i].termYears || 0);
        set(`I${row}`, lines[i].commissionRate || 0);
      } else {
        set(`D${row}`, 0);
        set(`G${row}`, 0);
        set(`I${row}`, 0);
      }
    }
  }

  // Row 48: Template already has J48=SUM(J42:K47) and F48=SUM(H42:H48) — don't touch

  // === COMMISSION DISTRIBUTION (rows 51-69) ===
  // Template: F51=(J48/2), F52=$F$51*0.385, etc., F70=SUM(F51:F69)
  const splits = commission?.splits || [
    { name: "Michael Bratvold", pct: 0.385 },
    { name: "Ben Kelley", pct: 0.265 },
    { name: "Shane Endicott", pct: 0.12 },
    { name: "Dallon Kuprowski", pct: 0.16 },
    { name: "Luke Jansen", pct: 0.07 },
  ];

  // Branch share — override F51 formula with user's configured share
  const branchSharePct = commission?.offices?.[0]?.share || 0.5;
  const branchCalc = (data.totalSF || 0); // for result estimation
  setFormula("F51", `=J48*${branchSharePct}`);

  // Individual splits — write name + formula referencing F51
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

  // Row 51: Deposits held (amount in J51, held by in J53, interest in I54/I55)
  set("J51", data.depositsHeld ?? data.depositAmount ?? "");
  set("J53", data.depositHeldBy || "");
  // Interest bearing: YES in I54, NO in I55
  if (data.depositInterestBearing === true) {
    set("I54", "YES:  ✓");
  } else if (data.depositInterestBearing === false) {
    set("I55", "NO:  ✓");
  }

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

  // Force Excel to recalculate all formulas on open
  wb.calcProperties = { fullCalcOnLoad: true };

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
  const setFormula = (cell: string, formula: string, result?: number) => {
    const f = formula.startsWith("=") ? formula.slice(1) : formula;
    ws.getCell(cell).value = { formula: f, result: result ?? 0 } as ExcelJS.CellFormulaValue;
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

  // === SALE COMMISSION ===
  // Template structure:
  //   A53=Price, E53=Commission % (or "Set Fee"), H53=Total Commission
  //   H54=A54*E54 (2nd commission line, usually empty)
  //   H55=H53+H54 (Total of all commission lines) — LEAVE THIS FORMULA
  //   I59=(H55*branchShare)/2 — branch total (÷2 is CBRE corporate split)
  //   I60+=$I$59*pct — individual splits

  const price = data.purchasePrice ?? 0;
  set("A53", price);
  if (data.commissionType === "setFee" && data.commissionSetFee) {
    set("E53", "Set Fee Agreement");
    set("H53", data.commissionSetFee);
  } else {
    const commPct = data.commissionPercentage || 0;
    set("E53", commPct);
    setFormula("H53", "=A53*E53");
  }

  // H55 template formula =H53+H54 is already there — don't touch it

  // Commission distribution
  const splits = commission?.splits || [
    { name: "Michael Bratvold", pct: 0.395 },
    { name: "Ben Kelley", pct: 0.265 },
    { name: "Shane Endicott", pct: 0.12 },
    { name: "Dallon Kuprowski", pct: 0.16 },
    { name: "Luke Jansen", pct: 0.06 },
  ];

  const offices = commission?.offices || [];
  const mainBranchShare = offices.length > 0 ? offices[0].share : 0.5;

  // I59: Branch total = (Total Commission × Branch Share) / 2 (CBRE corporate split)
  set("A59", offices[0]?.branchNum || "100101");
  set("B59", offices[0]?.name || "Saskatoon");
  setFormula("I59", `=(H55*${mainBranchShare})/2`);

  // Individual splits — formula referencing I59
  for (let i = 0; i < splits.length && i < 10; i++) {
    const row = 60 + i;
    set(`B${row}`, offices[0]?.name || "Saskatoon");
    set(`E${row}`, splits[i].name);
    setFormula(`I${row}`, `=$I$59*${splits[i].pct}`);
  }

  // Clear any leftover rows from template (e.g. Calgary office example data)
  const firstClearRow = 60 + splits.length;
  for (let row = firstClearRow; row <= 68; row++) {
    ws.getCell(`A${row}`).value = null;
    ws.getCell(`B${row}`).value = null;
    ws.getCell(`E${row}`).value = null;
    ws.getCell(`I${row}`).value = null;
  }

  // Additional offices — only if user explicitly added them
  if (offices.length > 1) {
    let row = 60 + splits.length + 1;
    for (let oi = 1; oi < offices.length; oi++) {
      const office = offices[oi];
      set(`A${row}`, office.branchNum || "");
      set(`B${row}`, office.name);
      const officeRow = row;
      setFormula(`I${row}`, `=(H55*${office.share})/2`);
      row++;
      if (office.people) {
        for (const p of office.people) {
          set(`B${row}`, office.name);
          set(`E${row}`, p.name);
          setFormula(`I${row}`, `=I${officeRow}*${p.pct}`);
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

  // Force Excel to recalculate all formulas on open
  wb.calcProperties = { fullCalcOnLoad: true };

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
