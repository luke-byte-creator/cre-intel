import ExcelJS from 'exceljs';

export interface QuickInputs {
  propertyName: string;
  address: string;
  city: string;
  propertyType: string;

  tenants: {
    tenantName: string;
    suite?: string;
    sf: number;
    leaseStart?: string;
    leaseExpiry?: string;
    baseRentPSF: number;
    baseRentAnnual: number;
    recoveryType?: string;
    recoveryPSF?: number;
  }[];

  operatingCostsPSF: number;
  propertyTaxPSF: number;
  propertyTaxIncludedInOpex: boolean;
  vacancyRate: number;
  managementPct: number;
  capRateLow: number;
  capRateMid: number;
  capRateHigh: number;
  purchasePrice?: number;
  capitalReservesPSF: number;
  notes?: string;

  auditTrail?: {
    field: string;
    value: string;
    sourceDoc: string;
    confidence: string;
    reasoning: string;
  }[];
}

// Styling constants (matching institutional model)
const NAVY = 'FF1B2A4A';
const MED_BLUE = 'FF2C3E7A';
const SUBTOTAL_FILL = 'FFF0F0F0';
const WHITE_FONT: Partial<ExcelJS.Font> = { color: { argb: 'FFFFFFFF' }, bold: true };
const HEADER_FILL = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const NUM_FMT = { currency: '#,##0', currDec: '#,##0.00', pct: '0.00%', date: 'MMM-YYYY' };

function colLetter(col: number): string {
  let s = '';
  while (col > 0) { col--; s = String.fromCharCode(65 + (col % 26)) + s; col = Math.floor(col / 26); }
  return s;
}

function titleBanner(ws: ExcelJS.Worksheet, row: number, text: string, colEnd = 12) {
  const r = ws.getRow(row);
  r.height = 30;
  for (let c = 1; c <= colEnd; c++) {
    const cell = r.getCell(c);
    cell.fill = HEADER_FILL(NAVY);
    cell.font = { ...WHITE_FONT, size: 13, name: 'Arial' };
  }
  r.getCell(1).value = text;
}

function sectionHeader(ws: ExcelJS.Worksheet, row: number, text: string, colStart = 1, colEnd = 12) {
  const r = ws.getRow(row);
  r.height = 24;
  for (let c = colStart; c <= colEnd; c++) {
    const cell = r.getCell(c);
    cell.fill = HEADER_FILL(MED_BLUE);
    cell.font = { ...WHITE_FONT, size: 10, name: 'Arial' };
  }
  r.getCell(colStart).value = text;
}

function subtotalRow(ws: ExcelJS.Worksheet, row: number, colEnd = 12) {
  const r = ws.getRow(row);
  for (let c = 1; c <= colEnd; c++) {
    r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SUBTOTAL_FILL } };
    r.getCell(c).font = { bold: true, name: 'Arial', size: 10 };
  }
}

function calcRemainingYears(expiry?: string): number {
  if (!expiry) return 0;
  const d = new Date(expiry);
  if (isNaN(d.getTime())) return 0;
  const diff = (d.getTime() - Date.now()) / (365.25 * 24 * 60 * 60 * 1000);
  return Math.max(0, Math.round(diff * 100) / 100);
}

export async function generateQuickModel(inputs: QuickInputs): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Nova Research';
  wb.created = new Date();

  const tenants = inputs.tenants || [];
  const totalNRA = tenants.reduce((s, t) => s + (t.sf || 0), 0);
  const totalBaseRent = tenants.reduce((s, t) => s + (t.baseRentAnnual || 0), 0);
  const totalRecoveryIncome = tenants.reduce((s, t) => s + ((t.recoveryPSF || 0) * (t.sf || 0)), 0);
  const today = new Date().toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' });

  // ═══ TAB 1: RENT ROLL ═══
  const ws1 = wb.addWorksheet('Rent Roll');
  // Column widths
  ws1.getColumn(1).width = 22; // Tenant
  ws1.getColumn(2).width = 10; // Suite
  ws1.getColumn(3).width = 10; // SF
  ws1.getColumn(4).width = 9;  // % NRA
  ws1.getColumn(5).width = 13; // Lease Start
  ws1.getColumn(6).width = 13; // Lease Expiry
  ws1.getColumn(7).width = 12; // Remaining Term
  ws1.getColumn(8).width = 12; // Base Rent PSF
  ws1.getColumn(9).width = 14; // Annual Base Rent
  ws1.getColumn(10).width = 12; // Recovery Type
  ws1.getColumn(11).width = 12; // Recovery PSF
  ws1.getColumn(12).width = 14; // Total Gross Rent

  titleBanner(ws1, 1, 'NOVA RESEARCH — RENT ROLL ANALYSIS');
  ws1.getRow(2).getCell(1).value = `${inputs.propertyName} | ${inputs.address}, ${inputs.city}`;
  ws1.getRow(2).getCell(1).font = { size: 10, name: 'Arial', color: { argb: 'FF666666' } };
  ws1.getRow(2).getCell(12).value = today;
  ws1.getRow(2).getCell(12).font = { size: 10, name: 'Arial', color: { argb: 'FF666666' } };
  ws1.getRow(2).getCell(12).alignment = { horizontal: 'right' };

  // Column headers
  const hdrRow = 4;
  const headers = ['Tenant', 'Suite', 'SF', '% of NRA', 'Lease Start', 'Lease Expiry', 'Remaining Term', 'Base Rent PSF', 'Annual Base Rent', 'Recovery Type', 'Recovery PSF', 'Total Gross Rent'];
  const hr = ws1.getRow(hdrRow);
  hr.height = 22;
  headers.forEach((h, i) => {
    const cell = hr.getCell(i + 1);
    cell.value = h;
    cell.fill = HEADER_FILL(MED_BLUE);
    cell.font = { ...WHITE_FONT, size: 9, name: 'Arial' };
    cell.alignment = { horizontal: i >= 2 ? 'right' : 'left', vertical: 'middle' };
  });
  // Recovery Type left-aligned
  hr.getCell(10).alignment = { horizontal: 'left', vertical: 'middle' };

  const dataStart = 5;
  tenants.forEach((t, i) => {
    const row = dataStart + i;
    const r = ws1.getRow(row);
    r.height = 18;
    r.getCell(1).value = t.tenantName;
    r.getCell(2).value = t.suite || '';
    r.getCell(3).value = t.sf || 0;
    r.getCell(3).numFmt = '#,##0';
    // % of NRA
    if (totalNRA > 0) {
      r.getCell(4).value = { formula: `${colLetter(3)}${row}/${totalNRA}` } as ExcelJS.CellFormulaValue;
    } else {
      r.getCell(4).value = 0;
    }
    r.getCell(4).numFmt = '0.0%';
    r.getCell(5).value = t.leaseStart || '';
    r.getCell(6).value = t.leaseExpiry || '';
    r.getCell(7).value = calcRemainingYears(t.leaseExpiry);
    r.getCell(7).numFmt = '0.0';
    r.getCell(8).value = t.baseRentPSF || 0;
    r.getCell(8).numFmt = NUM_FMT.currDec;
    r.getCell(9).value = { formula: `${colLetter(3)}${row}*${colLetter(8)}${row}` } as ExcelJS.CellFormulaValue;
    r.getCell(9).numFmt = NUM_FMT.currency;
    r.getCell(10).value = t.recoveryType || '';
    r.getCell(11).value = t.recoveryPSF || 0;
    r.getCell(11).numFmt = NUM_FMT.currDec;
    // Total Gross = Annual Base + Recovery PSF * SF
    r.getCell(12).value = { formula: `${colLetter(9)}${row}+${colLetter(11)}${row}*${colLetter(3)}${row}` } as ExcelJS.CellFormulaValue;
    r.getCell(12).numFmt = NUM_FMT.currency;

    // Alternating row shading
    if (i % 2 === 1) {
      for (let c = 1; c <= 12; c++) {
        r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FA' } };
      }
    }
    // Right-align numeric columns
    [3, 4, 7, 8, 9, 11, 12].forEach(c => { r.getCell(c).alignment = { horizontal: 'right' }; });
  });

  // Summary row
  const sumRow = dataStart + tenants.length;
  subtotalRow(ws1, sumRow, 12);
  const sr = ws1.getRow(sumRow);
  sr.getCell(1).value = 'TOTALS';
  if (tenants.length > 0) {
    sr.getCell(3).value = { formula: `SUM(C${dataStart}:C${sumRow - 1})` } as ExcelJS.CellFormulaValue;
    sr.getCell(3).numFmt = '#,##0';
    sr.getCell(4).value = 1;
    sr.getCell(4).numFmt = '0.0%';
    sr.getCell(9).value = { formula: `SUM(I${dataStart}:I${sumRow - 1})` } as ExcelJS.CellFormulaValue;
    sr.getCell(9).numFmt = NUM_FMT.currency;
    sr.getCell(12).value = { formula: `SUM(L${dataStart}:L${sumRow - 1})` } as ExcelJS.CellFormulaValue;
    sr.getCell(12).numFmt = NUM_FMT.currency;
  }

  // Wtd Avg Rent PSF
  const avgRow = sumRow + 1;
  ws1.getRow(avgRow).getCell(1).value = 'Wtd Avg Rent PSF';
  ws1.getRow(avgRow).getCell(1).font = { italic: true, size: 10, name: 'Arial', color: { argb: 'FF666666' } };
  if (tenants.length > 0 && totalNRA > 0) {
    ws1.getRow(avgRow).getCell(8).value = { formula: `I${sumRow}/C${sumRow}` } as ExcelJS.CellFormulaValue;
  }
  ws1.getRow(avgRow).getCell(8).numFmt = NUM_FMT.currDec;

  // WALT
  const waltRow = avgRow + 1;
  ws1.getRow(waltRow).getCell(1).value = 'WALT (Years)';
  ws1.getRow(waltRow).getCell(1).font = { italic: true, size: 10, name: 'Arial', color: { argb: 'FF666666' } };
  // WALT = sum(remaining_term * annual_rent) / sum(annual_rent)
  if (tenants.length > 0) {
    ws1.getRow(waltRow).getCell(8).value = { formula: `SUMPRODUCT(G${dataStart}:G${sumRow - 1},I${dataStart}:I${sumRow - 1})/SUM(I${dataStart}:I${sumRow - 1})` } as ExcelJS.CellFormulaValue;
  }
  ws1.getRow(waltRow).getCell(8).numFmt = '0.0';

  // Occupancy
  const occRow = waltRow + 1;
  ws1.getRow(occRow).getCell(1).value = 'Occupancy Rate';
  ws1.getRow(occRow).getCell(1).font = { italic: true, size: 10, name: 'Arial', color: { argb: 'FF666666' } };
  ws1.getRow(occRow).getCell(8).value = totalNRA > 0 ? 1 : 0; // Assume all tenants = occupied
  ws1.getRow(occRow).getCell(8).numFmt = '0.0%';

  ws1.views = [{ state: 'frozen', ySplit: hdrRow, xSplit: 0 }];

  // ═══ TAB 2: INCOME SUMMARY ═══
  const ws2 = wb.addWorksheet('Income Summary');
  ws2.getColumn(1).width = 3;
  ws2.getColumn(2).width = 32;
  ws2.getColumn(3).width = 16;
  ws2.getColumn(4).width = 14;
  ws2.getColumn(5).width = 14;

  titleBanner(ws2, 1, 'NOVA RESEARCH — INCOME SUMMARY', 5);
  ws2.getRow(2).getCell(2).value = `${inputs.propertyName} | ${inputs.address}, ${inputs.city}`;
  ws2.getRow(2).getCell(2).font = { size: 10, name: 'Arial', color: { argb: 'FF666666' } };
  ws2.getRow(2).getCell(5).value = today;
  ws2.getRow(2).getCell(5).font = { size: 10, name: 'Arial', color: { argb: 'FF666666' } };
  ws2.getRow(2).getCell(5).alignment = { horizontal: 'right' };

  let r2 = 4;
  sectionHeader(ws2, r2, 'REVENUE', 2, 5); r2++;
  const revStart = r2;

  const setRow = (ws: ExcelJS.Worksheet, row: number, label: string, val: ExcelJS.CellValue, fmt?: string) => {
    ws.getRow(row).getCell(2).value = label;
    ws.getRow(row).getCell(2).font = { size: 10, name: 'Arial' };
    ws.getRow(row).getCell(3).value = val;
    if (fmt) ws.getRow(row).getCell(3).numFmt = fmt;
    ws.getRow(row).getCell(3).alignment = { horizontal: 'right' };
    ws.getRow(row).height = 18;
  };

  setRow(ws2, r2, 'Base Rent', totalBaseRent, NUM_FMT.currency); r2++;
  setRow(ws2, r2, 'Recovery Income', totalRecoveryIncome, NUM_FMT.currency); r2++;
  const pgiRow = r2;
  setRow(ws2, r2, 'Potential Gross Income', { formula: `C${r2 - 2}+C${r2 - 1}` } as ExcelJS.CellFormulaValue, NUM_FMT.currency);
  subtotalRow(ws2, r2, 5); r2++;
  const vacRow = r2;
  setRow(ws2, r2, `Less: Vacancy (${(inputs.vacancyRate * 100).toFixed(1)}%)`, { formula: `-C${pgiRow}*${inputs.vacancyRate}` } as ExcelJS.CellFormulaValue, NUM_FMT.currency);
  ws2.getRow(r2).getCell(3).font = { color: { argb: 'FFCC0000' }, size: 10, name: 'Arial' }; r2++;
  const egiRow = r2;
  setRow(ws2, r2, 'Effective Gross Income', { formula: `C${pgiRow}+C${vacRow}` } as ExcelJS.CellFormulaValue, NUM_FMT.currency);
  subtotalRow(ws2, r2, 5);
  ws2.getRow(r2).getCell(2).font = { bold: true, size: 10, name: 'Arial' }; r2 += 2;

  // Expenses
  sectionHeader(ws2, r2, 'EXPENSES', 2, 5); r2++;
  const expStart = r2;
  const opexTotal = totalNRA * inputs.operatingCostsPSF;
  const taxTotal = inputs.propertyTaxIncludedInOpex ? 0 : totalNRA * inputs.propertyTaxPSF;
  setRow(ws2, r2, 'Operating Costs', opexTotal, NUM_FMT.currency); r2++;
  const taxRow = r2;
  setRow(ws2, r2, `Property Tax${inputs.propertyTaxIncludedInOpex ? ' (Incl. in Opex)' : ''}`, taxTotal, NUM_FMT.currency); r2++;
  const mgmtRow = r2;
  setRow(ws2, r2, `Management Fee (${(inputs.managementPct * 100).toFixed(1)}%)`, { formula: `C${egiRow}*${inputs.managementPct}` } as ExcelJS.CellFormulaValue, NUM_FMT.currency); r2++;
  const capResRow = r2;
  setRow(ws2, r2, 'Capital Reserves', totalNRA * inputs.capitalReservesPSF, NUM_FMT.currency); r2++;
  const totalExpRow = r2;
  setRow(ws2, r2, 'Total Expenses', { formula: `SUM(C${expStart}:C${r2 - 1})` } as ExcelJS.CellFormulaValue, NUM_FMT.currency);
  subtotalRow(ws2, r2, 5); r2 += 2;

  // NOI
  const noiRow = r2;
  sectionHeader(ws2, r2, 'NET OPERATING INCOME', 2, 5);
  ws2.getRow(r2).getCell(3).value = { formula: `C${egiRow}-C${totalExpRow}` } as ExcelJS.CellFormulaValue;
  ws2.getRow(r2).getCell(3).numFmt = NUM_FMT.currency;
  ws2.getRow(r2).getCell(3).font = { ...WHITE_FONT, size: 11, name: 'Arial' };
  ws2.getRow(r2).getCell(3).alignment = { horizontal: 'right' };
  r2 += 2;

  // Valuation Range
  sectionHeader(ws2, r2, 'VALUATION RANGE', 2, 5); r2++;
  // Headers
  const valHdr = ws2.getRow(r2);
  ['', 'Cap Rate', 'Value', 'Per SF'].forEach((h, i) => {
    valHdr.getCell(i + 2).value = h;
    valHdr.getCell(i + 2).font = { bold: true, size: 10, name: 'Arial' };
  });
  r2++;

  const capRates = [
    { label: 'Low', rate: inputs.capRateLow },
    { label: 'Mid', rate: inputs.capRateMid },
    { label: 'High', rate: inputs.capRateHigh },
  ];
  capRates.forEach(cr => {
    ws2.getRow(r2).getCell(2).value = cr.label;
    ws2.getRow(r2).getCell(3).value = cr.rate;
    ws2.getRow(r2).getCell(3).numFmt = NUM_FMT.pct;
    ws2.getRow(r2).getCell(4).value = { formula: `C${noiRow}/C${r2}` } as ExcelJS.CellFormulaValue;
    ws2.getRow(r2).getCell(4).numFmt = NUM_FMT.currency;
    ws2.getRow(r2).getCell(5).value = totalNRA > 0 ? { formula: `D${r2}/${totalNRA}` } as ExcelJS.CellFormulaValue : 0;
    ws2.getRow(r2).getCell(5).numFmt = NUM_FMT.currDec;
    ws2.getRow(r2).height = 18;
    r2++;
  });
  r2++;

  // Purchase price analysis
  if (inputs.purchasePrice) {
    sectionHeader(ws2, r2, 'PURCHASE ANALYSIS', 2, 5); r2++;
    setRow(ws2, r2, 'Purchase Price', inputs.purchasePrice, NUM_FMT.currency); r2++;
    const ppRow = r2 - 1;
    setRow(ws2, r2, 'Going-in Cap Rate', { formula: `C${noiRow}/C${ppRow}` } as ExcelJS.CellFormulaValue, NUM_FMT.pct); r2++;
    setRow(ws2, r2, 'Price Per SF', totalNRA > 0 ? { formula: `C${ppRow}/${totalNRA}` } as ExcelJS.CellFormulaValue : 0, NUM_FMT.currDec); r2++;
    r2++;
  }

  // Key Metrics
  sectionHeader(ws2, r2, 'KEY METRICS', 2, 5); r2++;
  setRow(ws2, r2, 'NOI Per SF', totalNRA > 0 ? { formula: `C${noiRow}/${totalNRA}` } as ExcelJS.CellFormulaValue : 0, NUM_FMT.currDec); r2++;
  setRow(ws2, r2, 'Expense Ratio', { formula: `C${totalExpRow}/C${egiRow}` } as ExcelJS.CellFormulaValue, NUM_FMT.pct); r2++;
  setRow(ws2, r2, 'Operating Cost PSF', inputs.operatingCostsPSF, NUM_FMT.currDec); r2++;
  setRow(ws2, r2, 'Occupancy', 1, NUM_FMT.pct); r2++;

  // Notes
  if (inputs.notes) {
    r2++;
    sectionHeader(ws2, r2, 'NOTES', 2, 5); r2++;
    ws2.getRow(r2).getCell(2).value = inputs.notes;
    ws2.getRow(r2).getCell(2).font = { size: 10, name: 'Arial', color: { argb: 'FF555555' } };
    ws2.mergeCells(r2, 2, r2, 5);
    ws2.getRow(r2).getCell(2).alignment = { wrapText: true };
  }

  ws2.views = [{ state: 'frozen', ySplit: 3, xSplit: 0 }];

  // ═══ TAB 3: LEASE EXPIRY PROFILE ═══
  const ws3 = wb.addWorksheet('Lease Expiry Profile');
  ws3.getColumn(1).width = 12;
  ws3.getColumn(2).width = 14;
  ws3.getColumn(3).width = 12;
  ws3.getColumn(4).width = 12;
  ws3.getColumn(5).width = 16;
  ws3.getColumn(6).width = 13;
  ws3.getColumn(7).width = 13;
  ws3.getColumn(8).width = 13;

  titleBanner(ws3, 1, 'NOVA RESEARCH — LEASE EXPIRY PROFILE', 8);
  ws3.getRow(2).getCell(1).value = `${inputs.propertyName} | ${inputs.address}, ${inputs.city}`;
  ws3.getRow(2).getCell(1).font = { size: 10, name: 'Arial', color: { argb: 'FF666666' } };

  // Build expiry buckets
  const expiryMap = new Map<string, { count: number; sf: number; rent: number }>();
  const noExpiryKey = 'MTM / No Expiry';
  tenants.forEach(t => {
    const expiry = t.leaseExpiry;
    let year = noExpiryKey;
    if (expiry) {
      const d = new Date(expiry);
      if (!isNaN(d.getTime())) year = String(d.getFullYear());
    }
    const existing = expiryMap.get(year) || { count: 0, sf: 0, rent: 0 };
    existing.count++;
    existing.sf += t.sf || 0;
    existing.rent += t.baseRentAnnual || 0;
    expiryMap.set(year, existing);
  });

  // Sort years
  const years = Array.from(expiryMap.keys()).sort((a, b) => {
    if (a === noExpiryKey) return 1;
    if (b === noExpiryKey) return -1;
    return Number(a) - Number(b);
  });

  const expHdr = 4;
  const expHeaders = ['Year', '# Tenants', 'SF Expiring', '% of SF', 'Rent Expiring', '% of Rent', 'Cum. SF %', 'Cum. Rent %'];
  const ehr = ws3.getRow(expHdr);
  ehr.height = 22;
  expHeaders.forEach((h, i) => {
    const cell = ehr.getCell(i + 1);
    cell.value = h;
    cell.fill = HEADER_FILL(MED_BLUE);
    cell.font = { ...WHITE_FONT, size: 9, name: 'Arial' };
    cell.alignment = { horizontal: i >= 1 ? 'right' : 'left', vertical: 'middle' };
  });
  ehr.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };

  let cumSF = 0, cumRent = 0;
  const expDataStart = 5;
  years.forEach((year, i) => {
    const row = expDataStart + i;
    const data = expiryMap.get(year)!;
    cumSF += data.sf;
    cumRent += data.rent;
    const r = ws3.getRow(row);
    r.height = 18;
    r.getCell(1).value = year;
    r.getCell(2).value = data.count;
    r.getCell(2).numFmt = '#,##0';
    r.getCell(3).value = data.sf;
    r.getCell(3).numFmt = '#,##0';
    r.getCell(4).value = totalNRA > 0 ? data.sf / totalNRA : 0;
    r.getCell(4).numFmt = '0.0%';
    r.getCell(5).value = data.rent;
    r.getCell(5).numFmt = NUM_FMT.currency;
    r.getCell(6).value = totalBaseRent > 0 ? data.rent / totalBaseRent : 0;
    r.getCell(6).numFmt = '0.0%';
    r.getCell(7).value = totalNRA > 0 ? cumSF / totalNRA : 0;
    r.getCell(7).numFmt = '0.0%';
    r.getCell(8).value = totalBaseRent > 0 ? cumRent / totalBaseRent : 0;
    r.getCell(8).numFmt = '0.0%';
    [2, 3, 4, 5, 6, 7, 8].forEach(c => { r.getCell(c).alignment = { horizontal: 'right' }; });
    if (i % 2 === 1) {
      for (let c = 1; c <= 8; c++) {
        r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FA' } };
      }
    }
  });

  // Summary metrics below
  const metricStart = expDataStart + years.length + 2;
  sectionHeader(ws3, metricStart, 'SUMMARY METRICS', 1, 8);

  // WALT
  let walt = 0;
  if (totalBaseRent > 0) {
    walt = tenants.reduce((s, t) => s + calcRemainingYears(t.leaseExpiry) * (t.baseRentAnnual || 0), 0) / totalBaseRent;
  }
  ws3.getRow(metricStart + 1).getCell(1).value = 'WALT (Years)';
  ws3.getRow(metricStart + 1).getCell(1).font = { size: 10, name: 'Arial' };
  ws3.getRow(metricStart + 1).getCell(3).value = walt;
  ws3.getRow(metricStart + 1).getCell(3).numFmt = '0.0';

  // Largest tenant exposure
  const maxRentTenant = tenants.reduce((max, t) => (t.baseRentAnnual || 0) > (max.baseRentAnnual || 0) ? t : max, tenants[0] || { baseRentAnnual: 0 });
  const largestExposure = totalBaseRent > 0 ? (maxRentTenant?.baseRentAnnual || 0) / totalBaseRent : 0;
  ws3.getRow(metricStart + 2).getCell(1).value = 'Largest Tenant Exposure';
  ws3.getRow(metricStart + 2).getCell(1).font = { size: 10, name: 'Arial' };
  ws3.getRow(metricStart + 2).getCell(3).value = largestExposure;
  ws3.getRow(metricStart + 2).getCell(3).numFmt = '0.0%';

  // Near-term rollover (within 2 years)
  const twoYearsFromNow = new Date();
  twoYearsFromNow.setFullYear(twoYearsFromNow.getFullYear() + 2);
  const nearTermRent = tenants.filter(t => {
    if (!t.leaseExpiry) return false;
    const d = new Date(t.leaseExpiry);
    return !isNaN(d.getTime()) && d <= twoYearsFromNow;
  }).reduce((s, t) => s + (t.baseRentAnnual || 0), 0);
  ws3.getRow(metricStart + 3).getCell(1).value = 'Near-Term Rollover Risk (2yr)';
  ws3.getRow(metricStart + 3).getCell(1).font = { size: 10, name: 'Arial' };
  ws3.getRow(metricStart + 3).getCell(3).value = totalBaseRent > 0 ? nearTermRent / totalBaseRent : 0;
  ws3.getRow(metricStart + 3).getCell(3).numFmt = '0.0%';

  ws3.views = [{ state: 'frozen', ySplit: expHdr, xSplit: 0 }];

  // ═══ TAB 4: AUDIT TRAIL ═══
  const ws4 = wb.addWorksheet('Audit Trail');
  ws4.getColumn(1).width = 22;
  ws4.getColumn(2).width = 20;
  ws4.getColumn(3).width = 20;
  ws4.getColumn(4).width = 12;
  ws4.getColumn(5).width = 40;

  titleBanner(ws4, 1, 'NOVA RESEARCH — AUDIT TRAIL', 5);

  const atHdr = 3;
  const atHeaders = ['Field', 'Value', 'Source', 'Confidence', 'Reasoning'];
  const ahr = ws4.getRow(atHdr);
  ahr.height = 22;
  atHeaders.forEach((h, i) => {
    const cell = ahr.getCell(i + 1);
    cell.value = h;
    cell.fill = HEADER_FILL(MED_BLUE);
    cell.font = { ...WHITE_FONT, size: 9, name: 'Arial' };
  });

  (inputs.auditTrail || []).forEach((entry, i) => {
    const row = atHdr + 1 + i;
    const r = ws4.getRow(row);
    r.height = 18;
    r.getCell(1).value = entry.field;
    r.getCell(2).value = entry.value;
    r.getCell(3).value = entry.sourceDoc;
    r.getCell(4).value = entry.confidence;
    r.getCell(5).value = entry.reasoning;
    r.getCell(5).alignment = { wrapText: true };
    if (i % 2 === 1) {
      for (let c = 1; c <= 5; c++) {
        r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FA' } };
      }
    }
  });

  ws4.views = [{ state: 'frozen', ySplit: atHdr, xSplit: 0 }];

  // Set default font for all worksheets
  [ws1, ws2, ws3, ws4].forEach(ws => {
    ws.eachRow(row => {
      row.eachCell(cell => {
        if (!cell.font?.name) {
          cell.font = { ...cell.font, name: 'Arial', size: cell.font?.size || 10 };
        }
      });
    });
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
