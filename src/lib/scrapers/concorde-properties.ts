/**
 * Concorde Properties (CGC) Scraper
 * Scrapes listings from cgcproperties.com/leasing/
 * FacetWP-based site with structured unit tables per building
 * All Saskatoon. Rich data.
 */
import * as cheerio from "cheerio";
import { execSync } from "child_process";

export interface ConcordeListing {
  address: string;
  suite: string | null;
  propertyType: string;
  propertyTypeFlag: string | null;
  listingType: string;
  askingPrice: number | null;
  askingRent: number | null;
  rentBasis: string | null;
  squareFeet: number | null;
  occupancyCost: number | null;
  description: string;
  sourceUrl: string;
  broker: string | null;
}

export interface ConCordeScrapingResult {
  listings: ConcordeListing[];
  totalFound: number;
  filtered: number;
  errors: string[];
}

const ALLOWED_TYPES = ["office", "industrial", "multi-family"];

function fetchPage(url: string): string | null {
  try {
    return execSync(
      `curl -s -L --max-time 30 -H "User-Agent: Mozilla/5.0 (compatible; NovaResearch/1.0)" "${url}"`,
      { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
    );
  } catch { return null; }
}

function sleep(ms: number) {
  const jitter = Math.floor(Math.random() * 500);
  execSync(`sleep ${(ms + jitter) / 1000}`);
}

function classifyType(typeStr: string): { propertyType: string | null; propertyTypeFlag: string | null } {
  const lower = typeStr.toLowerCase();
  if ((lower.includes("retail") && lower.includes("office")))
    return { propertyType: "office", propertyTypeFlag: "mixed_retail_office" };
  if ((lower.includes("industrial") && lower.includes("office")))
    return { propertyType: "office", propertyTypeFlag: "mixed_industrial_office" };
  if (lower.includes("industrial") || lower.includes("warehouse")) return { propertyType: "industrial", propertyTypeFlag: null };
  if (lower.includes("office") || lower.includes("commercial")) return { propertyType: "office", propertyTypeFlag: lower.includes("commercial") ? "inferred_type" : null };
  if (lower.includes("multi-family") || lower.includes("apartment")) return { propertyType: "multi-family", propertyTypeFlag: null };
  if (lower.includes("retail") && !lower.includes("office") && !lower.includes("industrial")) return { propertyType: null, propertyTypeFlag: null };
  return { propertyType: null, propertyTypeFlag: null };
}

export async function scrapeConcorde(): Promise<ConCordeScrapingResult> {
  const url = "https://cgcproperties.com/leasing/";
  const errors: string[] = [];
  const listings: ConcordeListing[] = [];
  let totalFound = 0;
  let filtered = 0;

  try {
    console.log("Fetching Concorde Properties listings via curl...");
    const html = fetchPage(url);
    if (!html) {
      errors.push("Fetch failed");
      return { listings, totalFound, filtered, errors };
    }
    console.log(`Concorde: Got ${html.length} chars of HTML`);

    const $ = cheerio.load(html);

    // Each building is a .result div
    const buildings = $(".facetwp-template .result");
    console.log(`Concorde: Found ${buildings.length} building cards`);

    buildings.each((_, building) => {
      try {
        const $bldg = $(building);
        
        // Building name and address
        const buildingName = $bldg.find(".listings h3 a").text().trim();
        const addressEl = $bldg.find(".address").text().trim();
        const buildingUrl = $bldg.find(".listings h3 a").attr("href") || "";
        const description = $bldg.find(".overview").text().trim().substring(0, 500);

        // Parse address — remove icon text, clean up, normalize whitespace
        // Some addresses have stray leading numbers from HTML rendering artifacts (e.g. "1 418 50th Street E")
        let address = addressEl.replace(/\s+/g, " ").trim();
        // Remove leading standalone single digits that aren't part of the street number
        address = address.replace(/^\d\s+(?=\d{2,})/, "");
        if (!address || address.length < 5) address = buildingName;
        if (!address || address.length < 5 || !/\d/.test(address)) { filtered++; return; }
        if (address && !address.toLowerCase().includes("saskatoon")) {
          address += ", Saskatoon, SK";
        }

        // Parse unit table rows
        const rows = $bldg.find(".units table tbody tr");
        
        if (rows.length === 0) {
          // No unit table — just the building itself
          totalFound++;
          // Try to classify from building name or description
          const typeText = buildingName + " " + description;
          const { propertyType, propertyTypeFlag } = classifyType(typeText);
          if (!propertyType || !ALLOWED_TYPES.includes(propertyType)) { filtered++; return; }

          listings.push({
            address,
            suite: null,
            propertyType,
            propertyTypeFlag,
            listingType: "lease",
            askingPrice: null,
            askingRent: null,
            rentBasis: null,
            squareFeet: null,
            occupancyCost: null,
            description,
            sourceUrl: buildingUrl,
            broker: null,
          });
          return;
        }

        rows.each((_, row) => {
          try {
            totalFound++;
            const $row = $(row);
            const cells = $row.find("td");

            // Unit number — get just the link text, not badges/extra elements
            const unitLink = cells.eq(0).find("a").first();
            const unitText = (unitLink.text() || cells.eq(0).text()).replace(/\s+/g, " ").trim();
            const unitUrl = unitLink.attr("href") || buildingUrl;
            
            // Skip garbage unit values
            if (unitText.toLowerCase().includes("click") || unitText.length > 20) {
              // Not a real unit identifier
            }

            // Check for "Leased" badge
            const rowText = $row.text().toLowerCase();
            if (rowText.includes("leased") || rowText.includes("sold")) { filtered++; return; }

            // Area (sq ft)
            const areaText = cells.eq(1).text().trim();
            const sfMatch = areaText.match(/([0-9,]+)/);
            const squareFeet = sfMatch ? parseFloat(sfMatch[1].replace(/,/g, "")) : null;

            // Property Type
            const typeText = cells.eq(2).text().trim();
            const { propertyType, propertyTypeFlag } = classifyType(typeText);
            if (!propertyType || !ALLOWED_TYPES.includes(propertyType)) { filtered++; return; }

            // Lease Rate
            const rateText = cells.eq(3).text().trim();
            let askingRent: number | null = null;
            let rentBasis: string | null = null;
            const rateMatch = rateText.match(/\$?([0-9,.]+)/);
            if (rateMatch) {
              askingRent = parseFloat(rateMatch[1].replace(/,/g, ""));
              rentBasis = rateText.toLowerCase().includes("gross") ? "psf_gross" : "psf_net";
            }

            // Clean suite value
            const cleanSuite = unitText && !unitText.toLowerCase().includes("click") && unitText.length <= 20 ? unitText : null;
            
            listings.push({
              address,
              suite: cleanSuite,
              propertyType,
              propertyTypeFlag,
              listingType: "lease",
              askingPrice: null,
              askingRent,
              rentBasis,
              squareFeet,
              occupancyCost: null,
              description,
              sourceUrl: unitUrl || buildingUrl,
              broker: null,
            });
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            errors.push(`Row parse error: ${msg}`);
          }
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`Building parse error: ${msg}`);
      }
    });

    console.log(`Concorde: ${listings.length} unit listings, ${filtered} filtered out`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`Fetch error: ${msg}`);
    console.error("Concorde scraper error:", e);
  }

  return { listings, totalFound, filtered, errors };
}
