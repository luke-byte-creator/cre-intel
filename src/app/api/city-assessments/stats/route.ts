import { NextResponse } from 'next/server';
import { db, schema } from '@/db';
import { sql } from 'drizzle-orm';

export async function GET() {
  const total = db.select({ count: sql<number>`count(*)` })
    .from(schema.cityAssessments).get()?.count || 0;

  const byGroup = db.select({
    group: schema.cityAssessments.propertyUseGroup,
    count: sql<number>`count(*)`,
    totalValue: sql<number>`sum(assessed_value)`,
  })
    .from(schema.cityAssessments)
    .groupBy(schema.cityAssessments.propertyUseGroup)
    .orderBy(sql`count(*) DESC`)
    .all();

  const totalMatched = db.select({ count: sql<number>`count(DISTINCT property_id)` })
    .from(schema.cityAssessmentMatches).get()?.count || 0;

  const totalCityMatched = db.select({ count: sql<number>`count(DISTINCT city_assessment_id)` })
    .from(schema.cityAssessmentMatches).get()?.count || 0;

  const matchesByMethod = db.select({
    method: schema.cityAssessmentMatches.matchMethod,
    count: sql<number>`count(*)`,
    pending: sql<number>`sum(case when status = 'pending' then 1 else 0 end)`,
  })
    .from(schema.cityAssessmentMatches)
    .groupBy(schema.cityAssessmentMatches.matchMethod)
    .all();

  const matchesByStatus = db.select({
    status: schema.cityAssessmentMatches.status,
    count: sql<number>`count(*)`,
  })
    .from(schema.cityAssessmentMatches)
    .groupBy(schema.cityAssessmentMatches.status)
    .all();

  const totalProperties = db.select({ count: sql<number>`count(*)` })
    .from(schema.properties).get()?.count || 0;

  return NextResponse.json({
    total,
    byGroup,
    totalMatched,
    totalCityMatched,
    totalProperties,
    unmatchedCity: total - totalCityMatched,
    unmatchedProperties: totalProperties - totalMatched,
    matchesByMethod,
    matchesByStatus,
  });
}
