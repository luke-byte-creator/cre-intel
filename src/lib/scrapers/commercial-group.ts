/**
 * The Commercial Group Scraper
 * Scrapes listings from thecommercialgroup.ca
 * Tries curl first, falls back to Playwright if JS-rendered
 */
import * as cheerio from "cheerio";
import { execSync } from "child_process";
import { browserPool } from "./utils";

export interface CommGroupListing {
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

export interface CommGroupScrapingResult {
  listings: CommGroupListing[];
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
  if (lower.includes("office") || lower.includes("commercial") || lower.includes("workspace")) return { propertyType: "office", propertyTypeFlag: lower.includes("commercial") ? "inferred_type" : null };
  if (lower.includes("multi-family") || lower.includes("apartment")) return { propertyType: "multi-family", propertyTypeFlag: null };
  return { propertyType: null, propertyTypeFlag: null };
}

function parseRent(priceStr: string): { askingRent: number | null; rentBasis: string | null; askingPrice: number | null; isCompleted: boolean } {
  if (!priceStr) return { askingRent: null, rentBasis: null, askingPrice: null, isCompleted: false };
  const lower = priceStr.toLowerCase();
  if (lower === "leased" || lower === "sold") return { askingRent: null, rentBasis: null, askingPrice: null, isCompleted: true };

  const psfMatch = priceStr.match(/\$([0-9,.]+)\s*(?:PSF|per\s*SF|\/SF)/i);
  if (psfMatch) {
    const val = parseFloat(psfMatch[1].replace(/,/g, ""));
    const basis = lower.includes("gross") ? "psf_gross" : "psf_net";
    return { askingRent: val, rentBasis: basis, askingPrice: null, isCompleted: false };
  }

  const genericMatch = priceStr.match(/\$([0-9,.]+)/);
  if (genericMatch) {
    const val = parseFloat(genericMatch[1].replace(/,/g, ""));
    if (val > 100000) return { askingRent: null, rentBasis: null, askingPrice: val, isCompleted: false };
    if (val < 200) return { askingRent: val, rentBasis: "psf_net", askingPrice: null, isCompleted: false };
  }
  return { askingRent: null, rentBasis: null, askingPrice: null, isCompleted: false };
}

async function fetchWithPlaywright(url: string): Promise<string | null> {
  try {
    const browser = await browserPool.getBrowser();
    const context = await browser.newContext({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(3000);
    const html = await page.content();
    await context.close();
    return html;
  } catch (e) {
    console.error("Playwright fetch failed:", e);
    return null;
  }
}

function parseListingsFromHtml($: cheerio.CheerioAPI, errors: string[]): { listings: CommGroupListing[]; totalFound: number; filtered: number } {
  const listings: CommGroupListing[] = [];
  let totalFound = 0;
  let filtered = 0;

  // The Commercial Group uses various possible structures. Try common patterns.
  // Look for listing cards, property items, etc.
  const cards = $(".listing, .property, .property-card, article, .result, [class*='listing']");
  totalFound = cards.length;

  if (totalFound === 0) {
    // Try broader selectors
    const links = $("a[href*='/listing'], a[href*='/property']");
    totalFound = links.length;
    
    links.each((_, el) => {
      try {
        const $el = $(el);
        const href = $el.attr("href") || "";
        const text = $el.text().trim();
        if (!text || !href) return;

        // Try to extract what we can
        const address = text;
        if (!address.toLowerCase().includes("saskatoon")) {
          // Assume Saskatoon listings only if not specified
        }

        listings.push({
          address: address.includes("Saskatoon") ? address : `${address}, Saskatoon, SK`,
          suite: null,
          propertyType: "office",
          propertyTypeFlag: "inferred_type",
          listingType: "lease",
          askingPrice: null,
          askingRent: null,
          rentBasis: null,
          squareFeet: null,
          occupancyCost: null,
          description: "",
          sourceUrl: href.startsWith("http") ? href : `https://thecommercialgroup.ca${href}`,
          broker: null,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`Parse error: ${msg}`);
      }
    });

    return { listings, totalFound, filtered };
  }

  cards.each((_, card) => {
    try {
      const $card = $(card);
      const title = $card.find("h2, h3, h4, .title, .name").first().text().trim();
      const link = $card.find("a").first().attr("href") || "";
      const typeText = $card.find(".type, .category, .property-type").text().trim();
      const priceText = $card.find(".price, .rent, .rate").text().trim();
      const statusText = $card.find(".status, .badge").text().trim().toLowerCase();

      if (statusText === "leased" || statusText === "sold") { filtered++; return; }

      const { propertyType, propertyTypeFlag } = classifyType(typeText || title);
      if (propertyType && !ALLOWED_TYPES.includes(propertyType)) { filtered++; return; }

      const { askingRent, rentBasis, askingPrice, isCompleted } = parseRent(priceText);
      if (isCompleted) { filtered++; return; }

      const address = title || "Unknown Address";

      listings.push({
        address: address.includes("Saskatoon") ? address : `${address}, Saskatoon, SK`,
        suite: null,
        propertyType: propertyType || "office",
        propertyTypeFlag: propertyTypeFlag || "inferred_type",
        listingType: "lease",
        askingPrice,
        askingRent,
        rentBasis,
        squareFeet: null,
        occupancyCost: null,
        description: "",
        sourceUrl: link.startsWith("http") ? link : `https://thecommercialgroup.ca${link}`,
        broker: null,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`Parse error: ${msg}`);
    }
  });

  return { listings, totalFound, filtered };
}

export async function scrapeCommGroup(): Promise<CommGroupScrapingResult> {
  const url = "https://thecommercialgroup.ca/listings/";
  const errors: string[] = [];
  let listings: CommGroupListing[] = [];
  let totalFound = 0;
  let filtered = 0;

  try {
    // Must use Playwright — listings load via realtysites.ca JS widget
    console.log("Fetching The Commercial Group listings via Playwright...");
    const browser = await browserPool.getBrowser();
    const context = await browser.newContext({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForSelector("#vdc-listing-container .listing", { timeout: 15000 });
    await page.waitForTimeout(2000);

    // Parse all pages (widget is paginated)
    let pageNum = 1;
    const maxPages = 5;

    while (pageNum <= maxPages) {
      const html = await page.content();
      const $ = cheerio.load(html);

      const cards = $("#vdc-listing-container .listing");
      if (cards.length === 0) break;

      console.log(`CommGroup: Page ${pageNum} — ${cards.length} cards`);

      cards.each((_, card) => {
        try {
          totalFound++;
          const $card = $(card);

          const address = $card.find(".address").text().trim();
          const city = $card.find(".city").text().trim();
          const priceText = $card.find(".price").text().trim();
          const typeText = $card.find(".property-type span").text().trim();
          const sfText = $card.find(".square-footage span").text().trim();
          const descText = $card.find(".description-text, .listing-description").text().trim();
          const detailLink = $card.find("a.more-details, a[href*='listing']").attr("href") || "";
          const mlsNum = $card.find(".mls-number span").text().trim();

          if (!address) return;

          // Classify type
          const { propertyType, propertyTypeFlag } = classifyType(typeText);
          if (propertyType && !ALLOWED_TYPES.includes(propertyType)) { filtered++; return; }
          // Skip if pure retail with no office/industrial
          if (!propertyType && typeText.toLowerCase().includes("retail")) { filtered++; return; }

          // Parse price
          const { askingRent, rentBasis, askingPrice, isCompleted } = parseRent(priceText);
          if (isCompleted) { filtered++; return; }

          // Parse SF
          let squareFeet: number | null = null;
          if (sfText) {
            const sfMatch = sfText.match(/([0-9,]+)/);
            if (sfMatch) squareFeet = parseFloat(sfMatch[1].replace(/,/g, ""));
          }

          const fullAddress = city ? `${address}, ${city}, SK` : `${address}, Saskatoon, SK`;
          const listingType = priceText.toLowerCase().includes("sale") || priceText.match(/\$[0-9,]+$/) ? "sale" : "lease";

          // Build source URL from detail link or MLS number
          let sourceUrl = detailLink;
          if (!sourceUrl && mlsNum) {
            sourceUrl = `https://thecommercialgroup.ca/listings/?mlsnum=${mlsNum}`;
          }
          if (!sourceUrl) sourceUrl = url;

          listings.push({
            address: fullAddress,
            suite: null,
            propertyType: propertyType || "office",
            propertyTypeFlag: propertyTypeFlag || (propertyType ? null : "inferred_type"),
            listingType,
            askingPrice,
            askingRent,
            rentBasis,
            squareFeet,
            occupancyCost: null,
            description: descText.substring(0, 500),
            sourceUrl,
            broker: null,
          });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          errors.push(`Card parse error: ${msg}`);
        }
      });

      // Try next page
      const nextBtn = page.locator(".pager a.next[data-url]").first();
      if (await nextBtn.count() > 0 && await nextBtn.isVisible()) {
        await nextBtn.click();
        await page.waitForTimeout(3000);
        pageNum++;
      } else {
        break;
      }
    }

    await context.close();
    console.log(`CommGroup: ${listings.length} listings found, ${filtered} filtered out (${totalFound} total)`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`Fetch error: ${msg}`);
    console.error("CommGroup scraper error:", e);
  }

  return { listings, totalFound, filtered, errors };
}
