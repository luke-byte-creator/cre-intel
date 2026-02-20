/**
 * Reddee Properties Scraper
 * Scrapes listings from reddeeproperties.com/leasing
 * Wix-based site — uses curl + cheerio on rendered HTML
 * Multi-city (Saskatoon, Corman Park, West Kelowna, Kamloops) — filter to SK only
 * Skip LEASED listings
 */
import * as cheerio from "cheerio";
import { execSync } from "child_process";

export interface ReddeeListing {
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

export interface ReddeeScrapingResult {
  listings: ReddeeListing[];
  totalFound: number;
  filtered: number;
  errors: string[];
}

const SK_LOCATIONS = ["saskatoon", "corman park", "regina", "saskatchewan", ", sk"];
const ALLOWED_TYPES = ["office", "industrial", "multi-family"];

function isSK(text: string): boolean {
  const lower = text.toLowerCase();
  return SK_LOCATIONS.some(loc => lower.includes(loc));
}

function classifyPropertyType(text: string): { propertyType: string | null; propertyTypeFlag: string | null } {
  const lower = text.toLowerCase();

  if ((lower.includes("office") && lower.includes("retail")) || lower.includes("office/retail")) {
    return { propertyType: "office", propertyTypeFlag: "mixed_retail_office" };
  }
  if (lower.includes("industrial") || lower.includes("warehouse") || lower.includes("dock door") || lower.includes("grade door") || lower.includes("ceiling height")) {
    return { propertyType: "industrial", propertyTypeFlag: null };
  }
  if (lower.includes("office")) return { propertyType: "office", propertyTypeFlag: null };
  if (lower.includes("multi-family") || lower.includes("apartment")) return { propertyType: "multi-family", propertyTypeFlag: null };
  // Retail-only — skip
  if (lower.includes("retail")) return { propertyType: null, propertyTypeFlag: null };

  return { propertyType: null, propertyTypeFlag: null };
}

function parseRent(text: string): { askingRent: number | null; rentBasis: string | null } {
  // "$15.00 / SF Net Lease Rate" or "$5 PSF" or "STARTING AT $5.00 / SF Net Lease"
  const psfMatch = text.match(/\$([0-9,.]+)\s*(?:\/\s*SF|PSF)/i);
  if (psfMatch) {
    const rent = parseFloat(psfMatch[1].replace(/,/g, ""));
    const basis = text.toLowerCase().includes("gross") ? "psf_gross" : "psf_net";
    return { askingRent: rent, rentBasis: basis };
  }
  return { askingRent: null, rentBasis: null };
}

function parseSF(text: string): number | null {
  // "20,000 SF" or "2,373 SF"
  const match = text.match(/([0-9,]+)\s*SF/i);
  if (match) return parseFloat(match[1].replace(/,/g, ""));
  return null;
}

function fetchPage(url: string): string | null {
  try {
    return execSync(
      `curl -s -L --max-time 30 -H "User-Agent: Mozilla/5.0 (compatible; NovaResearch/1.0)" "${url}"`,
      { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
    );
  } catch {
    return null;
  }
}

export async function scrapeReddee(): Promise<ReddeeScrapingResult> {
  const url = "https://www.reddeeproperties.com/leasing";
  const errors: string[] = [];
  const listings: ReddeeListing[] = [];
  let totalFound = 0;
  let filtered = 0;

  try {
    console.log("Fetching Reddee Properties listings via curl...");
    const html = fetchPage(url);
    if (!html) {
      errors.push("Fetch failed — Wix site may require browser rendering");
      return { listings, totalFound, filtered, errors };
    }
    console.log(`Reddee: Got ${html.length} chars of HTML`);

    const $ = cheerio.load(html);

    // Wix sites render content in various containers. Extract all text blocks.
    // The leasing page has listing blocks with addresses, prices, SF, and bullet features.
    // We'll parse the full text content and split by address patterns.
    
    // Get all text content from the page
    const bodyText = $("body").text();
    
    // Split into listing blocks by SK/BC address patterns
    // Addresses follow pattern: "NNN Street Name, City, Province"
    const addressPattern = /(\d+[\w\-,\s]*(?:Street|Ave|Avenue|Circle|Road|Rd|Drive|Dr|Blvd|Boulevard|Way|Crescent|Cres|Place|Pl|Lane|Ln)[\w\s]*,\s*(?:Saskatoon|Corman Park|West Kelowna|Kamloops|Regina)\s*,\s*(?:SK|BC))/gi;
    
    const addresses: { address: string; index: number }[] = [];
    let match;
    while ((match = addressPattern.exec(bodyText)) !== null) {
      addresses.push({ address: match[1].trim(), index: match.index });
    }

    totalFound = addresses.length;
    console.log(`Reddee: Found ${totalFound} address blocks`);

    for (let i = 0; i < addresses.length; i++) {
      const addr = addresses[i];
      const nextIndex = i + 1 < addresses.length ? addresses[i + 1].index : bodyText.length;
      const block = bodyText.substring(addr.index, nextIndex);

      // Filter to SK only
      if (!isSK(addr.address)) {
        filtered++;
        continue;
      }

      // Skip LEASED
      if (/\bLEASED\b/i.test(block)) {
        filtered++;
        continue;
      }

      // Classify property type from the block text (SF description, features, etc.)
      const { propertyType, propertyTypeFlag } = classifyPropertyType(block);
      if (!propertyType || !ALLOWED_TYPES.includes(propertyType)) {
        filtered++;
        continue;
      }

      const { askingRent, rentBasis } = parseRent(block);
      const squareFeet = parseSF(block);

      // Extract description (first ~300 chars of the block after the address)
      const descStart = block.indexOf(addr.address) + addr.address.length;
      const description = block.substring(descStart).replace(/\s+/g, " ").trim().substring(0, 500);

      listings.push({
        address: addr.address.replace(/\s+/g, " ").trim(),
        suite: null,
        propertyType,
        propertyTypeFlag,
        listingType: "lease",
        askingPrice: null,
        askingRent,
        rentBasis,
        squareFeet,
        occupancyCost: null,
        description,
        sourceUrl: url,
        broker: null,
      });
    }

    console.log(`Reddee: ${listings.length} listings matched filters, ${filtered} filtered out`);
  } catch (e: any) {
    errors.push(`Fetch error: ${e.message}`);
    console.error("Reddee scraper error:", e);
  }

  return { listings, totalFound, filtered, errors };
}
