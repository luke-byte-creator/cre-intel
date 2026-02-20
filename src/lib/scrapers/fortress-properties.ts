/**
 * Fortress Properties Scraper
 * Scrapes listings from fortressproperties.ca/properties/?available
 * Multi-city — filters to Saskatoon/SK only
 */
import * as cheerio from "cheerio";
import { execSync } from "child_process";

export interface FortressListing {
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

export interface FortressScrapingResult {
  listings: FortressListing[];
  totalFound: number;
  filtered: number;
  errors: string[];
}

const ALLOWED_TYPES = ["office", "industrial", "multi-family"];
const SK_CITIES = ["saskatoon", "regina", "martensville", "warman"];

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

function isSaskatchewan(location: string): boolean {
  const lower = location.toLowerCase();
  if (lower.includes(", sk")) return true;
  for (const city of SK_CITIES) {
    if (lower.includes(city)) return true;
  }
  return false;
}

function classifyType(typeStr: string): { propertyType: string | null; propertyTypeFlag: string | null } {
  const lower = typeStr.toLowerCase();
  // Fortress uses combined types like "Retail/Office/Warehouse"
  const hasRetail = lower.includes("retail");
  const hasOffice = lower.includes("office");
  const hasWarehouse = lower.includes("warehouse") || lower.includes("industrial");

  if (hasOffice && hasWarehouse) return { propertyType: "industrial", propertyTypeFlag: "mixed_industrial_office" };
  if (hasRetail && hasOffice) return { propertyType: "office", propertyTypeFlag: "mixed_retail_office" };
  if (hasRetail && hasWarehouse) return { propertyType: "industrial", propertyTypeFlag: "mixed_retail_industrial" };
  if (hasWarehouse) return { propertyType: "industrial", propertyTypeFlag: null };
  if (hasOffice) return { propertyType: "office", propertyTypeFlag: null };
  if (hasRetail && !hasOffice && !hasWarehouse) return { propertyType: null, propertyTypeFlag: null };
  // "Retail/Office/Warehouse" — classify as industrial with mixed flag
  if (hasRetail && hasOffice && hasWarehouse) return { propertyType: "industrial", propertyTypeFlag: "mixed_retail_office" };
  return { propertyType: null, propertyTypeFlag: null };
}

function parseSFRange(sfText: string): number | null {
  if (!sfText) return null;
  const matches = sfText.match(/[0-9,]+/g);
  if (!matches) return null;
  const nums = matches.map(n => parseFloat(n.replace(/,/g, "")));
  return Math.max(...nums);
}

export async function scrapeFortress(): Promise<FortressScrapingResult> {
  const errors: string[] = [];
  const listings: FortressListing[] = [];
  let totalFound = 0;
  let filtered = 0;

  try {
    // Fetch all pages (paginated)
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const url = page === 1
        ? "https://fortressproperties.ca/properties/?available"
        : `https://fortressproperties.ca/properties/page/${page}/?available`;

      console.log(`Fetching Fortress page ${page}...`);
      const html = fetchPage(url);
      if (!html || html.length < 1000) {
        if (page === 1) errors.push("Fetch failed");
        hasMore = false;
        break;
      }

      const $ = cheerio.load(html);
      const cards = $(".property-archive-card");
      
      if (cards.length === 0) {
        hasMore = false;
        break;
      }

      cards.each((_, card) => {
        try {
          totalFound++;
          const $card = $(card);

          // Property type from header
          const typeText = $card.find(".card-header-title").text().trim();

          // Location
          const location = $card.find(".property-location").text().trim();

          // Filter to Saskatchewan only
          if (!isSaskatchewan(location)) { filtered++; return; }

          // Classify type
          const { propertyType, propertyTypeFlag } = classifyType(typeText);
          if (!propertyType || !ALLOWED_TYPES.includes(propertyType)) { filtered++; return; }

          // Property name
          const name = $card.find(".subtitle").text().trim();

          // Status
          const status = $card.find(".property-status").text().trim().toLowerCase();
          // "is-invisible" class means no special status — that's fine
          // Only skip if explicitly "leased" or "sold"
          if (status === "leased" || status === "sold") { filtered++; return; }

          // SF range
          const sfText = $card.find(".sf").text().trim();
          const squareFeet = parseSFRange(sfText);

          // Description
          const description = $card.find(".short-description").text().trim().substring(0, 500);

          // Detail URL
          const detailUrl = $card.find(".card-footer a").attr("href") || "";

          // Address
          let address = location;
          if (!address.toLowerCase().includes("saskatoon") && !address.toLowerCase().includes(", sk")) {
            address += ", SK";
          }

          listings.push({
            address,
            suite: null,
            propertyType,
            propertyTypeFlag,
            listingType: "lease",
            askingPrice: null,
            askingRent: null,
            rentBasis: null,
            squareFeet,
            occupancyCost: null,
            description: `${name}. ${description}`,
            sourceUrl: detailUrl,
            broker: null,
          });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          errors.push(`Parse error: ${msg}`);
        }
      });

      // Check for next page
      const nextLink = $("a.next, .pagination .next, a[rel='next']");
      if (nextLink.length > 0) {
        page++;
        sleep(1500);
      } else {
        hasMore = false;
      }
    }

    console.log(`Fortress: ${listings.length} SK listings from ${totalFound} total, ${filtered} filtered out`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`Fetch error: ${msg}`);
    console.error("Fortress scraper error:", e);
  }

  return { listings, totalFound, filtered, errors };
}
