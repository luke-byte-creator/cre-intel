import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/db';
import { eq, and, inArray } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  const { matchMethod } = await req.json();
  
  const validMethods = ['exact', 'normalized', 'fuzzy'];
  if (!matchMethod || !validMethods.includes(matchMethod)) {
    return NextResponse.json({ error: 'Invalid matchMethod. Must be: exact, normalized, or fuzzy' }, { status: 400 });
  }

  const result = db.update(schema.cityAssessmentMatches)
    .set({ status: 'confirmed' })
    .where(and(
      eq(schema.cityAssessmentMatches.matchMethod, matchMethod),
      eq(schema.cityAssessmentMatches.status, 'pending')
    ))
    .run();

  return NextResponse.json({ confirmed: result.changes, matchMethod });
}
