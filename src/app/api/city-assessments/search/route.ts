import { NextRequest, NextResponse } from 'next/server';
import { rawDb } from '@/db';

/**
 * GET: Search city assessments by address
 * /api/city-assessments/search?q=broadway
 */
export async function GET(request: NextRequest) {
  const q = new URL(request.url).searchParams.get('q') || '';
  if (q.length < 2) return NextResponse.json({ data: [] });

  const data = rawDb.prepare(`
    SELECT id, full_address, street_number, street_name, street_suffix,
           zoning_desc, assessed_value, property_use_group, neighbourhood, roll_number
    FROM city_assessments
    WHERE full_address LIKE ?
    ORDER BY full_address
    LIMIT 15
  `).all(`%${q}%`);

  return NextResponse.json({ data });
}
