/**
 * E-Permitting Scraper for Nova CRE Intelligence Platform
 * Scrapes City of Saskatoon e-permitting system for commercial permits >= $350k
 * Source: https://lmspublic.saskatoon.ca/lms/pub/lmsguest/Default.aspx?PosseMenuName=PC_Search
 */

import { Page } from 'playwright';
import { browserPool, rateLimiter, withRetry, createScrapingPage, cleanText } from './utils';
import { parseValueDate } from '../parsers/building-permits'; // Reuse existing logic

export interface EPermitRecord {
  permitNumber: string;
  permitDate: string | null;
  address: string;
  owner: string | null;
  permitValue: number;
  description: string | null;
  permitStatus: string | null;
  workType: string;
}

export interface EPermittingResult {
  permits: EPermitRecord[];
  metadata: {
    searchedFrom: string;
    searchedTo: string;
    totalFound: number;
    totalProcessed: number;
  };
}

export class EPermittingScraper {
  private baseUrl = 'https://lmspublic.saskatoon.ca/lms/pub/lmsguest/Default.aspx?PosseMenuName=PC_Search';
  private minValue = 350000; // $350k minimum

  async scrape(fromDate?: string, toDate?: string): Promise<EPermittingResult> {
    console.log('Starting e-permitting scraper...');
    
    // Default to January 2025 for proof of concept
    const searchFrom = fromDate || '2025-01-01';
    const searchTo = toDate || new Date().toISOString().split('T')[0];
    
    const browser = await browserPool.getBrowser();
    const page = await createScrapingPage(browser);
    
    try {
      const permits = await withRetry(() => this.scrapePermits(page, searchFrom, searchTo));
      
      return {
        permits,
        metadata: {
          searchedFrom: searchFrom,
          searchedTo: searchTo,
          totalFound: permits.length,
          totalProcessed: permits.length,
        },
      };
    } finally {
      await page.close();
    }
  }

  private async scrapePermits(page: Page, fromDate: string, toDate: string): Promise<EPermitRecord[]> {
    await rateLimiter.wait();
    
    console.log(`Navigating to e-permitting system...`);
    await page.goto(this.baseUrl, { waitUntil: 'networkidle' });
    
    // Wait for the search form to load
    await page.waitForSelector('#ctl00_MainContent_txtPermitNumber', { timeout: 10000 });
    
    console.log('Setting up search filters...');
    
    // Set permit type filter to commercial (COMM)
    await page.fill('#ctl00_MainContent_txtPermitNumber', 'COMM-*');
    
    // Set date range
    await page.fill('#ctl00_MainContent_txtFromDate', this.formatDateForForm(fromDate));
    await page.fill('#ctl00_MainContent_txtToDate', this.formatDateForForm(toDate));
    
    // Set minimum value filter if available
    const valueField = await page.$('#ctl00_MainContent_txtMinValue');
    if (valueField) {
      await page.fill('#ctl00_MainContent_txtMinValue', this.minValue.toString());
    }
    
    console.log('Submitting search...');
    await rateLimiter.wait();
    
    // Submit the search form
    await page.click('#ctl00_MainContent_btnSearch');
    await page.waitForLoadState('networkidle');
    
    // Handle potential pagination and collect all results
    const allPermits: EPermitRecord[] = [];
    let pageNum = 1;
    
    while (true) {
      console.log(`Processing page ${pageNum}...`);
      
      const pagePermits = await this.extractPermitsFromPage(page);
      allPermits.push(...pagePermits);
      
      // Check for next page
      const nextButton = await page.$('#ctl00_MainContent_GridView1_ctl01_NextPageButton');
      const hasNextPage = nextButton && await nextButton.isEnabled();
      
      if (!hasNextPage) {
        break;
      }
      
      await rateLimiter.wait();
      await nextButton!.click();
      await page.waitForLoadState('networkidle');
      pageNum++;
    }
    
    console.log(`Found ${allPermits.length} permits, filtering by value >= $${this.minValue}`);
    
    // Filter by minimum value and commercial type
    const filteredPermits = allPermits.filter(permit => {
      return permit.permitValue >= this.minValue && 
             permit.workType === 'COMM-' &&
             permit.permitNumber.startsWith('COMM-');
    });
    
    console.log(`${filteredPermits.length} permits meet criteria`);
    return filteredPermits;
  }

  private async extractPermitsFromPage(page: Page): Promise<EPermitRecord[]> {
    const permits: EPermitRecord[] = [];
    
    // Look for the results grid/table
    const resultsTable = await page.$('#ctl00_MainContent_GridView1');
    if (!resultsTable) {
      console.warn('No results table found on page');
      return permits;
    }
    
    // Extract rows from the table
    const rows = await page.$$('#ctl00_MainContent_GridView1 tr');
    
    for (let i = 1; i < rows.length; i++) { // Skip header row
      const row = rows[i];
      const cells = await row.$$('td');
      
      if (cells.length < 6) continue; // Ensure we have enough columns
      
      try {
        const permitNumber = cleanText(await cells[0].textContent() || '');
        const permitDateText = cleanText(await cells[1].textContent() || '');
        const address = cleanText(await cells[2].textContent() || '');
        const owner = cleanText(await cells[3].textContent() || '') || null;
        const valueText = cleanText(await cells[4].textContent() || '');
        const description = cleanText(await cells[5].textContent() || '') || null;
        const status = cleanText(await cells[6]?.textContent() || '') || null;
        
        // Parse permit value using existing building-permits logic
        const { value: permitValue, issueDate } = parseValueDate(valueText);
        
        // Use the parsed date or fall back to the date column
        let permitDate = issueDate;
        if (!permitDate && permitDateText) {
          permitDate = this.parsePermitDate(permitDateText);
        }
        
        if (permitNumber && address && permitValue > 0) {
          permits.push({
            permitNumber,
            permitDate,
            address,
            owner,
            permitValue,
            description,
            permitStatus: status,
            workType: 'COMM-', // We're filtering for commercial permits
          });
        }
      } catch (error) {
        console.warn('Error parsing permit row:', error);
        continue;
      }
    }
    
    return permits;
  }

  private formatDateForForm(dateString: string): string {
    // Convert YYYY-MM-DD to MM/DD/YYYY for the form
    const date = new Date(dateString);
    return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
  }

  private parsePermitDate(dateText: string): string | null {
    try {
      // Handle various date formats that might come from the system
      const patterns = [
        /(\d{1,2})\/(\d{1,2})\/(\d{4})/, // MM/DD/YYYY
        /(\d{4})-(\d{1,2})-(\d{1,2})/, // YYYY-MM-DD
        /(\d{1,2})-(\d{1,2})-(\d{4})/, // MM-DD-YYYY
      ];
      
      for (const pattern of patterns) {
        const match = dateText.match(pattern);
        if (match) {
          const [, p1, p2, p3] = match;
          
          // Determine if it's MM/DD/YYYY or YYYY-MM-DD format
          if (p3.length === 4) { // MM/DD/YYYY or MM-DD-YYYY
            const month = parseInt(p1);
            const day = parseInt(p2);
            const year = parseInt(p3);
            return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          } else if (p1.length === 4) { // YYYY-MM-DD
            const year = parseInt(p1);
            const month = parseInt(p2);
            const day = parseInt(p3);
            return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          }
        }
      }
      
      return null;
    } catch (error) {
      console.warn('Error parsing date:', dateText, error);
      return null;
    }
  }
}

// Export singleton instance
export const epermittingScraper = new EPermittingScraper();