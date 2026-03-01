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
  'BLV': 'BOULEVARD',
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
  'COMM': 'COMMON',
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
/**
 * Convert a normalized (uppercase) address to clean display format.
 * "410 22ND STREET EAST" → "410 22nd Street East"
 * "123 MAIN STREET UNIT 5" → "123 Main Street Unit 5"
 */
export function displayAddress(normalized: string | null | undefined): string | null {
  if (!normalized) return null;
  // Title case, but keep ordinals lowercase: 1ST → 1st, 22ND → 22nd
  return normalized
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase())
    // Fix ordinals back to lowercase suffix: "22Nd" → "22nd", "1St" → "1st"
    .replace(/(\d+)(St|Nd|Rd|Th)\b/g, (_, num, suffix) => `${num}${suffix.toLowerCase()}`);
}

export function normalizeAddress(address: string | null | undefined): string | null {
  if (!address || !address.trim()) return null;

  let addr = address.trim().toUpperCase();

  // Detect legal land descriptions (e.g., "NE & SE 26-17-21-W2", "SW 14-36-5-W3")
  // These should not be normalized — return as-is in uppercase
  if (/^[NS][EW]?\s*[&\/]\s*[NS][EW]?\s+\d+/.test(addr) || /^[NS][EW]\s+\d+-\d+-\d+/.test(addr)) {
    return addr;
  }

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
  // But NOT address ranges like "232-242 Pinehouse Dr" where both are civic numbers
  if (!unit) {
    const dashMatch = addr.match(/^(\d{1,4})\s*-\s*(\d+)\s+(.+)/);
    if (dashMatch) {
      const first = parseInt(dashMatch[1]);
      const second = parseInt(dashMatch[2]);
      const streetPart = dashMatch[3];
      // It's a unit if: first number is much smaller than second (typical unit: 200-410)
      // AND the numbers aren't close together (close = address range like 232-242)
      const ratio = second / first;
      const diff = Math.abs(second - first);
      // Address range heuristic: numbers within 50 of each other, or both > 100 and within 2x
      const isRange = (diff <= 50) || (first > 100 && ratio < 2);
      if (!isRange && /^[A-Z]/.test(streetPart)) {
        unit = dashMatch[1];
        addr = `${dashMatch[2]} ${streetPart}`.trim();
      } else if (isRange) {
        // Keep as range address: "232-242 PINEHOUSE DRIVE"
        addr = `${first}-${second} ${streetPart}`.trim();
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

  // Expand street type abbreviations and direction suffixes
  const words = addr.split(' ');
  let streetTypeFound = false;
  for (let i = 0; i < words.length; i++) {
    const word = words[i].replace(/[.,]/g, '');
    
    // Expand street types
    if (STREET_TYPES[word]) {
      words[i] = STREET_TYPES[word];
      streetTypeFound = true;
    }
    // Only expand direction abbreviations AFTER a street type or at the very end
    // This prevents "NE Corned of Inland Drive" from expanding "NE"
    else if (DIRECTIONS[word] && (streetTypeFound || i === words.length - 1) && i > 0) {
      words[i] = DIRECTIONS[word];
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
