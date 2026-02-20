/**
 * ICR Commercial Scraper
 * Scrapes server-rendered listings from icrcommercial.com
 * Filters: office, industrial, multi-family | Saskatoon only
 */
import * as cheerio from "cheerio";
import { execSync } from "child_process";

export interface ICRListing {
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

export interface ICRScrapingResult {
  listings: ICRListing[];
  totalFound: number;
  filtered: number;
  errors: string[];
}

const ALLOWED_TYPES = ["office", "industrial", "multi-family"];

function classifyPropertyType(typeStr: string): { propertyType: string | null; propertyTypeFlag: string | null } {
  const lower = typeStr.toLowerCase();
  
  // Check for mixed types first
  if ((lower.includes("retail") && lower.includes("office")) || lower.includes("retail/office") || lower.includes("office/retail")) {
    return { propertyType: "office", propertyTypeFlag: "mixed_retail_office" };
  }
  if ((lower.includes("industrial") && lower.includes("office")) || lower.includes("industrial/office") || lower.includes("office/industrial")) {
    return { propertyType: "office", propertyTypeFlag: "mixed_industrial_office" };
  }
  
  if (lower.includes("industrial") || lower.includes("warehouse")) return { propertyType: "industrial", propertyTypeFlag: null };
  if (lower.includes("office")) return { propertyType: "office", propertyTypeFlag: null };
  if (lower.includes("multi-family") || lower.includes("multi family") || lower.includes("apartment")) return { propertyType: "multi-family", propertyTypeFlag: null };
  if (lower.includes("retail") && !lower.includes("office") && !lower.includes("industrial")) return { propertyType: null, propertyTypeFlag: null }; // Pure retail — skip
  
  // Branded listings with no clear type — try to infer from keywords
  if (lower.includes("commercial") || lower.includes("workspace") || lower.includes("collaborative")) return { propertyType: "office", propertyTypeFlag: "inferred_type" };
  
  return { propertyType: null, propertyTypeFlag: null };
}

function checkDescriptionForRetailSignals(description: string, propertyType: string, existingFlag: string | null): string | null {
  if (existingFlag) return existingFlag;
  if (propertyType !== "office") return null;
  const lower = description.toLowerCase();
  const retailSignals = ["retail hub", "mall", "frontage", "storefront", "retail"];
  for (const signal of retailSignals) {
    if (lower.includes(signal)) return "mixed_retail_office";
  }
  return null;
}

function classifyListingType(typeStr: string): string {
  const lower = typeStr.toLowerCase();
  if (lower.includes("sublease") || lower.includes("sub-lease")) return "sublease";
  if (lower.includes("sale") || lower.includes("investment")) return "sale";
  return "lease";
}

function parsePrice(priceStr: string, listingType?: string): { askingPrice: number | null; askingRent: number | null; rentBasis: string | null; isCompleted: boolean } {
  if (!priceStr) return { askingPrice: null, askingRent: null, rentBasis: null, isCompleted: false };
  const clean = priceStr.trim();
  const lower = clean.toLowerCase();

  // Skip completed deals
  if (lower === "leased" || lower === "sold") {
    return { askingPrice: null, askingRent: null, rentBasis: null, isCompleted: true };
  }

  // Sale price: "$299,950" or "$7,500,000"
  const saleMatch = clean.match(/^\$([0-9,]+)$/);
  if (saleMatch) {
    return { askingPrice: parseFloat(saleMatch[1].replace(/,/g, "")), askingRent: null, rentBasis: null, isCompleted: false };
  }

  // PSF rent: "$16 PSF Net" or "$24.95 PSF Gross"
  const psfMatch = clean.match(/\$([0-9,.]+)\s*PSF/i);
  if (psfMatch) {
    const rent = parseFloat(psfMatch[1].replace(/,/g, ""));
    let basis: string = "psf_net";
    if (lower.includes("gross")) basis = "psf_gross";
    return { askingPrice: null, askingRent: rent, rentBasis: basis, isCompleted: false };
  }

  // Monthly rent: "$2,950 per month Gross"
  const monthMatch = clean.match(/\$([0-9,.]+)\s*per\s*month/i);
  if (monthMatch) {
    const rent = parseFloat(monthMatch[1].replace(/,/g, ""));
    let basis: string = "monthly_gross";
    if (lower.includes("net")) basis = "monthly_net";
    return { askingPrice: null, askingRent: rent, rentBasis: basis, isCompleted: false };
  }

  // Generic dollar amount — use listing type to disambiguate
  const genericMatch = clean.match(/\$([0-9,.]+)/);
  if (genericMatch) {
    const val = parseFloat(genericMatch[1].replace(/,/g, ""));
    // If listing type is known, use it
    if (listingType === "sale" || listingType === "investment") {
      return { askingPrice: val, askingRent: null, rentBasis: null, isCompleted: false };
    }
    if (listingType === "lease" || listingType === "sublease") {
      return { askingPrice: null, askingRent: val, rentBasis: null, isCompleted: false };
    }
    // Fallback heuristic
    if (val > 100000) return { askingPrice: val, askingRent: null, rentBasis: null, isCompleted: false };
    return { askingPrice: null, askingRent: val, rentBasis: null, isCompleted: false };
  }

  return { askingPrice: null, askingRent: null, rentBasis: null, isCompleted: false };
}

function parseSF(sfStr: string): number | null {
  if (!sfStr) return null;
  const matches = sfStr.match(/[0-9,]+(\.[0-9]+)?/g);
  if (!matches) return null;
  const parsed = matches.map(n => parseFloat(n.replace(/,/g, "")));
  return Math.max(...parsed);
}

/** Parse SF for sub-listings — take the first/only number (no range logic) */
function parseSFExact(sfStr: string): number | null {
  if (!sfStr) return null;
  const match = sfStr.match(/([0-9,]+(?:\.[0-9]+)?)/);
  if (!match) return null;
  return parseFloat(match[1].replace(/,/g, ""));
}

/** Parse occupancy costs from description text (e.g. "OCCUPANCY COSTS$13.90 PSF") */
function parseOccupancyCost(description: string): number | null {
  if (!description) return null;
  
  // Try multiple patterns in priority order
  const patterns = [
    // "OCCUPANCY COSTS$13.90 PSF" or "OCCUPANCY COSTS $7.10 PSF (2026 estimate)"
    /OCCUPANCY\s*COSTS?\s*\$\s*([\d,.]+)/i,
    // "OCCUPANCY COST: $13.90 PSF"
    /OCCUPANCY\s*COSTS?\s*:\s*\$\s*([\d,.]+)/i,
    // "ADDITIONAL RENT$8.50 PSF" or "ADDITIONAL RENT: $8.50"
    /ADDITIONAL\s*RENT\s*:?\s*\$\s*([\d,.]+)/i,
    // "OCC COSTS $5.25"
    /OCC\.?\s*COSTS?\s*:?\s*\$\s*([\d,.]+)/i,
    // "ESTIMATED OCCUPANCY COSTS$6.50"
    /ESTIMATED\s*OCCUPANCY\s*COSTS?\s*:?\s*\$\s*([\d,.]+)/i,
  ];
  
  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match) {
      const val = parseFloat(match[1].replace(/,/g, ""));
      if (val > 0 && val < 100) return val; // Sanity check — occ costs should be reasonable
    }
  }
  return null;
}

function isSaskatoon(address: string): boolean {
  return /saskatoon/i.test(address);
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

interface SubListing {
  sourceUrl: string;
  suite: string;
  typeStr: string;
  priceStr: string;
  sfStr: string;
  listingTypeStr: string;
}

interface DetailPageResult {
  subListings: SubListing[];
  fullDescription: string; // og:description has full text including occ costs
  bodyText: string; // full page body text as fallback for parsing occ costs
}

function scrapeICRDetail(url: string): DetailPageResult {
  const html = fetchPage(url);
  if (!html) return { subListings: [], fullDescription: "", bodyText: "" };
  
  const $ = cheerio.load(html);
  const subListings: SubListing[] = [];
  
  // Extract full description from og:description meta tag
  const fullDescription = $('meta[property="og:description"]').attr("content") || "";
  
  // Also extract body text from description sections as fallback
  // (.wpl_prp_desc on detail pages, or broader container)
  const bodyText = $(".wpl_prp_show_detail_boxes").text() || $(".wpl-description-container").text() || $(".wpl_prp_desc").text() || "";
  
  const container = $(".wpl_listing_additional_container");
  if (container.length > 0) {
    container.find("ul li").each((_, li) => {
      const $li = $(li);
      const linkEl = $li.find(".wpl-listing-additional-property-title a");
      const sourceUrl = linkEl.attr("href") || "";
      const typeStr = linkEl.text().trim();
      const suite = $li.find(".wpl-listing-additional-property-type").text().trim();
      const priceStr = $li.find(".wpl-listing-additional-property-price").text().trim();
      const listingTypeStr = $li.find(".wpl-listing-additional-listing-type").text().trim();
      const sfStr = $li.find(".wpl-listing-additional-property-size").text().trim();
      
      if (sourceUrl) {
        subListings.push({ sourceUrl, suite, typeStr, priceStr, sfStr, listingTypeStr });
      }
    });
  }
  
  return { subListings, fullDescription, bodyText };
}

function sleep(ms: number) {
  // Add 0-500ms jitter to avoid looking like a bot
  const jitter = Math.floor(Math.random() * 500);
  execSync(`sleep ${(ms + jitter) / 1000}`);
}

export async function scrapeICR(): Promise<ICRScrapingResult> {
  const url = "https://www.icrcommercial.com/properties/?locations=saskatoon";
  const errors: string[] = [];
  const listings: ICRListing[] = [];
  let totalFound = 0;
  let filtered = 0;

  try {
    console.log("Fetching ICR Commercial listings via curl...");
    const html = fetchPage(url);
    if (!html) {
      errors.push("Fetch failed");
      return { listings, totalFound, filtered, errors };
    }
    console.log(`ICR: Got ${html.length} chars of HTML`);

    const $ = cheerio.load(html);
    const cards = $(".wpl_prp_bot");
    totalFound = cards.length;
    console.log(`ICR: Found ${totalFound} listing cards`);

    // Collect main page listings first
    interface MainListing {
      address: string;
      typeStr: string;
      propertyType: string;
      propertyTypeFlag: string | null;
      listingType: string;
      askingPrice: number | null;
      askingRent: number | null;
      rentBasis: string | null;
      squareFeet: number | null;
      description: string;
      sourceUrl: string;
    }
    const mainListings: MainListing[] = [];

    cards.each((_, card) => {
      try {
        const $card = $(card);
        const parent = $card.parent();
        const address = $card.find("h3.wpl_prp_title").text().trim();
        if (!address) return;
        if (!isSaskatoon(address)) { filtered++; return; }

        const typeStr = $card.find("h4.wpl_prp_listing_location").text().trim();
        const { propertyType, propertyTypeFlag } = classifyPropertyType(typeStr);
        if (!propertyType) { filtered++; return; }

        const listingType = classifyListingType(typeStr);

        // Check custom_status badge for Leased/Sold (separate from price)
        const customStatus = parent.find(".custom_status").text().trim().toLowerCase();
        if (customStatus === "leased" || customStatus === "sold") { filtered++; return; }

        const priceStr = parent.find(".price_box span").text().trim();
        const { askingPrice, askingRent, rentBasis, isCompleted } = parsePrice(priceStr, listingType);
        if (isCompleted) { filtered++; return; } // Skip "Leased" / "Sold" listings
        const sfStr = $card.find(".built_up_area").text().trim();
        const squareFeet = parseSF(sfStr);
        const description = $card.find(".wpl_prp_desc").text().trim();
        const sourceUrl = $card.find("a.view_detail").attr("href") || "";

        mainListings.push({
          address, typeStr, propertyType, propertyTypeFlag, listingType,
          askingPrice, askingRent, rentBasis, squareFeet,
          description: description.substring(0, 500), sourceUrl,
        });
      } catch (e: any) {
        errors.push(`Parse error: ${e.message}`);
      }
    });

    console.log(`ICR: ${mainListings.length} listings matched filters, fetching detail pages...`);

    // Map sourceUrl → suite from sub-listings (for backfilling main listings that appear as sub-listings elsewhere)
    const suiteMap = new Map<string, string>();

    // For each main listing, fetch detail page for sub-listings
    for (const main of mainListings) {
      if (!main.sourceUrl) {
        // No detail URL, just add the main listing
        const flag = checkDescriptionForRetailSignals(main.description, main.propertyType, main.propertyTypeFlag);
        const occCost = parseOccupancyCost(main.description);
        listings.push({
          address: main.address,
          suite: null,
          propertyType: main.propertyType,
          propertyTypeFlag: flag,
          listingType: main.listingType,
          askingPrice: main.askingPrice,
          askingRent: main.askingRent,
          rentBasis: main.rentBasis,
          squareFeet: main.squareFeet,
          occupancyCost: occCost,
          description: main.description,
          sourceUrl: main.sourceUrl,
          broker: null,
        });
        continue;
      }

      try {
        sleep(1000); // 1-1.5s between detail page fetches
        const { subListings, fullDescription, bodyText } = scrapeICRDetail(main.sourceUrl);
        
        // Use full description from detail page if available (has occ costs), fall back to main page snippet
        const effectiveDesc = fullDescription || main.description;
        // Try parsing occ cost from og:description first, then from page body text as fallback
        const occCost = parseOccupancyCost(effectiveDesc) ?? parseOccupancyCost(bodyText);
        
        // Record suite info from sub-listings for backfilling
        for (const sub of subListings) {
          if (sub.suite && sub.sourceUrl) {
            suiteMap.set(sub.sourceUrl, sub.suite);
          }
        }

        if (subListings.length === 0) {
          // No sub-listings, just the main listing
          const flag = checkDescriptionForRetailSignals(effectiveDesc, main.propertyType, main.propertyTypeFlag);
          listings.push({
            address: main.address,
            suite: null,
            propertyType: main.propertyType,
            propertyTypeFlag: flag,
            listingType: main.listingType,
            askingPrice: main.askingPrice,
            askingRent: main.askingRent,
            rentBasis: main.rentBasis,
            squareFeet: main.squareFeet,
            occupancyCost: occCost,
            description: effectiveDesc.substring(0, 500),
            sourceUrl: main.sourceUrl,
            broker: null,
          });
        } else {
          // Create a listing for each sub-listing
          for (const sub of subListings) {
            const { propertyType: subPropType, propertyTypeFlag: subFlag } = classifyPropertyType(sub.typeStr);
            // Use sub's property type if classifiable, otherwise fall back to main
            const effectivePropType = subPropType || main.propertyType;
            if (!ALLOWED_TYPES.includes(effectivePropType)) {
              filtered++;
              continue;
            }
            
            const subListingType = classifyListingType(sub.listingTypeStr || sub.typeStr);
            const { askingPrice, askingRent, rentBasis, isCompleted } = parsePrice(sub.priceStr, subListingType);
            if (isCompleted) { filtered++; continue; } // Skip leased/sold sub-units
            const squareFeet = parseSFExact(sub.sfStr);
            const flag = checkDescriptionForRetailSignals(effectiveDesc, effectivePropType, subFlag || main.propertyTypeFlag);

            listings.push({
              address: main.address,
              suite: sub.suite || null,
              propertyType: effectivePropType,
              propertyTypeFlag: flag,
              listingType: subListingType,
              askingPrice,
              askingRent,
              rentBasis,
              squareFeet,
              occupancyCost: occCost, // Same occ cost for all units in building
              description: effectiveDesc.substring(0, 500),
              sourceUrl: sub.sourceUrl,
              broker: null,
            });
          }
          
          // Also add the main listing itself (it represents the current detail page's unit)
          // But only if its sourceUrl is NOT already in the sub-listings
          const subUrls = new Set(subListings.map(s => s.sourceUrl));
          if (!subUrls.has(main.sourceUrl)) {
            const flag = checkDescriptionForRetailSignals(effectiveDesc, main.propertyType, main.propertyTypeFlag);
            listings.push({
              address: main.address,
              suite: null,
              propertyType: main.propertyType,
              propertyTypeFlag: flag,
              listingType: main.listingType,
              askingPrice: main.askingPrice,
              askingRent: main.askingRent,
              rentBasis: main.rentBasis,
              squareFeet: main.squareFeet,
              occupancyCost: occCost,
              description: effectiveDesc.substring(0, 500),
              sourceUrl: main.sourceUrl,
              broker: null,
            });
          }
        }
      } catch (e: any) {
        errors.push(`Detail page error for ${main.address}: ${e.message}`);
        // Fall back to main listing
        const flag = checkDescriptionForRetailSignals(main.description, main.propertyType, main.propertyTypeFlag);
        listings.push({
          address: main.address,
          suite: null,
          propertyType: main.propertyType,
          propertyTypeFlag: flag,
          listingType: main.listingType,
          askingPrice: main.askingPrice,
          askingRent: main.askingRent,
          rentBasis: main.rentBasis,
          squareFeet: main.squareFeet,
          occupancyCost: parseOccupancyCost(main.description),
          description: main.description,
          sourceUrl: main.sourceUrl,
          broker: null,
        });
      }
    }

    // Backfill missing suites from suiteMap (main listings that also appear as sub-listings elsewhere)
    for (const listing of listings) {
      if (!listing.suite && listing.sourceUrl && suiteMap.has(listing.sourceUrl)) {
        listing.suite = suiteMap.get(listing.sourceUrl)!;
      }
    }

    console.log(`ICR: ${listings.length} total listings (including sub-listings), ${filtered} filtered out`);
  } catch (e: any) {
    errors.push(`Fetch error: ${e.message}`);
    console.error("ICR scraper error:", e);
  }

  return { listings, totalFound, filtered, errors };
}
