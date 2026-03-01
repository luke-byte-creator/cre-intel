/**
 * Cushman Wakefield Saskatoon Scraper
 * Scrapes server-rendered listings from cushmanwakefieldsaskatoon.com
 * Filters: office, industrial, multi-family | Skip leased/sold & retail-only
 */
import * as cheerio from "cheerio";
import { execSync } from "child_process";

export interface CushmanListing {
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

export interface CushmanScrapingResult {
  listings: CushmanListing[];
  totalFound: number;
  filtered: number;
  errors: string[];
}

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

const ALLOWED_TYPES = ["office", "industrial", "multi-family"];

function classifyType(typeStr: string): { propertyType: string | null; propertyTypeFlag: string | null } {
  const lower = typeStr.toLowerCase();
  if ((lower.includes("retail") && lower.includes("office")) || lower.includes("retail/office") || lower.includes("office/retail"))
    return { propertyType: "office", propertyTypeFlag: "mixed_retail_office" };
  if ((lower.includes("industrial") && lower.includes("office")) || lower.includes("industrial/office") || lower.includes("office/industrial"))
    return { propertyType: "office", propertyTypeFlag: "mixed_industrial_office" };
  if (lower.includes("industrial") || lower.includes("warehouse")) return { propertyType: "industrial", propertyTypeFlag: null };
  if (lower.includes("office")) return { propertyType: "office", propertyTypeFlag: null };
  if (lower.includes("multi-family") || lower.includes("multi family") || lower.includes("apartment")) return { propertyType: "multi-family", propertyTypeFlag: null };
  return { propertyType: null, propertyTypeFlag: null };
}

function parseRent(priceStr: string): { askingRent: number | null; rentBasis: string | null; askingPrice: number | null } {
  if (!priceStr) return { askingRent: null, rentBasis: null, askingPrice: null };
  // "$28.00 per SF" or "$33 per SF"
  const psfMatch = priceStr.match(/\$([0-9,.]+)\s*per\s*SF/i);
  if (psfMatch) {
    return { askingRent: parseFloat(psfMatch[1].replace(/,/g, "")), rentBasis: "psf_net", askingPrice: null };
  }
  // "$299,950" (sale)
  const saleMatch = priceStr.match(/\$([0-9,]+)$/);
  if (saleMatch) {
    const val = parseFloat(saleMatch[1].replace(/,/g, ""));
    if (val > 100000) return { askingRent: null, rentBasis: null, askingPrice: val };
  }
  const genericMatch = priceStr.match(/\$([0-9,.]+)/);
  if (genericMatch) {
    const val = parseFloat(genericMatch[1].replace(/,/g, ""));
    if (val < 200) return { askingRent: val, rentBasis: "psf_net", askingPrice: null };
    return { askingRent: null, rentBasis: null, askingPrice: val };
  }
  return { askingRent: null, rentBasis: null, askingPrice: null };
}

/** Extract suite from title like "301 475 2nd Avenue South" → suite "301", rest is address */
function parseSuiteFromTitle(title: string): { suite: string | null; cleanAddress: string } {
  // Pattern: suite is a short number at the start, followed by a street number
  const match = title.match(/^(\d{1,4})\s+(\d+\s+.+)$/);
  if (match) {
    const possibleSuite = match[1];
    const rest = match[2];
    // If the "suite" is a reasonable suite number (1-9999) and rest starts with a street number
    if (parseInt(possibleSuite) <= 9999 && /^\d+\s/.test(rest)) {
      return { suite: possibleSuite, cleanAddress: rest };
    }
  }
  return { suite: null, cleanAddress: title };
}

function scrapeDetailPage(url: string): { description: string; squareFeet: number | null; occupancyCost: number | null; broker: string | null } {
  const html = fetchPage(url);
  if (!html) return { description: "", squareFeet: null, occupancyCost: null, broker: null };
  const $ = cheerio.load(html);

  // Description from og:description or main content
  let description = $('meta[property="og:description"]').attr("content") || "";
  if (!description) {
    description = $(".entry-content").text().trim().substring(0, 500);
  }

  // Try to find SF from the page content
  let squareFeet: number | null = null;
  const pageText = $("body").text();
  const sfMatch = pageText.match(/([0-9,]+)\s*(?:sq\.?\s*ft|SF|square\s*feet)/i);
  if (sfMatch) {
    squareFeet = parseFloat(sfMatch[1].replace(/,/g, ""));
  }

  // Occupancy costs
  let occupancyCost: number | null = null;
  const occMatch = pageText.match(/(?:occupancy|operating)\s*costs?\s*[\$:]?\s*\$?([0-9,.]+)\s*(?:PSF|\/SF|per\s*sf)?/i);
  if (occMatch) {
    const val = parseFloat(occMatch[1].replace(/,/g, ""));
    if (val > 0 && val < 100) occupancyCost = val;
  }

  // Broker
  let broker: string | null = null;
  const brokerEl = $(".broker-name, .agent-name, .listing-agent");
  if (brokerEl.length > 0) {
    broker = brokerEl.first().text().trim() || null;
  }

  return { description: description.substring(0, 500), squareFeet, occupancyCost, broker };
}

export async function scrapeCushman(): Promise<CushmanScrapingResult> {
  const url = "https://cushmanwakefieldsaskatoon.com/property-search/";
  const errors: string[] = [];
  const listings: CushmanListing[] = [];
  let totalFound = 0;
  let filtered = 0;

  try {
    console.log("Fetching Cushman Wakefield listings via curl...");
    const html = fetchPage(url);
    if (!html) {
      errors.push("Fetch failed");
      return { listings, totalFound, filtered, errors };
    }
    console.log(`Cushman: Got ${html.length} chars of HTML`);

    const $ = cheerio.load(html);
    const cards = $(".property.card");
    totalFound = cards.length;
    console.log(`Cushman: Found ${totalFound} listing cards`);

    cards.each((_, card) => {
      try {
        const $card = $(card);

        // Skip leased/sold
        const statusBanner = $card.find(".status_banner").text().trim().toLowerCase();
        if (statusBanner === "leased" || statusBanner === "sold") { filtered++; return; }

        // Type from .availability span
        const availText = $card.find(".availability").text().trim();
        const { propertyType, propertyTypeFlag } = classifyType(availText);
        if (!propertyType || !ALLOWED_TYPES.includes(propertyType)) { filtered++; return; }

        // Listing type
        const listingType = availText.toLowerCase().includes("sale") ? "sale" : "lease";

        // Title and link
        const titleEl = $card.find("h3 a");
        const title = titleEl.text().trim();
        const detailUrl = titleEl.attr("href") || "";

        // Address from <p> tag
        const rawAddress = $card.find(".content > p").first().text().trim();

        // Parse suite from title
        const { suite } = parseSuiteFromTitle(title);

        // Use the <p> address as the main address, append Saskatoon if not present
        let address = rawAddress || title;
        if (address && !address.toLowerCase().includes("saskatoon")) {
          address += ", Saskatoon, SK";
        }

        // Price
        const priceStr = $card.find(".price").text().trim();
        const { askingRent, rentBasis, askingPrice } = parseRent(priceStr);

        listings.push({
          address,
          suite,
          propertyType,
          propertyTypeFlag,
          listingType,
          askingPrice,
          askingRent,
          rentBasis,
          squareFeet: null,
          occupancyCost: null,
          description: "",
          sourceUrl: detailUrl,
          broker: null,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`Parse error: ${msg}`);
      }
    });

    // Fetch detail pages for extra data
    console.log(`Cushman: ${listings.length} listings matched, fetching detail pages...`);
    for (const listing of listings) {
      if (!listing.sourceUrl) continue;
      try {
        sleep(1000);
        const detail = scrapeDetailPage(listing.sourceUrl);
        if (detail.description) listing.description = detail.description;
        if (detail.squareFeet) listing.squareFeet = detail.squareFeet;
        if (detail.occupancyCost) listing.occupancyCost = detail.occupancyCost;
        if (detail.broker) listing.broker = detail.broker;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`Detail page error for ${listing.address}: ${msg}`);
      }
    }

    console.log(`Cushman: ${listings.length} total listings, ${filtered} filtered out`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`Fetch error: ${msg}`);
    console.error("Cushman scraper error:", e);
  }

  return { listings, totalFound, filtered, errors };
}
