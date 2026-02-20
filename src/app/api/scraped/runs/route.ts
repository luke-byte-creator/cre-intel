import { NextResponse } from 'next/server';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { desc } from 'drizzle-orm';
import { scraperRuns } from '@/db/schema';

const sqlite = new Database('data/cre-intel.db');
const db = drizzle(sqlite);

export async function GET() {
  try {
    const runs = await db.select()
      .from(scraperRuns)
      .orderBy(desc(scraperRuns.startedAt))
      .limit(100);

    return NextResponse.json({ runs });
  } catch (error) {
    console.error('Error fetching scraper runs:', error);
    return NextResponse.json({ error: 'Failed to fetch runs' }, { status: 500 });
  }
}