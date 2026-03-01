import { generateAcquisitionModel, AcquisitionInputs } from './generate-acquisition';
import * as fs from 'fs';
import * as path from 'path';

const testInputs: AcquisitionInputs = {
  propertyName: 'Midtown Office Tower',
  address: '200 3rd Avenue North',
  city: 'Saskatoon',
  province: 'SK',
  propertyType: 'Office',
  nraSF: 85000,
  landArea: 1.2,
  yearBuilt: 1998,
  floors: 8,
  parking: 200,
  purchasePrice: 18500000,
  closingCostPct: 0.02,
  upfrontCapex: 350000,
  analysisStartDate: '2026-01-01',
  analysisPeriod: 10,
  baseRent: 1530000,
  recoveryIncome: 425000,
  parkingIncome: 120000,
  otherIncome: 35000,
  vacancyRate: 0.05,
  rentAbatement: 50000,
  historicalT2: { revenue: 1950000, expenses: 820000, noi: 1130000 },
  historicalT1: { revenue: 2020000, expenses: 845000, noi: 1175000 },
  historicalT12: { revenue: 2080000, expenses: 870000, noi: 1210000 },
  propertyTax: 285000,
  insurance: 45000,
  utilities: 165000,
  repairsMaint: 95000,
  managementPct: 0.03,
  admin: 42000,
  payroll: 85000,
  marketing: 15000,
  otherExpenses: 25000,
  incomeGrowth: 0.02,
  expenseGrowth: 0.025,
  propertyTaxGrowth: 0.03,
  capexGrowth: 0.02,
  tiPSF: 3.50,
  leasingCommPct: 0.05,
  capitalReservesPSF: 0.75,
  loanAmount: 12000000,
  interestRate: 0.055,
  amortizationYears: 25,
  loanTerm: 10,
  ioYears: 2,
  lenderFeesPct: 0.01,
  exitCapRate: 0.065,
  sellingCostPct: 0.02,
  discountRate: 0.08,
  rentRoll: [
    { tenantName: 'Acme Corp', suite: '100', sf: 15000, leaseStart: '2023-01-01', leaseExpiry: '2028-12-31', baseRentPSF: 18.50, recoveryType: 'NNN', recoveryPSF: 5.00, escalationType: 'Fixed %', escalationRate: 0.02, options: '2x5yr', notes: 'Anchor tenant' },
    { tenantName: 'Smith & Partners LLP', suite: '200', sf: 8500, leaseStart: '2024-06-01', leaseExpiry: '2029-05-31', baseRentPSF: 19.00, recoveryType: 'NNN', recoveryPSF: 5.00, escalationType: 'Fixed %', escalationRate: 0.025, options: '1x5yr', notes: '' },
    { tenantName: 'TechStart Inc', suite: '300', sf: 5200, leaseStart: '2025-01-01', leaseExpiry: '2027-12-31', baseRentPSF: 17.50, recoveryType: 'Modified Gross', recoveryPSF: 3.50, escalationType: 'CPI', escalationRate: 0.02, options: '', notes: 'Early termination clause' },
    { tenantName: 'Provincial Gov', suite: '400-600', sf: 35000, leaseStart: '2022-04-01', leaseExpiry: '2032-03-31', baseRentPSF: 18.00, recoveryType: 'NNN', recoveryPSF: 5.25, escalationType: 'Fixed %', escalationRate: 0.015, options: '3x5yr', notes: 'AAA covenant' },
    { tenantName: 'Prairie Wellness', suite: '700', sf: 3200, leaseStart: '2025-06-01', leaseExpiry: '2030-05-31', baseRentPSF: 16.00, recoveryType: 'Full Service', recoveryPSF: 0, escalationType: 'Stepped', escalationRate: 0.03, options: '1x3yr', notes: '' },
  ],
  auditTrail: [
    { field: 'Purchase Price', value: '18,500,000', sourceDoc: 'Purchase Agreement', page: '3', confidence: 'high', sourceText: 'Purchase price of $18,500,000', reasoning: 'Direct extraction from signed agreement' },
    { field: 'Base Rent', value: '1,530,000', sourceDoc: 'Rent Roll Export', page: '1', confidence: 'high', sourceText: 'Total annual base rent: $1,530,000', reasoning: 'Sum of all tenant base rents from rent roll' },
    { field: 'Vacancy Rate', value: '5%', sourceDoc: 'Market Report', page: '12', confidence: 'medium', sourceText: 'Market vacancy for downtown Saskatoon office: 4.8-6.2%', reasoning: 'Used midpoint of market range' },
  ],
};

async function main() {
  console.log('Generating test acquisition model...');
  const buffer = await generateAcquisitionModel(testInputs);
  const outDir = path.resolve(__dirname, '../../../data/underwriting');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'test-output.xlsx');
  fs.writeFileSync(outPath, buffer);
  console.log(`✅ Generated: ${outPath} (${buffer.length} bytes)`);
}

main().catch(err => { console.error('❌ Error:', err); process.exit(1); });
