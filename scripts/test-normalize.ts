import { normalizeAddress, normalizeCity, addressMatchKey } from '../src/lib/address';

const tests = [
  // Street addresses
  { input: '123 Main St.', expected: '123 MAIN STREET' },
  { input: '2030 1st Ave N', expected: '2030 1ST AVENUE NORTH' },
  { input: '131 20th St W', expected: '131 20TH STREET WEST' },
  { input: '2105 8th Street East', expected: '2105 8TH STREET EAST' },
  { input: '3030 Meadows Parkway', expected: '3030 MEADOWS PARKWAY' },
  { input: '114 Radu Cres', expected: '114 RADU CRESCENT' },
  { input: '708 Ave R North', expected: '708 AVENUE R NORTH' },
  
  // With city/province to strip
  { input: '157 Maccormack Rd Martensville, SK', expected: '157 MACCORMACK ROAD MARTENSVILLE' },
  // Actually this one has city embedded — tricky. The city after comma is "SK" which gets stripped,
  // but "Martensville" is part of the address string. This is a data quality issue.
  
  // Unit patterns
  { input: 'Unit 5 - 123 Main St', expected: '123 MAIN STREET UNIT 5' },
  { input: '#200 - 410 22nd St E', expected: '410 22ND STREET EAST UNIT 200' },
  { input: '9 126 English CRES, Saskatoon, SK', expected: '126 ENGLISH CRESCENT UNIT 9' },
  { input: '4 210 Slimmon RD #10, Saskatoon, SK', expected: '210 SLIMMON ROAD UNIT 4' },
  // ^ This one has two unit indicators - #10 and leading 4. Edge case.
];

console.log('=== Address Normalization Tests ===\n');
for (const t of tests) {
  const result = normalizeAddress(t.input);
  const pass = result === t.expected;
  console.log(`${pass ? '✅' : '❌'} "${t.input}"`);
  if (!pass) {
    console.log(`   Expected: "${t.expected}"`);
    console.log(`   Got:      "${result}"`);
  }
}

console.log('\n=== City Normalization Tests ===\n');
const cityTests = [
  { input: 'Saskatoon', expected: 'SASKATOON' },
  { input: 'Rega', expected: 'REGINA' },
  { input: 'R.M of Sherwood # 159', expected: 'RM OF SHERWOOD NO 159' },
  { input: 'RM of Corman Park', expected: 'RM OF CORMAN PARK NO 344' },
  { input: 'Rural Municipality of Sherwood No.159', expected: 'RM OF SHERWOOD NO 159' },
  { input: 'R.M of Sherwood # 159`', expected: 'RM OF SHERWOOD NO 159' },
  { input: 'Regina & RM 159', expected: 'REGINA' },
];

for (const t of cityTests) {
  const result = normalizeCity(t.input);
  const pass = result === t.expected;
  console.log(`${pass ? '✅' : '❌'} "${t.input}"`);
  if (!pass) {
    console.log(`   Expected: "${t.expected}"`);
    console.log(`   Got:      "${result}"`);
  }
}
