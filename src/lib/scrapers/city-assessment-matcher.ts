/**
 * Address matcher: links city_assessments to properties table
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { cityAssessments, cityAssessmentMatches, properties } from '@/db/schema';

// Street type normalization map
const STREET_TYPES: Record<string, string> = {
  'st': 'street', 'str': 'street', 'ave': 'avenue', 'av': 'avenue',
  'blvd': 'boulevard', 'boul': 'boulevard', 'dr': 'drive', 'cres': 'crescent',
  'cr': 'crescent', 'crt': 'court', 'ct': 'court', 'pl': 'place',
  'rd': 'road', 'way': 'way', 'ln': 'lane', 'terr': 'terrace',
  'ter': 'terrace', 'cir': 'circle', 'pk': 'park', 'pkwy': 'parkway',
  'hwy': 'highway', 'hw': 'highway',
};

const DIRECTIONALS: Record<string, string> = {
  'n': 'north', 's': 'south', 'e': 'east', 'w': 'west',
  'ne': 'northeast', 'nw': 'northwest', 'se': 'southeast', 'sw': 'southwest',
};

function normalizeAddress(addr: string): string {
  let s = addr.toLowerCase().trim();
  // Remove city/province
  s = s.replace(/,?\s*saskatoon\s*/gi, '').replace(/,?\s*sk\s*/gi, '').replace(/,?\s*saskatchewan\s*/gi, '');
  // Remove postal codes
  s = s.replace(/[a-z]\d[a-z]\s*\d[a-z]\d/gi, '');
  // Remove commas, extra spaces
  s = s.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  // Normalize street types
  const words = s.split(' ');
  const normalized = words.map(w => STREET_TYPES[w] || DIRECTIONALS[w] || w);
  return normalized.join(' ');
}

function aggressiveNormalize(addr: string): string {
  let s = normalizeAddress(addr);
  // Strip unit/suite prefixes
  s = s.replace(/^(unit|suite|ste|apt|#)\s*\S+\s*/i, '');
  s = s.replace(/\s+(unit|suite|ste|apt|#)\s*\S+/i, '');
  // Remove all non-alphanumeric
  s = s.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  return s;
}

function extractStreetNumber(addr: string): string | null {
  const m = addr.match(/(\d+)/);
  return m ? m[1] : null;
}

function extractStreetName(addr: string): string {
  // Get everything after the first number
  const m = addr.replace(/^[\s\d-]+/, '').toLowerCase().trim();
  return m.split(' ')[0] || '';
}

export interface MatchResult {
  totalProperties: number;
  matched: number;
  exact: number;
  normalized: number;
  fuzzy: number;
  unmatched: number;
  errors: string[];
}

export async function matchCityAssessments(dbPath?: string): Promise<MatchResult> {
  const sqlite = new Database(dbPath || 'data/cre-intel.db');
  const db = drizzle(sqlite);

  console.log('🔗 Starting city assessment matching...');

  // Load all city assessments
  const allAssessments = db.select().from(cityAssessments).all();
  const allProperties = db.select().from(properties).all();

  console.log(`   ${allAssessments.length} city assessments, ${allProperties.length} properties`);

  // Clear existing matches
  sqlite.exec('DELETE FROM city_assessment_matches');

  // Build lookup maps for city assessments
  const exactMap = new Map<string, typeof allAssessments>();
  const normalizedMap = new Map<string, typeof allAssessments>();
  
  for (const ca of allAssessments) {
    const exact = normalizeAddress(ca.fullAddress);
    if (!exactMap.has(exact)) exactMap.set(exact, []);
    exactMap.get(exact)!.push(ca);

    const norm = aggressiveNormalize(ca.fullAddress);
    if (!normalizedMap.has(norm)) normalizedMap.set(norm, []);
    normalizedMap.get(norm)!.push(ca);
  }

  // Build fuzzy index: streetNumber -> streetNameStart -> assessments
  const fuzzyMap = new Map<string, Map<string, typeof allAssessments>>();
  for (const ca of allAssessments) {
    const num = extractStreetNumber(ca.fullAddress);
    const name = extractStreetName(ca.fullAddress);
    if (!num || !name) continue;
    if (!fuzzyMap.has(num)) fuzzyMap.set(num, new Map());
    const nameMap = fuzzyMap.get(num)!;
    if (!nameMap.has(name)) nameMap.set(name, []);
    nameMap.get(name)!.push(ca);
  }

  let matched = 0, exact = 0, normalized = 0, fuzzy = 0;
  const errors: string[] = [];
  const matchedPropertyIds = new Set<number>();

  for (const prop of allProperties) {
    if (!prop.address) continue;
    const propAddr = prop.address;

    // Try exact match
    const exactKey = normalizeAddress(propAddr);
    let matches = exactMap.get(exactKey);
    if (matches && matches.length > 0) {
      for (const ca of matches) {
        try {
          db.insert(cityAssessmentMatches).values({
            cityAssessmentId: ca.id,
            propertyId: prop.id,
            matchMethod: 'exact',
            confidence: 1.0,
            status: 'pending',
          }).run();
        } catch (e) { errors.push(`Insert error: ${e}`); }
      }
      matched++;
      exact++;
      matchedPropertyIds.add(prop.id);
      continue;
    }

    // Try normalized match
    const normKey = aggressiveNormalize(propAddr);
    matches = normalizedMap.get(normKey);
    if (matches && matches.length > 0) {
      for (const ca of matches) {
        try {
          db.insert(cityAssessmentMatches).values({
            cityAssessmentId: ca.id,
            propertyId: prop.id,
            matchMethod: 'normalized',
            confidence: 0.85,
            status: 'pending',
          }).run();
        } catch (e) { errors.push(`Insert error: ${e}`); }
      }
      matched++;
      normalized++;
      matchedPropertyIds.add(prop.id);
      continue;
    }

    // Try fuzzy match
    const propNum = extractStreetNumber(propAddr);
    const propName = extractStreetName(propAddr);
    if (propNum && propName) {
      const nameMap = fuzzyMap.get(propNum);
      if (nameMap) {
        // Try partial street name match
        const fuzzyMatches: typeof allAssessments = [];
        for (const [name, cas] of nameMap) {
          if (name.startsWith(propName.substring(0, 3)) || propName.startsWith(name.substring(0, 3))) {
            fuzzyMatches.push(...cas);
          }
        }
        if (fuzzyMatches.length > 0 && fuzzyMatches.length <= 5) {
          for (const ca of fuzzyMatches) {
            try {
              db.insert(cityAssessmentMatches).values({
                cityAssessmentId: ca.id,
                propertyId: prop.id,
                matchMethod: 'fuzzy',
                confidence: 0.6,
                status: 'pending',
              }).run();
            } catch (e) { errors.push(`Insert error: ${e}`); }
          }
          matched++;
          fuzzy++;
          matchedPropertyIds.add(prop.id);
        }
      }
    }
  }

  const result: MatchResult = {
    totalProperties: allProperties.length,
    matched,
    exact,
    normalized,
    fuzzy,
    unmatched: allProperties.length - matched,
    errors,
  };

  console.log(`✅ Matching complete: ${matched} matched (${exact} exact, ${normalized} normalized, ${fuzzy} fuzzy), ${result.unmatched} unmatched`);
  sqlite.close();
  return result;
}
