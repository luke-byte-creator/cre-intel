import { NextRequest, NextResponse } from 'next/server';
import { rawDb } from '@/db';

/**
 * POST: Bulk confirm all matches of a given method for a table
 * { table: 'office_buildings'|'multi_buildings', method: 'exact'|'normalized'|'fuzzy' }
 */
export async function POST(request: NextRequest) {
  try {
    const { table, method } = await request.json();
    const inventoryTable = table === 'multi_buildings' ? 'multi_buildings' : 'office_buildings';

    const matches = rawDb.prepare(`
      SELECT id, inventory_id, city_assessment_id 
      FROM inventory_assessment_matches 
      WHERE table_name = ? AND match_method = ? AND status = 'pending'
    `).all(inventoryTable, method) as any[];

    const updateMatch = rawDb.prepare('UPDATE inventory_assessment_matches SET status = ? WHERE id = ?');
    const updateInv = rawDb.prepare(`UPDATE ${inventoryTable} SET city_assessment_id = ? WHERE id = ?`);

    const tx = rawDb.transaction(() => {
      for (const m of matches) {
        updateMatch.run('confirmed', m.id);
        updateInv.run(m.city_assessment_id, m.inventory_id);
      }
    });
    tx();

    return NextResponse.json({ confirmed: matches.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
