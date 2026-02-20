import { NextResponse } from 'next/server';
import { db, rawDb, schema } from '@/db';
import { eq, and } from 'drizzle-orm';

export async function POST() {
  // Ensure columns exist on properties table
  const cols = (rawDb.pragma('table_info(properties)') as any[]).map((c: any) => c.name);
  if (!cols.includes('assessed_value')) rawDb.exec('ALTER TABLE properties ADD COLUMN assessed_value REAL');
  if (!cols.includes('zoning')) rawDb.exec('ALTER TABLE properties ADD COLUMN zoning TEXT');
  if (!cols.includes('roll_number')) rawDb.exec('ALTER TABLE properties ADD COLUMN roll_number TEXT');
  if (!cols.includes('ward')) rawDb.exec('ALTER TABLE properties ADD COLUMN ward TEXT');

  // Get confirmed matches
  const confirmed = db.select({
    match: schema.cityAssessmentMatches,
    city: schema.cityAssessments,
  })
    .from(schema.cityAssessmentMatches)
    .innerJoin(schema.cityAssessments, eq(schema.cityAssessmentMatches.cityAssessmentId, schema.cityAssessments.id))
    .where(and(
      eq(schema.cityAssessmentMatches.status, 'confirmed'),
    ))
    .all();

  let merged = 0;
  const now = new Date().toISOString();

  for (const { match, city } of confirmed) {
    if (match.mergedAt) continue; // already merged

    rawDb.prepare(`
      UPDATE properties SET 
        assessed_value = ?, zoning = ?, roll_number = ?, ward = ?,
        neighbourhood = COALESCE(neighbourhood, ?), updated_at = ?
      WHERE id = ?
    `).run(
      city.assessedValue, city.zoningDesc, String(city.rollNumber || ''),
      city.ward, city.neighbourhood, now, match.propertyId
    );

    db.update(schema.cityAssessmentMatches)
      .set({ mergedAt: now })
      .where(eq(schema.cityAssessmentMatches.id, match.id))
      .run();

    merged++;
  }

  return NextResponse.json({ merged, total: confirmed.length });
}
