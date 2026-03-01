import { NextRequest, NextResponse } from 'next/server';
import { rawDb } from '@/db';

/**
 * GET: Returns unmatched Saskatoon properties with top candidate city assessments
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';

    // Count unmatched Saskatoon properties
    const baseWhere = `p.id NOT IN (SELECT property_id FROM city_assessment_matches)
      AND p.id NOT IN (SELECT property_id FROM skipped_properties)
      AND (p.city = 'Saskatoon' OR p.city_normalized LIKE '%saskatoon%')`;

    let countSql = `SELECT COUNT(*) as c FROM properties p WHERE ${baseWhere}`;
    let listSql = `SELECT p.id, p.address, p.address_normalized, p.city, p.property_type
      FROM properties p WHERE ${baseWhere}`;
    const params: any[] = [];

    if (search) {
      countSql += ` AND p.address LIKE ?`;
      listSql += ` AND p.address LIKE ?`;
      params.push(`%${search}%`);
    }

    listSql += ` ORDER BY p.address LIMIT ? OFFSET ?`;

    const total = (rawDb.prepare(countSql).get(...params) as any).c;
    const properties = rawDb.prepare(listSql).all(...params, limit, (page - 1) * limit) as any[];

    // For each property, find candidate city assessments
    const results = properties.map((p: any) => {
      let addr = (p.address || '').trim();
      // Strip common junk prefixes from comp imports (leading digits that aren't the real street number)
      // e.g. "00420 116 Marquis Drive West Unit 30" → "116 Marquis Drive West Unit 30"
      // e.g. "0 Coldstor 2435 Schuyler Street" → "2435 Schuyler Street"
      addr = addr.replace(/^0+\s+\w+\s+/, ''); // "0 Coldstor 2435..." → "2435..."  
      addr = addr.replace(/^0{2,}\d*\s+/, ''); // "00420 116..." → "116..."
      
      const parts = addr.match(/^(\d+)\s+(.+)/);
      const streetNum = parts ? parts[1] : '';
      const streetRest = parts ? parts[2] : addr;
      const streetWord = streetRest.split(/\s+/)[0] || '';

      let candidates: any[] = [];
      if (streetNum && streetWord) {
        candidates = rawDb.prepare(`
          SELECT id, full_address, street_number, street_name, street_suffix,
                 zoning_desc, assessed_value, property_use_group, neighbourhood, roll_number
          FROM city_assessments
          WHERE full_address LIKE ? OR full_address LIKE ? OR street_name LIKE ?
          ORDER BY CASE WHEN street_number = ? THEN 0 ELSE 1 END, full_address
          LIMIT 8
        `).all(`${streetNum} ${streetWord}%`, `%${streetWord}%`, `%${streetWord}%`, streetNum);
      } else if (streetWord) {
        candidates = rawDb.prepare(`
          SELECT id, full_address, street_number, street_name, street_suffix,
                 zoning_desc, assessed_value, property_use_group, neighbourhood, roll_number
          FROM city_assessments
          WHERE street_name LIKE ?
          ORDER BY full_address LIMIT 8
        `).all(`%${streetWord}%`);
      }

      return { property: p, candidates };
    });

    return NextResponse.json({ data: results, total, page, limit });
  } catch (err: any) {
    console.error('match-candidates error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST: Create a manual match
 */
export async function POST(request: NextRequest) {
  try {
    const { propertyId, cityAssessmentId } = await request.json();
    if (!propertyId || !cityAssessmentId) {
      return NextResponse.json({ error: 'propertyId and cityAssessmentId required' }, { status: 400 });
    }

    const existing = rawDb.prepare(
      'SELECT id FROM city_assessment_matches WHERE property_id = ? AND city_assessment_id = ?'
    ).get(propertyId, cityAssessmentId);

    if (existing) {
      return NextResponse.json({ error: 'Match already exists' }, { status: 409 });
    }

    rawDb.prepare(`
      INSERT INTO city_assessment_matches (property_id, city_assessment_id, match_method, confidence, status)
      VALUES (?, ?, 'manual', 1.0, 'confirmed')
    `).run(propertyId, cityAssessmentId);

    rawDb.prepare('UPDATE properties SET city_assessment_id = ? WHERE id = ?').run(cityAssessmentId, propertyId);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('match-candidates POST error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
