/**
 * Colliers Commercial Scraper
 * Uses Playwright to extract Coveo search token, then queries Coveo API
 * Falls back to browser for detail pages if needed
 * Filters: office, industrial | Saskatoon only
 */
import { chromium, Browser, Page } from 'playwright';

export interface ColliersListing {
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

export interface ColliersScrapingResult {
  listings: ColliersListing[];
  totalFound: number;
  filtered: number;
  errors: string[];
}

const ALLOWED_TYPES = ['Office', 'Industrial'];

// Rate limit: 2-3s jitter between requests
function delay(minMs = 2000, maxMs = 3000): Promise<void> {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise(resolve => setTimeout(resolve, ms));
}

function classifyPropertyType(rawType: string): { propertyType: string | null; flag: string | null } {
  const lower = rawType.toLowerCase();
  if (lower === 'office') return { propertyType: 'office', flag: null };
  if (lower === 'industrial') return { propertyType: 'industrial', flag: null };
  // Mixed types
  if (lower.includes('office') && lower.includes('retail')) return { propertyType: 'office', flag: 'mixed_retail_office' };
  if (lower.includes('office') && lower.includes('industrial')) return { propertyType: 'office', flag: 'mixed_industrial_office' };
  if (lower.includes('industrial') && lower.includes('office')) return { propertyType: 'industrial', flag: 'mixed_industrial_office' };
  if (lower.includes('office')) return { propertyType: 'office', flag: null };
  if (lower.includes('industrial') || lower.includes('warehouse')) return { propertyType: 'industrial', flag: null };
  return { propertyType: null, flag: null };
}

function classifyListingType(raw: any): string {
  const forLease = raw['forz32xlease'] === 1;
  const forSale = raw['forz32xsale'] === 1;
  const saleOrLease = raw['propertyforsaleorleasecomputed'] || [];

  if (forLease && forSale) return 'sale_and_lease';
  if (forSale) return 'sale';
  if (forLease) return 'lease';

  // Fallback to computed field
  const hasLease = saleOrLease.some((s: string) => s.includes('Lease') || s.includes('Rent') || s.includes('Sublease'));
  const hasSale = saleOrLease.some((s: string) => s.includes('Sale'));
  if (hasLease && hasSale) return 'sale_and_lease';
  if (hasSale) return 'sale';
  if (hasLease) return 'lease';

  // Check for sublease
  if (saleOrLease.some((s: string) => s.includes('Sublease'))) return 'sublease';

  return 'lease';
}

function cleanAddress(fullAddress: string): string {
  return fullAddress
    .replace(/,\s*Saskatchewan,\s*Canada$/i, '')
    .replace(/,\s*Canada$/i, '')
    .replace(/,\s*Saskatchewan$/i, '')
    .replace(/\s*\n\s*/g, ' ')  // Remove newlines (Coveo sometimes has these)
    .replace(/,\s*SK$/i, '')     // Strip trailing ", SK"
    .replace(/\s+/g, ' ')        // Normalize whitespace
    .trim();
}

function parseOccupancyCost(text: string): number | null {
  if (!text) return null;
  // Match patterns like "Occupancy Costs $14.43/SF" or "OCCUPANCY COSTS$14.43 PSF"
  const patterns = [
    /occupancy\s*costs?\s*\$?([\d,.]+)\s*(?:\/?\s*(?:SF|PSF|sq\.?\s*ft))/i,
    /occ(?:upancy)?\s*cost[s]?\s*(?:of\s*)?\$?([\d,.]+)\s*(?:\/?\s*(?:SF|PSF|sq\.?\s*ft))/i,
    /additional\s*rent\s*(?:of\s*)?\$?([\d,.]+)\s*(?:\/?\s*(?:SF|PSF|sq\.?\s*ft))/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return parseFloat(match[1].replace(/,/g, ''));
    }
  }
  return null;
}

function parseUnitDetails(text: string): Array<{ suite: string; sf: number | null }> {
  const units: Array<{ suite: string; sf: number | null }> = [];
  // Match patterns like "Unit 500 ± 9,454 SF" or "Suite 100 - 2,500 SF"
  const unitPattern = /(?:unit|suite|space)\s+(\w+)\s*[±\-–]\s*([\d,]+)\s*SF/gi;
  let match;
  while ((match = unitPattern.exec(text)) !== null) {
    units.push({
      suite: match[1],
      sf: parseInt(match[2].replace(/,/g, '')),
    });
  }
  return units;
}

function parseLeaseRate(text: string): { rate: number | null; basis: string | null } {
  // Match patterns like "$18 - $22 /SF CAD" or "$18.00/SF"
  const patterns = [
    /\$([\d,.]+)\s*(?:-\s*\$([\d,.]+))?\s*\/SF\s*(?:CAD)?/i,
    /net\s*(?:lease\s*)?rate\s*[^$]*\$([\d,.]+)\s*(?:\/?\s*(?:SF|PSF))/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const min = parseFloat(match[1].replace(/,/g, ''));
      return { rate: min, basis: 'psf_net' };
    }
  }
  return { rate: null, basis: null };
}

function parseCoveoResult(raw: any): ColliersListing | null {
  const primaryType = raw['primarypropertytype'] || '';
  const types = raw['propertytypecomputed'] || [primaryType];
  const typeStr = types.join('/');
  const { propertyType, flag } = classifyPropertyType(typeStr || primaryType);

  if (!propertyType) return null;

  // Filter non-Saskatoon
  const cities = raw['city'] || [];
  const addr = raw['propertyz32xfullz32xaddress'] || '';
  const isSaskatoon = cities.some((c: string) => c.toLowerCase().includes('saskatoon'))
    || addr.toLowerCase().includes('saskatoon');
  if (!isSaskatoon) return null;

  const listingType = classifyListingType(raw);
  const address = cleanAddress(addr);
  const title = raw['propertyz32xtitle'] || '';
  const description = raw['shortz32xdescription'] || raw['description'] || '';

  // Size
  const sizeComputed = raw['propertysiz122xecomputed'];
  const sizeUnit = raw['siz122xeunitcomputed'] || [];
  const isSF = sizeUnit.length === 0 || sizeUnit.some((u: string) => u.toLowerCase().includes('sf'));
  const squareFeet = (isSF && typeof sizeComputed === 'number' && sizeComputed > 0) ? Math.round(sizeComputed) : null;

  // Lease price
  const minPrice = raw['fleasez32xpricez32xmin16556'];
  const maxPrice = raw['fleasez32xpricez32xmaz120x16556'];
  const askingRent = (typeof minPrice === 'number' && minPrice > 0) ? minPrice : null;
  const rentBasis = askingRent ? 'psf_net' : null;

  // Sale price (Coveo doesn't have a clean sale price field — defer to detail page)
  const askingPrice: number | null = null;

  // Broker
  const experts = raw['relatedez120xpertsfullnamecomputed'] || [];
  const broker = experts.length > 0 ? experts.join(' / ') : null;

  // Source URL
  const urlLink = raw['urllink'] || '';
  const sourceUrl = urlLink
    ? `https://www.collierscanada.com${urlLink}`
    : raw['clickableuri'] || '';

  // Property ID
  const propertyId = raw['propertyz32xid'] || '';

  return {
    address: address || title,
    suite: null, // Will be enriched from detail page if available
    propertyType,
    propertyTypeFlag: flag,
    listingType,
    askingPrice,
    askingRent,
    rentBasis,
    squareFeet,
    occupancyCost: null, // Will be enriched from detail page
    description: `${title}${description ? ' — ' + description : ''}`,
    sourceUrl,
    broker,
  };
}

export async function scrapeColliers(): Promise<ColliersScrapingResult> {
  const errors: string[] = [];
  const listings: ColliersListing[] = [];
  let totalFound = 0;
  let browser: Browser | null = null;

  // Global timeout: kill browser after 5 minutes max
  const globalTimeout = setTimeout(async () => {
    console.error('🔵 Colliers: Global timeout (5min) reached, killing browser');
    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
      browser = null;
    }
    errors.push('Global timeout reached — scraper took too long');
  }, 5 * 60 * 1000);

  try {
    console.log('🔵 Colliers: Launching browser to extract Coveo token...');
    browser = await chromium.launch({
      headless: false,
      channel: 'chrome',  // Use installed Google Chrome instead of Playwright Chromium
      args: ['--disable-blink-features=AutomationControlled'],
    });

    const page = await browser.newPage({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
    });

    // Block images/fonts/media to speed up page load
    await page.route('**/*', (route) => {
      const resourceType = route.request().resourceType();
      if (['image', 'font', 'media'].includes(resourceType)) {
        route.abort();
      } else {
        route.continue();
      }
    });

    // Navigate to Colliers properties page
    console.log('🔵 Colliers: Loading properties page...');
    await page.goto(
      'https://www.collierscanada.com/en-ca/properties#f:location=[Saskatchewan%20%3E%20Saskatoon%20Region]',
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );

    // Wait for Coveo to initialize
    await page.waitForTimeout(8000);

    // Check for Cloudflare
    const title = await page.title();
    if (title.includes('Just a moment') || title.includes('Attention Required')) {
      console.log('🔵 Colliers: Cloudflare challenge, waiting longer...');
      await page.waitForTimeout(10000);
      const title2 = await page.title();
      if (title2.includes('Just a moment')) {
        errors.push('Failed to bypass Cloudflare challenge');
        return { listings: [], totalFound: 0, filtered: 0, errors };
      }
    }

    // Extract the Coveo token
    console.log('🔵 Colliers: Extracting Coveo token...');
    let token: string | null = null;
    try {
      token = await page.evaluate(() => {
        // @ts-ignore - Coveo is a global from their JS
        return (window as any).Coveo?.SearchEndpoint?.defaultEndpoint?.options?.accessToken || null;
      });
    } catch {
      errors.push('Failed to extract Coveo token from page');
    }

    if (!token) {
      // Try alternative: look for token in page source
      const content = await page.content();
      const tokenMatch = content.match(/accessToken["']?\s*[:=]\s*["']([^"']+)/);
      if (tokenMatch) {
        token = tokenMatch[1];
      }
    }

    if (!token) {
      errors.push('Could not extract Coveo search token');
      return { listings: [], totalFound: 0, filtered: 0, errors };
    }

    console.log('🔵 Colliers: Token extracted. Querying Coveo API...');

    // Query Coveo API — this can be done from Node.js directly since Coveo is NOT behind Cloudflare
    const coveoResponse = await fetch(
      'https://platform.cloud.coveo.com/rest/search/v2?organizationId=colliersinternational',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          q: '',
          numberOfResults: 300,
          sortCriteria: 'relevancy',
          aq: '@propertylocationtypeaheadcomputed=="Saskatchewan > Saskatoon Region" OR @propertylocationtypeaheadcomputed=="Saskatchewan > Saskatoon Region > Saskatoon"',
        }),
      }
    );

    if (!coveoResponse.ok) {
      errors.push(`Coveo API returned ${coveoResponse.status}`);
      return { listings: [], totalFound: 0, filtered: 0, errors };
    }

    const coveoData = await coveoResponse.json();
    const results = coveoData.results || [];
    totalFound = coveoData.totalCount || results.length;
    console.log(`🔵 Colliers: ${totalFound} total results, ${results.length} returned`);

    // Parse and filter results
    const parsedListings: ColliersListing[] = [];
    for (const result of results) {
      try {
        const raw = result.raw || {};
        const parsed = parseCoveoResult(raw);
        if (parsed) {
          parsedListings.push(parsed);
        }
      } catch (err) {
        const id = result.raw?.['propertyz32xid'] || 'unknown';
        errors.push(`Error parsing Colliers result ${id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    console.log(`🔵 Colliers: ${parsedListings.length} office/industrial listings after filtering`);

    // No detail page enrichment during main scrape — handled separately
    // by enrichMissingOccupancyCosts() after listings are saved
    listings.push(...parsedListings);
    console.log(`🔵 Colliers: Scrape complete. ${listings.length} listings extracted.`);

  } catch (err) {
    const errMsg = `Colliers scraper error: ${err instanceof Error ? err.message : String(err)}`;
    errors.push(errMsg);
    console.error(`🔵 ${errMsg}`);
  } finally {
    clearTimeout(globalTimeout);
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

/**
 * Enrich Colliers listings that are missing occupancy costs.
 * Visits detail pages one at a time, up to `maxPages` per call.
 * Designed to be called after saveListings() with URLs that need enrichment.
 */
export async function enrichColliersOccupancyCosts(
  urlsToEnrich: Array<{ id: number; sourceUrl: string; address: string }>,
  maxPages = 10,
): Promise<{ enriched: Array<{ id: number; occupancyCost: number | null; askingRent: number | null; rentBasis: string | null }>; errors: string[] }> {
  const enriched: Array<{ id: number; occupancyCost: number | null; askingRent: number | null; rentBasis: string | null }> = [];
  const errors: string[] = [];

  if (urlsToEnrich.length === 0) return { enriched, errors };

  const batch = urlsToEnrich.slice(0, maxPages);
  console.log(`🔵 Colliers enrichment: visiting ${batch.length} detail pages (${urlsToEnrich.length} total missing)...`);

  let browser: Browser | null = null;
  const globalTimeout = setTimeout(async () => {
    if (browser) { try { await browser.close(); } catch {} browser = null; }
    errors.push('Enrichment global timeout (3min)');
  }, 3 * 60 * 1000);

  try {
    browser = await chromium.launch({
      headless: false,
      channel: 'chrome',
      args: ['--disable-blink-features=AutomationControlled'],
    });

    const page = await browser.newPage({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
    });

    // Block images/fonts to speed up
    await page.route('**/*', (route) => {
      const resourceType = route.request().resourceType();
      if (['image', 'font', 'media'].includes(resourceType)) {
        route.abort();
      } else {
        route.continue();
      }
    });

    let consecutiveFailures = 0;

    for (const item of batch) {
      if (consecutiveFailures >= 3 || !browser) break;

      await delay(2000, 3000);

      try {
        console.log(`  📄 ${item.address}`);
        await page.goto(item.sourceUrl, { waitUntil: 'domcontentloaded', timeout: 12000 });
        await page.waitForTimeout(1500);

        const title = await page.title();
        if (title.includes('Just a moment') || title.includes('Attention')) {
          consecutiveFailures++;
          continue;
        }
        consecutiveFailures = 0;

        const pageText = await page.evaluate(() => {
          const main = document.querySelector('main');
          return main?.textContent || document.body.textContent || '';
        });

        const occCost = parseOccupancyCost(pageText);
        const { rate, basis } = parseLeaseRate(pageText);

        enriched.push({
          id: item.id,
          occupancyCost: occCost,
          askingRent: rate,
          rentBasis: basis,
        });
      } catch (err) {
        consecutiveFailures++;
        errors.push(`Enrichment error for ${item.address}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    errors.push(`Enrichment browser error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(globalTimeout);
    if (browser) { try { await browser.close(); } catch {} }
  }

  console.log(`🔵 Colliers enrichment: ${enriched.filter(e => e.occupancyCost !== null).length} occ costs found from ${enriched.length} pages visited`);
  return { enriched, errors };
}
