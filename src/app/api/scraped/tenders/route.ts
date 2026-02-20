import { NextResponse } from 'next/server';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { desc } from 'drizzle-orm';
import { scrapedTenders } from '@/db/schema';

const sqlite = new Database('data/cre-intel.db');
const db = drizzle(sqlite);

export async function GET() {
  try {
    const tenders = await db.select()
      .from(scrapedTenders)
      .orderBy(desc(scrapedTenders.lastSeen))
      .limit(1000);

    return NextResponse.json({ tenders });
  } catch (error) {
    console.error('Error fetching scraped tenders:', error);
    return NextResponse.json({ error: 'Failed to fetch tenders' }, { status: 500 });
  }
}