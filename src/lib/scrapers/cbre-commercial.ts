/**
 * CBRE Commercial Scraper
 * Uses Playwright to bypass Cloudflare, then hits CBRE's REST API
 * Filters: office, industrial | Saskatoon only
 */
import { chromium, Browser, Page } from 'playwright';

export interface CBREListing {
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
  buildingName: string | null;
  yearBuilt: number | null;
  totalBuildingSF: number | null;
}

export interface CBREScrapingResult {
  listings: CBREListing[];
  totalFound: number;
  filtered: number;
  errors: string[];
}

const SASKATOON_POLYGON = encodeURIComponent(
  '[["52.2311171,-106.5038622","52.0698309,-106.5038622","52.0698309,-106.8249588","52.2311171,-106.8249588"]]'
);

const ALLOWED_USAGE_TYPES = ['Office', 'Industrial'];

// Rate limit: 2-3s jitter between requests
function delay(minMs = 2000, maxMs = 3000): Promise<void> {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise(resolve => setTimeout(resolve, ms));
}

function classifyListingType(aspects: string[]): string {
  const hasLease = aspects.includes('isLetting');
  const hasSale = aspects.includes('isSale');
  if (hasLease && hasSale) return 'sale_and_lease';
  if (hasSale) return 'sale';
  return 'lease';
}

function classifyPropertyType(usageType: string): { propertyType: string | null; flag: string | null } {
  const lower = usageType.toLowerCase();
  if (lower === 'office') return { propertyType: 'office', flag: null };
  if (lower === 'industrial') return { propertyType: 'industrial', flag: null };
  return { propertyType: null, flag: null };
}

function extractCharge(charges: any[], kind: string, modifier?: string): number | null {
  if (!charges || !Array.isArray(charges)) return null;
  const match = charges.find((c: any) => {
    if (c['Common.ChargeKind'] !== kind) return false;
    if (modifier && c['Common.ChargeModifer'] !== modifier) return false;
    return true;
  });
  if (!match) return null;
  const amount = match['Common.Amount'];
  if (match['Common.OnApplication']) return null;
  return typeof amount === 'number' ? amount : null;
}

function extractSize(sizes: any[], kind: string): number | null {
  if (!sizes || !Array.isArray(sizes)) return null;
  const match = sizes.find((s: any) => s['Common.SizeKind'] === kind);
  if (!match) return null;
  const dims = match['Common.Dimensions'];
  if (!dims || !dims[0]) return null;
  return dims[0]['Common.Amount'] ?? null;
}

function buildDetailUrl(doc: any): string {
  const pk = doc['Common.PrimaryKey'] || '';
  // The clickable URL follows a pattern but we'll construct a basic one
  const addr = doc['Common.ActualAddress'] || {};
  const line1 = addr['Common.Line1'] || '';
  const line2 = addr['Common.Line2'] || '';
  const city = addr['Common.Locallity'] || '';
  const region = addr['Common.Region'] || '';
  const postCode = addr['Common.PostCode'] || '';

  // Build slug from address components
  const parts = [line1, line2, city, region, postCode]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return `https://www.cbre.ca/properties/commercial-space/details/${pk}/${parts}`;
}

function parseDocument(doc: any): CBREListing[] {
  const addr = doc['Common.ActualAddress'] || {};
  const buildingName = addr['Common.Line1'] || null;
  const streetAddress = addr['Common.Line2'] || addr['Common.Line1'] || '';
  const city = addr['Common.Locallity'] || 'Saskatoon';
  const fullAddress = streetAddress ? `${streetAddress}, ${city}` : city;

  const usageType = doc['Common.UsageType'] || '';
  const { propertyType, flag } = classifyPropertyType(usageType);
  if (!propertyType) return [];

  const aspects = doc['Common.Aspects'] || [];
  const listingType = classifyListingType(aspects);
  const charges = doc['Common.Charges'] || [];
  const sizes = doc['Common.Sizes'] || [];
  const floorsAndUnits = doc['Common.FloorsAndUnits'] || [];
  const sourceUrl = buildDetailUrl(doc);

  // Extract building-level data
  const netRent = extractCharge(charges, 'NetRent', 'From') ?? extractCharge(charges, 'NetRent');
  const grossRent = extractCharge(charges, 'Rent', 'From') ?? extractCharge(charges, 'Rent');
  const salePrice = extractCharge(charges, 'SalePrice');
  const occCost = (grossRent !== null && netRent !== null && grossRent > netRent)
    ? Math.round((grossRent - netRent) * 100) / 100
    : null;

  const totalBuildingSF = extractSize(sizes, 'TotalBuildingSize');
  const yearBuilt = doc['Common.YearBuilt'] ?? null;

  const strapline = doc['Common.Strapline'];
  const description = strapline?.[0]?.['Common.Text']
    || doc['Common.LongDescription']?.[0]?.['Common.Text']
    || '';

  const contacts = doc['Common.ContactGroup']?.['Common.Contacts'] || [];
  const broker = contacts
    .map((c: any) => c['Common.AgentName'])
    .filter((n: string) => n && n !== 'Saskatchewan')
    .join(' / ') || null;

  // Document-level sizes (available on both parent and child listings)
  const docMinSF = extractSize(sizes, 'MinimumSize');
  const docMaxSF = extractSize(sizes, 'MaximumSize');
  const docUnitSF = extractSize(sizes, 'UnitSize');
  const docSF = docUnitSF || docMinSF || docMaxSF || null;

  // If there are floor/unit details, create one listing per available unit
  const availableUnits = floorsAndUnits.filter(
    (u: any) => u['Common.Unit.Status'] === 'Available'
  );

  // Helper: clean suite names — filter out descriptions that aren't real suite IDs
  const cleanSuiteName = (raw: string | null): string | null => {
    if (!raw) return null;
    // If the name matches the street address, it's not a suite
    if (raw === streetAddress || raw === buildingName) return null;
    // If it looks like a property description, not a suite
    const lower = raw.toLowerCase();
    if (lower.includes('warehouse') || lower.includes('investment') || lower.includes('industrial/office')) return null;
    return raw;
  };

  if (availableUnits.length > 0) {
    // For child listings (1 unit = 1 document), use document-level size
    const isChildListing = availableUnits.length === 1 && docSF !== null;

    return availableUnits.map((unit: any) => {
      const rawSuiteName = unit['Common.SubdivisionName']?.[0]?.['Common.UnitDisplayName'] || null;
      const suiteName = cleanSuiteName(rawSuiteName);
      const unitCharges = unit['Common.Charges'] || [];
      const unitSizes = unit['Common.Sizes'] || [];

      // Unit-level rent (often gross only at unit level)
      const unitGrossRent = extractCharge(unitCharges, 'Rent');
      const unitNetRent = extractCharge(unitCharges, 'NetRent');
      const unitRent = unitNetRent ?? netRent; // fall back to building-level net
      const unitOccCost = (unitGrossRent !== null && unitRent !== null && unitGrossRent > unitRent)
        ? Math.round((unitGrossRent - unitRent) * 100) / 100
        : occCost;

      // Unit-level size: check unit's own sizes, then fall back to document-level
      const unitSF = extractSize(unitSizes, 'MinimumSize')
        || extractSize(unitSizes, 'UnitSize')
        || extractSize(unitSizes, 'TotalSize')
        || (isChildListing ? docSF : null);

      return {
        address: fullAddress,
        suite: suiteName,
        propertyType,
        propertyTypeFlag: flag,
        listingType,
        askingPrice: listingType.includes('sale') ? salePrice : null,
        askingRent: unitRent,
        rentBasis: unitRent !== null ? 'psf_net' : null,
        squareFeet: unitSF,
        occupancyCost: unitOccCost,
        description,
        sourceUrl: suiteName ? `${sourceUrl}#${suiteName}` : sourceUrl,
        broker,
        buildingName,
        yearBuilt,
        totalBuildingSF,
      };
    });
  }

  // No unit breakdown — single listing
  const sf = docSF;

  return [{
    address: fullAddress,
    suite: null,
    propertyType,
    propertyTypeFlag: flag,
    listingType,
    askingPrice: listingType.includes('sale') ? salePrice : null,
    askingRent: netRent,
    rentBasis: netRent !== null ? 'psf_net' : null,
    squareFeet: sf,
    occupancyCost: occCost,
    description,
    sourceUrl,
    broker,
    buildingName,
    yearBuilt,
    totalBuildingSF,
  }];
}

export async function scrapeCBRE(): Promise<CBREScrapingResult> {
  const errors: string[] = [];
  const listings: CBREListing[] = [];
  let totalFound = 0;
  let browser: Browser | null = null;

  try {
    console.log('🏢 CBRE: Launching browser to bypass Cloudflare...');
    browser = await chromium.launch({
      headless: false,
      channel: 'chrome',  // Use installed Google Chrome instead of Playwright Chromium
      args: ['--disable-blink-features=AutomationControlled'],
    });

    const page = await browser.newPage({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
    });

    // Navigate to CBRE to pass Cloudflare challenge
    console.log('🏢 CBRE: Navigating to cbre.ca to pass Cloudflare...');
    await page.goto('https://www.cbre.ca/properties', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Wait for Cloudflare challenge to resolve
    await page.waitForTimeout(5000);

    // Check if we passed Cloudflare
    const title = await page.title();
    if (title.includes('Just a moment') || title.includes('Attention Required')) {
      // Wait longer for Cloudflare
      console.log('🏢 CBRE: Cloudflare challenge detected, waiting...');
      await page.waitForTimeout(10000);
      const title2 = await page.title();
      if (title2.includes('Just a moment')) {
        errors.push('Failed to bypass Cloudflare challenge');
        return { listings: [], totalFound: 0, filtered: 0, errors };
      }
    }

    console.log('🏢 CBRE: Cloudflare passed. Querying API...');

    // Query the API from within browser context (bypasses Cloudflare)
    const usageTypes = ALLOWED_USAGE_TYPES.map(t => encodeURIComponent(t)).join('%2C');
    const apiUrl = `/property-api/propertylistings/query?Site=ca-comm&CurrencyCode=CAD&Unit=sqft&Interval=Annually&Common.HomeSite=ca-comm&PolygonFilters=${SASKATOON_POLYGON}&Common.Aspects=isLetting%2CisSale&Common.UsageType=${usageTypes}&Common.IsParent=true&PageSize=200&Page=1`;

    const searchResult = await page.evaluate(async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      return await res.json();
    }, apiUrl);

    const documents = searchResult?.Documents?.[0] || searchResult?.Documents || [];
    totalFound = searchResult?.DocumentCount || documents.length;
    console.log(`🏢 CBRE: Found ${totalFound} office/industrial listings`);

    // Identify buildings that have child listings (multi-unit)
    // For these, we'll skip parent-level unit expansion and fetch children instead
    const multiUnitPKs = new Set(
      documents
        .filter((d: any) => (d['Common.ListingCount'] || 0) > 1)
        .map((d: any) => d['Common.PrimaryKey'])
    );

    // Parse each document — skip unit expansion for multi-unit buildings
    for (const doc of documents) {
      try {
        const pk = doc['Common.PrimaryKey'];
        if (multiUnitPKs.has(pk)) {
          // Skip — we'll get detailed child listings below
          continue;
        }
        const parsed = parseDocument(doc);
        listings.push(...parsed);
      } catch (err) {
        const pk = doc?.['Common.PrimaryKey'] || 'unknown';
        const errMsg = `Error parsing ${pk}: ${err instanceof Error ? err.message : String(err)}`;
        errors.push(errMsg);
        console.warn(`🏢 CBRE: ${errMsg}`);
      }
    }

    // For buildings with multiple child listings, fetch children for complete unit data
    const multiUnitBuildings = documents.filter(
      (d: any) => multiUnitPKs.has(d['Common.PrimaryKey'])
    );

    if (multiUnitBuildings.length > 0) {
      console.log(`🏢 CBRE: Fetching child listings for ${multiUnitBuildings.length} multi-unit buildings...`);

      for (const parent of multiUnitBuildings) {
        const pk = parent['Common.PrimaryKey'];
        if (!pk) continue;

        await delay(2000, 3000);

        try {
          const childUrl = `/property-api/propertylistings/query?Site=ca-comm&CurrencyCode=CAD&Unit=sqft&Interval=Annually&Common.HomeSite=ca-comm&Common.Aspects=isLetting%2CisSale&Common.ParentProperty=${encodeURIComponent(pk)}&Common.PrimaryKey=!${encodeURIComponent(pk)}&PageSize=50&Page=1`;

          const childResult = await page.evaluate(async (url: string) => {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Child API returned ${res.status}`);
            return await res.json();
          }, childUrl);

          const childDocs = childResult?.Documents?.[0] || childResult?.Documents || [];
          console.log(`  📄 ${pk}: ${childDocs.length} child listings`);

          for (const child of childDocs) {
            try {
              const parsed = parseDocument(child);
              listings.push(...parsed);
            } catch (err) {
              errors.push(`Error parsing child of ${pk}: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        } catch (err) {
          errors.push(`Error fetching children for ${pk}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    console.log(`🏢 CBRE: Scrape complete. ${listings.length} listings extracted.`);
  } catch (err) {
    const errMsg = `CBRE scraper error: ${err instanceof Error ? err.message : String(err)}`;
    errors.push(errMsg);
    console.error(`🏢 ${errMsg}`);
  } finally {
    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
    }
  }

  return {
    listings,
    totalFound,
    filtered: listings.length,
    errors,
  };
}
