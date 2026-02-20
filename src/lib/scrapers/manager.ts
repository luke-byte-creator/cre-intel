/**
 * Scraper Manager for Nova CRE Intelligence Platform
 * Coordinates all scrapers and manages database operations
 */

import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { eq, and, desc, sql, isNull, like } from 'drizzle-orm';
import { 
  scrapedListings, 
  scrapedPermits, 
  scrapedTenders, 
  scrapedAssessments, 
  scraperRuns,
  mutedAddresses,
  officeUnits,
  industrialVacancies,
  suburbanOfficeListings,
  listingChanges,
} from '@/db/schema';

// Import scrapers
import { epermittingScraper, EPermitRecord } from './epermitting';
import { scrapeICR } from './icr-commercial';
import { scrapeCBRE } from './cbre-commercial';
import { scrapeColliers, enrichColliersOccupancyCosts } from './colliers-commercial';
import { scrapeSasktenders, SaskTender } from './sasktenders';
import { scrapeCushman } from './cushman-wakefield';
import { scrapeCommGroup } from './commercial-group';
import { scrapeConcorde } from './concorde-properties';
import { scrapeFortress } from './fortress-properties';
import { scrapeReddee } from './reddee-properties';
import { browserPool } from './utils';
import { scrapeCityAssessments } from './city-assessments';
import { matchCityAssessments } from './city-assessment-matcher';

export type ScraperSource = 'epermitting' | 'icr' | 'cbre' | 'colliers' | 'sasktenders' | 'assessments' | 'cushman' | 'commgroup' | 'concorde' | 'fortress' | 'reddee' | 'city_assessments';

export interface ScraperRunResult {
  source: ScraperSource;
  status: 'completed' | 'failed' | 'partial';
  itemsFound: number;
  itemsNew: number;
  itemsUpdated: number;
  errors: string[];
  duration: number;
  metadata?: any;
}

export class ScraperManager {
  private db: ReturnType<typeof drizzle>;

  constructor(dbPath?: string) {
    const sqlite = new Database(dbPath || 'data/cre-intel.db');
    this.db = drizzle(sqlite);
  }

  async runScraper(source: ScraperSource): Promise<ScraperRunResult> {
    const startTime = Date.now();
    console.log(`\n🚀 Starting scraper: ${source.toUpperCase()}`);
    
    // Create run record
    const [runRecord] = await this.db.insert(scraperRuns).values({
      source,
      status: 'running',
      itemsFound: 0,
      itemsProcessed: 0,
      itemsNew: 0,
      itemsUpdated: 0,
    }).returning();
    
    try {
      let result: ScraperRunResult;
      
      switch (source) {
        case 'epermitting':
          result = await this.runEPermittingScraper();
          break;
        case 'icr':
          result = await this.runICRScraper();
          break;
        case 'cbre':
          result = await this.runCBREScraper();
          break;
        case 'colliers':
          result = await this.runColliersScraper();
          break;
        case 'sasktenders':
          result = await this.runSasktendersScraper();
          break;
        case 'cushman':
          result = await this.runCushmanScraper();
          break;
        case 'commgroup':
          result = await this.runCommGroupScraper();
          break;
        case 'concorde':
          result = await this.runConcordeScraper();
          break;
        case 'fortress':
          result = await this.runFortressScraper();
          break;
        case 'reddee':
          result = await this.runReddeeScraper();
          break;
        case 'city_assessments': {
          const caResult = await scrapeCityAssessments();
          const matchResult = await matchCityAssessments();
          result = {
            source: 'city_assessments',
            status: 'completed',
            itemsFound: caResult.totalFetched,
            itemsNew: caResult.inserted,
            itemsUpdated: caResult.updated,
            errors: [...caResult.errors, ...matchResult.errors],
            duration: 0,
            metadata: { matchStats: matchResult },
          };
          break;
        }
        case 'assessments':
          // Legacy — redirect to city_assessments
          result = await this.runScraper('city_assessments' as ScraperSource);
          break;
        default:
          throw new Error(`Unknown scraper source: ${source}`);
      }
      
      result.duration = Date.now() - startTime;
      
      // Update run record
      await this.db.update(scraperRuns)
        .set({
          status: result.status,
          itemsFound: result.itemsFound,
          itemsProcessed: result.itemsNew + result.itemsUpdated,
          itemsNew: result.itemsNew,
          itemsUpdated: result.itemsUpdated,
          errors: result.errors.length > 0 ? JSON.stringify(result.errors) : null,
          duration: result.duration,
          metadata: result.metadata ? JSON.stringify(result.metadata) : null,
          completedAt: new Date().toISOString(),
        })
        .where(eq(scraperRuns.id, runRecord.id));
      
      console.log(`✅ ${source.toUpperCase()} completed: ${result.itemsNew} new, ${result.itemsUpdated} updated, ${result.errors.length} errors`);
      return result;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Update run record with failure
      await this.db.update(scraperRuns)
        .set({
          status: 'failed',
          duration,
          errors: JSON.stringify([errorMessage]),
          completedAt: new Date().toISOString(),
        })
        .where(eq(scraperRuns.id, runRecord.id));
      
      console.error(`❌ ${source.toUpperCase()} failed:`, error);
      
      return {
        source,
        status: 'failed',
        itemsFound: 0,
        itemsNew: 0,
        itemsUpdated: 0,
        errors: [errorMessage],
        duration,
      };
    }
  }

  async runAllScrapers(): Promise<ScraperRunResult[]> {
    console.log('🌟 Starting all scrapers...');
    
    const sources: ScraperSource[] = ['epermitting', 'icr', 'cbre', 'colliers', 'sasktenders', 'cushman', 'commgroup', 'concorde', 'fortress', 'reddee'];
    const results: ScraperRunResult[] = [];
    
    for (const source of sources) {
      try {
        const result = await this.runScraper(source);
        results.push(result);
        
        // Brief pause between scrapers
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.error(`Error running ${source} scraper:`, error);
        results.push({
          source,
          status: 'failed',
          itemsFound: 0,
          itemsNew: 0,
          itemsUpdated: 0,
          errors: [error instanceof Error ? error.message : String(error)],
          duration: 0,
        });
      }
    }
    
    // Close browser pool
    await browserPool.closeAll();
    
    const summary = results.reduce((acc, result) => ({
      total: acc.total + 1,
      completed: acc.completed + (result.status === 'completed' ? 1 : 0),
      failed: acc.failed + (result.status === 'failed' ? 1 : 0),
      itemsNew: acc.itemsNew + result.itemsNew,
      itemsUpdated: acc.itemsUpdated + result.itemsUpdated,
    }), { total: 0, completed: 0, failed: 0, itemsNew: 0, itemsUpdated: 0 });
    
    console.log(`\n🎉 All scrapers complete: ${summary.completed}/${summary.total} successful, ${summary.itemsNew} new items, ${summary.itemsUpdated} updated`);
    
    return results;
  }

  private async runEPermittingScraper(): Promise<ScraperRunResult> {
    const result = await epermittingScraper.scrape();
    const { itemsNew, itemsUpdated } = await this.savePermits(result.permits);
    
    return {
      source: 'epermitting',
      status: 'completed',
      itemsFound: result.permits.length,
      itemsNew,
      itemsUpdated,
      errors: [],
      duration: 0,
      metadata: result.metadata,
    };
  }

  private async runICRScraper(): Promise<ScraperRunResult> {
    const result = await scrapeICR();
    
    // Map camelCase scraper output to snake_case for DB
    const dbListings = result.listings.map(l => ({
      source_url: l.sourceUrl,
      address: l.address,
      suite: l.suite,
      property_type: l.propertyType,
      property_type_flag: l.propertyTypeFlag,
      listing_type: l.listingType,
      asking_price: l.askingPrice,
      asking_rent: l.askingRent,
      rent_basis: l.rentBasis,
      square_feet: l.squareFeet,
      occupancy_cost: l.occupancyCost,
      description: l.description,
      broker: l.broker,
      brokerage_firm: "ICR Commercial",
    }));
    
    const { itemsNew, itemsUpdated } = await this.saveListings(dbListings, 'ICR');
    
    return {
      source: 'icr',
      status: result.errors.length > 0 && result.listings.length === 0 ? 'failed' : 'completed',
      itemsFound: result.totalFound,
      itemsNew,
      itemsUpdated,
      errors: result.errors,
      duration: 0,
    };
  }

  private async runCBREScraper(): Promise<ScraperRunResult> {
    const result = await scrapeCBRE();
    
    const dbListings = result.listings.map(l => ({
      source_url: l.sourceUrl,
      address: l.address,
      suite: l.suite,
      property_type: l.propertyType,
      property_type_flag: l.propertyTypeFlag,
      listing_type: l.listingType,
      asking_price: l.askingPrice,
      asking_rent: l.askingRent,
      rent_basis: l.rentBasis,
      square_feet: l.squareFeet,
      occupancy_cost: l.occupancyCost,
      description: l.description,
      broker: l.broker,
      brokerage_firm: 'CBRE',
    }));
    
    const { itemsNew, itemsUpdated } = await this.saveListings(dbListings, 'CBRE');
    
    return {
      source: 'cbre',
      status: result.errors.length > 0 && result.listings.length === 0 ? 'failed' : 'completed',
      itemsFound: result.totalFound,
      itemsNew,
      itemsUpdated,
      errors: result.errors,
      duration: 0,
    };
  }

  private async runColliersScraper(): Promise<ScraperRunResult> {
    const result = await scrapeColliers();
    
    const dbListings = result.listings.map(l => ({
      source_url: l.sourceUrl,
      address: l.address,
      suite: l.suite,
      property_type: l.propertyType,
      property_type_flag: l.propertyTypeFlag,
      listing_type: l.listingType,
      asking_price: l.askingPrice,
      asking_rent: l.askingRent,
      rent_basis: l.rentBasis,
      square_feet: l.squareFeet,
      occupancy_cost: l.occupancyCost,
      description: l.description,
      broker: l.broker,
      brokerage_firm: 'Colliers',
    }));
    
    const { itemsNew, itemsUpdated } = await this.saveListings(dbListings, 'Colliers');
    
    // After saving, enrich listings missing occupancy costs (up to 10 per run)
    const allErrors = [...result.errors];
    try {
      const missing = this.db.select({
        id: scrapedListings.id,
        sourceUrl: scrapedListings.sourceUrl,
        address: scrapedListings.address,
      })
        .from(scrapedListings)
        .where(and(
          eq(scrapedListings.source, 'Colliers'),
          eq(scrapedListings.status, 'active'),
          isNull(scrapedListings.occupancyCost),
        ))
        .all()
        .filter(l => l.sourceUrl && !l.sourceUrl.includes('#')); // Skip fragment URLs (sub-units share parent's occ cost)

      if (missing.length > 0) {
        const { enriched, errors: enrichErrors } = await enrichColliersOccupancyCosts(
          missing.map(m => ({ id: m.id, sourceUrl: m.sourceUrl!, address: m.address })),
          10, // max 10 pages per run
        );
        allErrors.push(...enrichErrors);

        // Write enriched data back to DB
        for (const e of enriched) {
          const updates: any = {};
          if (e.occupancyCost !== null) updates.occupancyCost = e.occupancyCost;
          if (e.askingRent !== null) updates.askingRent = e.askingRent;
          if (e.rentBasis !== null) updates.rentBasis = e.rentBasis;
          if (Object.keys(updates).length > 0) {
            updates.updatedAt = new Date().toISOString();
            this.db.update(scrapedListings).set(updates).where(eq(scrapedListings.id, e.id)).run();
            
            // Also update any sub-unit listings sharing this parent URL
            // (fragment URLs like sourceUrl#unit-500 share the parent's occ cost)
            if (e.occupancyCost !== null) {
              const parentRec = this.db.select({ sourceUrl: scrapedListings.sourceUrl })
                .from(scrapedListings).where(eq(scrapedListings.id, e.id)).get();
              if (parentRec?.sourceUrl) {
                this.db.update(scrapedListings)
                  .set({ occupancyCost: e.occupancyCost, updatedAt: updates.updatedAt })
                  .where(and(
                    eq(scrapedListings.source, 'Colliers'),
                    like(scrapedListings.sourceUrl, parentRec.sourceUrl + '#%'),
                    isNull(scrapedListings.occupancyCost),
                  ))
                  .run();
              }
            }
          }
        }
        
        console.log(`🔵 Colliers: enriched ${enriched.filter(e => e.occupancyCost !== null).length} occ costs, ${missing.length - 10 > 0 ? missing.length - 10 : 0} still remaining`);
      }
    } catch (err) {
      allErrors.push(`Enrichment phase error: ${err instanceof Error ? err.message : String(err)}`);
    }
    
    return {
      source: 'colliers',
      status: result.errors.length > 0 && result.listings.length === 0 ? 'failed' : 'completed',
      itemsFound: result.totalFound,
      itemsNew,
      itemsUpdated,
      errors: allErrors,
      duration: 0,
    };
  }

  private async runSasktendersScraper(): Promise<ScraperRunResult> {
    const result = await scrapeSasktenders();
    
    // Map tender fields for DB
    const dbTenders = result.tenders.map(t => ({
      ...t,
      sourceUrl: t.sourceUrl,
    }));
    
    const { itemsNew, itemsUpdated } = await this.saveTenders(dbTenders);
    
    return {
      source: 'sasktenders',
      status: result.errors.length > 0 && result.tenders.length === 0 ? 'failed' : 'completed',
      itemsFound: result.totalOnSite,
      itemsNew,
      itemsUpdated,
      errors: result.errors,
      duration: 0,
    };
  }

  private async runCushmanScraper(): Promise<ScraperRunResult> {
    const result = await scrapeCushman();
    const dbListings = result.listings.map(l => ({
      source_url: l.sourceUrl, address: l.address, suite: l.suite,
      property_type: l.propertyType, property_type_flag: l.propertyTypeFlag,
      listing_type: l.listingType, asking_price: l.askingPrice,
      asking_rent: l.askingRent, rent_basis: l.rentBasis,
      square_feet: l.squareFeet, occupancy_cost: l.occupancyCost,
      description: l.description, broker: l.broker,
      brokerage_firm: "Cushman & Wakefield",
    }));
    const { itemsNew, itemsUpdated } = await this.saveListings(dbListings, 'Cushman');
    return {
      source: 'cushman', status: result.errors.length > 0 && result.listings.length === 0 ? 'failed' : 'completed',
      itemsFound: result.totalFound, itemsNew, itemsUpdated, errors: result.errors, duration: 0,
    };
  }

  private async runCommGroupScraper(): Promise<ScraperRunResult> {
    const result = await scrapeCommGroup();
    const dbListings = result.listings.map(l => ({
      source_url: l.sourceUrl, address: l.address, suite: l.suite,
      property_type: l.propertyType, property_type_flag: l.propertyTypeFlag,
      listing_type: l.listingType, asking_price: l.askingPrice,
      asking_rent: l.askingRent, rent_basis: l.rentBasis,
      square_feet: l.squareFeet, occupancy_cost: l.occupancyCost,
      description: l.description, broker: l.broker,
      brokerage_firm: "The Commercial Group",
    }));
    const { itemsNew, itemsUpdated } = await this.saveListings(dbListings, 'CommGroup');
    return {
      source: 'commgroup', status: result.errors.length > 0 && result.listings.length === 0 ? 'failed' : 'completed',
      itemsFound: result.totalFound, itemsNew, itemsUpdated, errors: result.errors, duration: 0,
    };
  }

  private async runConcordeScraper(): Promise<ScraperRunResult> {
    const result = await scrapeConcorde();
    const dbListings = result.listings.map(l => ({
      source_url: l.sourceUrl, address: l.address, suite: l.suite,
      property_type: l.propertyType, property_type_flag: l.propertyTypeFlag,
      listing_type: l.listingType, asking_price: l.askingPrice,
      asking_rent: l.askingRent, rent_basis: l.rentBasis,
      square_feet: l.squareFeet, occupancy_cost: l.occupancyCost,
      description: l.description, broker: l.broker,
      brokerage_firm: "Concorde Properties",
    }));
    const { itemsNew, itemsUpdated } = await this.saveListings(dbListings, 'Concorde');
    return {
      source: 'concorde', status: result.errors.length > 0 && result.listings.length === 0 ? 'failed' : 'completed',
      itemsFound: result.totalFound, itemsNew, itemsUpdated, errors: result.errors, duration: 0,
    };
  }

  private async runFortressScraper(): Promise<ScraperRunResult> {
    const result = await scrapeFortress();
    const dbListings = result.listings.map(l => ({
      source_url: l.sourceUrl, address: l.address, suite: l.suite,
      property_type: l.propertyType, property_type_flag: l.propertyTypeFlag,
      listing_type: l.listingType, asking_price: l.askingPrice,
      asking_rent: l.askingRent, rent_basis: l.rentBasis,
      square_feet: l.squareFeet, occupancy_cost: l.occupancyCost,
      description: l.description, broker: l.broker,
      brokerage_firm: "Fortress Properties",
    }));
    const { itemsNew, itemsUpdated } = await this.saveListings(dbListings, 'Fortress');
    return {
      source: 'fortress', status: result.errors.length > 0 && result.listings.length === 0 ? 'failed' : 'completed',
      itemsFound: result.totalFound, itemsNew, itemsUpdated, errors: result.errors, duration: 0,
    };
  }

  private async runReddeeScraper(): Promise<ScraperRunResult> {
    const result = await scrapeReddee();
    const dbListings = result.listings.map(l => ({
      source_url: l.sourceUrl, address: l.address, suite: l.suite,
      property_type: l.propertyType, property_type_flag: l.propertyTypeFlag,
      listing_type: l.listingType, asking_price: l.askingPrice,
      asking_rent: l.askingRent, rent_basis: l.rentBasis,
      square_feet: l.squareFeet, occupancy_cost: l.occupancyCost,
      description: l.description, broker: l.broker,
      brokerage_firm: "Reddee Properties",
    }));
    const { itemsNew, itemsUpdated } = await this.saveListings(dbListings, 'Reddee');
    return {
      source: 'reddee', status: result.errors.length > 0 && result.listings.length === 0 ? 'failed' : 'completed',
      itemsFound: result.totalFound, itemsNew, itemsUpdated, errors: result.errors, duration: 0,
    };
  }

  private normalizeAddress(address: string): string {
    return address.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private async saveListings(listings: any[], source: string): Promise<{ itemsNew: number; itemsUpdated: number }> {
    let itemsNew = 0;
    let itemsUpdated = 0;

    // Load muted addresses for auto-dismiss
    const muted = await this.db.select().from(mutedAddresses);
    const mutedNormalized = new Set(muted.map(m => m.addressNormalized || this.normalizeAddress(m.address)));
    
    for (const listing of listings) {
      try {
        // Match by source_url (unique per sub-listing)
        const existing = listing.source_url
          ? await this.db.select()
              .from(scrapedListings)
              .where(and(
                eq(scrapedListings.source, source),
                eq(scrapedListings.sourceUrl, listing.source_url)
              ))
              .limit(1)
          : await this.db.select()
              .from(scrapedListings)
              .where(and(
                eq(scrapedListings.source, source),
                eq(scrapedListings.address, listing.address),
                eq(scrapedListings.listingType, listing.listing_type)
              ))
              .limit(1);
        
        const now = new Date().toISOString();
        const rawData = JSON.stringify(listing);

        // Check if address is muted
        const normalizedAddr = this.normalizeAddress(listing.address);
        const isMuted = mutedNormalized.has(normalizedAddr);
        
        if (existing.length === 0) {
          // New listing
          await this.db.insert(scrapedListings).values({
            source,
            sourceUrl: listing.source_url,
            address: listing.address,
            suite: listing.suite || null,
            propertyType: listing.property_type,
            propertyTypeFlag: listing.property_type_flag || null,
            listingType: listing.listing_type,
            askingPrice: listing.asking_price,
            askingRent: listing.asking_rent,
            rentBasis: listing.rent_basis || null,
            squareFeet: listing.square_feet,
            description: listing.description,
            broker: listing.broker,
            occupancyCost: listing.occupancy_cost || null,
            brokerageFirm: listing.brokerage_firm,
            status: 'active',
            dismissed: isMuted ? 1 : 0,
            rawData,
            firstSeen: now,
            lastSeen: now,
          });
          itemsNew++;
        } else {
          // Update existing
          await this.db.update(scrapedListings)
            .set({
              lastSeen: now,
              askingPrice: listing.asking_price,
              askingRent: listing.asking_rent,
              rentBasis: listing.rent_basis || null,
              squareFeet: listing.square_feet,
              suite: listing.suite || null,
              propertyTypeFlag: listing.property_type_flag || null,
              occupancyCost: listing.occupancy_cost || null,
              description: listing.description,
              broker: listing.broker,
              rawData,
              updatedAt: now,
            })
            .where(eq(scrapedListings.id, existing[0].id));
          itemsUpdated++;
        }
      } catch (error) {
        console.warn(`Error saving listing ${listing.address}:`, error);
      }
    }
    
    // Auto-update production tables for already-released listings
    await this.autoUpdateReleasedListings(source);
    
    return { itemsNew, itemsUpdated };
  }

  /**
   * Auto-update production tables when scraped data changes for already-released listings.
   * Also flags listings that disappeared as "possibly leased" for review.
   */
  private async autoUpdateReleasedListings(source: string): Promise<void> {
    const now = new Date().toISOString();
    
    // Get all released listings for this source
    const released = this.db.select()
      .from(scrapedListings)
      .where(and(
        eq(scrapedListings.source, source),
      ))
      .all()
      .filter(l => l.releasedTo); // Only released ones

    for (const sl of released) {
      try {
        if (sl.releasedTo === 'office_units') {
          // Find matching office unit by source_ref (sourceUrl)
          const units = this.db.select().from(officeUnits)
            .where(eq(officeUnits.sourceRef, sl.sourceUrl))
            .all();
          
          for (const unit of units) {
            const changes: { field: string; old: string; new_: string }[] = [];
            const updates: Partial<typeof officeUnits.$inferInsert> = {};
            
            if (sl.askingRent !== null && unit.askingRent !== sl.askingRent) {
              changes.push({ field: 'asking_rent', old: String(unit.askingRent ?? ''), new_: String(sl.askingRent) });
              updates.askingRent = sl.askingRent;
            }
            if (sl.occupancyCost !== null && unit.occupancyCost !== sl.occupancyCost) {
              changes.push({ field: 'occupancy_cost', old: String(unit.occupancyCost ?? ''), new_: String(sl.occupancyCost) });
              updates.occupancyCost = sl.occupancyCost;
            }
            if (sl.squareFeet && unit.areaSF !== sl.squareFeet) {
              changes.push({ field: 'area_sf', old: String(unit.areaSF ?? ''), new_: String(sl.squareFeet) });
              updates.areaSF = sl.squareFeet;
            }
            
            if (Object.keys(updates).length > 0) {
              updates.lastSeen = now;
              updates.updatedAt = now;
              this.db.update(officeUnits).set(updates).where(eq(officeUnits.id, unit.id)).run();
              
              for (const c of changes) {
                this.db.insert(listingChanges).values({
                  sourceTable: 'office_units', sourceRecordId: unit.id, scrapedListingId: sl.id,
                  changeType: c.field.includes('rent') || c.field.includes('cost') ? 'rate_change' : 'sf_change',
                  field: c.field, oldValue: c.old, newValue: c.new_, status: 'reviewed',
                }).run();
              }
            }
          }
        } else if (sl.releasedTo === 'industrial_vacancies') {
          const vacancies = this.db.select().from(industrialVacancies)
            .where(eq(industrialVacancies.sourceUrl, sl.sourceUrl))
            .all();
          
          for (const v of vacancies) {
            const changes: { field: string; old: string; new_: string }[] = [];
            const updates: Partial<typeof industrialVacancies.$inferInsert> = {};
            
            if (sl.askingRent !== null && v.askingRent !== sl.askingRent) {
              changes.push({ field: 'asking_rent', old: String(v.askingRent ?? ''), new_: String(sl.askingRent) });
              updates.askingRent = sl.askingRent;
            }
            if (sl.occupancyCost !== null && v.occupancyCost !== sl.occupancyCost) {
              changes.push({ field: 'occupancy_cost', old: String(v.occupancyCost ?? ''), new_: String(sl.occupancyCost) });
              updates.occupancyCost = sl.occupancyCost;
            }
            if (sl.squareFeet && v.availableSF !== sl.squareFeet) {
              changes.push({ field: 'available_sf', old: String(v.availableSF ?? ''), new_: String(sl.squareFeet) });
              updates.availableSF = sl.squareFeet;
            }
            
            // Always update lastSeen when the listing is still active
            updates.lastSeen = now;
            
            if (Object.keys(updates).length > 0) {
              updates.updatedAt = now;
              this.db.update(industrialVacancies).set(updates).where(eq(industrialVacancies.id, v.id)).run();
              
              for (const c of changes) {
                this.db.insert(listingChanges).values({
                  sourceTable: 'industrial_vacancies', sourceRecordId: v.id, scrapedListingId: sl.id,
                  changeType: c.field.includes('rent') || c.field.includes('cost') ? 'rate_change' : 'sf_change',
                  field: c.field, oldValue: c.old, newValue: c.new_, status: 'reviewed',
                }).run();
              }
            }
          }
        } else if (sl.releasedTo === 'suburban_office') {
          const subs = this.db.select().from(suburbanOfficeListings)
            .where(eq(suburbanOfficeListings.sourceUrl, sl.sourceUrl))
            .all();
          
          for (const s of subs) {
            const changes: { field: string; old: string; new_: string }[] = [];
            const updates: Partial<typeof suburbanOfficeListings.$inferInsert> = {};
            
            if (sl.askingRent !== null && s.askingRent !== sl.askingRent) {
              changes.push({ field: 'asking_rent', old: String(s.askingRent ?? ''), new_: String(sl.askingRent) });
              updates.askingRent = sl.askingRent;
            }
            if (sl.occupancyCost !== null && s.occupancyCost !== sl.occupancyCost) {
              changes.push({ field: 'occupancy_cost', old: String(s.occupancyCost ?? ''), new_: String(sl.occupancyCost) });
              updates.occupancyCost = sl.occupancyCost;
            }
            if (sl.squareFeet && s.squareFeet !== sl.squareFeet) {
              changes.push({ field: 'square_feet', old: String(s.squareFeet ?? ''), new_: String(sl.squareFeet) });
              updates.squareFeet = sl.squareFeet;
            }
            
            if (Object.keys(updates).length > 0) {
              updates.lastSeen = now;
              updates.updatedAt = now;
              this.db.update(suburbanOfficeListings).set(updates).where(eq(suburbanOfficeListings.id, s.id)).run();
              
              for (const c of changes) {
                this.db.insert(listingChanges).values({
                  sourceTable: 'suburban_office_listings', sourceRecordId: s.id, scrapedListingId: sl.id,
                  changeType: c.field.includes('rent') || c.field.includes('cost') ? 'rate_change' : 'sf_change',
                  field: c.field, oldValue: c.old, newValue: c.new_, status: 'reviewed',
                }).run();
              }
            }
          }
        }

        // Check for disappeared listings (possibly leased)
        // A listing with released_to but status != 'active' or last_seen is old
        const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
        if (sl.lastSeen && sl.lastSeen < fourteenDaysAgo && sl.status === 'active') {
          // Check if we already flagged this
          const existingFlag = this.db.select().from(listingChanges)
            .where(and(
              eq(listingChanges.scrapedListingId, sl.id),
              eq(listingChanges.changeType, 'possibly_leased'),
              eq(listingChanges.status, 'pending_review'),
            )).all();
          
          if (existingFlag.length === 0) {
            this.db.insert(listingChanges).values({
              sourceTable: sl.releasedTo!,
              sourceRecordId: sl.id, // We'll use scraped listing ID as reference
              scrapedListingId: sl.id,
              changeType: 'possibly_leased',
              field: null,
              oldValue: sl.lastSeen,
              newValue: null,
              status: 'pending_review', // Luke needs to review these
            }).run();
            console.log(`Flagged ${sl.address} (${sl.suite || 'no suite'}) as possibly leased — last seen ${sl.lastSeen}`);
          }
        }
      } catch (error) {
        console.warn(`Auto-update error for ${sl.address}:`, error);
      }
    }
  }

  private async savePermits(permits: EPermitRecord[]): Promise<{ itemsNew: number; itemsUpdated: number }> {
    let itemsNew = 0;
    let itemsUpdated = 0;
    
    for (const permit of permits) {
      try {
        // Check if permit already exists (by permit number)
        const existing = await this.db.select()
          .from(scrapedPermits)
          .where(eq(scrapedPermits.permitNumber, permit.permitNumber))
          .limit(1);
        
        const now = new Date().toISOString();
        const rawData = JSON.stringify(permit);
        
        if (existing.length === 0) {
          // New permit
          await this.db.insert(scrapedPermits).values({
            source: 'saskatoon-epermitting',
            permitNumber: permit.permitNumber,
            permitDate: permit.permitDate,
            address: permit.address,
            owner: permit.owner,
            permitValue: permit.permitValue,
            description: permit.description,
            permitStatus: permit.permitStatus,
            workType: permit.workType,
            rawData,
            firstSeen: now,
            lastSeen: now,
          });
          itemsNew++;
        } else {
          // Update existing
          await this.db.update(scrapedPermits)
            .set({
              lastSeen: now,
              permitStatus: permit.permitStatus,
              rawData,
              updatedAt: now,
            })
            .where(eq(scrapedPermits.id, existing[0].id));
          itemsUpdated++;
        }
      } catch (error) {
        console.warn(`Error saving permit ${permit.permitNumber}:`, error);
      }
    }
    
    return { itemsNew, itemsUpdated };
  }

  private async saveTenders(tenders: SaskTender[]): Promise<{ itemsNew: number; itemsUpdated: number }> {
    let itemsNew = 0;
    let itemsUpdated = 0;
    
    for (const tender of tenders) {
      try {
        // Check if tender already exists (by tender name + organization)
        const existing = await this.db.select()
          .from(scrapedTenders)
          .where(and(
            eq(scrapedTenders.tenderName, tender.tenderName),
            eq(scrapedTenders.organization, tender.organization)
          ))
          .limit(1);
        
        const now = new Date().toISOString();
        const rawData = JSON.stringify(tender);
        
        if (existing.length === 0) {
          // New tender
          await this.db.insert(scrapedTenders).values({
            source: 'sasktenders',
            sourceUrl: tender.sourceUrl,
            tenderName: tender.tenderName,
            organization: tender.organization,
            closingDate: tender.closingDate,
            description: tender.description,
            category: tender.category,
            status: tender.status,
            rawData,
            firstSeen: now,
            lastSeen: now,
          });
          itemsNew++;
        } else {
          // Update existing
          await this.db.update(scrapedTenders)
            .set({
              lastSeen: now,
              closingDate: tender.closingDate,
              description: tender.description,
              status: tender.status,
              rawData,
              updatedAt: now,
            })
            .where(eq(scrapedTenders.id, existing[0].id));
          itemsUpdated++;
        }
      } catch (error) {
        console.warn(`Error saving tender ${tender.tenderName}:`, error);
      }
    }
    
    return { itemsNew, itemsUpdated };
  }

  async getRecentScraperRuns(limit = 10): Promise<any[]> {
    return await this.db.select()
      .from(scraperRuns)
      .orderBy(desc(scraperRuns.startedAt))
      .limit(limit);
  }
}

// Export singleton instance
export const scraperManager = new ScraperManager();