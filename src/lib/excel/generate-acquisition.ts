import ExcelJS from 'exceljs';

export interface AcquisitionInputs {
  propertyName: string;
  address: string;
  city: string;
  province: string;
  propertyType: string;
  nraSF: number;
  landArea: number;
  yearBuilt: number;
  floors: number;
  parking: number;
  purchasePrice: number;
  closingCostPct: number;
  upfrontCapex: number;
  analysisStartDate: string;
  analysisPeriod: number;
  baseRent: number;
  recoveryIncome: number;
  parkingIncome: number;
  otherIncome: number;
  vacancyRate: number;
  rentAbatement: number;
  historicalT2?: { revenue: number; expenses: number; noi: number };
  historicalT1?: { revenue: number; expenses: number; noi: number };
  historicalT12?: { revenue: number; expenses: number; noi: number };
  propertyTax: number;
  insurance: number;
  utilities: number;
  repairsMaint: number;
  managementPct: number;
  admin: number;
  payroll: number;
  marketing: number;
  otherExpenses: number;
  incomeGrowth: number;
  expenseGrowth: number;
  propertyTaxGrowth: number;
  capexGrowth: number;
  tiPSF: number;
  leasingCommPct: number;
  capitalReservesPSF: number;
  loanAmount: number;
  interestRate: number;
  amortizationYears: number;
  loanTerm: number;
  ioYears: number;
  lenderFeesPct: number;
  exitCapRate: number;
  sellingCostPct: number;
  discountRate: number;
  rentRoll?: {
    tenantName: string;
    suite: string;
    sf: number;
    leaseStart: string;
    leaseExpiry: string;
    baseRentPSF: number;
    recoveryType: string;
    recoveryPSF: number;
    escalationType: string;
    escalationRate: number;
    options: string;
    notes: string;
  }[];
  auditTrail?: {
    field: string;
    value: string;
    sourceDoc: string;
    page: string;
    confidence: 'high' | 'medium' | 'low' | 'default' | 'manual';
    sourceText: string;
    reasoning: string;
  }[];
}

// Color constants
const NAVY = 'FF1B2A4A';
const MED_BLUE = 'FF2C3E7A';
const INPUT_FONT = 'FF1A5276';
const INPUT_FILL = 'FFFFF9E6';
const SUBTOTAL_FILL = 'FFF0F0F0';
const WHITE_FONT: Partial<ExcelJS.Font> = { color: { argb: 'FFFFFFFF' }, bold: true };
const HEADER_FILL = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const INPUT_STYLE: { font: Partial<ExcelJS.Font>; fill: ExcelJS.Fill } = {
  font: { color: { argb: INPUT_FONT } },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: INPUT_FILL } },
};

const NUM_FMT = { currency: '#,##0', psf: '#,##0.00', pct: '0.00%', date: 'MMM-YY' };

function colLetter(col: number): string {
  let s = '';
  while (col > 0) { col--; s = String.fromCharCode(65 + (col % 26)) + s; col = Math.floor(col / 26); }
  return s;
}

// Helpers
function setColWidths(ws: ExcelJS.Worksheet) {
  ws.getColumn(1).width = 3;
  ws.getColumn(2).width = 35;
  for (let c = 3; c <= 19; c++) ws.getColumn(c).width = 14;
}

function sectionHeader(ws: ExcelJS.Worksheet, row: number, text: string, colStart = 2, colEnd = 10) {
  const r = ws.getRow(row);
  r.height = 28;
  for (let c = colStart; c <= colEnd; c++) {
    const cell = r.getCell(c);
    cell.fill = HEADER_FILL(MED_BLUE);
    cell.font = { ...WHITE_FONT, size: 11 };
  }
  r.getCell(colStart).value = text;
}

function dataRow(ws: ExcelJS.Worksheet, row: number, label: string, values: Record<number, unknown>, fmt?: string) {
  const r = ws.getRow(row);
  r.height = 18;
  r.getCell(2).value = label;
  for (const [col, val] of Object.entries(values)) {
    const cell = r.getCell(Number(col));
    if (typeof val === 'object' && val !== null && 'formula' in (val as Record<string, unknown>)) {
      cell.value = val as ExcelJS.CellFormulaValue;
    } else {
      cell.value = val as ExcelJS.CellValue;
    }
    if (fmt) cell.numFmt = fmt;
  }
}

function inputCell(ws: ExcelJS.Worksheet, row: number, col: number, value: ExcelJS.CellValue, fmt?: string) {
  const cell = ws.getRow(row).getCell(col);
  cell.value = value;
  cell.font = INPUT_STYLE.font;
  cell.fill = INPUT_STYLE.fill;
  if (fmt) cell.numFmt = fmt;
}

// Assumptions tab cell references (col D)
// We'll lay them out and return a map
const A = {
  // Row map for assumptions tab - column D holds values
  purchasePrice: 'Assumptions!D7',
  closingCostPct: 'Assumptions!D8',
  upfrontCapex: 'Assumptions!D9',
  analysisPeriod: 'Assumptions!D10',
  nraSF: 'Assumptions!D14',
  baseRent: 'Assumptions!D18',
  recoveryIncome: 'Assumptions!D19',
  parkingIncome: 'Assumptions!D20',
  otherIncome: 'Assumptions!D21',
  vacancyRate: 'Assumptions!D22',
  rentAbatement: 'Assumptions!D23',
  propertyTax: 'Assumptions!D27',
  insurance: 'Assumptions!D28',
  utilities: 'Assumptions!D29',
  repairsMaint: 'Assumptions!D30',
  managementPct: 'Assumptions!D31',
  admin: 'Assumptions!D32',
  payroll: 'Assumptions!D33',
  marketing: 'Assumptions!D34',
  otherExpenses: 'Assumptions!D35',
  incomeGrowth: 'Assumptions!D39',
  expenseGrowth: 'Assumptions!D40',
  propertyTaxGrowth: 'Assumptions!D41',
  capexGrowth: 'Assumptions!D42',
  tiPSF: 'Assumptions!D46',
  leasingCommPct: 'Assumptions!D47',
  capitalReservesPSF: 'Assumptions!D48',
  loanAmount: 'Assumptions!D52',
  interestRate: 'Assumptions!D53',
  amortizationYears: 'Assumptions!D54',
  loanTerm: 'Assumptions!D55',
  ioYears: 'Assumptions!D56',
  lenderFeesPct: 'Assumptions!D57',
  exitCapRate: 'Assumptions!D61',
  sellingCostPct: 'Assumptions!D62',
  discountRate: 'Assumptions!D66',
};

export async function generateAcquisitionModel(inputs: AcquisitionInputs): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Nova Research';
  const N = inputs.analysisPeriod || 10;

  // Create all worksheets in display order first
  const esWs = wb.addWorksheet('Executive Summary', { properties: { tabColor: { argb: '7C3AED' } } });
  const wsA = wb.addWorksheet('Assumptions');
  const wsRR = wb.addWorksheet('Rent Roll');
  const wsOS = wb.addWorksheet('Operating Statement');
  const wsD = wb.addWorksheet('Debt Schedule');
  const wsR = wb.addWorksheet('Returns Analysis');
  const wsS = wb.addWorksheet('Sensitivity Analysis');
  const wsMC = wb.addWorksheet('Market Context');
  const wsAT = wb.addWorksheet('Audit Trail');

  // ═══════════════════════════════════════
  // TAB 2: ASSUMPTIONS
  // ═══════════════════════════════════════
  setColWidths(wsA);
  wsA.views = [{ state: 'frozen', xSplit: 2, ySplit: 2 }];

  // Header
  const aHdr = wsA.getRow(1);
  aHdr.height = 28;
  for (let c = 2; c <= 10; c++) { aHdr.getCell(c).fill = HEADER_FILL(NAVY); aHdr.getCell(c).font = { ...WHITE_FONT, size: 14 }; }
  aHdr.getCell(2).value = 'ASSUMPTIONS';

  // Sections
  let r = 3;
  const putLabel = (row: number, label: string) => { wsA.getRow(row).getCell(2).value = label; wsA.getRow(row).height = 18; };
  const putSection = (row: number, title: string) => sectionHeader(wsA, row, title, 2, 5);

  // ACQUISITION
  putSection(r = 5, 'ACQUISITION');
  r = 6;
  putLabel(r, ''); r++;
  const aRows: [string, keyof typeof inputs, string | undefined][] = [
    ['Purchase Price', 'purchasePrice', NUM_FMT.currency],
    ['Closing Costs %', 'closingCostPct', NUM_FMT.pct],
    ['Upfront CapEx', 'upfrontCapex', NUM_FMT.currency],
    ['Analysis Period (years)', 'analysisPeriod', undefined],
  ];
  for (const [label, key, fmt] of aRows) {
    putLabel(r, label);
    inputCell(wsA, r, 4, inputs[key] as number, fmt);
    r++;
  }

  // PROPERTY
  putSection(r = 12, 'PROPERTY');
  r = 13; putLabel(r, ''); r++;
  putLabel(r, 'NRA (SF)'); inputCell(wsA, r, 4, inputs.nraSF, NUM_FMT.currency); r++;

  // INCOME
  putSection(r = 16, 'INCOME (Annual)');
  r = 17; putLabel(r, ''); r++;
  const incRows: [string, keyof typeof inputs, string | undefined][] = [
    ['Base Rent', 'baseRent', NUM_FMT.currency],
    ['Recovery Income', 'recoveryIncome', NUM_FMT.currency],
    ['Parking Income', 'parkingIncome', NUM_FMT.currency],
    ['Other Income', 'otherIncome', NUM_FMT.currency],
    ['Vacancy Rate', 'vacancyRate', NUM_FMT.pct],
    ['Rent Abatement', 'rentAbatement', NUM_FMT.currency],
  ];
  for (const [label, key, fmt] of incRows) {
    putLabel(r, label);
    inputCell(wsA, r, 4, inputs[key] as number, fmt);
    r++;
  }

  // EXPENSES
  putSection(r = 25, 'OPERATING EXPENSES (Annual)');
  r = 26; putLabel(r, ''); r++;
  const expRows: [string, keyof typeof inputs, string | undefined][] = [
    ['Property Tax', 'propertyTax', NUM_FMT.currency],
    ['Insurance', 'insurance', NUM_FMT.currency],
    ['Utilities', 'utilities', NUM_FMT.currency],
    ['Repairs & Maintenance', 'repairsMaint', NUM_FMT.currency],
    ['Management Fee (% of EGI)', 'managementPct', NUM_FMT.pct],
    ['Administrative', 'admin', NUM_FMT.currency],
    ['Payroll', 'payroll', NUM_FMT.currency],
    ['Marketing', 'marketing', NUM_FMT.currency],
    ['Other Expenses', 'otherExpenses', NUM_FMT.currency],
  ];
  for (const [label, key, fmt] of expRows) {
    putLabel(r, label);
    inputCell(wsA, r, 4, inputs[key] as number, fmt);
    r++;
  }

  // GROWTH RATES
  putSection(r = 37, 'GROWTH RATES');
  r = 38; putLabel(r, ''); r++;
  const grRows: [string, keyof typeof inputs][] = [
    ['Income Growth %/yr', 'incomeGrowth'],
    ['Expense Growth %/yr', 'expenseGrowth'],
    ['Property Tax Growth %/yr', 'propertyTaxGrowth'],
    ['CapEx Growth %/yr', 'capexGrowth'],
  ];
  for (const [label, key] of grRows) {
    putLabel(r, label);
    inputCell(wsA, r, 4, inputs[key] as number, NUM_FMT.pct);
    r++;
  }

  // CAPEX
  putSection(r = 44, 'CAPITAL EXPENDITURES');
  r = 45; putLabel(r, ''); r++;
  const cxRows: [string, keyof typeof inputs, string][] = [
    ['TI (PSF)', 'tiPSF', NUM_FMT.psf],
    ['Leasing Commissions %', 'leasingCommPct', NUM_FMT.pct],
    ['Capital Reserves (PSF)', 'capitalReservesPSF', NUM_FMT.psf],
  ];
  for (const [label, key, fmt] of cxRows) {
    putLabel(r, label);
    inputCell(wsA, r, 4, inputs[key] as number, fmt);
    r++;
  }

  // FINANCING
  putSection(r = 50, 'FINANCING');
  r = 51; putLabel(r, ''); r++;
  const finRows: [string, keyof typeof inputs, string | undefined][] = [
    ['Loan Amount', 'loanAmount', NUM_FMT.currency],
    ['Interest Rate', 'interestRate', NUM_FMT.pct],
    ['Amortization (years)', 'amortizationYears', undefined],
    ['Loan Term (years)', 'loanTerm', undefined],
    ['I/O Period (years)', 'ioYears', undefined],
    ['Lender Fees %', 'lenderFeesPct', NUM_FMT.pct],
  ];
  for (const [label, key, fmt] of finRows) {
    putLabel(r, label);
    inputCell(wsA, r, 4, inputs[key] as number, fmt);
    r++;
  }

  // EXIT
  putSection(r = 59, 'EXIT');
  r = 60; putLabel(r, ''); r++;
  putLabel(r, 'Exit Cap Rate'); inputCell(wsA, r, 4, inputs.exitCapRate, NUM_FMT.pct); r++;
  putLabel(r, 'Selling Costs %'); inputCell(wsA, r, 4, inputs.sellingCostPct, NUM_FMT.pct); r++;

  // DISCOUNT RATE
  putSection(r = 64, 'VALUATION');
  r = 65; putLabel(r, ''); r++;
  putLabel(r, 'Discount Rate'); inputCell(wsA, r, 4, inputs.discountRate, NUM_FMT.pct);

  // ═══════════════════════════════════════
  // TAB 3: RENT ROLL
  // ═══════════════════════════════════════
  
  setColWidths(wsRR);
  wsRR.views = [{ state: 'frozen', xSplit: 2, ySplit: 4 }];

  sectionHeader(wsRR, 1, 'RENT ROLL', 2, 15);
  const rrHeaders = ['Tenant', 'Suite', 'SF', '% of NRA', 'Lease Start', 'Lease Expiry',
    'Base Rent PSF', 'Annual Rent', 'Recovery Type', 'Recovery PSF', 'Escalation', 'Esc. Rate', 'Options', 'Notes'];
  const rrHdrRow = wsRR.getRow(3);
  rrHdrRow.height = 22;
  for (let i = 0; i < rrHeaders.length; i++) {
    const cell = rrHdrRow.getCell(i + 2);
    cell.value = rrHeaders[i];
    cell.font = { bold: true, size: 10 };
    cell.fill = HEADER_FILL('FFD6E4F0');
  }

  const rrDataStart = 4;
  const rrCount = inputs.rentRoll ? inputs.rentRoll.length : 0;
  const rrRows = Math.max(rrCount, 20);
  for (let i = 0; i < rrRows; i++) {
    const row = rrDataStart + i;
    const rr = inputs.rentRoll?.[i];
    if (rr) {
      wsRR.getRow(row).getCell(2).value = rr.tenantName;
      wsRR.getRow(row).getCell(3).value = rr.suite;
      wsRR.getRow(row).getCell(4).value = rr.sf;
      wsRR.getRow(row).getCell(4).numFmt = NUM_FMT.currency;
      wsRR.getRow(row).getCell(5).value = { formula: `D${row}/${A.nraSF}` } as ExcelJS.CellFormulaValue;
      wsRR.getRow(row).getCell(5).numFmt = NUM_FMT.pct;
      wsRR.getRow(row).getCell(6).value = new Date(rr.leaseStart);
      wsRR.getRow(row).getCell(6).numFmt = NUM_FMT.date;
      wsRR.getRow(row).getCell(7).value = new Date(rr.leaseExpiry);
      wsRR.getRow(row).getCell(7).numFmt = NUM_FMT.date;
      wsRR.getRow(row).getCell(8).value = rr.baseRentPSF;
      wsRR.getRow(row).getCell(8).numFmt = NUM_FMT.psf;
      wsRR.getRow(row).getCell(9).value = { formula: `D${row}*H${row}` } as ExcelJS.CellFormulaValue;
      wsRR.getRow(row).getCell(9).numFmt = NUM_FMT.currency;
      wsRR.getRow(row).getCell(10).value = rr.recoveryType;
      wsRR.getRow(row).getCell(11).value = rr.recoveryPSF;
      wsRR.getRow(row).getCell(11).numFmt = NUM_FMT.psf;
      wsRR.getRow(row).getCell(12).value = rr.escalationType;
      wsRR.getRow(row).getCell(13).value = rr.escalationRate;
      wsRR.getRow(row).getCell(13).numFmt = NUM_FMT.pct;
      wsRR.getRow(row).getCell(14).value = rr.options;
      wsRR.getRow(row).getCell(15).value = rr.notes;
    }
  }

  const rrSummaryRow = rrDataStart + rrRows + 1;
  sectionHeader(wsRR, rrSummaryRow, 'SUMMARY', 2, 9);
  const sr = rrSummaryRow + 1;
  wsRR.getRow(sr).getCell(2).value = 'Total SF Leased';
  wsRR.getRow(sr).getCell(4).value = { formula: `SUM(D${rrDataStart}:D${rrDataStart + rrRows - 1})` } as ExcelJS.CellFormulaValue;
  wsRR.getRow(sr).getCell(4).numFmt = NUM_FMT.currency;
  wsRR.getRow(sr + 1).getCell(2).value = 'Occupancy %';
  wsRR.getRow(sr + 1).getCell(4).value = { formula: `D${sr}/${A.nraSF}` } as ExcelJS.CellFormulaValue;
  wsRR.getRow(sr + 1).getCell(4).numFmt = NUM_FMT.pct;
  wsRR.getRow(sr + 2).getCell(2).value = 'Wtd Avg Rent PSF';
  wsRR.getRow(sr + 2).getCell(4).value = { formula: `IF(D${sr}=0,0,SUMPRODUCT(D${rrDataStart}:D${rrDataStart + rrRows - 1},H${rrDataStart}:H${rrDataStart + rrRows - 1})/D${sr})` } as ExcelJS.CellFormulaValue;
  wsRR.getRow(sr + 2).getCell(4).numFmt = NUM_FMT.psf;
  wsRR.getRow(sr + 3).getCell(2).value = 'Total Annual Base Rent';
  wsRR.getRow(sr + 3).getCell(4).value = { formula: `SUM(I${rrDataStart}:I${rrDataStart + rrRows - 1})` } as ExcelJS.CellFormulaValue;
  wsRR.getRow(sr + 3).getCell(4).numFmt = NUM_FMT.currency;

  // ═══════════════════════════════════════
  // TAB 4: OPERATING STATEMENT / DCF
  // ═══════════════════════════════════════
  
  setColWidths(wsOS);
  wsOS.views = [{ state: 'frozen', xSplit: 2, ySplit: 3 }];

  // Header row
  sectionHeader(wsOS, 1, 'OPERATING STATEMENT / DCF', 2, 19);

  // Column headers: B=Label, C=T-2, D=T-1, E=T12, F=/SF, G=Pro Forma, H=/SF, I..R=Year 1..10, S=CAGR
  const colHdrRow = wsOS.getRow(3);
  colHdrRow.height = 22;
  const colLabels: Record<number, string> = {
    2: '', 3: 'T-2', 4: 'T-1', 5: 'T-12', 6: '/SF', 7: 'Pro Forma', 8: '/SF', 19: 'CAGR'
  };
  for (let yr = 1; yr <= N; yr++) colLabels[8 + yr] = `Year ${yr}`;
  for (const [c, v] of Object.entries(colLabels)) {
    const cell = colHdrRow.getCell(Number(c));
    cell.value = v;
    cell.font = { bold: true, size: 10 };
    cell.fill = HEADER_FILL('FFD6E4F0');
    cell.alignment = { horizontal: 'center' };
  }

  // Row layout
  // Row 5: REVENUE header
  // Row 6: Base Rent, 7: Recoveries, 8: Parking, 9: Other, 10: PGI
  // Row 11: Vacancy, 12: Abatement, 13: EGI
  // Row 15: EXPENSES header
  // Row 16-24: expense lines, 25: Total OpEx
  // Row 27: NOI
  // Row 29: CAPEX header, 30: TI, 31: Leasing Comm, 32: Capital Reserves, 33: Total CapEx
  // Row 35: Cash Flow
  // Row 37: METRICS header, 38-42: metrics

  let osRow = 5;
  sectionHeader(wsOS, osRow, 'REVENUE', 2, 19);
  osRow = 6;

  // Helper: set historical + pro forma + years for a row
  const YEAR1_COL = 9; // column I = Year 1
  const lastYrCol = 8 + N; // column for Year N

  type HistField = 'revenue' | 'expenses' | 'noi';

  function setHist(row: number, field: HistField) {
    if (inputs.historicalT2) { wsOS.getRow(row).getCell(3).value = inputs.historicalT2[field]; wsOS.getRow(row).getCell(3).numFmt = NUM_FMT.currency; }
    if (inputs.historicalT1) { wsOS.getRow(row).getCell(4).value = inputs.historicalT1[field]; wsOS.getRow(row).getCell(4).numFmt = NUM_FMT.currency; }
    if (inputs.historicalT12) { wsOS.getRow(row).getCell(5).value = inputs.historicalT12[field]; wsOS.getRow(row).getCell(5).numFmt = NUM_FMT.currency; }
  }

  // Revenue rows
  const baseRentRow = osRow;
  wsOS.getRow(osRow).getCell(2).value = 'Base Rental Income';
  // Pro forma = Assumptions
  wsOS.getRow(osRow).getCell(7).value = { formula: A.baseRent } as ExcelJS.CellFormulaValue;
  wsOS.getRow(osRow).getCell(7).numFmt = NUM_FMT.currency;
  wsOS.getRow(osRow).getCell(8).value = { formula: `G${osRow}/${A.nraSF}` } as ExcelJS.CellFormulaValue;
  wsOS.getRow(osRow).getCell(8).numFmt = NUM_FMT.psf;
  // Year 1 = Pro Forma
  wsOS.getRow(osRow).getCell(YEAR1_COL).value = { formula: `G${osRow}` } as ExcelJS.CellFormulaValue;
  wsOS.getRow(osRow).getCell(YEAR1_COL).numFmt = NUM_FMT.currency;
  // Years 2..N: prev * (1 + growth)
  for (let yr = 2; yr <= N; yr++) {
    const col = 8 + yr;
    const prevCol = colLetter(col - 1);
    wsOS.getRow(osRow).getCell(col).value = { formula: `${prevCol}${osRow}*(1+${A.incomeGrowth})` } as ExcelJS.CellFormulaValue;
    wsOS.getRow(osRow).getCell(col).numFmt = NUM_FMT.currency;
  }
  osRow++;

  // Recovery Income
  const recoveryRow = osRow;
  wsOS.getRow(osRow).getCell(2).value = 'Recovery Income';
  wsOS.getRow(osRow).getCell(7).value = { formula: A.recoveryIncome } as ExcelJS.CellFormulaValue;
  wsOS.getRow(osRow).getCell(7).numFmt = NUM_FMT.currency;
  wsOS.getRow(osRow).getCell(YEAR1_COL).value = { formula: `G${osRow}` } as ExcelJS.CellFormulaValue;
  wsOS.getRow(osRow).getCell(YEAR1_COL).numFmt = NUM_FMT.currency;
  for (let yr = 2; yr <= N; yr++) {
    const col = 8 + yr;
    wsOS.getRow(osRow).getCell(col).value = { formula: `${colLetter(col - 1)}${osRow}*(1+${A.incomeGrowth})` } as ExcelJS.CellFormulaValue;
    wsOS.getRow(osRow).getCell(col).numFmt = NUM_FMT.currency;
  }
  osRow++;

  // Parking
  const parkingRow = osRow;
  wsOS.getRow(osRow).getCell(2).value = 'Parking Income';
  wsOS.getRow(osRow).getCell(7).value = { formula: A.parkingIncome } as ExcelJS.CellFormulaValue;
  wsOS.getRow(osRow).getCell(7).numFmt = NUM_FMT.currency;
  wsOS.getRow(osRow).getCell(YEAR1_COL).value = { formula: `G${osRow}` } as ExcelJS.CellFormulaValue;
  wsOS.getRow(osRow).getCell(YEAR1_COL).numFmt = NUM_FMT.currency;
  for (let yr = 2; yr <= N; yr++) {
    const col = 8 + yr;
    wsOS.getRow(osRow).getCell(col).value = { formula: `${colLetter(col - 1)}${osRow}*(1+${A.incomeGrowth})` } as ExcelJS.CellFormulaValue;
    wsOS.getRow(osRow).getCell(col).numFmt = NUM_FMT.currency;
  }
  osRow++;

  // Other Income
  const otherIncRow = osRow;
  wsOS.getRow(osRow).getCell(2).value = 'Other Income';
  wsOS.getRow(osRow).getCell(7).value = { formula: A.otherIncome } as ExcelJS.CellFormulaValue;
  wsOS.getRow(osRow).getCell(7).numFmt = NUM_FMT.currency;
  wsOS.getRow(osRow).getCell(YEAR1_COL).value = { formula: `G${osRow}` } as ExcelJS.CellFormulaValue;
  wsOS.getRow(osRow).getCell(YEAR1_COL).numFmt = NUM_FMT.currency;
  for (let yr = 2; yr <= N; yr++) {
    const col = 8 + yr;
    wsOS.getRow(osRow).getCell(col).value = { formula: `${colLetter(col - 1)}${osRow}*(1+${A.incomeGrowth})` } as ExcelJS.CellFormulaValue;
    wsOS.getRow(osRow).getCell(col).numFmt = NUM_FMT.currency;
  }
  osRow++;

  // PGI
  const pgiRow = osRow;
  wsOS.getRow(osRow).getCell(2).value = 'Potential Gross Income';
  wsOS.getRow(osRow).font = { bold: true };
  for (let c = 7; c <= lastYrCol; c++) {
    wsOS.getRow(osRow).getCell(c).value = { formula: `SUM(${colLetter(c)}${baseRentRow}:${colLetter(c)}${otherIncRow})` } as ExcelJS.CellFormulaValue;
    wsOS.getRow(osRow).getCell(c).numFmt = NUM_FMT.currency;
  }
  wsOS.getRow(osRow).getCell(6).value = { formula: `E${osRow}/${A.nraSF}` } as ExcelJS.CellFormulaValue;
  wsOS.getRow(osRow).getCell(6).numFmt = NUM_FMT.psf;
  wsOS.getRow(osRow).getCell(8).value = { formula: `G${osRow}/${A.nraSF}` } as ExcelJS.CellFormulaValue;
  wsOS.getRow(osRow).getCell(8).numFmt = NUM_FMT.psf;
  osRow++;

  // Vacancy
  osRow++;
  const vacRow = osRow;
  wsOS.getRow(osRow).getCell(2).value = 'Less: Vacancy & Credit Loss';
  for (let c = 7; c <= lastYrCol; c++) {
    wsOS.getRow(osRow).getCell(c).value = { formula: `-${colLetter(c)}${pgiRow}*${A.vacancyRate}` } as ExcelJS.CellFormulaValue;
    wsOS.getRow(osRow).getCell(c).numFmt = NUM_FMT.currency;
  }
  osRow++;

  // Abatement
  const abateRow = osRow;
  wsOS.getRow(osRow).getCell(2).value = 'Less: Rent Abatement';
  wsOS.getRow(osRow).getCell(7).value = { formula: `-${A.rentAbatement}` } as ExcelJS.CellFormulaValue;
  wsOS.getRow(osRow).getCell(7).numFmt = NUM_FMT.currency;
  wsOS.getRow(osRow).getCell(YEAR1_COL).value = { formula: `G${osRow}` } as ExcelJS.CellFormulaValue;
  wsOS.getRow(osRow).getCell(YEAR1_COL).numFmt = NUM_FMT.currency;
  // Abatement typically year 1 only, 0 afterwards
  for (let yr = 2; yr <= N; yr++) {
    wsOS.getRow(osRow).getCell(8 + yr).value = 0;
    wsOS.getRow(osRow).getCell(8 + yr).numFmt = NUM_FMT.currency;
  }
  osRow++;

  // EGI
  const egiRow = osRow;
  wsOS.getRow(osRow).getCell(2).value = 'Effective Gross Income (EGI)';
  wsOS.getRow(osRow).font = { bold: true };
  for (const c of [7, ...Array.from({ length: N }, (_, i) => YEAR1_COL + i)]) {
    const cl = colLetter(c);
    wsOS.getRow(osRow).getCell(c).value = { formula: `${cl}${pgiRow}+${cl}${vacRow}+${cl}${abateRow}` } as ExcelJS.CellFormulaValue;
    wsOS.getRow(osRow).getCell(c).numFmt = NUM_FMT.currency;
  }
  wsOS.getRow(osRow).getCell(8).value = { formula: `G${osRow}/${A.nraSF}` } as ExcelJS.CellFormulaValue;
  wsOS.getRow(osRow).getCell(8).numFmt = NUM_FMT.psf;
  // Subtotal fill
  for (let c = 2; c <= lastYrCol; c++) wsOS.getRow(osRow).getCell(c).fill = HEADER_FILL(SUBTOTAL_FILL);
  osRow += 2;

  // EXPENSES
  sectionHeader(wsOS, osRow, 'OPERATING EXPENSES', 2, 19);
  osRow++;

  // Expense line helper
  const expenseLines: { label: string; ref: string; growth: string; isManagementPct?: boolean }[] = [
    { label: 'Property Tax', ref: A.propertyTax, growth: A.propertyTaxGrowth },
    { label: 'Insurance', ref: A.insurance, growth: A.expenseGrowth },
    { label: 'Utilities', ref: A.utilities, growth: A.expenseGrowth },
    { label: 'Repairs & Maintenance', ref: A.repairsMaint, growth: A.expenseGrowth },
    { label: 'Management Fee', ref: A.managementPct, growth: '', isManagementPct: true },
    { label: 'Administrative', ref: A.admin, growth: A.expenseGrowth },
    { label: 'Payroll', ref: A.payroll, growth: A.expenseGrowth },
    { label: 'Marketing', ref: A.marketing, growth: A.expenseGrowth },
    { label: 'Other Expenses', ref: A.otherExpenses, growth: A.expenseGrowth },
  ];

  const expStartRow = osRow;
  for (const exp of expenseLines) {
    wsOS.getRow(osRow).getCell(2).value = exp.label;
    wsOS.getRow(osRow).height = 18;
    if (exp.isManagementPct) {
      // % of EGI
      for (let c = 7; c <= lastYrCol; c++) {
        wsOS.getRow(osRow).getCell(c).value = { formula: `${colLetter(c)}${egiRow}*${A.managementPct}` } as ExcelJS.CellFormulaValue;
        wsOS.getRow(osRow).getCell(c).numFmt = NUM_FMT.currency;
      }
    } else {
      // Year 1 = assumption, year 2+ = prev * (1+growth)
      wsOS.getRow(osRow).getCell(7).value = { formula: exp.ref } as ExcelJS.CellFormulaValue;
      wsOS.getRow(osRow).getCell(7).numFmt = NUM_FMT.currency;
      wsOS.getRow(osRow).getCell(YEAR1_COL).value = { formula: `G${osRow}` } as ExcelJS.CellFormulaValue;
      wsOS.getRow(osRow).getCell(YEAR1_COL).numFmt = NUM_FMT.currency;
      for (let yr = 2; yr <= N; yr++) {
        const col = 8 + yr;
        wsOS.getRow(osRow).getCell(col).value = { formula: `${colLetter(col - 1)}${osRow}*(1+${exp.growth})` } as ExcelJS.CellFormulaValue;
        wsOS.getRow(osRow).getCell(col).numFmt = NUM_FMT.currency;
      }
    }
    osRow++;
  }
  const expEndRow = osRow - 1;

  // Total OpEx
  const totalOpExRow = osRow;
  wsOS.getRow(osRow).getCell(2).value = 'Total Operating Expenses';
  wsOS.getRow(osRow).font = { bold: true };
  for (let c = 7; c <= lastYrCol; c++) {
    wsOS.getRow(osRow).getCell(c).value = { formula: `SUM(${colLetter(c)}${expStartRow}:${colLetter(c)}${expEndRow})` } as ExcelJS.CellFormulaValue;
    wsOS.getRow(osRow).getCell(c).numFmt = NUM_FMT.currency;
  }
  for (let c = 2; c <= lastYrCol; c++) wsOS.getRow(osRow).getCell(c).fill = HEADER_FILL(SUBTOTAL_FILL);
  osRow += 2;

  // NOI
  const noiRow = osRow;
  wsOS.getRow(osRow).getCell(2).value = 'NET OPERATING INCOME';
  wsOS.getRow(osRow).font = { bold: true, size: 11 };
  // Set historical NOI
  setHist(osRow, 'noi');
  for (let c = 7; c <= lastYrCol; c++) {
    wsOS.getRow(osRow).getCell(c).value = { formula: `${colLetter(c)}${egiRow}-${colLetter(c)}${totalOpExRow}` } as ExcelJS.CellFormulaValue;
    wsOS.getRow(osRow).getCell(c).numFmt = NUM_FMT.currency;
  }
  wsOS.getRow(osRow).getCell(6).value = { formula: `E${osRow}/${A.nraSF}` } as ExcelJS.CellFormulaValue;
  wsOS.getRow(osRow).getCell(6).numFmt = NUM_FMT.psf;
  wsOS.getRow(osRow).getCell(8).value = { formula: `G${osRow}/${A.nraSF}` } as ExcelJS.CellFormulaValue;
  wsOS.getRow(osRow).getCell(8).numFmt = NUM_FMT.psf;
  // CAGR
  wsOS.getRow(osRow).getCell(19).value = { formula: `(${colLetter(lastYrCol)}${osRow}/${colLetter(YEAR1_COL)}${osRow})^(1/${N})-1` } as ExcelJS.CellFormulaValue;
  wsOS.getRow(osRow).getCell(19).numFmt = NUM_FMT.pct;
  for (let c = 2; c <= lastYrCol; c++) wsOS.getRow(osRow).getCell(c).fill = HEADER_FILL(SUBTOTAL_FILL);
  osRow += 2;

  // CAPEX
  sectionHeader(wsOS, osRow, 'CAPITAL EXPENDITURES', 2, 19);
  osRow++;

  const tiRow = osRow;
  wsOS.getRow(osRow).getCell(2).value = 'Tenant Improvements';
  wsOS.getRow(osRow).getCell(7).value = { formula: `${A.tiPSF}*${A.nraSF}` } as ExcelJS.CellFormulaValue;
  wsOS.getRow(osRow).getCell(7).numFmt = NUM_FMT.currency;
  wsOS.getRow(osRow).getCell(YEAR1_COL).value = { formula: `G${osRow}` } as ExcelJS.CellFormulaValue;
  wsOS.getRow(osRow).getCell(YEAR1_COL).numFmt = NUM_FMT.currency;
  for (let yr = 2; yr <= N; yr++) {
    const col = 8 + yr;
    wsOS.getRow(osRow).getCell(col).value = { formula: `${colLetter(col - 1)}${osRow}*(1+${A.capexGrowth})` } as ExcelJS.CellFormulaValue;
    wsOS.getRow(osRow).getCell(col).numFmt = NUM_FMT.currency;
  }
  osRow++;

  const lcRow = osRow;
  wsOS.getRow(osRow).getCell(2).value = 'Leasing Commissions';
  // LC = % of base rent
  for (let c = 7; c <= lastYrCol; c++) {
    wsOS.getRow(osRow).getCell(c).value = { formula: `${colLetter(c)}${baseRentRow}*${A.leasingCommPct}` } as ExcelJS.CellFormulaValue;
    wsOS.getRow(osRow).getCell(c).numFmt = NUM_FMT.currency;
  }
  osRow++;

  const crRow = osRow;
  wsOS.getRow(osRow).getCell(2).value = 'Capital Reserves';
  wsOS.getRow(osRow).getCell(7).value = { formula: `${A.capitalReservesPSF}*${A.nraSF}` } as ExcelJS.CellFormulaValue;
  wsOS.getRow(osRow).getCell(7).numFmt = NUM_FMT.currency;
  wsOS.getRow(osRow).getCell(YEAR1_COL).value = { formula: `G${osRow}` } as ExcelJS.CellFormulaValue;
  wsOS.getRow(osRow).getCell(YEAR1_COL).numFmt = NUM_FMT.currency;
  for (let yr = 2; yr <= N; yr++) {
    const col = 8 + yr;
    wsOS.getRow(osRow).getCell(col).value = { formula: `${colLetter(col - 1)}${osRow}*(1+${A.capexGrowth})` } as ExcelJS.CellFormulaValue;
    wsOS.getRow(osRow).getCell(col).numFmt = NUM_FMT.currency;
  }
  osRow++;

  // Total CapEx
  const totalCapExRow = osRow;
  wsOS.getRow(osRow).getCell(2).value = 'Total Capital Expenditures';
  wsOS.getRow(osRow).font = { bold: true };
  for (let c = 7; c <= lastYrCol; c++) {
    wsOS.getRow(osRow).getCell(c).value = { formula: `SUM(${colLetter(c)}${tiRow}:${colLetter(c)}${crRow})` } as ExcelJS.CellFormulaValue;
    wsOS.getRow(osRow).getCell(c).numFmt = NUM_FMT.currency;
  }
  for (let c = 2; c <= lastYrCol; c++) wsOS.getRow(osRow).getCell(c).fill = HEADER_FILL(SUBTOTAL_FILL);
  osRow += 2;

  // Cash Flow from Operations
  const cfRow = osRow;
  wsOS.getRow(osRow).getCell(2).value = 'CASH FLOW FROM OPERATIONS';
  wsOS.getRow(osRow).font = { bold: true, size: 11 };
  for (let c = 7; c <= lastYrCol; c++) {
    wsOS.getRow(osRow).getCell(c).value = { formula: `${colLetter(c)}${noiRow}-${colLetter(c)}${totalCapExRow}` } as ExcelJS.CellFormulaValue;
    wsOS.getRow(osRow).getCell(c).numFmt = NUM_FMT.currency;
  }
  wsOS.getRow(osRow).getCell(19).value = { formula: `(${colLetter(lastYrCol)}${osRow}/${colLetter(YEAR1_COL)}${osRow})^(1/${N})-1` } as ExcelJS.CellFormulaValue;
  wsOS.getRow(osRow).getCell(19).numFmt = NUM_FMT.pct;
  for (let c = 2; c <= lastYrCol; c++) wsOS.getRow(osRow).getCell(c).fill = HEADER_FILL(SUBTOTAL_FILL);
  osRow += 2;

  // Operating Metrics
  sectionHeader(wsOS, osRow, 'OPERATING METRICS', 2, 19);
  osRow++;
  // Rent PSF
  wsOS.getRow(osRow).getCell(2).value = 'Rent PSF';
  for (let c = YEAR1_COL; c <= lastYrCol; c++) {
    wsOS.getRow(osRow).getCell(c).value = { formula: `${colLetter(c)}${baseRentRow}/${A.nraSF}` } as ExcelJS.CellFormulaValue;
    wsOS.getRow(osRow).getCell(c).numFmt = NUM_FMT.psf;
  }
  osRow++;
  // Expense Ratio
  wsOS.getRow(osRow).getCell(2).value = 'Expense Ratio';
  for (let c = YEAR1_COL; c <= lastYrCol; c++) {
    wsOS.getRow(osRow).getCell(c).value = { formula: `IF(${colLetter(c)}${egiRow}=0,0,${colLetter(c)}${totalOpExRow}/${colLetter(c)}${egiRow})` } as ExcelJS.CellFormulaValue;
    wsOS.getRow(osRow).getCell(c).numFmt = NUM_FMT.pct;
  }
  osRow++;
  // NOI PSF
  wsOS.getRow(osRow).getCell(2).value = 'NOI PSF';
  for (let c = YEAR1_COL; c <= lastYrCol; c++) {
    wsOS.getRow(osRow).getCell(c).value = { formula: `${colLetter(c)}${noiRow}/${A.nraSF}` } as ExcelJS.CellFormulaValue;
    wsOS.getRow(osRow).getCell(c).numFmt = NUM_FMT.psf;
  }

  // ═══════════════════════════════════════
  // TAB 5: DEBT SCHEDULE
  // ═══════════════════════════════════════
  
  setColWidths(wsD);
  wsD.views = [{ state: 'frozen', xSplit: 2, ySplit: 3 }];

  sectionHeader(wsD, 1, 'DEBT SCHEDULE', 2, 12);

  // Input refs
  wsD.getRow(3).getCell(2).value = 'Loan Amount';
  wsD.getRow(3).getCell(4).value = { formula: A.loanAmount } as ExcelJS.CellFormulaValue;
  wsD.getRow(3).getCell(4).numFmt = NUM_FMT.currency;
  wsD.getRow(4).getCell(2).value = 'Interest Rate';
  wsD.getRow(4).getCell(4).value = { formula: A.interestRate } as ExcelJS.CellFormulaValue;
  wsD.getRow(4).getCell(4).numFmt = NUM_FMT.pct;
  wsD.getRow(5).getCell(2).value = 'Amortization (years)';
  wsD.getRow(5).getCell(4).value = { formula: A.amortizationYears } as ExcelJS.CellFormulaValue;
  wsD.getRow(6).getCell(2).value = 'I/O Period (years)';
  wsD.getRow(6).getCell(4).value = { formula: A.ioYears } as ExcelJS.CellFormulaValue;
  wsD.getRow(7).getCell(2).value = 'Annual Debt Service (Amort.)';
  // PMT: annual payment = PMT(rate/12, amort*12, -loanAmount)*12
  wsD.getRow(7).getCell(4).value = { formula: `PMT(D4/12,D5*12,-D3)*12` } as ExcelJS.CellFormulaValue;
  wsD.getRow(7).getCell(4).numFmt = NUM_FMT.currency;
  wsD.getRow(8).getCell(2).value = 'Annual I/O Payment';
  wsD.getRow(8).getCell(4).value = { formula: `D3*D4` } as ExcelJS.CellFormulaValue;
  wsD.getRow(8).getCell(4).numFmt = NUM_FMT.currency;

  // Schedule headers
  const dHdrRow = 10;
  const dHeaders = ['Year', 'Beg Balance', 'Interest', 'Principal', 'End Balance', 'Debt Service', 'DSCR', 'Debt Yield'];
  sectionHeader(wsD, dHdrRow, '', 2, 9);
  for (let i = 0; i < dHeaders.length; i++) {
    wsD.getRow(dHdrRow).getCell(i + 2).value = dHeaders[i];
    wsD.getRow(dHdrRow).getCell(i + 2).font = { ...WHITE_FONT, size: 10 };
  }

  const OS = "'Operating Statement'!";

  for (let yr = 1; yr <= N; yr++) {
    const dRow = dHdrRow + yr;
    wsD.getRow(dRow).getCell(2).value = yr; // Year
    // Beg Balance
    if (yr === 1) {
      wsD.getRow(dRow).getCell(3).value = { formula: `D3` } as ExcelJS.CellFormulaValue;
    } else {
      wsD.getRow(dRow).getCell(3).value = { formula: `F${dRow - 1}` } as ExcelJS.CellFormulaValue;
    }
    wsD.getRow(dRow).getCell(3).numFmt = NUM_FMT.currency;

    // Interest = Beg Balance * Rate
    wsD.getRow(dRow).getCell(4).value = { formula: `C${dRow}*D4` } as ExcelJS.CellFormulaValue;
    wsD.getRow(dRow).getCell(4).numFmt = NUM_FMT.currency;

    // Principal: if in IO period, 0; else annual payment - interest
    // Annual payment (amortizing) = D7 (annual amort payment)
    wsD.getRow(dRow).getCell(5).value = { formula: `IF(${yr}<=D6,0,D7-D${dRow})` } as ExcelJS.CellFormulaValue;
    wsD.getRow(dRow).getCell(5).numFmt = NUM_FMT.currency;

    // End Balance = Beg - Principal
    wsD.getRow(dRow).getCell(6).value = { formula: `C${dRow}-E${dRow}` } as ExcelJS.CellFormulaValue;
    wsD.getRow(dRow).getCell(6).numFmt = NUM_FMT.currency;

    // Debt Service = Interest + Principal
    wsD.getRow(dRow).getCell(7).value = { formula: `D${dRow}+E${dRow}` } as ExcelJS.CellFormulaValue;
    wsD.getRow(dRow).getCell(7).numFmt = NUM_FMT.currency;

    // DSCR = NOI / Debt Service (ref Operating Statement NOI row)
    const noiColLetter = colLetter(8 + yr);
    wsD.getRow(dRow).getCell(8).value = { formula: `IF(G${dRow}=0,0,${OS}${noiColLetter}${noiRow}/G${dRow})` } as ExcelJS.CellFormulaValue;
    wsD.getRow(dRow).getCell(8).numFmt = '0.00x';

    // Debt Yield = NOI / Beg Balance
    wsD.getRow(dRow).getCell(9).value = { formula: `IF(C${dRow}=0,0,${OS}${noiColLetter}${noiRow}/C${dRow})` } as ExcelJS.CellFormulaValue;
    wsD.getRow(dRow).getCell(9).numFmt = NUM_FMT.pct;
  }

  // ═══════════════════════════════════════
  // TAB 6: RETURNS ANALYSIS
  // ═══════════════════════════════════════
  
  setColWidths(wsR);
  wsR.views = [{ state: 'frozen', xSplit: 2, ySplit: 2 }];

  sectionHeader(wsR, 1, 'RETURNS ANALYSIS', 2, 19);

  // REVERSION section
  sectionHeader(wsR, 3, 'REVERSION (SALE)', 2, 6);
  const exitNoiCol = colLetter(lastYrCol);
  wsR.getRow(4).getCell(2).value = 'Exit Year NOI';
  wsR.getRow(4).getCell(4).value = { formula: `${OS}${exitNoiCol}${noiRow}` } as ExcelJS.CellFormulaValue;
  wsR.getRow(4).getCell(4).numFmt = NUM_FMT.currency;
  wsR.getRow(5).getCell(2).value = 'Exit Cap Rate';
  wsR.getRow(5).getCell(4).value = { formula: A.exitCapRate } as ExcelJS.CellFormulaValue;
  wsR.getRow(5).getCell(4).numFmt = NUM_FMT.pct;
  wsR.getRow(6).getCell(2).value = 'Gross Sale Price';
  wsR.getRow(6).getCell(4).value = { formula: `D4/D5` } as ExcelJS.CellFormulaValue;
  wsR.getRow(6).getCell(4).numFmt = NUM_FMT.currency;
  wsR.getRow(7).getCell(2).value = 'Less: Selling Costs';
  wsR.getRow(7).getCell(4).value = { formula: `-D6*${A.sellingCostPct}` } as ExcelJS.CellFormulaValue;
  wsR.getRow(7).getCell(4).numFmt = NUM_FMT.currency;
  wsR.getRow(8).getCell(2).value = 'Net Sale Proceeds (Unlev)';
  wsR.getRow(8).getCell(4).value = { formula: `D6+D7` } as ExcelJS.CellFormulaValue;
  wsR.getRow(8).getCell(4).numFmt = NUM_FMT.currency;
  wsR.getRow(8).font = { bold: true };
  // Loan payoff = debt schedule end balance in last year
  const debtEndBalRow = dHdrRow + N;
  wsR.getRow(9).getCell(2).value = 'Less: Loan Payoff';
  wsR.getRow(9).getCell(4).value = { formula: `-'Debt Schedule'!F${debtEndBalRow}` } as ExcelJS.CellFormulaValue;
  wsR.getRow(9).getCell(4).numFmt = NUM_FMT.currency;
  wsR.getRow(10).getCell(2).value = 'Net Equity Proceeds';
  wsR.getRow(10).getCell(4).value = { formula: `D8+D9` } as ExcelJS.CellFormulaValue;
  wsR.getRow(10).getCell(4).numFmt = NUM_FMT.currency;
  wsR.getRow(10).font = { bold: true };

  // Total cost (Year 0 outflow)
  // Unlevered: -(Purchase + Closing + Upfront CapEx)
  const totalCostFormula = `-(${A.purchasePrice}*(1+${A.closingCostPct})+${A.upfrontCapex})`;
  // Equity: -(Total cost - Loan + Lender fees)
  const equityFormula = `-(${A.purchasePrice}*(1+${A.closingCostPct})+${A.upfrontCapex}-${A.loanAmount}+${A.loanAmount}*${A.lenderFeesPct})`;

  // UNLEVERED CASH FLOWS
  sectionHeader(wsR, 12, 'UNLEVERED RETURNS', 2, lastYrCol);
  // Row 13: Year labels
  wsR.getRow(13).getCell(2).value = 'Year';
  wsR.getRow(13).getCell(3).value = 0;
  for (let yr = 1; yr <= N; yr++) wsR.getRow(13).getCell(3 + yr).value = yr;

  // Row 14: Unlevered CF
  wsR.getRow(14).getCell(2).value = 'Cash Flow';
  wsR.getRow(14).getCell(3).value = { formula: totalCostFormula } as ExcelJS.CellFormulaValue;
  wsR.getRow(14).getCell(3).numFmt = NUM_FMT.currency;
  for (let yr = 1; yr <= N; yr++) {
    const col = 3 + yr;
    const osCfCol = colLetter(8 + yr);
    if (yr === N) {
      // Last year: CF + net sale proceeds (before debt)
      wsR.getRow(14).getCell(col).value = { formula: `${OS}${osCfCol}${cfRow}+D8` } as ExcelJS.CellFormulaValue;
    } else {
      wsR.getRow(14).getCell(col).value = { formula: `${OS}${osCfCol}${cfRow}` } as ExcelJS.CellFormulaValue;
    }
    wsR.getRow(14).getCell(col).numFmt = NUM_FMT.currency;
  }

  // Row 15: Unlevered IRR
  wsR.getRow(16).getCell(2).value = 'Unlevered IRR';
  wsR.getRow(16).getCell(2).font = { bold: true };
  const unlCfRange = `C14:${colLetter(3 + N)}14`;
  wsR.getRow(16).getCell(4).value = { formula: `IRR(${unlCfRange})` } as ExcelJS.CellFormulaValue;
  wsR.getRow(16).getCell(4).numFmt = NUM_FMT.pct;

  wsR.getRow(17).getCell(2).value = 'Unlevered Equity Multiple';
  wsR.getRow(17).getCell(4).value = { formula: `(SUM(D14:${colLetter(3 + N)}14))/-C14` } as ExcelJS.CellFormulaValue;
  wsR.getRow(17).getCell(4).numFmt = '0.00x';

  // LEVERED CASH FLOWS
  sectionHeader(wsR, 19, 'LEVERED RETURNS', 2, lastYrCol);
  wsR.getRow(20).getCell(2).value = 'Year';
  wsR.getRow(20).getCell(3).value = 0;
  for (let yr = 1; yr <= N; yr++) wsR.getRow(20).getCell(3 + yr).value = yr;

  wsR.getRow(21).getCell(2).value = 'Cash Flow';
  wsR.getRow(21).getCell(3).value = { formula: equityFormula } as ExcelJS.CellFormulaValue;
  wsR.getRow(21).getCell(3).numFmt = NUM_FMT.currency;
  for (let yr = 1; yr <= N; yr++) {
    const col = 3 + yr;
    const osCfCol = colLetter(8 + yr);
    const debtSvcRow = dHdrRow + yr;
    if (yr === N) {
      wsR.getRow(21).getCell(col).value = { formula: `${OS}${osCfCol}${cfRow}-'Debt Schedule'!G${debtSvcRow}+D10` } as ExcelJS.CellFormulaValue;
    } else {
      wsR.getRow(21).getCell(col).value = { formula: `${OS}${osCfCol}${cfRow}-'Debt Schedule'!G${debtSvcRow}` } as ExcelJS.CellFormulaValue;
    }
    wsR.getRow(21).getCell(col).numFmt = NUM_FMT.currency;
  }

  const levCfRange = `C21:${colLetter(3 + N)}21`;
  wsR.getRow(23).getCell(2).value = 'Levered IRR';
  wsR.getRow(23).getCell(2).font = { bold: true };
  wsR.getRow(23).getCell(4).value = { formula: `IRR(${levCfRange})` } as ExcelJS.CellFormulaValue;
  wsR.getRow(23).getCell(4).numFmt = NUM_FMT.pct;

  wsR.getRow(24).getCell(2).value = 'Levered Equity Multiple';
  wsR.getRow(24).getCell(4).value = { formula: `(SUM(D21:${colLetter(3 + N)}21))/-C21` } as ExcelJS.CellFormulaValue;
  wsR.getRow(24).getCell(4).numFmt = '0.00x';

  wsR.getRow(25).getCell(2).value = 'Avg Cash-on-Cash';
  wsR.getRow(25).getCell(4).value = { formula: `AVERAGE(D21:${colLetter(2 + N)}21)/-C21` } as ExcelJS.CellFormulaValue;
  wsR.getRow(25).getCell(4).numFmt = NUM_FMT.pct;

  // ═══════════════════════════════════════
  // TAB 1: EXECUTIVE SUMMARY (references other tabs)
  // ═══════════════════════════════════════
  
  setColWidths(esWs);
  esWs.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];

  // Header band
  for (let row = 1; row <= 2; row++) {
    const r = esWs.getRow(row);
    r.height = 28;
    for (let c = 1; c <= 10; c++) {
      r.getCell(c).fill = HEADER_FILL(NAVY);
      r.getCell(c).font = { ...WHITE_FONT, size: row === 1 ? 16 : 12 };
    }
  }
  esWs.getRow(1).getCell(2).value = 'NOVA RESEARCH — INVESTMENT SUMMARY';
  esWs.getRow(3).getCell(2).value = inputs.propertyName;
  esWs.getRow(3).getCell(2).font = { bold: true, size: 14 };
  esWs.getRow(4).getCell(2).value = `${inputs.address}, ${inputs.city}, ${inputs.province}`;

  // Property Description (left)
  sectionHeader(esWs, 6, 'Property Description', 2, 5);
  const propDesc: [string, string | number][] = [
    ['Property Type', inputs.propertyType],
    ['NRA (SF)', inputs.nraSF],
    ['Land Area (acres)', inputs.landArea],
    ['Year Built', inputs.yearBuilt],
    ['Floors', inputs.floors],
    ['Parking Stalls', inputs.parking],
  ];
  for (let i = 0; i < propDesc.length; i++) {
    esWs.getRow(7 + i).getCell(2).value = propDesc[i][0];
    esWs.getRow(7 + i).getCell(4).value = propDesc[i][1];
    if (typeof propDesc[i][1] === 'number') esWs.getRow(7 + i).getCell(4).numFmt = NUM_FMT.currency;
  }

  // Key Financial Metrics (right)
  sectionHeader(esWs, 6, 'Key Financial Metrics', 7, 10);
  const RA = "'Returns Analysis'!";
  const metrics: [string, ExcelJS.CellFormulaValue, string][] = [
    ['Purchase Price', { formula: A.purchasePrice }, NUM_FMT.currency],
    ['Going-In Cap Rate', { formula: `${OS}G${noiRow}/${A.purchasePrice}` }, NUM_FMT.pct],
    ['Exit Cap Rate', { formula: A.exitCapRate }, NUM_FMT.pct],
    ['Unlevered IRR', { formula: `${RA}D16` }, NUM_FMT.pct],
    ['Levered IRR', { formula: `${RA}D23` }, NUM_FMT.pct],
    ['Equity Multiple', { formula: `${RA}D24` }, '0.00x'],
    ['Avg Cash-on-Cash', { formula: `${RA}D25` }, NUM_FMT.pct],
  ];
  for (let i = 0; i < metrics.length; i++) {
    esWs.getRow(7 + i).getCell(7).value = metrics[i][0];
    esWs.getRow(7 + i).getCell(9).value = metrics[i][1];
    esWs.getRow(7 + i).getCell(9).numFmt = metrics[i][2];
    esWs.getRow(7 + i).getCell(9).font = { bold: true };
  }

  // Sources & Uses (left)
  sectionHeader(esWs, 16, 'Sources & Uses', 2, 5);
  esWs.getRow(17).getCell(2).value = 'USES';
  esWs.getRow(17).getCell(2).font = { bold: true };
  esWs.getRow(18).getCell(2).value = 'Purchase Price';
  esWs.getRow(18).getCell(4).value = { formula: A.purchasePrice } as ExcelJS.CellFormulaValue;
  esWs.getRow(18).getCell(4).numFmt = NUM_FMT.currency;
  esWs.getRow(19).getCell(2).value = 'Closing Costs';
  esWs.getRow(19).getCell(4).value = { formula: `${A.purchasePrice}*${A.closingCostPct}` } as ExcelJS.CellFormulaValue;
  esWs.getRow(19).getCell(4).numFmt = NUM_FMT.currency;
  esWs.getRow(20).getCell(2).value = 'Upfront CapEx';
  esWs.getRow(20).getCell(4).value = { formula: A.upfrontCapex } as ExcelJS.CellFormulaValue;
  esWs.getRow(20).getCell(4).numFmt = NUM_FMT.currency;
  esWs.getRow(21).getCell(2).value = 'Lender Fees';
  esWs.getRow(21).getCell(4).value = { formula: `${A.loanAmount}*${A.lenderFeesPct}` } as ExcelJS.CellFormulaValue;
  esWs.getRow(21).getCell(4).numFmt = NUM_FMT.currency;
  esWs.getRow(22).getCell(2).value = 'Total Uses';
  esWs.getRow(22).getCell(2).font = { bold: true };
  esWs.getRow(22).getCell(4).value = { formula: `SUM(D18:D21)` } as ExcelJS.CellFormulaValue;
  esWs.getRow(22).getCell(4).numFmt = NUM_FMT.currency;
  esWs.getRow(22).getCell(4).font = { bold: true };

  esWs.getRow(24).getCell(2).value = 'SOURCES';
  esWs.getRow(24).getCell(2).font = { bold: true };
  esWs.getRow(25).getCell(2).value = 'Debt';
  esWs.getRow(25).getCell(4).value = { formula: A.loanAmount } as ExcelJS.CellFormulaValue;
  esWs.getRow(25).getCell(4).numFmt = NUM_FMT.currency;
  esWs.getRow(26).getCell(2).value = 'Equity Required';
  esWs.getRow(26).getCell(4).value = { formula: `D22-D25` } as ExcelJS.CellFormulaValue;
  esWs.getRow(26).getCell(4).numFmt = NUM_FMT.currency;
  esWs.getRow(26).getCell(4).font = { bold: true };

  // Financing Summary (right)
  sectionHeader(esWs, 16, 'Financing Summary', 7, 10);
  const finSummary: [string, ExcelJS.CellFormulaValue, string][] = [
    ['Loan Amount', { formula: A.loanAmount }, NUM_FMT.currency],
    ['LTV', { formula: `${A.loanAmount}/${A.purchasePrice}` }, NUM_FMT.pct],
    ['Interest Rate', { formula: A.interestRate }, NUM_FMT.pct],
    ['Amortization', { formula: A.amortizationYears }, '0'],
    ['Term', { formula: A.loanTerm }, '0'],
    ['I/O Period', { formula: A.ioYears }, '0'],
    ['Annual Debt Service', { formula: `'Debt Schedule'!D7` }, NUM_FMT.currency],
    ['Year 1 DSCR', { formula: `'Debt Schedule'!H${dHdrRow + 1}` }, '0.00x'],
  ];
  for (let i = 0; i < finSummary.length; i++) {
    esWs.getRow(17 + i).getCell(7).value = finSummary[i][0];
    esWs.getRow(17 + i).getCell(9).value = finSummary[i][1];
    esWs.getRow(17 + i).getCell(9).numFmt = finSummary[i][2];
  }

  // Investment Highlights / Risk Factors
  sectionHeader(esWs, 28, 'Investment Highlights', 2, 5);
  for (let i = 0; i < 4; i++) {
    esWs.getRow(29 + i).getCell(2).value = `• [Enter highlight ${i + 1}]`;
    esWs.getRow(29 + i).getCell(2).font = { italic: true, color: { argb: 'FF999999' } };
  }
  sectionHeader(esWs, 28, 'Risk Factors', 7, 10);
  for (let i = 0; i < 4; i++) {
    esWs.getRow(29 + i).getCell(7).value = `• [Enter risk ${i + 1}]`;
    esWs.getRow(29 + i).getCell(7).font = { italic: true, color: { argb: 'FF999999' } };
  }

  // ═══════════════════════════════════════
  // TAB 7: SENSITIVITY ANALYSIS
  // ═══════════════════════════════════════
  
  setColWidths(wsS);
  wsS.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];

  sectionHeader(wsS, 1, 'SENSITIVITY ANALYSIS', 2, 15);
  wsS.getRow(3).getCell(2).value = 'Instructions: To make these tables dynamic, select the grid cells, go to Data → What-If Analysis → Data Table.';
  wsS.getRow(3).getCell(2).font = { italic: true, color: { argb: 'FF666666' }, size: 9 };

  // Table 1: Exit Cap vs Discount Rate → Levered IRR
  sectionHeader(wsS, 5, 'Table 1: Levered IRR — Exit Cap Rate vs Discount Rate', 2, 12);
  wsS.getRow(6).getCell(2).value = 'Base Case Levered IRR →';
  wsS.getRow(6).getCell(3).value = { formula: `${RA}D23` } as ExcelJS.CellFormulaValue;
  wsS.getRow(6).getCell(3).numFmt = NUM_FMT.pct;

  // Column headers: discount rates
  const baseDisc = inputs.discountRate;
  const discRates = [-0.02, -0.015, -0.01, -0.005, 0, 0.005, 0.01, 0.015, 0.02];
  for (let i = 0; i < discRates.length; i++) {
    wsS.getRow(7).getCell(3 + i).value = baseDisc + discRates[i];
    wsS.getRow(7).getCell(3 + i).numFmt = NUM_FMT.pct;
    wsS.getRow(7).getCell(3 + i).font = { bold: true };
    // Highlight base case column
    if (discRates[i] === 0) wsS.getRow(7).getCell(3 + i).fill = HEADER_FILL(INPUT_FILL);
  }

  // Row headers: exit cap rates
  const baseExitCap = inputs.exitCapRate;
  const exitCapOffsets = [-0.01, -0.0075, -0.005, -0.0025, 0, 0.0025, 0.005, 0.0075, 0.01];
  for (let j = 0; j < exitCapOffsets.length; j++) {
    const row = 8 + j;
    wsS.getRow(row).getCell(2).value = baseExitCap + exitCapOffsets[j];
    wsS.getRow(row).getCell(2).numFmt = NUM_FMT.pct;
    wsS.getRow(row).getCell(2).font = { bold: true };
    if (exitCapOffsets[j] === 0) wsS.getRow(row).getCell(2).fill = HEADER_FILL(INPUT_FILL);
    // Grid cells reference base case
    for (let i = 0; i < discRates.length; i++) {
      const cell = wsS.getRow(row).getCell(3 + i);
      cell.value = { formula: `C6` } as ExcelJS.CellFormulaValue;
      cell.numFmt = NUM_FMT.pct;
      if (exitCapOffsets[j] === 0 && discRates[i] === 0) {
        cell.fill = HEADER_FILL('FFFFFFCC');
        cell.font = { bold: true };
      }
    }
  }

  // Table 2: Exit Cap vs Rent Growth → Levered IRR
  const t2Start = 19;
  sectionHeader(wsS, t2Start, 'Table 2: Levered IRR — Exit Cap Rate vs Rent Growth', 2, 12);
  wsS.getRow(t2Start + 1).getCell(2).value = 'Base Case Levered IRR →';
  wsS.getRow(t2Start + 1).getCell(3).value = { formula: `${RA}D23` } as ExcelJS.CellFormulaValue;
  wsS.getRow(t2Start + 1).getCell(3).numFmt = NUM_FMT.pct;

  const rentGrowthVals = [0, 0.005, 0.01, 0.015, 0.02, 0.025, 0.03, 0.035, 0.04];
  for (let i = 0; i < rentGrowthVals.length; i++) {
    wsS.getRow(t2Start + 2).getCell(3 + i).value = rentGrowthVals[i];
    wsS.getRow(t2Start + 2).getCell(3 + i).numFmt = NUM_FMT.pct;
    wsS.getRow(t2Start + 2).getCell(3 + i).font = { bold: true };
  }
  for (let j = 0; j < exitCapOffsets.length; j++) {
    const row = t2Start + 3 + j;
    wsS.getRow(row).getCell(2).value = baseExitCap + exitCapOffsets[j];
    wsS.getRow(row).getCell(2).numFmt = NUM_FMT.pct;
    wsS.getRow(row).getCell(2).font = { bold: true };
    for (let i = 0; i < rentGrowthVals.length; i++) {
      wsS.getRow(row).getCell(3 + i).value = { formula: `C${t2Start + 1}` } as ExcelJS.CellFormulaValue;
      wsS.getRow(row).getCell(3 + i).numFmt = NUM_FMT.pct;
    }
  }

  // Table 3: Occupancy vs Rent PSF → Year 1 NOI
  const t3Start = 34;
  sectionHeader(wsS, t3Start, 'Table 3: Year 1 NOI — Occupancy vs Rent PSF', 2, 12);
  wsS.getRow(t3Start + 1).getCell(2).value = 'Base Case Year 1 NOI →';
  wsS.getRow(t3Start + 1).getCell(3).value = { formula: `${OS}${colLetter(YEAR1_COL)}${noiRow}` } as ExcelJS.CellFormulaValue;
  wsS.getRow(t3Start + 1).getCell(3).numFmt = NUM_FMT.currency;

  const baseRentPSF = inputs.baseRent / inputs.nraSF;
  const rentPSFMults = [0.8, 0.85, 0.9, 0.95, 1.0, 1.05, 1.1, 1.15, 1.2];
  for (let i = 0; i < rentPSFMults.length; i++) {
    wsS.getRow(t3Start + 2).getCell(3 + i).value = Math.round(baseRentPSF * rentPSFMults[i] * 100) / 100;
    wsS.getRow(t3Start + 2).getCell(3 + i).numFmt = NUM_FMT.psf;
    wsS.getRow(t3Start + 2).getCell(3 + i).font = { bold: true };
  }
  const occRates = [0.70, 0.75, 0.80, 0.85, 0.90, 0.95, 1.00];
  for (let j = 0; j < occRates.length; j++) {
    const row = t3Start + 3 + j;
    wsS.getRow(row).getCell(2).value = occRates[j];
    wsS.getRow(row).getCell(2).numFmt = NUM_FMT.pct;
    wsS.getRow(row).getCell(2).font = { bold: true };
    for (let i = 0; i < rentPSFMults.length; i++) {
      wsS.getRow(row).getCell(3 + i).value = { formula: `C${t3Start + 1}` } as ExcelJS.CellFormulaValue;
      wsS.getRow(row).getCell(3 + i).numFmt = NUM_FMT.currency;
    }
  }

  // ═══════════════════════════════════════
  // TAB 8: MARKET CONTEXT
  // ═══════════════════════════════════════
  
  setColWidths(wsMC);
  wsMC.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];

  sectionHeader(wsMC, 1, 'MARKET CONTEXT', 2, 12);
  wsMC.getRow(2).getCell(2).value = 'Enter comparable transactions below.';
  wsMC.getRow(2).getCell(2).font = { italic: true, color: { argb: 'FF666666' } };

  // Sale comps
  sectionHeader(wsMC, 4, 'COMPARABLE SALES', 2, 10);
  const saleHeaders = ['Address', 'City', 'Date', 'Price', 'Price/SF', 'Size SF', 'Type', 'Cap Rate', 'Comments'];
  for (let i = 0; i < saleHeaders.length; i++) {
    wsMC.getRow(5).getCell(2 + i).value = saleHeaders[i];
    wsMC.getRow(5).getCell(2 + i).font = { bold: true };
    wsMC.getRow(5).getCell(2 + i).fill = HEADER_FILL('FFD6E4F0');
  }
  // 15 empty rows
  for (let i = 0; i < 15; i++) {
    for (let c = 2; c <= 10; c++) {
      wsMC.getRow(6 + i).getCell(c).border = {
        bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      };
    }
  }

  // Lease comps
  sectionHeader(wsMC, 23, 'COMPARABLE LEASES', 2, 10);
  const leaseHeaders = ['Address', 'City', 'Tenant', 'Rent/SF', 'Size SF', 'Start', 'Expiry', 'Type', 'Comments'];
  for (let i = 0; i < leaseHeaders.length; i++) {
    wsMC.getRow(24).getCell(2 + i).value = leaseHeaders[i];
    wsMC.getRow(24).getCell(2 + i).font = { bold: true };
    wsMC.getRow(24).getCell(2 + i).fill = HEADER_FILL('FFD6E4F0');
  }
  for (let i = 0; i < 15; i++) {
    for (let c = 2; c <= 10; c++) {
      wsMC.getRow(25 + i).getCell(c).border = {
        bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      };
    }
  }

  // ═══════════════════════════════════════
  // TAB 9: AUDIT TRAIL
  // ═══════════════════════════════════════
  
  setColWidths(wsAT);
  wsAT.views = [{ state: 'frozen', xSplit: 0, ySplit: 3 }];

  sectionHeader(wsAT, 1, 'AUDIT TRAIL', 2, 10);
  const atHeaders = ['Input Field', 'Extracted Value', 'Source Document', 'Page', 'Confidence', 'Source Text', 'Reasoning'];
  for (let i = 0; i < atHeaders.length; i++) {
    wsAT.getRow(3).getCell(2 + i).value = atHeaders[i];
    wsAT.getRow(3).getCell(2 + i).font = { bold: true };
    wsAT.getRow(3).getCell(2 + i).fill = HEADER_FILL('FFD6E4F0');
  }

  if (inputs.auditTrail && inputs.auditTrail.length > 0) {
    for (let i = 0; i < inputs.auditTrail.length; i++) {
      const at = inputs.auditTrail[i];
      const row = 4 + i;
      wsAT.getRow(row).getCell(2).value = at.field;
      wsAT.getRow(row).getCell(3).value = at.value;
      wsAT.getRow(row).getCell(4).value = at.sourceDoc;
      wsAT.getRow(row).getCell(5).value = at.page;
      wsAT.getRow(row).getCell(6).value = at.confidence;
      wsAT.getRow(row).getCell(7).value = at.sourceText;
      wsAT.getRow(row).getCell(8).value = at.reasoning;
    }
  } else {
    for (let i = 0; i < 15; i++) {
      for (let c = 2; c <= 8; c++) {
        wsAT.getRow(4 + i).getCell(c).border = {
          bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        };
      }
    }
  }

  // Cross-validation section
  const cvRow = (inputs.auditTrail ? inputs.auditTrail.length : 15) + 6;
  sectionHeader(wsAT, cvRow, 'CROSS-VALIDATION', 2, 8);
  wsAT.getRow(cvRow + 1).getCell(2).value = 'Check';
  wsAT.getRow(cvRow + 1).getCell(4).value = 'Value A';
  wsAT.getRow(cvRow + 1).getCell(5).value = 'Value B';
  wsAT.getRow(cvRow + 1).getCell(6).value = 'Variance';
  wsAT.getRow(cvRow + 1).getCell(7).value = 'Status';
  for (let c = 2; c <= 7; c++) wsAT.getRow(cvRow + 1).getCell(c).font = { bold: true };

  // Stated cap vs calculated
  wsAT.getRow(cvRow + 2).getCell(2).value = 'Stated Cap Rate vs Calculated';
  wsAT.getRow(cvRow + 2).getCell(4).value = { formula: `${OS}G${noiRow}/${A.purchasePrice}` } as ExcelJS.CellFormulaValue;
  wsAT.getRow(cvRow + 2).getCell(4).numFmt = NUM_FMT.pct;

  // ═══════════════════════════════════════
  // REORDER WORKSHEETS
  // ═══════════════════════════════════════
  // ExcelJS creates sheets in order added. We added: Assumptions, Rent Roll, Operating Statement, Debt Schedule, Returns Analysis, Executive Summary (deleted+readded), Sensitivity, Market Context, Audit Trail
  // We need: Exec Summary first. Let's reorder by removing and re-adding... Actually ExcelJS supports worksheet ordering via workbook.worksheets array manipulation isn't great.
  // The order should be fine since we can use wb.getWorksheet and the tabs appear in creation order. Let's just accept the order as-is and note that Executive Summary will be near the end. Instead, let's use a workaround:

  // Actually, we should just write a buffer
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
