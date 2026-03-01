/**
 * Corporate Registry PDF Parser v2
 * Uses pdftotext (poppler) for proper text extraction with preserved spacing.
 */

import { execSync } from "child_process";
import { writeFileSync, readFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";

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
  businessNames: { number: string; name: string; type: string }[];
  previousNames: { name: string; effectiveUntil: string }[];
  amalgamatedFrom: string[];
}

// ── Helpers ──

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => {
      if (/^\d/.test(w)) return w; // keep tokens starting with digits as-is
      if (/^[IVXLC]+$/.test(w) && w.length <= 4) return w; // Roman numerals
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

function titleCaseEntity(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => {
      if (/^\d/.test(w)) return w;
      const upper = w.toUpperCase();
      // Keep certain suffixes in conventional form
      if (upper === "LTD." || upper === "LTD") return "Ltd.";
      if (upper === "INC." || upper === "INC") return "Inc.";
      if (upper === "CORP." || upper === "CORP") return "Corp.";
      if (upper === "LP" || upper === "LP.") return "LP";
      if (upper === "LLP" || upper === "LLP.") return "LLP";
      if (upper === "GP" || upper === "GP.") return "GP";
      if (/^[IVXLC]+$/.test(upper) && upper.length <= 4) return upper;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

function titleCasePerson(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => {
      if (/^\d/.test(w)) return w;
      // Handle initials like "J." or "O."
      if (/^[A-Z]\.$/.test(w.toUpperCase())) return w.charAt(0).toUpperCase() + ".";
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

function extractTextFromPdf(filePath: string): string {
  return execSync(`/opt/homebrew/bin/pdftotext "${filePath}" -`, {
    maxBuffer: 10 * 1024 * 1024,
  }).toString("utf-8");
}

function extractTextFromBuffer(buffer: Buffer): string {
  const tmpPath = join(tmpdir(), `cr-${randomBytes(8).toString("hex")}.pdf`);
  writeFileSync(tmpPath, buffer);
  try {
    return extractTextFromPdf(tmpPath);
  } finally {
    try { unlinkSync(tmpPath); } catch {}
  }
}

/**
 * Strip repeated page headers (pages 2+).
 * Headers look like:
 *   "Saskatchewan\nCorporate Registry\nProfile Report\nEntity Number: ...\n\nPage X of Y\n\nEntity Name: ...\n\nReport Date: ..."
 * or (newer):
 *   "Profile Report\nEntity Number: ...\n\nPage X of Y\n\nEntity Name: ...\n\nReport Date: ..."
 */
function stripPageHeaders(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let i = 0;
  let firstPage = true;

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    // Detect page header start
    const isOldHeader = trimmed === "Saskatchewan" && i + 2 < lines.length &&
      lines[i + 1].trim() === "Corporate Registry" &&
      lines[i + 2].trim() === "Profile Report";
    const isNewHeader = trimmed === "Profile Report" && i + 1 < lines.length &&
      lines[i + 1].trim().startsWith("Entity Number:");

    if (isOldHeader || isNewHeader) {
      if (firstPage) {
        firstPage = false;
        // Keep first page header
        while (i < lines.length) {
          result.push(lines[i]);
          if (/^Report Date:/.test(lines[i].trim())) { i++; break; }
          i++;
        }
      } else {
        // Skip subsequent page headers until after Report Date line
        while (i < lines.length) {
          if (/^Report Date:/.test(lines[i].trim())) { i++; break; }
          i++;
        }
      }
    } else {
      result.push(lines[i]);
      i++;
    }
  }
  return result.join("\n");
}

/**
 * Find section boundaries by looking for known section headers.
 */
function findSections(text: string): Map<string, string> {
  const sectionHeaders = [
    "Entity Details",
    "Registered Office/Mailing Address",
    "Registered Office Addresses",
    "Directors/Officers",
    "Power of Attorney",
    "Shareholders",
    "Articles",
    "Business Names Owned By Corporation",
    "Previous Entity Names",
    "Amalgamated From",
    "Event History",
  ];

  const lines = text.split("\n");
  const sections: { name: string; start: number }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    for (const header of sectionHeaders) {
      if (trimmed === header) {
        sections.push({ name: header, start: i + 1 });
      }
    }
  }

  const result = new Map<string, string>();
  for (let s = 0; s < sections.length; s++) {
    const end = s + 1 < sections.length ? sections[s + 1].start - 1 : lines.length;
    result.set(sections[s].name, lines.slice(sections[s].start, end).join("\n"));
  }
  return result;
}

function parseEntityDetails(section: string): Partial<CorporateRegistryResult> {
  const r: Partial<CorporateRegistryResult> = {};
  const lines = section.split("\n").map((l) => l.trim()).filter(Boolean);

  // Parse key-value pairs where key is on one line, value on the next
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = i + 1 < lines.length ? lines[i + 1] : "";

    if (line === "Entity Type") { r.entityType = next; i++; }
    else if (line === "Entity Subtype") { r.entitySubtype = next; i++; }
    else if (line === "Entity Status") { r.status = next; i++; }
    else if (line === "Incorporation Date" || line === "Registration Date") { r.incorporationDate = next; i++; }
    else if (line === "Annual Return Due Date") { r.annualReturnDue = next; i++; }
    else if (line === "Nature of Business") { r.natureOfBusiness = next; i++; }
  }
  return r;
}

function parseAddresses(section: string): { registeredAddress: string | null; mailingAddress: string | null } {
  const result = { registeredAddress: null as string | null, mailingAddress: null as string | null };
  const lines = section.split("\n");

  let currentField: "physical" | "mailing" | "attention" | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    if (currentField === "physical" && currentLines.length) {
      result.registeredAddress = currentLines.join(" ").replace(/\s+/g, " ").trim();
    } else if (currentField === "mailing" && currentLines.length) {
      result.mailingAddress = currentLines.join(" ").replace(/\s+/g, " ").trim();
    }
    currentLines = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed === "Physical Address" || trimmed.startsWith("Physical Address")) {
      flush();
      currentField = "physical";
      const after = trimmed.replace(/^Physical Address\s*/, "").trim();
      if (after) currentLines.push(after);
    } else if (trimmed === "Mailing Address" || trimmed.startsWith("Mailing Address")) {
      flush();
      currentField = "mailing";
      const after = trimmed.replace(/^Mailing Address\s*/, "").trim();
      if (after) currentLines.push(after);
    } else if (trimmed.startsWith("Attention To")) {
      flush();
      currentField = "attention";
    } else if (currentField === "physical" || currentField === "mailing") {
      currentLines.push(trimmed);
    }
  }
  flush();
  return result;
}

function parseDirectorsOfficers(section: string): { directors: PersonEntry[]; officers: PersonEntry[] } {
  const directors: PersonEntry[] = [];
  const officers: PersonEntry[] = [];
  const lines = section.split("\n");

  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    const personMatch = trimmed.match(/^(.+?)\s*\((Director|Officer)\)\s*$/);

    if (personMatch) {
      const rawName = personMatch[1].trim();
      const role = personMatch[2];
      let physAddr: string | null = null;
      let officeHeld: string | null = null;
      let effectiveDate: string | null = null;

      i++;
      let collecting: "physical" | "mailing" | null = null;
      let addrLines: string[] = [];

      while (i < lines.length) {
        const cl = lines[i].trim();

        // Next person or next section
        if (/^.+\s*\((Director|Officer)\)\s*$/.test(cl)) break;
        if (/^(Shareholders|Power of Attorney|Articles)$/.test(cl)) break;

        if (cl === "Physical Address:" || cl.startsWith("Physical Address:")) {
          if (collecting === "physical" && addrLines.length) {
            physAddr = addrLines.join(" ").replace(/\s+/g, " ").trim();
          }
          collecting = "physical";
          addrLines = [];
          const after = cl.replace(/^Physical Address:\s*/, "").trim();
          if (after) addrLines.push(after);
          i++;
          continue;
        }

        if (cl === "Mailing Address:" || cl.startsWith("Mailing Address:")) {
          if (collecting === "physical" && addrLines.length) {
            physAddr = addrLines.join(" ").replace(/\s+/g, " ").trim();
          }
          collecting = "mailing";
          addrLines = [];
          i++;
          continue;
        }

        if (cl.startsWith("Resident Canadian:")) {
          if (collecting === "physical" && addrLines.length) {
            physAddr = addrLines.join(" ").replace(/\s+/g, " ").trim();
          }
          collecting = null;
          addrLines = [];
          i++;
          continue;
        }

        if (cl.startsWith("Effective Date:") || cl === "Effective Date:") {
          if (collecting === "physical" && addrLines.length) {
            physAddr = addrLines.join(" ").replace(/\s+/g, " ").trim();
          }
          collecting = null;
          addrLines = [];
          const val = cl.replace(/^Effective Date:\s*/, "").trim();
          if (val) {
            effectiveDate = val;
          } else {
            // Value on next line
            i++;
            while (i < lines.length && !lines[i].trim()) i++;
            if (i < lines.length) effectiveDate = lines[i].trim();
          }
          i++;
          continue;
        }

        if (cl.startsWith("Office Held:") || cl === "Office Held:") {
          if (collecting === "physical" && addrLines.length) {
            physAddr = addrLines.join(" ").replace(/\s+/g, " ").trim();
          }
          collecting = null;
          addrLines = [];
          const val = cl.replace(/^Office Held:\s*/, "").trim();
          if (val) {
            officeHeld = val;
          } else {
            i++;
            while (i < lines.length && !lines[i].trim()) i++;
            if (i < lines.length) officeHeld = lines[i].trim();
          }
          i++;
          continue;
        }

        if (collecting && cl) {
          addrLines.push(cl);
        }
        i++;
      }

      // Flush remaining physical address
      if (collecting === "physical" && addrLines.length) {
        physAddr = addrLines.join(" ").replace(/\s+/g, " ").trim();
      }

      const name = titleCasePerson(rawName);
      const entry: PersonEntry = {
        name,
        role,
        effectiveDate,
        address: physAddr,
        title: officeHeld ? titleCase(officeHeld) : null,
      };

      if (role === "Director") directors.push(entry);
      else officers.push(entry);
      continue;
    }
    i++;
  }
  return { directors, officers };
}

function parseShareholders(section: string): ShareholderEntry[] {
  const results: ShareholderEntry[] = [];
  const lines = section.split("\n");

  // Find the header row with "Shares Held"
  let startIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "Shares Held" || lines[i].includes("Shares Held")) {
      startIdx = i + 1;
      break;
    }
  }

  // Collect non-empty lines after header
  const dataLines: string[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    dataLines.push(t);
  }

  // Group lines into entries. A shares-held number (digits with optional commas) terminates an entry.
  let entryLines: string[] = [];

  for (const line of dataLines) {
    entryLines.push(line);

    // Check if this line is just a number (shares held)
    if (/^[\d,]+$/.test(line)) {
      processShareholderEntry(entryLines, results);
      entryLines = [];
    }
  }

  // Handle leftover (shouldn't normally happen)
  if (entryLines.length > 0) {
    processShareholderEntry(entryLines, results);
  }

  return results;
}

function processShareholderEntry(lines: string[], results: ShareholderEntry[]): void {
  if (lines.length < 2) return;

  // Last line is shares held
  const sharesStr = lines[lines.length - 1].trim();
  const sharesHeld = parseInt(sharesStr.replace(/,/g, ""));
  if (isNaN(sharesHeld)) return;

  // Second-to-last line is share class
  const shareClass = lines[lines.length - 2].trim();

  // Remaining lines are name + address
  const remaining = lines.slice(0, -2);
  if (remaining.length === 0) return;

  // Separate name from address.
  // Address lines: start with digits, #, BOX, PO, P.O., C/O, or contain province/country patterns
  const geoPattern = /\b(Saskatchewan|Alberta|British Columbia|Ontario|Quebec|Manitoba|Nova Scotia|New Brunswick|Canada|SK|AB|BC|ON|QC|MB|NS|NB|PE|NL|NT|YT|NU)\b/i;
  const addrStartPattern = /^(\d|#|BOX\b|PO\b|P\.?O\.?\b|C\/O\b)/i;

  let nameLines: string[] = [];
  let addrLines: string[] = [];
  let inAddress = false;

  for (const line of remaining) {
    if (!inAddress) {
      if (geoPattern.test(line) || (nameLines.length > 0 && addrStartPattern.test(line))) {
        inAddress = true;
        addrLines.push(line);
      } else {
        nameLines.push(line);
      }
    } else {
      addrLines.push(line);
    }
  }

  const name = nameLines.join(" ").replace(/\s+/g, " ").trim();
  const address = addrLines.join(" ").replace(/\s+/g, " ").trim() || null;

  if (!name) return;

  // Determine if name is a person or company for title casing
  const isCompany = /\b(Ltd|Inc|Corp|Holdings|Trust|Partnership|Lp|Llp|Limited|Company)\b/i.test(name);
  const formattedName = isCompany ? titleCaseEntity(name) : titleCasePerson(name);

  results.push({
    name: formattedName,
    address,
    shareClass: shareClass || null,
    sharesHeld,
  });
}

function parseBusinessNames(section: string): { number: string; name: string; type: string }[] {
  const results: { number: string; name: string; type: string }[] = [];
  const lines = section.split("\n").map((l) => l.trim()).filter(Boolean);

  // Skip header lines (Number, Name, Type)
  let startIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === "Type" || lines[i] === "Number") {
      startIdx = i + 1;
    }
  }

  // Each entry: number line, name line, type line
  let i = startIdx;
  while (i < lines.length) {
    const numMatch = lines[i].match(/^(\d+)$/);
    if (numMatch && i + 2 < lines.length) {
      const number = numMatch[1];
      const name = lines[i + 1];
      const type = lines[i + 2];
      results.push({ number, name: titleCaseEntity(name), type });
      i += 3;
    } else {
      i++;
    }
  }
  return results;
}

function parsePreviousNames(section: string): { name: string; effectiveUntil: string }[] {
  const results: { name: string; effectiveUntil: string }[] = [];
  const lines = section.split("\n").map((l) => l.trim()).filter(Boolean);

  // Skip header lines
  let startIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === "Effective Until") {
      startIdx = i + 1;
      break;
    }
  }

  // Entries can be: "Type\nName\nEffectiveUntil" or "Name\nEffectiveUntil"
  // Look for date pattern DD-Mon-YYYY
  for (let i = startIdx; i < lines.length; i++) {
    const dateMatch = lines[i].match(/^\d{2}-[A-Za-z]{3}-\d{4}$/);
    if (dateMatch && i > startIdx) {
      // Previous line(s) are the name; line before that might be type
      let nameIdx = i - 1;
      const name = lines[nameIdx];
      results.push({ name: titleCaseEntity(name), effectiveUntil: lines[i] });
    }
  }
  return results;
}

function parseAmalgamatedFrom(text: string): string[] {
  const results: string[] = [];
  const match = text.match(/Amalgamated From\n([\s\S]*?)(?=\n(?:Registered Office|Directors|Shareholders|Articles|Event History|Business Names|Previous Entity|$))/);
  if (match) {
    const lines = match[1].split("\n").map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (line.match(/^\d+\s*-\s*.+/)) {
        results.push(titleCaseEntity(line));
      }
    }
  }
  return results;
}

// ── Main parser ──

export async function parseCorporateRegistry(
  bufferOrPath: Buffer | string
): Promise<CorporateRegistryResult> {
  const rawText = typeof bufferOrPath === "string"
    ? extractTextFromPdf(bufferOrPath)
    : extractTextFromBuffer(bufferOrPath);

  const text = stripPageHeaders(rawText);

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
    businessNames: [],
    previousNames: [],
    amalgamatedFrom: [],
  };

  // Extract header fields
  const numMatch = text.match(/Entity Number:\s*(\S+)/);
  if (numMatch) result.entityNumber = numMatch[1];

  const nameMatch = text.match(/Entity Name:\s*(.+)/);
  if (nameMatch) result.entityName = titleCaseEntity(nameMatch[1].trim());

  const dateMatch = text.match(/Report Date:\s*(\S+)/);
  if (dateMatch) result.reportDate = dateMatch[1];

  // Parse sections
  const sections = findSections(text);

  // Entity Details
  const entitySection = sections.get("Entity Details");
  if (entitySection) {
    Object.assign(result, parseEntityDetails(entitySection));
  }

  // Addresses
  const addrSection = sections.get("Registered Office/Mailing Address") || sections.get("Registered Office Addresses");
  if (addrSection) {
    const addrs = parseAddresses(addrSection);
    result.registeredAddress = addrs.registeredAddress;
    result.mailingAddress = addrs.mailingAddress;
  }

  // Directors/Officers
  const dirSection = sections.get("Directors/Officers");
  if (dirSection) {
    const { directors, officers } = parseDirectorsOfficers(dirSection);
    result.directors = directors;
    result.officers = officers;
  }

  // Shareholders
  const shSection = sections.get("Shareholders");
  if (shSection) {
    result.shareholders = parseShareholders(shSection);
  }

  // Business Names
  const bnSection = sections.get("Business Names Owned By Corporation");
  if (bnSection) {
    result.businessNames = parseBusinessNames(bnSection);
  }

  // Previous Names
  const pnSection = sections.get("Previous Entity Names");
  if (pnSection) {
    result.previousNames = parsePreviousNames(pnSection);
  }

  // Amalgamated From
  result.amalgamatedFrom = parseAmalgamatedFrom(text);

  return result;
}

export function parseCorporateRegistryFromFile(filePath: string): Promise<CorporateRegistryResult> {
  return parseCorporateRegistry(filePath);
}
