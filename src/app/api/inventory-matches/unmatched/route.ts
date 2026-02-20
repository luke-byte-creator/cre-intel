import { NextRequest, NextResponse } from 'next/server';
import { rawDb } from '@/db';

/**
 * GET: List unmatched inventory items
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const table = searchParams.get('table') || 'office_buildings';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const inventoryTable = table === 'multi_buildings' ? 'multi_buildings' : 'office_buildings';

    const total = (rawDb.prepare(`
      SELECT COUNT(*) as c FROM ${inventoryTable}
      WHERE id NOT IN (SELECT inventory_id FROM inventory_assessment_matches WHERE table_name = ?)
    `).get(inventoryTable) as any).c;

    const data = rawDb.prepare(`
      SELECT * FROM ${inventoryTable}
      WHERE id NOT IN (SELECT inventory_id FROM inventory_assessment_matches WHERE table_name = ?)
      ORDER BY address LIMIT ? OFFSET ?
    `).all(inventoryTable, limit, (page - 1) * limit);

    return NextResponse.json({ data, total, page, limit });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST: Manual match for unmatched inventory item
 * { table, inventoryId, cityAssessmentId }
 */
export async function POST(request: NextRequest) {
  try {
    const { table, inventoryId, cityAssessmentId } = await request.json();
    const inventoryTable = table === 'multi_buildings' ? 'multi_buildings' : 'office_buildings';

    rawDb.prepare(`
      INSERT INTO inventory_assessment_matches (table_name, inventory_id, city_assessment_id, match_method, confidence, status)
      VALUES (?, ?, ?, 'manual', 1.0, 'confirmed')
    `).run(inventoryTable, inventoryId, cityAssessmentId);

    rawDb.prepare(`UPDATE ${inventoryTable} SET city_assessment_id = ? WHERE id = ?`)
      .run(cityAssessmentId, inventoryId);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
