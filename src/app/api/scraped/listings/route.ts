import { NextRequest, NextResponse } from 'next/server';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { asc, desc, eq, ne } from 'drizzle-orm';
import { scrapedListings } from '@/db/schema';

const sqlite = new Database('data/cre-intel.db');
const db = drizzle(sqlite);

export async function GET(request: NextRequest) {
  try {
    const showDismissed = request.nextUrl.searchParams.get('showDismissed') === 'true';

    const raw = showDismissed
      ? db.select()
          .from(scrapedListings)
          .limit(1000)
          .all()
      : db.select()
          .from(scrapedListings)
          .where(eq(scrapedListings.dismissed, 0))
          .limit(1000)
          .all();

    // Sort by address (street name then number) so same-building listings group together
    const listings = raw.sort((a, b) => {
      const parseAddr = (addr: string) => {
        const m = addr.match(/^(\d+)\s+(.+)/);
        return m ? { num: parseInt(m[1]), street: m[2].toLowerCase() } : { num: 0, street: addr.toLowerCase() };
      };
      const pa = parseAddr(a.address || '');
      const pb = parseAddr(b.address || '');
      const streetCmp = pa.street.localeCompare(pb.street);
      if (streetCmp !== 0) return streetCmp;
      if (pa.num !== pb.num) return pa.num - pb.num;
      return (a.suite || '').localeCompare(b.suite || '');
    });

    return NextResponse.json({ listings });
  } catch (error) {
    console.error('Error fetching scraped listings:', error);
    return NextResponse.json({ error: 'Failed to fetch listings' }, { status: 500 });
  }
}
