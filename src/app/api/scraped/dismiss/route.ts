import { NextRequest, NextResponse } from 'next/server';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { scrapedListings, mutedAddresses } from '@/db/schema';

const sqlite = new Database('data/cre-intel.db');
const db = drizzle(sqlite);

function normalizeAddress(address: string): string {
  return address.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export async function GET() {
  try {
    const muted = await db.select().from(mutedAddresses);
    return NextResponse.json({ mutedAddresses: muted });
  } catch (error) {
    console.error('Error fetching muted addresses:', error);
    return NextResponse.json({ error: 'Failed to fetch muted addresses' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'dismiss') {
      const { listingId } = body;
      if (!listingId) return NextResponse.json({ error: 'listingId required' }, { status: 400 });
      
      await db.update(scrapedListings)
        .set({ dismissed: 1 })
        .where(eq(scrapedListings.id, listingId));
      
      return NextResponse.json({ success: true });
    }

    if (action === 'mute') {
      const { address, reason } = body;
      if (!address) return NextResponse.json({ error: 'address required' }, { status: 400 });

      await db.insert(mutedAddresses).values({
        address,
        addressNormalized: normalizeAddress(address),
        reason: reason || null,
        mutedAt: new Date().toISOString(),
      }).onConflictDoNothing();

      // Also dismiss all existing listings at this address
      const normalized = normalizeAddress(address);
      const allListings = await db.select().from(scrapedListings);
      for (const listing of allListings) {
        if (normalizeAddress(listing.address) === normalized) {
          await db.update(scrapedListings)
            .set({ dismissed: 1 })
            .where(eq(scrapedListings.id, listing.id));
        }
      }

      return NextResponse.json({ success: true });
    }

    if (action === 'unmute') {
      const { id } = body;
      if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
      
      // Get the address before deleting
      const [muted] = await db.select().from(mutedAddresses).where(eq(mutedAddresses.id, id)).limit(1);
      if (muted) {
        await db.delete(mutedAddresses).where(eq(mutedAddresses.id, id));
        
        // Un-dismiss listings at this address
        const normalized = normalizeAddress(muted.address);
        const allListings = await db.select().from(scrapedListings);
        for (const listing of allListings) {
          if (normalizeAddress(listing.address) === normalized) {
            await db.update(scrapedListings)
              .set({ dismissed: 0 })
              .where(eq(scrapedListings.id, listing.id));
          }
        }
      }
      
      return NextResponse.json({ success: true });
    }

    if (action === 'undismiss') {
      const { listingId } = body;
      if (!listingId) return NextResponse.json({ error: 'listingId required' }, { status: 400 });
      
      await db.update(scrapedListings)
        .set({ dismissed: 0 })
        .where(eq(scrapedListings.id, listingId));
      
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error in dismiss/mute:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
