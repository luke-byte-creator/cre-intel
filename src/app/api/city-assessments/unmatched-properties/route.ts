import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/db';
import { sql } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');

  const total = db.select({ count: sql<number>`count(*)` })
    .from(schema.properties)
    .where(sql`${schema.properties.id} NOT IN (SELECT property_id FROM city_assessment_matches)`)
    .get()?.count || 0;

  const data = db.select()
    .from(schema.properties)
    .where(sql`${schema.properties.id} NOT IN (SELECT property_id FROM city_assessment_matches)`)
    .limit(limit)
    .offset((page - 1) * limit)
    .all();

  return NextResponse.json({ data, total, page, limit });
}
