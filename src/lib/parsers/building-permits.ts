/**
 * Building Permit PDF Parser (TypeScript)
 * Parses City of Saskatoon weekly building permit reports using pdf-parse v1.
 * Filters to commercial permits (COMM- prefix) with value >= threshold.
 *
 * Raw pdf-parse text format (no spaces/commas, value+date concatenated):
 *   $21000002/9/20260   ← $2,100,000 + 2/9/2026 + trailing 0
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse/lib/pdf-parse");

export interface PermitRecord {
  permitNumber: string;
  issueDate: string | null;
  address: string | null;
  owner: string | null;
  scope: string | null;
  workType: string | null;
  buildingType: string;
  value: number | null;
}

/**
 * Parse concatenated value+date string like "$21000002/9/20260"
 * Returns separated value and date.
 */
export function parseValueDate(dollarStr: string): { value: number; issueDate: string | null } {
  const stripped = dollarStr.replace(/[$,]/g, "");

  // Find slash positions — date is M/D/YYYY
  const slashes: number[] = [];
  for (let i = 0; i < stripped.length; i++) {
    if (stripped[i] === "/") slashes.push(i);
  }

  if (slashes.length >= 2) {
    const s1 = slashes[0];
    const s2 = slashes[1];
    const dayStr = stripped.substring(s1 + 1, s2);
    const yearStr = stripped.substring(s2 + 1, s2 + 5);
    const day = parseInt(dayStr);
    const year = parseInt(yearStr);

    if (day >= 1 && day <= 31 && year >= 2020 && year <= 2030) {
      // Try 1-digit month first (keeps more digits in value)
      for (const monthLen of [1, 2]) {
        if (s1 - monthLen < 0) continue;
        const monthStr = stripped.substring(s1 - monthLen, s1);
        const month = parseInt(monthStr);
        if (month < 1 || month > 12) continue;
        const valueStr = stripped.substring(0, s1 - monthLen);
        if (!valueStr) continue;
        return {
          value: parseInt(valueStr),
          issueDate: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        };
      }
    }
  }

  // No date found — just parse as plain number
  const digits = stripped.replace(/\D/g, "");
  return { value: digits ? parseInt(digits) : 0, issueDate: null };
}

/**
 * Extract owner from the permit block.
 * Owner appears right after the permit number, before the first address or phone line.
 */
function extractOwner(block: string): string | null {
  const lines = block.split("\n");
  const ownerLines: string[] = [];
  let started = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (i === 0) {
      // Owner may be concatenated: COMM-2025-09832aodbt architecture
      const afterPermit = line.replace(/^COMM-\d{4}-\d+/, "").trim();
      if (afterPermit) {
        ownerLines.push(afterPermit);
        started = true;
      }
      continue;
    }
    if (!started && line) {
      ownerLines.push(line);
      started = true;
      continue;
    }
    if (started) {
      // Stop at: address lines, phone, postal codes, postal code prefix (S7K etc), comma-only, empty
      if (/^\d+[\s\-]/.test(line) || /^Ph:/.test(line) || /^[A-Z]\d[A-Z]/.test(line) || /^S\d[A-Z]/.test(line) || line === "," || !line) {
        break;
      }
      ownerLines.push(line);
    }
  }

  if (ownerLines.length === 0) return null;
  let name = ownerLines.join(" ").trim().replace(/,\s*$/, "").replace(/\s+/g, " ");
  return name || null;
}

/**
 * Dedup owner name — pdf-parse often repeats the owner (owner block + contractor block).
 */
function dedupOwner(name: string): string {
  const half = Math.floor(name.length / 2);
  for (let i = half - 5; i <= half + 5; i++) {
    if (i > 0 && i < name.length) {
      const first = name.substring(0, i).trim();
      const second = name.substring(i).trim();
      if (first === second) return first;
    }
  }
  return name;
}

export async function parseBuildingPermits(
  buffer: Buffer,
  minValue: number = 350_000
): Promise<PermitRecord[]> {
  const data = await pdfParse(buffer);
  const fullText: string = data.text;
  const permits: PermitRecord[] = [];

  const blocks = fullText.split(
    /(?=(?:ACC|COMM|DECK|DEMO|HALT|INST|MFR|SFD|SIGN|TENT|PLUMB|FIRE|MOVE)-\d{4}-\d+)/
  );

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed || !trimmed.startsWith("COMM-")) continue;

    const bpMatch = trimmed.match(/^(COMM-\d{4}-\d+)/);
    if (!bpMatch) continue;
    const permitNumber = bpMatch[1];

    // Value + Date
    const dollarMatch = trimmed.match(/\$[0-9,/]+/);
    if (!dollarMatch) continue;
    const { value, issueDate } = parseValueDate(dollarMatch[0]);

    if (!value || value < minValue) continue;

    // Address — project address is the last address before "Commercial Building"
    // Handles: "211 19th ST E", "2950 Miners AVE", "425 AVE P S", "C 3750 Idylwyld DR N"
    let address: string | null = null;
    const addrPattern = /(?:^|\n)\s*(?:C\s+)?(\d+(?:\s*[A-Z])?\s+(?:[\w\s]+?(?:AVE|ST|DR|RD|BLVD|CRES|PL|WAY|LANE|CRT|TERR|PKWY|HWY|CIRCLE|MANOR|MEWS|TRAIL|GATE|Bend|Pkwy)|(?:AVE|ST|DR|RD|BLVD)\s+[A-Z])\s*[NSEW]?\s*(?:#\s*\d+)?),?\s*\n?\s*(Saskatoon|Regina|Prince Albert|Warman|Martensville),?\s*\n?\s*SK/gi;
    const allAddresses: { street: string; city: string; index: number }[] = [];
    let addrMatch;
    while ((addrMatch = addrPattern.exec(trimmed)) !== null) {
      allAddresses.push({ street: addrMatch[1].trim(), city: addrMatch[2].trim(), index: addrMatch.index });
    }

    const commIdx = trimmed.indexOf("Commercial Building");
    if (allAddresses.length > 0) {
      let best;
      if (commIdx > 0) {
        const beforeComm = allAddresses.filter(a => a.index < commIdx);
        best = beforeComm.length > 0 ? beforeComm[beforeComm.length - 1] : allAddresses[allAddresses.length - 1];
      } else {
        best = allAddresses[allAddresses.length - 1];
      }
      address = `${best.street}, ${best.city}, SK`.replace(/\s+/g, " ");
    }

    if (address) {
      address = address.replace(/^\d\s+(?=\d)/, "");
      if (address.match(/Construction|Architect|Engineering|Design|Group|Consult/i)) {
        address = null;
      }
    }

    // Scope
    let scope: string | null = null;
    const scopeLines: string[] = [];
    const lines = trimmed.split("\n");
    let inScope = false;
    for (const line of lines) {
      if (line.includes("Commercial Building") || line.trim() === "Commercial") {
        inScope = true;
        continue;
      }
      if (inScope) {
        if (/^\$|^(?:ACC|COMM|DECK|DEMO)-/.test(line.trim())) break;
        if (line.trim()) scopeLines.push(line.trim());
      }
    }
    if (scopeLines.length) scope = scopeLines.join(" - ");

    // Owner
    let owner = extractOwner(trimmed);
    if (owner) owner = dedupOwner(owner);

    // Work type
    let workType: string | null = null;
    if (trimmed.includes("Alteration/Renovation")) workType = "Alteration/Renovation";
    else if (/Phased New|New\b/.test(trimmed)) workType = "New Construction";
    else if (trimmed.includes("Demolition")) workType = "Demolition";

    permits.push({
      permitNumber,
      issueDate,
      address,
      owner,
      scope,
      workType,
      buildingType: "Commercial",
      value,
    });
  }

  return permits;
}
