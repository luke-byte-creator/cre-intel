import { NextRequest, NextResponse } from 'next/server';
import { rawDb } from '@/db';

/**
 * POST: Skip/dismiss a property from matching (marks it as manually reviewed with no match)
 * Body: { propertyId: number, reason?: string }
 */
export async function POST(request: NextRequest) {
  const { propertyId, reason } = await request.json();
  if (!propertyId) {
    return NextResponse.json({ error: 'propertyId required' }, { status: 400 });
  }

  // Insert a self-referencing match with status 'skipped' so it doesn't show up as unmatched
  rawDb.prepare(`
    INSERT OR IGNORE INTO city_assessment_matches (property_id, city_assessment_id, match_method, confidence, status)
    VALUES (?, 0, 'skipped', 0, 'skipped')
  `).run(propertyId);

  return NextResponse.json({ ok: true });
}
