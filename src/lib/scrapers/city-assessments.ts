/**
 * City of Saskatoon Property Assessment Scraper
 * Pulls CRE-relevant property data from the public ArcGIS REST API
 */

import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { cityAssessments } from '@/db/schema';

const API_URL = 'https://gisext.saskatoon.ca/arcgis/rest/services/Core/Property/MapServer/1/query';

const CRE_USE_GROUPS = [
  'Commercial - General',
  'Warehouse, Storage',
  'Vacant Commercial Land',
  'Multi-Residential',
  'Mixed Use',
  'Commercial - Utility / Transportation',
  'Commercial - Non General',
  'Auto, Service Station',
  'Auto, Showroom',
  'Auto, Service Centre',
  'Auto, Mini-Lube Garage',
  'Auto, Repair Garage',
  'Auto, Dealership',
  'Bank, Downtown Central',
  'Recreational / Institutional',
  'Vacant Multi-Residential Land',
  'Condo, Undeveloped Commercial Land',
  'Condo, Undeveloped Multi Family Land',
];

const OUT_FIELDS = [
  'OBJECTID', 'Site_Id', 'Property_Id', 'Roll_Number', 'Unit',
  'Street_Number', 'Street_Name', 'Street_Suff', 'Street_Post_Dir',
  'Full_Address', 'Zoning_Desc', 'Assessment_Year', 'Assessed_Value',
  'Adjusted_Sales_Price', 'Property_Use_Code_Desc', 'Property_Use_Cd_Grp_Desc',
  'Neighbourhood', 'Ward', 'Url',
].join(',');

function buildWhereClause(): string {
  const conditions = CRE_USE_GROUPS.map(g => `Property_Use_Cd_Grp_Desc='${g}'`);
  return conditions.join(' OR ');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export interface CityAssessmentResult {
  totalFetched: number;
  inserted: number;
  updated: number;
  errors: string[];
}

export async function scrapeCityAssessments(dbPath?: string): Promise<CityAssessmentResult> {
  const sqlite = new Database(dbPath || 'data/cre-intel.db');
  const db = drizzle(sqlite);

  const where = buildWhereClause();
  let offset = 0;
  const pageSize = 1000;
  let totalFetched = 0;
  let inserted = 0;
  let updated = 0;
  const errors: string[] = [];

  console.log('🏛️ Starting City of Saskatoon assessment scraper...');
  console.log(`   WHERE: ${where.substring(0, 100)}...`);

  while (true) {
    const params = new URLSearchParams({
      where,
      outFields: OUT_FIELDS,
      f: 'json',
      returnGeometry: 'false',
      resultRecordCount: String(pageSize),
      resultOffset: String(offset),
    });

    try {
      console.log(`   Fetching offset ${offset}...`);
      const response = await fetch(`${API_URL}?${params}`);
      if (!response.ok) {
        errors.push(`HTTP ${response.status} at offset ${offset}`);
        break;
      }

      const data = await response.json();
      
      if (data.error) {
        errors.push(`API error: ${JSON.stringify(data.error)}`);
        break;
      }

      const features = data.features || [];
      if (features.length === 0) break;

      totalFetched += features.length;
      console.log(`   Got ${features.length} records (total: ${totalFetched})`);

      const now = new Date().toISOString();

      for (const feature of features) {
        const a = feature.attributes;
        try {
          const existing = db.select({ id: cityAssessments.id })
            .from(cityAssessments)
            .where(eq(cityAssessments.objectId, a.OBJECTID))
            .get();

          if (existing) {
            db.update(cityAssessments)
              .set({
                siteId: a.Site_Id,
                propertyId: a.Property_Id,
                rollNumber: a.Roll_Number,
                unit: a.Unit || null,
                streetNumber: String(a.Street_Number || ''),
                streetName: a.Street_Name || '',
                streetSuffix: a.Street_Suff || null,
                streetPostDir: a.Street_Post_Dir || null,
                fullAddress: (a.Full_Address || '').trim(),
                zoningDesc: a.Zoning_Desc || null,
                assessmentYear: a.Assessment_Year,
                assessedValue: a.Assessed_Value,
                adjustedSalesPrice: a.Adjusted_Sales_Price,
                propertyUseCode: a.Property_Use_Code_Desc || '',
                propertyUseGroup: a.Property_Use_Cd_Grp_Desc || '',
                neighbourhood: a.Neighbourhood || null,
                ward: a.Ward || null,
                cityUrl: a.Url || null,
                updatedAt: now,
              })
              .where(eq(cityAssessments.id, existing.id))
              .run();
            updated++;
          } else {
            db.insert(cityAssessments)
              .values({
                objectId: a.OBJECTID,
                siteId: a.Site_Id,
                propertyId: a.Property_Id,
                rollNumber: a.Roll_Number,
                unit: a.Unit || null,
                streetNumber: String(a.Street_Number || ''),
                streetName: a.Street_Name || '',
                streetSuffix: a.Street_Suff || null,
                streetPostDir: a.Street_Post_Dir || null,
                fullAddress: (a.Full_Address || '').trim(),
                zoningDesc: a.Zoning_Desc || null,
                assessmentYear: a.Assessment_Year,
                assessedValue: a.Assessed_Value,
                adjustedSalesPrice: a.Adjusted_Sales_Price,
                propertyUseCode: a.Property_Use_Code_Desc || '',
                propertyUseGroup: a.Property_Use_Cd_Grp_Desc || '',
                neighbourhood: a.Neighbourhood || null,
                ward: a.Ward || null,
                cityUrl: a.Url || null,
              })
              .run();
            inserted++;
          }
        } catch (err) {
          errors.push(`Record ${a.OBJECTID}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      if (features.length < pageSize) break;
      offset += pageSize;
      await sleep(1000);
    } catch (err) {
      errors.push(`Fetch error at offset ${offset}: ${err instanceof Error ? err.message : String(err)}`);
      break;
    }
  }

  console.log(`✅ City assessments: ${totalFetched} fetched, ${inserted} new, ${updated} updated, ${errors.length} errors`);
  sqlite.close();
  return { totalFetched, inserted, updated, errors };
}
