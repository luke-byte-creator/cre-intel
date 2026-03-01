import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/db';
import { eq } from 'drizzle-orm';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  db.update(schema.cityAssessmentMatches)
    .set({ status: 'rejected' })
    .where(eq(schema.cityAssessmentMatches.id, parseInt(id)))
    .run();
  return NextResponse.json({ ok: true });
}
