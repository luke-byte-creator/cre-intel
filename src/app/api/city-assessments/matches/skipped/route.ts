import { NextRequest, NextResponse } from 'next/server';
import { rawDb } from '@/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');

  const total = (rawDb.prepare(`
    SELECT COUNT(*) as c FROM skipped_properties sp
    JOIN properties p ON sp.property_id = p.id
  `).get() as any)?.c || 0;

  const data = rawDb.prepare(`
    SELECT sp.id as match_id, p.id as property_id, p.address, p.property_type, p.city, sp.reason, sp.created_at
    FROM skipped_properties sp
    JOIN properties p ON sp.property_id = p.id
    ORDER BY sp.created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, (page - 1) * limit);

  return NextResponse.json({ data, total, page, limit });
}

/** DELETE: Restore a skipped property back to the matching queue */
export async function DELETE(request: NextRequest) {
  try {
    const { matchId } = await request.json();
    if (!matchId) return NextResponse.json({ error: 'matchId required' }, { status: 400 });
    rawDb.prepare('DELETE FROM skipped_properties WHERE id = ?').run(matchId);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
