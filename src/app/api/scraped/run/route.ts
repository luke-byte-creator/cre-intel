import { NextRequest, NextResponse } from 'next/server';
import { scraperManager, ScraperSource } from '@/lib/scrapers/manager';
import { db, schema } from '@/db';
import { eq, and } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const { source } = await request.json();
    
    if (!source) {
      return NextResponse.json({ error: 'Source is required' }, { status: 400 });
    }

    const validSources: ScraperSource[] = ['epermitting', 'icr', 'cbre', 'colliers', 'sasktenders', 'assessments', 'cushman', 'commgroup', 'concorde', 'fortress', 'reddee', 'city_assessments'];
    if (!validSources.includes(source)) {
      return NextResponse.json({ 
        error: `Invalid source. Must be one of: ${validSources.join(', ')}` 
      }, { status: 400 });
    }

    // Check for already-running scraper
    const running = db.select({ id: schema.scraperRuns.id })
      .from(schema.scraperRuns)
      .where(and(
        eq(schema.scraperRuns.source, source),
        eq(schema.scraperRuns.status, 'running')
      ))
      .all();
    
    if (running.length > 0) {
      return NextResponse.json({ 
        error: `${source.toUpperCase()} scraper is already running`,
        alreadyRunning: true,
      }, { status: 409 });
    }

    // Run the scraper (this will run in background)
    scraperManager.runScraper(source)
      .then(result => {
        console.log(`Scraper ${source} completed:`, result);
      })
      .catch(error => {
        console.error(`Scraper ${source} failed:`, error);
      });

    return NextResponse.json({ 
      message: `Scraper ${source} started successfully`,
      source 
    });

  } catch (error) {
    console.error('Error starting scraper:', error);
    return NextResponse.json({ 
      error: 'Failed to start scraper' 
    }, { status: 500 });
  }
}