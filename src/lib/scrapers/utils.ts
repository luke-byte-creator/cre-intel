/**
 * Shared scraping utilities for Nova CRE Intelligence Platform
 * Browser pool, rate limiting, retry logic, robots.txt checking
 */

import { chromium, Browser, Page } from 'playwright';

// Browser pool for managing Playwright instances
class BrowserPool {
  private browsers: Browser[] = [];
  private maxBrowsers = 3;
  private currentIndex = 0;

  async getBrowser(): Promise<Browser> {
    if (this.browsers.length === 0) {
      await this.initializeBrowsers();
    }
    
    const browser = this.browsers[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.browsers.length;
    return browser;
  }

  private async initializeBrowsers(): Promise<void> {
    for (let i = 0; i < this.maxBrowsers; i++) {
      const browser = await chromium.launch({
        headless: true,
        args: ['--disable-blink-features=AutomationControlled'],
      });
      this.browsers.push(browser);
    }
  }

  async closeAll(): Promise<void> {
    await Promise.all(this.browsers.map(browser => browser.close()));
    this.browsers = [];
  }
}

export const browserPool = new BrowserPool();

// Rate limiter to ensure 2-3 second delays between requests
class RateLimiter {
  private lastRequest = 0;
  private minDelay = 2000; // 2 seconds minimum
  private maxDelay = 3000; // 3 seconds maximum

  async wait(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequest;
    const delay = Math.random() * (this.maxDelay - this.minDelay) + this.minDelay;
    
    if (elapsed < delay) {
      const remaining = delay - elapsed;
      await new Promise(resolve => setTimeout(resolve, remaining));
    }
    
    this.lastRequest = Date.now();
  }
}

export const rateLimiter = new RateLimiter();

// Retry logic with exponential backoff
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Log the error but continue retrying
      console.warn(`Attempt ${attempt + 1} failed, retrying...`, error);
      
      // Exponential backoff with jitter
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error('Unreachable'); // TypeScript satisfaction
}

// Robots.txt checker
export async function checkRobots(url: string, userAgent = '*'): Promise<boolean> {
  try {
    const urlObj = new URL(url);
    const robotsUrl = `${urlObj.protocol}//${urlObj.host}/robots.txt`;
    
    const response = await fetch(robotsUrl);
    if (!response.ok) {
      // If robots.txt doesn't exist, assume scraping is allowed
      return true;
    }
    
    const robotsContent = await response.text();
    const lines = robotsContent.split('\n').map(line => line.trim());
    
    let currentUserAgent = '';
    let disallowedPaths: string[] = [];
    
    for (const line of lines) {
      if (line.startsWith('User-agent:')) {
        if (currentUserAgent === userAgent || currentUserAgent === '*') {
          break; // We've finished parsing rules for our user agent
        }
        currentUserAgent = line.split(':')[1].trim();
        disallowedPaths = [];
      } else if ((currentUserAgent === userAgent || currentUserAgent === '*') && line.startsWith('Disallow:')) {
        const path = line.split(':')[1].trim();
        if (path) {
          disallowedPaths.push(path);
        }
      }
    }
    
    // Check if the URL path is disallowed
    const urlPath = urlObj.pathname;
    return !disallowedPaths.some(disallowed => {
      if (disallowed === '/') return false; // Complete disallow - we'll respect this
      return urlPath.startsWith(disallowed);
    });
  } catch (error) {
    console.warn('Failed to check robots.txt, assuming allowed:', error);
    return true;
  }
}

// User agent rotation
const userAgents = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
];

export function getRandomUserAgent(): string {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

// Create a new page with proper settings
export async function createScrapingPage(browser: Browser): Promise<Page> {
  const page = await browser.newPage({
    userAgent: getRandomUserAgent(),
    viewport: { width: 1920, height: 1080 },
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    },
  });

  // Block unnecessary resources to speed up scraping
  await page.route('**/*', (route) => {
    const resourceType = route.request().resourceType();
    if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
      route.abort();
    } else {
      route.continue();
    }
  });

  return page;
}

// Clean up text content
export function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[\r\n\t]/g, ' ')
    .trim();
}

// Parse address from text
export function parseAddress(text: string): string | null {
  const addressPattern = /\d+[\s\-][\w\s]+(ST|AVE|DR|RD|BLVD|CRES|PL|WAY|LANE|CRT|TERR|PKWY|HWY|CIRCLE|MANOR|MEWS|TRAIL|GATE|Bend|Pkwy)[\s\w]*[NSEW]?/i;
  const match = text.match(addressPattern);
  return match ? cleanText(match[0]) : null;
}

// Parse square footage from text
export function parseSquareFeet(text: string): number | null {
  const patterns = [
    /(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:sq\.?\s*ft\.?|square\s+feet|sf)\b/i,
    /(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*sf\b/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return parseInt(match[1].replace(/,/g, ''));
    }
  }
  
  return null;
}

// Parse price from text
export function parsePrice(text: string): number | null {
  const pricePattern = /\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/;
  const match = text.match(pricePattern);
  return match ? parseFloat(match[1].replace(/,/g, '')) : null;
}

// Determine property type
export function classifyPropertyType(text: string): string | null {
  const lowerText = text.toLowerCase();
  
  if (lowerText.includes('office') || lowerText.includes('executive suite')) {
    return 'office';
  } else if (lowerText.includes('industrial') || lowerText.includes('warehouse') || lowerText.includes('manufacturing')) {
    return 'industrial';
  } else if (lowerText.includes('multi') || lowerText.includes('apartment') || lowerText.includes('residential')) {
    return 'multi-family';
  } else if (lowerText.includes('retail') || lowerText.includes('commercial')) {
    return 'retail';
  }
  
  return null;
}

// Property type filter - only scrape office, industrial, multi-family
export function shouldScrapePropertyType(propertyType: string | null): boolean {
  if (!propertyType) return false;
  return ['office', 'industrial', 'multi-family'].includes(propertyType);
}