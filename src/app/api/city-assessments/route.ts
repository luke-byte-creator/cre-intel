import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/db';
import { eq, like, sql, and, isNull, isNotNull } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');
  const useGroup = searchParams.get('useGroup');
  const neighbourhood = searchParams.get('neighbourhood');
  const search = searchParams.get('search');
  const matched = searchParams.get('matched'); // 'yes', 'no', or null

  const conditions: any[] = [];
  if (useGroup) conditions.push(eq(schema.cityAssessments.propertyUseGroup, useGroup));
  if (neighbourhood) conditions.push(eq(schema.cityAssessments.neighbourhood, neighbourhood));
  if (search) conditions.push(like(schema.cityAssessments.fullAddress, `%${search}%`));

  // For matched/unmatched filter, use subquery
  let baseQuery;
  if (matched === 'yes' || matched === 'no') {
    const matchedIds = db.select({ id: schema.cityAssessmentMatches.cityAssessmentId })
      .from(schema.cityAssessmentMatches);
    
    if (matched === 'yes') {
      conditions.push(sql`${schema.cityAssessments.id} IN (SELECT city_assessment_id FROM city_assessment_matches)`);
    } else {
      conditions.push(sql`${schema.cityAssessments.id} NOT IN (SELECT city_assessment_id FROM city_assessment_matches)`);
    }
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const total = db.select({ count: sql<number>`count(*)` })
    .from(schema.cityAssessments)
    .where(where)
    .get()?.count || 0;

  const data = db.select()
    .from(schema.cityAssessments)
    .where(where)
    .orderBy(sql`assessed_value DESC`)
    .limit(limit)
    .offset((page - 1) * limit)
    .all();

  return NextResponse.json({ data, total, page, limit });
}
