import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/db';
import { eq, sql } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');
  const status = searchParams.get('status');

  const conditions: any[] = [];
  if (status) conditions.push(eq(schema.cityAssessmentMatches.status, status));

  const where = conditions.length > 0 ? conditions[0] : undefined;

  const total = db.select({ count: sql<number>`count(*)` })
    .from(schema.cityAssessmentMatches)
    .where(where)
    .get()?.count || 0;

  const data = db.select({
    match: schema.cityAssessmentMatches,
    city: schema.cityAssessments,
    property: schema.properties,
  })
    .from(schema.cityAssessmentMatches)
    .innerJoin(schema.cityAssessments, eq(schema.cityAssessmentMatches.cityAssessmentId, schema.cityAssessments.id))
    .innerJoin(schema.properties, eq(schema.cityAssessmentMatches.propertyId, schema.properties.id))
    .where(where)
    .orderBy(sql`${schema.cityAssessmentMatches.confidence} DESC`)
    .limit(limit)
    .offset((page - 1) * limit)
    .all();

  return NextResponse.json({ data, total, page, limit });
}
