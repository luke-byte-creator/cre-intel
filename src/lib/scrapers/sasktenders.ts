/**
 * Sasktenders Scraper
 * Scrapes the default search results page and filters for CRE-relevant tenders
 * Source: https://sasktenders.ca/content/public/Search.aspx
 */
import * as cheerio from "cheerio";
import { execSync } from "child_process";

export interface SaskTender {
  tenderName: string;
  organization: string;
  closingDate: string | null;
  description: string | null;
  category: string;
  status: string;
  sourceUrl: string;
  tenderId: string | null;
}

export interface SasktendersResult {
  tenders: SaskTender[];
  totalOnSite: number;
  errors: string[];
}

const CRE_KEYWORDS = [
  "lease", "leasing", "real estate", "property", "building", "office",
  "warehouse", "facility", "facilities", "renovation", "construction",
  "tenant", "commercial space", "janitorial", "cleaning", "maintenance",
  "HVAC", "elevator", "parking", "demolition", "land", "zoning",
];

function isCRERelevant(name: string, org: string): string | null {
  const text = `${name} ${org}`.toLowerCase();
  for (const kw of CRE_KEYWORDS) {
    if (text.includes(kw.toLowerCase())) return kw;
  }
  return null;
}

export async function scrapeSasktenders(): Promise<SasktendersResult> {
  const url = "https://sasktenders.ca/content/public/Search.aspx";
  const errors: string[] = [];
  const tenders: SaskTender[] = [];
  let totalOnSite = 0;

  try {
    console.log("Fetching Sasktenders...");
    let html: string;
    try {
      html = execSync(
        `curl -s -L --max-time 30 -H "User-Agent: Mozilla/5.0 (compatible; NovaResearch/1.0)" "${url}"`,
        { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
      );
    } catch (e: any) {
      errors.push(`Fetch failed: ${e.message}`);
      return { tenders, totalOnSite, errors };
    }

    console.log(`Sasktenders: Got ${html.length} chars`);
    const $ = cheerio.load(html);

    // Find result count
    const countText = $("body").text().match(/returned\s+(\d+)\s+results/i);
    if (countText) totalOnSite = parseInt(countText[1]);

    // Each tender is in a table row or repeated block
    // From the fetched content, tenders appear as structured blocks with:
    // tender name, organization, tender ID, posted date, closing date, status
    
    // The page uses a GridView or Repeater — let me find the actual structure
    const rows = $("table.GridView tr, table.DataGrid tr, .tender-row, tr").filter((_, el) => {
      const text = $(el).text();
      return text.includes("Open") || text.includes("Closed");
    });

    if (rows.length === 0) {
      // Try parsing from raw text — Sasktenders might render as divs
      // Parse the text-based format: Name, Org, ID, Posted, Closing, Status
      const bodyText = $("body").text();
      const tenderBlocks = bodyText.split(/(?=\n[A-Z][^\n]{10,}\n)/);
      
      // Alternative: try to find repeating patterns
      // Let's use a regex approach on the full text
      const fullText = bodyText.replace(/\s+/g, " ");
      
      // Look for patterns like "Tender Name Organization ID Date Date Status"
      console.log("Sasktenders: No table rows found, trying text extraction...");
      
      // The data appears as: TenderName \n Organization \n TenderID \n PostedDate \n ClosingDate \n Status
      // Let's find all "Open" occurrences and work backwards
      const lines = bodyText.split("\n").map(l => l.trim()).filter(l => l);
      
      let i = 0;
      while (i < lines.length) {
        // Look for status indicator
        if (lines[i] === "Open" || lines[i] === "Closed") {
          // Work backwards to find the tender info
          // Pattern: name, org, id, posted date, closing date, status
          const status = lines[i];
          
          // Look back for dates (format: "Mon DD, YYYY HH:MM AM/PM CST")
          let closingDate: string | null = null;
          let postedDate: string | null = null;
          let tenderId: string | null = null;
          let org: string | null = null;
          let name: string | null = null;
          
          // Go back up to 6 lines
          const block = lines.slice(Math.max(0, i - 6), i);
          
          // Find dates (CST suffix)
          const dateLines: number[] = [];
          block.forEach((line, idx) => {
            if (/CST$/.test(line)) dateLines.push(idx);
          });
          
          if (dateLines.length >= 2) {
            closingDate = block[dateLines[dateLines.length - 1]];
            postedDate = block[dateLines[dateLines.length - 2]];
            
            // ID is before posted date
            const idIdx = dateLines[dateLines.length - 2] - 1;
            if (idIdx >= 0) tenderId = block[idIdx];
            
            // Org is before ID
            const orgIdx = idIdx - 1;
            if (orgIdx >= 0) org = block[orgIdx];
            
            // Name is before org
            const nameIdx = orgIdx - 1;
            if (nameIdx >= 0) name = block[nameIdx];
          }
          
          if (name && org) {
            const keyword = isCRERelevant(name, org);
            if (keyword) {
              tenders.push({
                tenderName: name,
                organization: org,
                closingDate: closingDate,
                description: null,
                category: keyword,
                status: status.toLowerCase(),
                sourceUrl: `https://sasktenders.ca`,
                tenderId: tenderId,
              });
            }
          }
        }
        i++;
      }
      
      console.log(`Sasktenders: Extracted ${tenders.length} CRE-relevant tenders from ${totalOnSite} total`);
    } else {
      console.log(`Sasktenders: Found ${rows.length} table rows`);
      rows.each((_, row) => {
        const cells = $(row).find("td");
        if (cells.length < 4) return;
        
        const name = $(cells[0]).text().trim();
        const org = $(cells[1]).text().trim();
        const tenderId = $(cells[2]).text().trim();
        const closingDate = $(cells[4]).text().trim() || null;
        const status = $(cells[5]).text().trim() || "open";
        
        const keyword = isCRERelevant(name, org);
        if (keyword) {
          tenders.push({
            tenderName: name,
            organization: org,
            closingDate,
            description: null,
            category: keyword,
            status: status.toLowerCase(),
            sourceUrl: `https://sasktenders.ca`,
            tenderId: tenderId || null,
          });
        }
      });
    }
  } catch (e: any) {
    errors.push(`Scraper error: ${e.message}`);
    console.error("Sasktenders scraper error:", e);
  }

  return { tenders, totalOnSite, errors };
}

// Legacy export for manager compatibility
export const sasktendersScraper = { 
  scrape: scrapeSasktenders 
};
