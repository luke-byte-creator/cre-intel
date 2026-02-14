/**
 * Corporate Registry PDF Parser (TypeScript)
 * Parses Saskatchewan corporate registry profile reports using pdf-parse v1.
 * Handles concatenated text from pdf-parse (no spaces between words).
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

// ── Helpers ──

// Words to insert spaces before/after in concatenated entity names
const KNOWN_WORDS = [
  // Sort longer first to match greedily
  "DEVELOPMENTS", "DEVELOPMENT", "CONSTRUCTION", "ENTERPRISES", "TECHNOLOGIES",
  "INVESTMENTS", "CONTRACTING", "LANDSCAPING", "EXCAVATING", "DISTRIBUTION",
  "DISTRIBUTORS", "COMMUNICATIONS", "ENVIRONMENTAL", "FABRICATION", "ENGINEERING",
  "HOSPITALITY", "RESIDENTIAL", "COMMERCIAL", "WOODWORKING", "EXPLORATION",
  "AGGREGATES", "MANAGEMENT", "PROPERTIES", "CONSULTING", "AUTOMOTIVE",
  "MECHANICAL", "RECYCLING", "FINANCIAL", "SOLUTIONS", "PETROLEUM",
  "RESTAURANT", "RESOURCES", "TRANSPORT", "LOGISTICS", "INDUSTRIES",
  "ASSOCIATES", "SUPPLIERS", "SUPPLIES", "TRUCKING", "HOLDINGS",
  "VENTURES", "BUILDERS", "CONCRETE", "PLUMBING", "FLOORING",
  "CABINETS", "MILLWORK", "PIPELINE", "DRILLING", "OILFIELD",
  "MACHINING", "SERVICES", "RENTALS", "LEASING", "HAULING",
  "ROOFING", "WELDING", "GRAVEL", "ASPHALT", "CAPITAL",
  "HEATING", "COOLING", "MEDICAL", "DENTAL", "HEALTH",
  "ENERGY", "MINING", "STEEL", "METAL", "MEDIA", "WATER",
  "WASTE", "DESIGN", "FOODS", "HOMES", "SUPPLY", "PAVING",
  "REALTY", "CATTLE", "GRAIN", "RANCH", "CARE", "LAND",
  "AUTO", "HVAC", "SAND",
  "SASKATCHEWAN", "CANADA",
  "PARTNERSHIP", "GROUP", "TRUST",
  "ELECTRIC",
  "FARMING",
  "CORP", "HOLDINGS", "INC", "LTD", "LLP", "LP", "GP", "AG",
];

function insertSpacesInName(s: string): string {
  // Insert space between digits and letters
  s = s.replace(/(\d)([A-Z])/gi, "$1 $2");
  s = s.replace(/([A-Z])(\d)/g, "$1 $2");

  // Insert spaces around known words (iterative)
  for (const word of KNOWN_WORDS) {
    // Insert space before the word if preceded by a letter
    const reBefore = new RegExp(`([A-Za-z])(${word})`, "gi");
    s = s.replace(reBefore, "$1 $2");
    // Insert space after the word if followed by a letter (but not a period)
    const reAfter = new RegExp(`(${word})([A-Za-z])`, "gi");
    s = s.replace(reAfter, "$1 $2");
  }

  return s.replace(/\s+/g, " ").trim();
}

function fixEntityName(raw: string): string {
  if (!raw) return raw;
  let s = raw.trim();
  const hasDot = s.endsWith(".");
  if (hasDot) s = s.slice(0, -1);

  s = insertSpacesInName(s);
  if (hasDot) s += ".";
  return titleCase(s);
}

function titleCase(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => {
      // Keep all-digit tokens as-is
      if (/^\d+$/.test(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

// Common first names for splitting concatenated names
const COMMON_FIRST_NAMES = new Set([
  "AARON","ADAM","ADRIAN","AL","ALAN","ALBERT","ALEX","ALEXANDER","ALLAN","ALLEN",
  "AMANDA","AMBER","ANDREA","ANDREW","ANDY","ANGELA","ANN","ANNA","ANNE","ANTHONY",
  "ARLEN","ARNOLD","ARTHUR","ASHLEY","AUSTIN","BARRY","BEN","BENJAMIN","BERNIE",
  "BETH","BILL","BOB","BRAD","BRADLEY","BRANDON","BRENT","BRETT","BRIAN","BRUCE",
  "BRYAN","BRYCE","BYRON","CALVIN","CAMERON","CARL","CAROL","CAROLYN","CASEY",
  "CHAD","CHARLES","CHARLIE","CHERYL","CHRIS","CHRISTIAN","CHRISTINE","CHRISTOPHER",
  "CHUCK","CINDY","CLARENCE","CLARK","CLAY","CLAYTON","CLIFF","CLIFFORD","CLINT",
  "CODY","COLE","COLIN","COLLEEN","COLLIN","CONNOR","COREY","CORY","CRAIG","CURTIS",
  "DALE","DAN","DANIEL","DANNY","DARCY","DARIN","DARRELL","DARREN","DARRYL","DARYL",
  "DAVE","DAVID","DAWN","DEAN","DEBBIE","DEBORAH","DEBRA","DENNIS","DEREK","DERRICK",
  "DEVIN","DEVON","DIANE","DON","DONALD","DONNA","DOUG","DOUGLAS","DREW","DUANE",
  "DUSTIN","DWAYNE","DWIGHT","DYLAN","EARL","ED","EDDIE","EDWARD","EILEEN","ELAINE",
  "ELIZABETH","ELLEN","EMILY","ERIC","ERIK","ERNEST","ERNIE","EVAN","FLOYD","FRANCIS",
  "FRANCOIS","FRANK","FRED","FREDERICK","GARNET","GARRY","GARY","GENE","GEOFF",
  "GEOFFREY","GEORGE","GERALD","GERRY","GLEN","GLENN","GORDON","GRACE","GRAHAM",
  "GRANT","GREG","GREGORY","GUY","HAROLD","HARRY","HARVEY","HEATHER","HELEN","HENRY",
  "HERB","HERBERT","HOWARD","IAN","IVAN","JACK","JACOB","JAKE","JAMES","JAMIE",
  "JANE","JANET","JANICE","JARED","JASON","JAY","JEAN","JEFF","JEFFREY","JENNIFER",
  "JENNY","JEREMY","JERRY","JESSE","JESSICA","JIM","JIMMY","JOE","JOEL","JOHN",
  "JOHNNY","JON","JONATHAN","JORDAN","JOSEPH","JOSH","JOSHUA","JOY","JOYCE","JUDY",
  "JULIE","JUSTIN","KAREN","KARL","KATE","KATHERINE","KATHY","KEITH","KELLY","KEN",
  "KENNETH","KERRY","KEVIN","KIM","KIRK","KRIS","KRISTEN","KRISTIN","KURT","KYLE",
  "LANCE","LARRY","LAURA","LAURIE","LAWRENCE","LEE","LEIGH","LEON","LEONARD","LEROY",
  "LESLIE","LEVI","LINDA","LINDSAY","LISA","LLOYD","LOIS","LOREN","LORI","LORNE",
  "LORRAINE","LOUIS","LUKE","LYNN","MARC","MARCEL","MARCUS","MARGARET","MARIA",
  "MARIE","MARILYN","MARK","MARLENE","MARLIN","MARSHALL","MARTIN","MARVIN","MARY",
  "MATT","MATTHEW","MAUREEN","MAX","MELANIE","MELISSA","MERLE","MERV","MERVIN",
  "MICHAEL","MICHELLE","MIKE","MILES","MITCHELL","MONICA","MONTE","MORGAN","MORRIS",
  "MURRAY","NANCY","NATHAN","NATHANIEL","NEAL","NEIL","NELSON","NICK","NICOLE",
  "NORM","NORMAN","PAM","PAMELA","PAT","PATRICIA","PATRICK","PAUL","PENNY","PETE",
  "PETER","PHIL","PHILIP","PHILLIP","RACHEL","RALPH","RANDY","RAY","RAYMOND","REG",
  "REID","RENEE","RHONDA","RICH","RICHARD","RICK","RICKY","ROB","ROBERT","ROBIN",
  "ROD","RODNEY","ROGER","RON","RONALD","ROSS","ROY","RUSS","RUSSELL","RUTH","RYAN",
  "SAM","SAMUEL","SANDRA","SANDY","SARAH","SCOTT","SEAN","SETH","SHANE","SHANNON",
  "SHARON","SHAUN","SHAWN","SHELLEY","SHELLY","SHIRLEY","SIMON","SPENCER","STACEY",
  "STAN","STANLEY","STEPHEN","STEVE","STEVEN","STEWART","STUART","SUE","SUSAN",
  "TAMMY","TED","TERESA","TERRANCE","TERRY","THERESA","THOMAS","TIM","TIMOTHY",
  "TODD","TOM","TOMMY","TONY","TRACY","TRAVIS","TREVOR","TROY","TYLER","VAUGHN",
  "VERN","VERNON","VICTOR","VINCE","VINCENT","WADE","WALLACE","WALTER","WARREN",
  "WAYNE","WENDY","WES","WESLEY","WILLIAM","WILLIE","WYATT","ZACHARY",
]);

/**
 * Try to split a concatenated ALL-CAPS name like "BRETTSCHMAUTZ" into "Brett Schmautz".
 */
function splitPersonName(raw: string, knownFragments: string[] = []): string {
  let name = raw.trim();

  // If already has space(s), just title case
  if (/\s/.test(name)) return titleCase(name);

  const nameUpper = name.toUpperCase();

  // 1. Try known fragments (from shareholders, AttentionTo, etc.)
  for (const frag of knownFragments) {
    const fragUpper = frag.toUpperCase();
    if (fragUpper.length < 2) continue;

    if (nameUpper.endsWith(fragUpper) && nameUpper.length > fragUpper.length) {
      const first = nameUpper.slice(0, nameUpper.length - fragUpper.length);
      if (first.length >= 2) return titleCase(first + " " + fragUpper);
    }
    if (nameUpper.startsWith(fragUpper) && nameUpper.length > fragUpper.length) {
      const rest = nameUpper.slice(fragUpper.length);
      if (rest.length >= 2) return titleCase(fragUpper + " " + rest);
    }
  }

  // 2. Try common first names
  for (const firstName of COMMON_FIRST_NAMES) {
    if (nameUpper.startsWith(firstName) && nameUpper.length > firstName.length + 1) {
      const lastName = nameUpper.slice(firstName.length);
      if (lastName.length >= 2) return titleCase(firstName + " " + lastName);
    }
  }

  // Fallback: just title case as-is
  return titleCase(name);
}

/**
 * Strip repeated page headers from multi-page PDFs.
 */
function stripPageHeaders(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let i = 0;
  let firstHeader = true;

  while (i < lines.length) {
    if (
      lines[i].trim() === "Saskatchewan" &&
      i + 1 < lines.length &&
      lines[i + 1].trim() === "CorporateRegistry"
    ) {
      if (firstHeader) {
        firstHeader = false;
        while (i < lines.length) {
          result.push(lines[i]);
          if (/ReportDate:/.test(lines[i])) { i++; break; }
          i++;
        }
      } else {
        while (i < lines.length) {
          if (/ReportDate:/.test(lines[i])) { i++; break; }
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

// ── Main parser ──

export async function parseCorporateRegistry(
  buffer: Buffer
): Promise<CorporateRegistryResult> {
  const data = await pdfParse(buffer);
  const rawText: string = data.text;
  const fullText = stripPageHeaders(rawText);

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

  // Entity number
  let m = fullText.match(/EntityNumber:(\d+)/);
  if (m) result.entityNumber = m[1];

  // Entity name
  m = fullText.match(/EntityName:(.+?)ReportDate:/);
  if (m) result.entityName = fixEntityName(m[1].trim());

  // Report date
  m = fullText.match(/ReportDate:(\d{2}-[A-Za-z]{3}-\d{4})/);
  if (m) result.reportDate = m[1];

  // Entity details
  m = fullText.match(/EntityType(.+?)(?:\n|EntitySubtype)/);
  if (m) result.entityType = m[1].replace(/([a-z])([A-Z])/g, "$1 $2").trim();

  m = fullText.match(/EntitySubtype(.+?)(?:\n|EntityStatus)/);
  if (m) result.entitySubtype = m[1].replace(/([a-z])([A-Z])/g, "$1 $2").trim();

  m = fullText.match(/EntityStatus(\w+)/);
  if (m) result.status = m[1];

  m = fullText.match(/IncorporationDate(\S+)/);
  if (m) result.incorporationDate = m[1];

  m = fullText.match(/AnnualReturnDue\s*Date\s*(\S+)/);
  if (m) result.annualReturnDue = m[1];

  m = fullText.match(/Nature\s*of\s*Business\s*(.+?)(?:\n|MRAS)/);
  if (m) result.natureOfBusiness = m[1].replace(/([a-z])([A-Z])/g, "$1 $2").trim();

  // ── Registered Office Address ──
  const regOfficeSection = fullText.match(
    /RegisteredOffice\/MailingAddress\n([\s\S]*?)(?=Directors\/Officers|$)/
  );
  if (regOfficeSection) {
    const sec = regOfficeSection[1];
    const physMatch = sec.match(/PhysicalAddress([\s\S]+?)(?=\nAttentionTo|\nMailingAddress|$)/);
    if (physMatch) {
      result.registeredAddress = physMatch[1].replace(/\n/g, " ").replace(/\s+/g, " ").trim();
    }
    const mailMatch = sec.match(/MailingAddress([\s\S]+?)(?=\nAttentionTo|\nDirectors|$)/);
    if (mailMatch) {
      result.mailingAddress = mailMatch[1].replace(/\n/g, " ").replace(/\s+/g, " ").trim();
    }
  }

  // ── Parse Shareholders FIRST (to get known names for director cross-reference) ──
  const knownNameFragments: string[] = [];

  const shSection = fullText.match(
    /ShareholderNameMailingAddressShareClassSharesHeld\n([\s\S]*?)(?=\nArticles|$)/
  );
  if (shSection) {
    const section = shSection[1].trim();
    const lines = section.split("\n");

    // Collect lines into entries. Each entry ends with share class + shares pattern.
    // Share class is a single letter A-O, NOT part of a postal code.
    const entries: string[][] = [];
    let currentLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      currentLines.push(trimmed);

      // Match share class + shares at end: "B50", "A1,000", "G500,000"
      // Ensure it's NOT a postal code (X9X 9X9 pattern)
      const shareEndMatch = trimmed.match(/\b([A-O])([\d][\d,]*)\s*$/);
      if (shareEndMatch && shareEndMatch.index !== undefined) {
        // Check if the char before the letter is a digit (postal code like S7K2L6)
        const charBefore = trimmed[shareEndMatch.index - 1];
        if (charBefore && /\d/.test(charBefore)) {
          // Likely postal code, skip
          continue;
        }
        entries.push([...currentLines]);
        currentLines = [];
      }
    }
    if (currentLines.length > 0) entries.push([...currentLines]);

    for (const entryLines of entries) {
      const combined = entryLines.join(" ").replace(/\s+/g, " ").trim();

      // Extract share class + shares from end
      const shareMatch = combined.match(/\b([A-O])([\d][\d,]*)\s*$/);
      if (!shareMatch || shareMatch.index === undefined) continue;

      const shareClass = shareMatch[1];
      const sharesHeld = parseInt(shareMatch[2].replace(/,/g, ""));
      const beforeShares = combined.slice(0, shareMatch.index).trim();

      // Separate name from address: address starts with street number
      let name = beforeShares;
      let address: string | null = null;

      const addrStart = beforeShares.match(/^(.*?)(\d[\d-]*\s+[A-Z].*)/);
      if (addrStart && addrStart[2].length > 10) {
        name = addrStart[1].trim().replace(/,\s*$/, "");
        address = addrStart[2].trim();
      }

      name = name.replace(/,\s*$/, "").trim();
      if (!name) continue;

      // Apply word splitting to shareholder names too
      const splitName = insertSpacesInName(name);

      // Extract name fragments for cross-referencing with directors
      const nameWords = splitName.toUpperCase().replace(/[()&,.]/g, " ").split(/\s+/).filter(w => w.length >= 2 && !/^\d+$/.test(w));
      const skipWords = new Set(["FAMILY", "TRUST", "BY", "ITS", "TRUSTEE", "TRUSTEES", "LTD", "INC", "CORP", "HOLDINGS", "PROPERTIES", "VENTURES", "INVESTMENTS", "THE", "AND", "OF"]);
      for (const w of nameWords) {
        if (!skipWords.has(w)) knownNameFragments.push(w);
      }

      result.shareholders.push({
        name: titleCase(splitName),
        address: address || null,
        shareClass,
        sharesHeld,
      });
    }
  }

  // Also extract name fragments from AttentionTo lines
  const attentionMatches = fullText.matchAll(/AttentionTo([A-Z][A-Z\s.]+)/g);
  for (const am of attentionMatches) {
    const words = am[1].replace(/[()&,.]/g, " ").split(/\s+/).filter(w => w.length >= 2 && !/^\d+$/.test(w));
    for (const w of words) knownNameFragments.push(w.toUpperCase());
  }

  // Deduplicate fragments, sort by length descending (prefer longer matches)
  const uniqueFragments = [...new Set(knownNameFragments)].sort((a, b) => b.length - a.length);

  // ── Directors/Officers ──
  const dirSection = fullText.match(
    /Directors\/Officers\n([\s\S]*?)(?=\nShareholders|\nArticles|$)/
  );
  if (dirSection) {
    const section = dirSection[1];
    const lines = section.split("\n");

    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();
      const personMatch = line.match(/^(.+?)\s*\((Director|Officer)\)\s*$/);
      if (personMatch) {
        const rawName = personMatch[1].trim();
        const role = personMatch[2];
        let physAddr: string | null = null;
        let officeHeld: string | null = null;
        let effectiveDate: string | null = null;

        i++;
        while (i < lines.length) {
          const cl = lines[i].trim();
          if (/^.+\((Director|Officer)\)\s*$/.test(cl)) break;
          if (/^Shareholders$/.test(cl) || /^Articles$/.test(cl)) break;

          if (cl.startsWith("PhysicalAddress:")) {
            const parts = [cl.replace("PhysicalAddress:", "").trim()];
            i++;
            while (i < lines.length) {
              const nl = lines[i].trim();
              if (/^(ResidentCanadian:|MailingAddress:|EffectiveDate:|OfficeHeld:)/.test(nl) ||
                  /\((Director|Officer)\)/.test(nl)) break;
              parts.push(nl);
              i++;
            }
            physAddr = parts.join(" ").replace(/\s+/g, " ").trim();
            continue;
          }

          if (cl.startsWith("MailingAddress:")) {
            i++;
            while (i < lines.length) {
              const nl = lines[i].trim();
              if (/^(ResidentCanadian:|EffectiveDate:|OfficeHeld:|PhysicalAddress:)/.test(nl) ||
                  /\((Director|Officer)\)/.test(nl)) break;
              i++;
            }
            continue;
          }

          if (cl.startsWith("ResidentCanadian:")) { i++; continue; }
          if (cl.startsWith("OfficeHeld:")) {
            officeHeld = cl.replace("OfficeHeld:", "").trim();
            i++; continue;
          }
          if (cl.startsWith("EffectiveDate:")) {
            effectiveDate = cl.replace("EffectiveDate:", "").trim();
            i++; continue;
          }
          i++;
        }

        const name = splitPersonName(rawName, uniqueFragments);

        const person: PersonEntry = {
          name,
          role,
          effectiveDate,
          address: physAddr,
          title: officeHeld ? titleCase(officeHeld) : null,
        };
        if (role === "Director") result.directors.push(person);
        else result.officers.push(person);
        continue;
      }
      i++;
    }
  }

  // Post-process: fix shareholder person names using the same name splitting
  for (const sh of result.shareholders) {
    const isCompany = /\b(Ltd|Inc|Corp|Holdings|Trust|Partnership|Lp|Llp)\b/i.test(sh.name);
    if (!isCompany) {
      sh.name = splitPersonName(sh.name.toUpperCase(), uniqueFragments);
    }
  }

  return result;
}
