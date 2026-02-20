import { NextResponse } from 'next/server';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { desc } from 'drizzle-orm';
import { scrapedPermits } from '@/db/schema';

const sqlite = new Database('data/cre-intel.db');
const db = drizzle(sqlite);

export async function GET() {
  try {
    const permits = await db.select()
      .from(scrapedPermits)
      .orderBy(desc(scrapedPermits.lastSeen))
      .limit(1000);

    return NextResponse.json({ permits });
  } catch (error) {
    console.error('Error fetching scraped permits:', error);
    return NextResponse.json({ error: 'Failed to fetch permits' }, { status: 500 });
  }
}