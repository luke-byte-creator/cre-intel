/**
 * Corporate Registry PDF Parser (TypeScript)
 * Parses Saskatchewan corporate registry profile reports using pdf-parse v1.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse/lib/pdf-parse");

export interface CorporateRegistryResult {
  entityNumber: string | null;
  entityName: string | null;
  reportDate: string | null;
  entityType: string | null;
  entitySubtype: string | null;
  status: string | null;
  incorporationDate: string | null;
  annualReturnDue: string | null;
  natureOfBusiness: string | null;
  registeredAddress: string | null;
  mailingAddress: string | null;
  directors: PersonEntry[];
  officers: PersonEntry[];
  shareholders: ShareholderEntry[];
}

export interface PersonEntry {
  name: string;
  role: string;
  effectiveDate: string | null;
  address: string | null;
  title: string | null;
}

export interface ShareholderEntry {
  name: string;
  address: string | null;
  shareClass: string | null;
  sharesHeld: number | null;
}

function titleCase(name: string): string {
  return name
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Split concatenated ALL CAPS names like "TRAVISBATTING" -> "TRAVIS BATTING"
// This is tricky - we use the shareholder section which has addresses to help
function splitConcatenatedName(raw: string): string {
  // If already has spaces in the name portion, return as-is
  const trimmed = raw.trim();
  if (trimmed.includes(" ")) return titleCase(trimmed);
  // Try to split at uppercase transitions won't work since it's all uppercase
  // Best effort: return as-is in title case
  return titleCase(trimmed);
}

export async function parseCorporateRegistry(
  buffer: Buffer
): Promise<CorporateRegistryResult> {
  const data = await pdfParse(buffer);
  const fullText: string = data.text;

  const result: CorporateRegistryResult = {
    entityNumber: null,
    entityName: null,
    reportDate: null,
    entityType: null,
    entitySubtype: null,
    status: null,
    incorporationDate: null,
    annualReturnDue: null,
    natureOfBusiness: null,
    registeredAddress: null,
    mailingAddress: null,
    directors: [],
    officers: [],
    shareholders: [],
  };

  // Entity number (no spaces in pdf-parse v1 output)
  let m = fullText.match(/EntityNumber:\s*(\d+)/);
  if (m) result.entityNumber = m[1];

  // Entity name - between EntityName: and ReportDate:
  m = fullText.match(/EntityName:\s*(.+?)ReportDate:/);
  if (m) result.entityName = m[1].trim();

  // Report date
  m = fullText.match(/ReportDate:\s*(\d{2}-[A-Za-z]{3}-\d{4})/);
  if (m) result.reportDate = m[1];

  // Entity details (concatenated labels)
  m = fullText.match(/EntityType\s*(.+?)(?:\n|EntitySubtype)/);
  if (m) result.entityType = m[1].replace(/([a-z])([A-Z])/g, "$1 $2").trim();

  m = fullText.match(/EntitySubtype\s*(.+?)(?:\n|EntityStatus)/);
  if (m) result.entitySubtype = m[1].replace(/([a-z])([A-Z])/g, "$1 $2").trim();

  m = fullText.match(/EntityStatus\s*(\w+)/);
  if (m) result.status = m[1];

  m = fullText.match(/IncorporationDate\s*(\S+)/);
  if (m) result.incorporationDate = m[1];

  m = fullText.match(/AnnualReturnDue\s*Date\s*(\S+)/);
  if (m) result.annualReturnDue = m[1];

  m = fullText.match(/Nature\s*of\s*Business\s*(.+?)(?:\n|MRAS)/);
  if (m) result.natureOfBusiness = m[1].replace(/([a-z])([A-Z])/g, "$1 $2").trim();

  // Addresses
  m = fullText.match(/PhysicalAddress\s*(.+?)(?:\nMailing)/);
  if (m) result.registeredAddress = m[1].replace(/\s+/g, " ").trim();

  m = fullText.match(/RegisteredOfficeAddresses[\s\S]*?MailingAddress\s*(.+?)(?:\nDirectors)/);
  if (m) result.mailingAddress = m[1].replace(/\s+/g, " ").trim();

  // Directors/Officers
  // Pattern: NAME(Director|Officer)EffectiveDate:DATE
  const dirSection = fullText.match(/Directors\/Officers\n([\s\S]*?)(?:\nShareholders)/);
  if (dirSection) {
    const section = dirSection[1];
    // Match entries like: TRAVISBATTING(Director)EffectiveDate:28-Mar-2022
    const entryRegex = /([A-Z][A-Z\s]+?)\((Director|Officer)\)\s*EffectiveDate:\s*(\S+)/g;
    let em;
    while ((em = entryRegex.exec(section)) !== null) {
      const rawName = em[1].trim();
      const role = em[2];
      const effectiveDate = em[3];

      // Get address after this entry
      const afterEntry = section.slice(em.index + em[0].length);
      let address: string | null = null;
      const addrMatch = afterEntry.match(/PhysicalAddress:\s*([\s\S]+?)(?:\nMailing|$)/);
      if (addrMatch) {
        address = addrMatch[1].replace(/\s+/g, " ").trim();
      }

      // Title
      let title: string | null = null;
      const titleMatch = afterEntry.match(/OfficeHeld:\s*(.+?)(?:\n|$)/);
      if (titleMatch) title = titleMatch[1].trim();

      // Try to split name using known shareholder names later, for now use as-is
      const name = splitConcatenatedName(rawName);

      const person: PersonEntry = { name, role, effectiveDate, address, title };
      if (role === "Director") result.directors.push(person);
      else result.officers.push(person);
    }
  }

  // Shareholders - better parsing since we have structured lines
  const shSection = fullText.match(/ShareholderName[\s\S]*?\n([\s\S]*?)(?:\nArticles)/);
  if (shSection) {
    const section = shSection[1];
    // Match: NAME ADDRESS CLASS# SHARES
    // Lines like: FRANCOISMESSIER122 BLAIRCOURT,SASKATOON,...\nCLASSA50
    const lines = section.split("\n").filter((l) => l.trim());
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      // Match shareholder line: ALL CAPS NAME followed by address, then CLASS and shares
      const shMatch = line.match(/^([A-Z][A-Z]+)\s*(.+?)(CLASS\s*[A-Z])\s*(\d+)\s*$/);
      if (shMatch) {
        result.shareholders.push({
          name: splitConcatenatedName(shMatch[1]),
          address: shMatch[2].trim().replace(/,\s*$/, ""),
          shareClass: shMatch[3].replace(/\s/g, ""),
          sharesHeld: parseInt(shMatch[4]),
        });
        i++;
        continue;
      }
      // Multi-line: name+address on one line, CLASS on next
      // e.g., FRANCOISMESSIER122 BLAIRCOURT,SASKATOON,
      //        SASKATCHEWAN,CANADA,S7N 3G9
      //        CLASSA50
      if (/^[A-Z]{2,}/.test(line) && !line.includes("CLASS")) {
        // Collect continuation lines until we see CLASS
        let combined = line;
        let j = i + 1;
        while (j < lines.length) {
          combined += " " + lines[j].trim();
          if (/CLASS\s*[A-Z]\s*\d+/.test(lines[j])) {
            j++;
            break;
          }
          j++;
        }
        const cm = combined.match(/^([A-Z][A-Z]+)\s*(.+?)(CLASS\s*[A-Z])\s*(\d+)/);
        if (cm) {
          result.shareholders.push({
            name: splitConcatenatedName(cm[1]),
            address: cm[2].trim().replace(/,\s*$/, ""),
            shareClass: cm[3].replace(/\s/g, ""),
            sharesHeld: parseInt(cm[4]),
          });
          i = j;
          continue;
        }
      }
      i++;
    }
  }

  // Now fix concatenated names by cross-referencing shareholders with directors
  // Shareholders have addresses that help separate name from address
  // Use shareholder names to fix director names
  const knownNames = result.shareholders.map((s) => s.name);
  for (const person of [...result.directors, ...result.officers]) {
    // Try to match against known shareholder names
    const personNorm = person.name.toLowerCase().replace(/\s+/g, "");
    for (const known of knownNames) {
      const knownNorm = known.toLowerCase().replace(/\s+/g, "");
      if (personNorm === knownNorm) {
        person.name = known;
        break;
      }
    }
  }

  return result;
}
