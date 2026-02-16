/**
 * Address normalization for consistent matching across all data sources.
 * 
 * Strategy:
 * - Normalize street address separately from city
 * - Store both original (display) and normalized (matching) versions
 * - Match key = address_normalized + city_normalized
 */

// Street type expansions (abbreviation → full form, uppercase)
const STREET_TYPES: Record<string, string> = {
  'ST': 'STREET',
  'AVE': 'AVENUE',
  'AV': 'AVENUE',
  'DR': 'DRIVE',
  'BLVD': 'BOULEVARD',
  'RD': 'ROAD',
  'CRES': 'CRESCENT',
  'CR': 'CRESCENT',
  'CT': 'COURT',
  'CRT': 'COURT',
  'PL': 'PLACE',
  'CIR': 'CIRCLE',
  'CIRC': 'CIRCLE',
  'HWY': 'HIGHWAY',
  'PKWY': 'PARKWAY',
  'PKY': 'PARKWAY',
  'LN': 'LANE',
  'TR': 'TRAIL',
  'TERR': 'TERRACE',
  'TER': 'TERRACE',
  'WAY': 'WAY',
  'GR': 'GREEN',
  'GV': 'GROVE',
  'GT': 'GATE',
  'PT': 'POINT',
  'CV': 'COVE',
  'BND': 'BEND',
  'SQ': 'SQUARE',
  'GDNS': 'GARDENS',
  'GDN': 'GARDEN',
  'WK': 'WALK',
  'MEWS': 'MEWS',
  'PARK': 'PARK',
  'VIEW': 'VIEW',
  'RISE': 'RISE',
  'BAY': 'BAY',
  'RUN': 'RUN',
  'HTS': 'HEIGHTS',
  'HT': 'HEIGHTS',
  'PASS': 'PASS',
  'CLO': 'CLOSE',
  'CL': 'CLOSE',
};

// Direction expansions
const DIRECTIONS: Record<string, string> = {
  'N': 'NORTH',
  'S': 'SOUTH',
  'E': 'EAST',
  'W': 'WEST',
  'NE': 'NORTHEAST',
  'NW': 'NORTHWEST',
  'SE': 'SOUTHEAST',
  'SW': 'SOUTHWEST',
};

// City name normalization map (common variations → canonical)
const CITY_ALIASES: Record<string, string> = {
  'REGA': 'REGINA',
  'REGINA & RM 159': 'REGINA',
  'RM OF SHERWOOD': 'RM OF SHERWOOD NO 159',
  'R.M OF SHERWOOD # 159': 'RM OF SHERWOOD NO 159',
  'R.M OF SHERWOOD # 159`': 'RM OF SHERWOOD NO 159',
  'RURAL MUNICIPALITY OF SHERWOOD NO.159': 'RM OF SHERWOOD NO 159',
  'RURAL MUNICIPALITY OF SHERWOOD NO 159': 'RM OF SHERWOOD NO 159',
  'RM OF CORMAN PARK': 'RM OF CORMAN PARK NO 344',
  'CORMAN PARK': 'RM OF CORMAN PARK NO 344',
  'RM OF CORMAN PARK NO. 344': 'RM OF CORMAN PARK NO 344',
  'R.M OF EDENWOLD 158': 'RM OF EDENWOLD NO 158',
  'R.M. OF EDENWOLD 158': 'RM OF EDENWOLD NO 158',
  'WEYBURN RM NO.67': 'RM OF WEYBURN NO 67',
  'WEYBURN RM NO 67': 'RM OF WEYBURN NO 67',
};

/**
 * Normalize a street address for matching.
 * Strips city/province/postal, expands abbreviations, standardizes unit format.
 * 
 * Examples:
 *   "123 Main St., Saskatoon, SK S7K 1A1" → "123 MAIN STREET"
 *   "Unit 5 - 123 Main Street" → "123 MAIN STREET UNIT 5"
 *   "#200 - 410 22nd St E" → "410 22ND STREET EAST UNIT 200"
 */
export function normalizeAddress(address: string | null | undefined): string | null {
  if (!address || !address.trim()) return null;

  let addr = address.trim().toUpperCase();

  // Remove postal codes (Canadian format: A1A 1A1)
  addr = addr.replace(/\b[A-Z]\d[A-Z]\s*\d[A-Z]\d\b/g, '').trim();

  // Remove province abbreviations and full names at the end
  addr = addr.replace(/,?\s*(SASKATCHEWAN|SASK\.?|SK)\s*$/i, '').trim();

  // Remove city if it appears after a comma at the end (we handle city separately)
  // But we need to be careful — only strip known city patterns after the last comma
  const commaIdx = addr.lastIndexOf(',');
  if (commaIdx > 0) {
    const afterComma = addr.substring(commaIdx + 1).trim();
    // If what's after the comma looks like a city (no numbers, short-ish), strip it
    if (afterComma.length > 0 && afterComma.length < 40 && !/\d/.test(afterComma)) {
      addr = addr.substring(0, commaIdx).trim();
    }
  }

  // Remove trailing periods
  addr = addr.replace(/\.\s*/g, ' ').trim();

  // Extract unit/suite number patterns and move to end
  let unit = '';

  // Pattern: "Unit 5 - 123 Main St" or "#200 - 410 22nd St" or "Suite 100, 123 Main"
  const unitPrefixMatch = addr.match(/^(?:UNIT|SUITE|STE|#)\s*(\w+)\s*[-,]\s*(.+)/);
  if (unitPrefixMatch) {
    unit = unitPrefixMatch[1];
    addr = unitPrefixMatch[2].trim();
  }

  // Pattern: "123 Main St Unit 5" or "123 Main St #200"
  const unitSuffixMatch = addr.match(/^(.+?)\s+(?:UNIT|SUITE|STE|#)\s*(\w+)\s*$/);
  if (!unit && unitSuffixMatch) {
    addr = unitSuffixMatch[1].trim();
    unit = unitSuffixMatch[2];
  }

  // Pattern: "200-410 22nd St" (number-dash-number at start, first is unit)
  if (!unit) {
    const dashMatch = addr.match(/^(\d{1,4})\s*-\s*(\d+.+)/);
    if (dashMatch) {
      const possibleUnit = dashMatch[1];
      const rest = dashMatch[2];
      if (parseInt(possibleUnit) < 10000 && /^\d+\s+\w/.test(rest)) {
        unit = possibleUnit;
        addr = rest.trim();
      }
    }
  }

  // Pattern: "9 126 English Cres" (small number space larger number — unit then civic)
  // Only when first number ≤ 3 digits AND second number is larger
  if (!unit) {
    const spaceUnitMatch = addr.match(/^(\d{1,3})\s+(\d{2,5}\s+\w.+)/);
    if (spaceUnitMatch) {
      const possibleUnit = parseInt(spaceUnitMatch[1]);
      const rest = spaceUnitMatch[2];
      const civicNum = parseInt(rest);
      // Unit should be smaller than civic number, and civic should look like an address
      if (possibleUnit < civicNum && /^\d+\s+[A-Z]/.test(rest)) {
        unit = spaceUnitMatch[1];
        addr = rest.trim();
      }
    }
  }

  // Normalize multiple spaces
  addr = addr.replace(/\s+/g, ' ').trim();

  // Expand street type abbreviations (only the last word or second-to-last if direction follows)
  const words = addr.split(' ');
  for (let i = 0; i < words.length; i++) {
    const word = words[i].replace(/[.,]/g, '');
    
    // Expand direction abbreviations (typically last word)
    if (DIRECTIONS[word]) {
      words[i] = DIRECTIONS[word];
    }
    // Expand street types
    else if (STREET_TYPES[word]) {
      words[i] = STREET_TYPES[word];
    }
  }

  addr = words.join(' ');

  // Remove any remaining commas
  addr = addr.replace(/,/g, '').trim();

  // Append unit at end if extracted
  if (unit) {
    addr = `${addr} UNIT ${unit}`;
  }

  // Final cleanup
  addr = addr.replace(/\s+/g, ' ').trim();

  return addr || null;
}

/**
 * Normalize a city name for consistent matching.
 * Fixes typos, standardizes RM names, maps aliases.
 */
export function normalizeCity(city: string | null | undefined): string | null {
  if (!city || !city.trim()) return null;

  let c = city.trim().toUpperCase();

  // Handle "NO." before removing periods — insert space between "NO." and digit
  c = c.replace(/\bNO\.(\d)/g, 'NO. $1');

  // Remove periods
  c = c.replace(/\./g, '');

  // Remove backticks (data quality issue)
  c = c.replace(/`/g, '');

  // Normalize spacing
  c = c.replace(/\s+/g, ' ').trim();

  // Standardize "R.M" → "RM" and "RURAL MUNICIPALITY" → "RM"
  c = c.replace(/^R\.?M\.?\s+OF\s+/i, 'RM OF ');
  c = c.replace(/^RURAL MUNICIPALITY OF\s+/i, 'RM OF ');

  // Standardize RM patterns: "NO." → "NO ", "#" → "NO "
  // "NO." or "NO" followed by a digit → "NO "
  c = c.replace(/\bNO\.(\d)/g, 'NO $1');
  c = c.replace(/\bNO\.\s+/g, 'NO ');
  c = c.replace(/#\s*/g, 'NO ');

  // Normalize spacing again after replacements
  c = c.replace(/\s+/g, ' ').trim();

  // Check alias map
  if (CITY_ALIASES[c]) {
    return CITY_ALIASES[c];
  }

  return c;
}

/**
 * Build a matching key from address + city for deduplication.
 */
export function addressMatchKey(address: string | null | undefined, city: string | null | undefined): string | null {
  const normAddr = normalizeAddress(address);
  const normCity = normalizeCity(city);
  
  if (!normAddr) return null;
  
  // If no city, just use address (some records lack city)
  if (!normCity) return normAddr;
  
  return `${normAddr}|${normCity}`;
}
