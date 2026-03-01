import { NextRequest, NextResponse } from 'next/server';
import { rawDb } from '@/db';

/**
 * GET: List inventory-to-assessment matches for review
 * ?table=office_buildings|multi_buildings&status=pending|confirmed|rejected&page=1&limit=50
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const table = searchParams.get('table') || 'office_buildings';
    const status = searchParams.get('status') || 'pending';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const inventoryTable = table === 'multi_buildings' ? 'multi_buildings' : 'office_buildings';

    const total = (rawDb.prepare(`
      SELECT COUNT(DISTINCT iam.inventory_id) as c 
      FROM inventory_assessment_matches iam
      WHERE iam.table_name = ? AND iam.status = ?
    `).get(inventoryTable, status) as any).c;

    // Get unique inventory items with their matches
    const inventoryIds = rawDb.prepare(`
      SELECT DISTINCT inventory_id FROM inventory_assessment_matches
      WHERE table_name = ? AND status = ?
      ORDER BY inventory_id
      LIMIT ? OFFSET ?
    `).all(inventoryTable, status, limit, (page - 1) * limit) as any[];

    const results = inventoryIds.map((row: any) => {
      const inv = rawDb.prepare(`SELECT * FROM ${inventoryTable} WHERE id = ?`).get(row.inventory_id) as any;
      const matches = rawDb.prepare(`
        SELECT iam.id as match_id, iam.match_method, iam.confidence, iam.status,
               ca.id as ca_id, ca.full_address, ca.assessed_value, ca.zoning_desc, 
               ca.property_use_group, ca.neighbourhood, ca.roll_number
        FROM inventory_assessment_matches iam
        JOIN city_assessments ca ON iam.city_assessment_id = ca.id
        WHERE iam.table_name = ? AND iam.inventory_id = ? AND iam.status = ?
        ORDER BY iam.confidence DESC
      `).all(inventoryTable, row.inventory_id, status);
      return { inventory: inv, matches };
    });

    // Stats
    const stats = rawDb.prepare(`
      SELECT status, COUNT(DISTINCT inventory_id) as cnt 
      FROM inventory_assessment_matches WHERE table_name = ?
      GROUP BY status
    `).all(inventoryTable);

    // Unmatched count
    const unmatchedCount = (rawDb.prepare(`
      SELECT COUNT(*) as c FROM ${inventoryTable} 
      WHERE id NOT IN (SELECT inventory_id FROM inventory_assessment_matches WHERE table_name = ?)
    `).get(inventoryTable) as any).c;

    return NextResponse.json({ data: results, total, page, limit, stats, unmatchedCount });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST: Confirm or reject a match
 * { matchId, action: 'confirm' | 'reject' }
 */
export async function POST(request: NextRequest) {
  try {
    const { matchId, action } = await request.json();
    if (!matchId || !['confirm', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'matchId and action (confirm/reject) required' }, { status: 400 });
    }

    const newStatus = action === 'confirm' ? 'confirmed' : 'rejected';
    rawDb.prepare('UPDATE inventory_assessment_matches SET status = ? WHERE id = ?').run(newStatus, matchId);

    // If confirmed, update the inventory table with city_assessment_id
    if (action === 'confirm') {
      const match = rawDb.prepare(`
        SELECT table_name, inventory_id, city_assessment_id 
        FROM inventory_assessment_matches WHERE id = ?
      `).get(matchId) as any;
      if (match) {
        rawDb.prepare(`UPDATE ${match.table_name} SET city_assessment_id = ? WHERE id = ?`)
          .run(match.city_assessment_id, match.inventory_id);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
