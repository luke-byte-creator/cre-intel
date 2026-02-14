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

    // Address
    let address: string | null = null;
    const addrMatch = trimmed.match(
      /(\d+\s+(?:\d+\s+)?[A-Za-z][A-Za-z\s]+?(?:AVE|ST|DR|RD|BLVD|CRES|PL|WAY|LANE|CRT|TERR|PKWY|HWY|CIRCLE|MANOR|MEWS|TRAIL|GATE|Bend|Pkwy)\s*[NSEW]?\s*(?:#\s*\d+)?),?\s*\n?\s*Saskatoon,?\s*SK/i
    );
    if (addrMatch) {
      address = addrMatch[0].replace(/\s+/g, " ").trim().replace(/,$/, "");
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
