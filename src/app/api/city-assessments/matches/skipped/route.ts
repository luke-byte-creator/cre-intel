import { NextRequest, NextResponse } from 'next/server';
import { rawDb } from '@/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');

  const total = (rawDb.prepare(`
    SELECT COUNT(*) as c FROM city_assessment_matches cam
    JOIN properties p ON cam.property_id = p.id
    WHERE cam.status = 'skipped'
  `).get() as any).c;

  const data = rawDb.prepare(`
    SELECT cam.id as match_id, p.id as property_id, p.address, p.property_type, p.city
    FROM city_assessment_matches cam
    JOIN properties p ON cam.property_id = p.id
    WHERE cam.status = 'skipped'
    ORDER BY p.address
    LIMIT ? OFFSET ?
  `).all(limit, (page - 1) * limit);

  return NextResponse.json({ data, total, page, limit });
}

/** DELETE: Restore a skipped property back to the matching queue */
export async function DELETE(request: NextRequest) {
  const { matchId } = await request.json();
  if (!matchId) return NextResponse.json({ error: 'matchId required' }, { status: 400 });
  rawDb.prepare('DELETE FROM city_assessment_matches WHERE id = ? AND status = ?').run(matchId, 'skipped');
  return NextResponse.json({ ok: true });
}
