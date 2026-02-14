/**
 * Building Permit PDF Parser (TypeScript)
 * Parses City of Saskatoon weekly building permit reports using pdf-parse v1.
 * Filters to commercial permits (COMM- prefix) with value >= threshold.
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

function extractOwner(block: string): string | null {
  const m = block.match(
    /([A-Z][A-Za-z\s&\-']+(?:Inc|Ltd|Corp|Co|LP|LLP|Group|Properties|Investments|Construction|Development|Developments|Holdings|Realty|Real Estate|Partnership|Trust|Association|Electric)\.?(?:\s+(?:Inc|Ltd|Corp)\.?)?)/
  );
  return m ? m[1].trim() : null;
}

function dedupOwner(name: string): string {
  const words = name.split(/\s+/);
  for (let split = 2; split < words.length; split++) {
    if (
      words[split] === words[0] ||
      (words[split].length > 3 && words.slice(0, split).join(" ").includes(words[split]))
    ) {
      return words.slice(0, split).join(" ");
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

  // Split into permit blocks
  const blocks = fullText.split(
    /(?=(?:ACC|COMM|DECK|DEMO|HALT|INST|MFR|SFD|SIGN|TENT|PLUMB|FIRE|MOVE)-\d{4}-\d+)/
  );

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed || !trimmed.startsWith("COMM-")) continue;

    const bpMatch = trimmed.match(/^(COMM-\d{4}-\d+)/);
    if (!bpMatch) continue;
    const permitNumber = bpMatch[1];

    // Issue date
    let issueDate: string | null = null;
    const dateMatch = trimmed.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dateMatch) {
      issueDate = `${dateMatch[3]}-${dateMatch[1].padStart(2, "0")}-${dateMatch[2].padStart(2, "0")}`;
    }

    // Value
    let value: number | null = null;
    const valueMatch = trimmed.match(/\$([0-9,]+)/);
    if (valueMatch) {
      value = parseFloat(valueMatch[1].replace(/,/g, ""));
    }

    if (!value || value < minValue) continue;

    // Address — find the PROJECT address, not the applicant's mailing address.
    // The project address is the last address before "Commercial Building" in the block.
    // The applicant address comes first (often with postal code + phone number).
    let address: string | null = null;
    const addrPattern = /(\d+\s+(?:\d+\s+)?(?:[A-Za-z][\w\s]+?|[\d]+(?:st|nd|rd|th)\s+)(?:AVE|ST|DR|RD|BLVD|CRES|PL|WAY|LANE|CRT|TERR|PKWY|HWY|CIRCLE|MANOR|MEWS|TRAIL|GATE|Bend|Pkwy)\s*[NSEW]?\s*(?:#\s*\d+)?),?\s*\n?\s*(?:Saskatoon|Regina|Prince Albert|Warman|Martensville),?\s*SK/gi;
    const allAddresses: { match: string; index: number }[] = [];
    let addrMatch;
    while ((addrMatch = addrPattern.exec(trimmed)) !== null) {
      allAddresses.push({ match: addrMatch[0], index: addrMatch.index });
    }
    // Find the "Commercial Building" marker
    const commIdx = trimmed.indexOf("Commercial Building");
    if (allAddresses.length > 0 && commIdx > 0) {
      // Take the last address that appears before "Commercial Building"
      const beforeComm = allAddresses.filter(a => a.index < commIdx);
      const best = beforeComm.length > 0 ? beforeComm[beforeComm.length - 1] : allAddresses[allAddresses.length - 1];
      address = best.match.replace(/\s+/g, " ").trim().replace(/,$/, "");
    } else if (allAddresses.length > 0) {
      // Fallback: use the last address found (most likely the project address)
      address = allAddresses[allAddresses.length - 1].match.replace(/\s+/g, " ").trim().replace(/,$/, "");
    }
    // Clean up stray postal code digits that get prepended (e.g. "9 2100 8th ST" from "S7K 8A9\n2100...")
    if (address) {
      address = address.replace(/^\d\s+(?=\d)/, "");
      // Remove company names that leaked into the address
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
    else if (/\bNew\b/.test(trimmed)) workType = "New Construction";
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
