import { NextRequest, NextResponse } from 'next/server';
import { rawDb } from '@/db';

// Ensure skipped_properties table exists
rawDb.exec(`
  CREATE TABLE IF NOT EXISTS skipped_properties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER NOT NULL REFERENCES properties(id),
    reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(property_id)
  )
`);

/**
 * POST: Skip/dismiss a property from matching (marks it as manually reviewed with no match)
 * Body: { propertyId: number, reason?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { propertyId, reason } = await request.json();
    if (!propertyId) {
      return NextResponse.json({ error: 'propertyId required' }, { status: 400 });
    }

    rawDb.prepare(`
      INSERT OR IGNORE INTO skipped_properties (property_id, reason)
      VALUES (?, ?)
    `).run(propertyId, reason || null);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
