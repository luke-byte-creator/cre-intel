import { normalizeAddress, normalizeCity, displayAddress } from '../src/lib/address';

const tests = [
  // Basic
  { input: '123 Main St.', expected: '123 MAIN STREET' },
  { input: '2030 1st Ave N', expected: '2030 1ST AVENUE NORTH' },
  { input: '131 20th St W', expected: '131 20TH STREET WEST' },
  { input: '2105 8th Street East', expected: '2105 8TH STREET EAST' },
  { input: '114 Radu Cres', expected: '114 RADU CRESCENT' },
  { input: '708 Ave R North', expected: '708 AVENUE R NORTH' },
  
  // With city/province to strip
  { input: '157 Maccormack Rd Martensville, SK', expected: '157 MACCORMACK ROAD MARTENSVILLE' },
  
  // Unit patterns
  { input: 'Unit 5 - 123 Main St', expected: '123 MAIN STREET UNIT 5' },
  { input: '#200 - 410 22nd St E', expected: '410 22ND STREET EAST UNIT 200' },
  
  // Address ranges (should NOT be treated as units)
  { input: '232-242 Pinehouse Drive', expected: '232-242 PINEHOUSE DRIVE' },
  { input: '655-659 51st Street East', expected: '655-659 51ST STREET EAST' },
  { input: '113-119 33rd Street West', expected: '113-119 33RD STREET WEST' },
  { input: '801-807 Kristjanson Road', expected: '801-807 KRISTJANSON ROAD' },
  { input: '424-436 11th Street East', expected: '424-436 11TH STREET EAST' },
  
  // Legal land descriptions (should pass through as-is)
  { input: 'NE & SE 26-17-21-W2', expected: 'NE & SE 26-17-21-W2' },
  
  // Direction at start should NOT expand
  { input: 'NE Corned of Inland Drive', expected: 'NE CORNED OF INLAND DRIVE' },
  
  // Real unit-dash patterns (unit much smaller than civic)
  { input: '200-3515 Millar Ave', expected: '3515 MILLAR AVENUE UNIT 200' },
];

console.log('=== Address Normalization Tests ===\n');
let pass = 0, fail = 0;
for (const t of tests) {
  const result = normalizeAddress(t.input);
  const ok = result === t.expected;
  if (ok) pass++; else fail++;
  console.log(`${ok ? '✅' : '❌'} "${t.input}"`);
  if (!ok) {
    console.log(`   Expected: "${t.expected}"`);
    console.log(`   Got:      "${result}"`);
  }
}
console.log(`\n${pass} passed, ${fail} failed\n`);

console.log('=== Display Address Tests ===\n');
const displayTests = [
  { input: '410 22ND STREET EAST', expected: '410 22nd Street East' },
  { input: '123 MAIN STREET UNIT 5', expected: '123 Main Street Unit 5' },
  { input: '201 1ST AVENUE SOUTH', expected: '201 1st Avenue South' },
  { input: '232-242 PINEHOUSE DRIVE', expected: '232-242 Pinehouse Drive' },
  { input: '3030 MEADOWS PARKWAY', expected: '3030 Meadows Parkway' },
  { input: 'NE & SE 26-17-21-W2', expected: 'Ne & Se 26-17-21-W2' }, // legal desc — acceptable
];
for (const t of displayTests) {
  const result = displayAddress(t.input);
  const ok = result === t.expected;
  console.log(`${ok ? '✅' : '❌'} "${t.input}" → "${result}"`);
  if (!ok) console.log(`   Expected: "${t.expected}"`);
}

console.log('\n=== City Normalization Tests ===\n');
const cityTests = [
  { input: 'Saskatoon', expected: 'SASKATOON' },
  { input: 'Rega', expected: 'REGINA' },
  { input: 'R.M of Sherwood # 159', expected: 'RM OF SHERWOOD NO 159' },
  { input: 'RM of Corman Park', expected: 'RM OF CORMAN PARK NO 344' },
  { input: 'Rural Municipality of Sherwood No.159', expected: 'RM OF SHERWOOD NO 159' },
];
for (const t of cityTests) {
  const result = normalizeCity(t.input);
  const ok = result === t.expected;
  console.log(`${ok ? '✅' : '❌'} "${t.input}" → "${result}"`);
  if (!ok) console.log(`   Expected: "${t.expected}"`);
}
