#!/usr/bin/env node
/**
 * Cron job script for Nova CRE scraping infrastructure
 * Runs all scrapers in sequence and logs results
 * Designed to run weekly at 2-4 AM CST
 */

const { scraperManager } = require('../src/lib/scrapers/manager.ts');
const fs = require('fs').promises;
const path = require('path');

async function runAllScrapers() {
  const startTime = new Date();
  const logFile = path.join(__dirname, '../logs/scrapers.log');
  
  // Ensure logs directory exists
  const logsDir = path.dirname(logFile);
  try {
    await fs.mkdir(logsDir, { recursive: true });
  } catch (e) {
    // Directory might already exist
  }

  console.log(`🌟 Starting Nova CRE scrapers at ${startTime.toISOString()}`);
  
  const logEntry = {
    timestamp: startTime.toISOString(),
    event: 'scraper_run_started',
  };

  try {
    // Run all scrapers
    const results = await scraperManager.runAllScrapers();
    
    const endTime = new Date();
    const totalDuration = endTime - startTime;
    
    // Calculate summary
    const summary = results.reduce((acc, result) => ({
      total: acc.total + 1,
      completed: acc.completed + (result.status === 'completed' ? 1 : 0),
      failed: acc.failed + (result.status === 'failed' ? 1 : 0),
      partial: acc.partial + (result.status === 'partial' ? 1 : 0),
      itemsNew: acc.itemsNew + result.itemsNew,
      itemsUpdated: acc.itemsUpdated + result.itemsUpdated,
      totalErrors: acc.totalErrors + result.errors.length,
    }), { total: 0, completed: 0, failed: 0, partial: 0, itemsNew: 0, itemsUpdated: 0, totalErrors: 0 });

    const finalLogEntry = {
      ...logEntry,
      event: 'scraper_run_completed',
      endTime: endTime.toISOString(),
      duration: totalDuration,
      results,
      summary,
    };

    // Log to file
    await fs.appendFile(logFile, JSON.stringify(finalLogEntry) + '\n');
    
    console.log(`\n🎉 Scraper run completed in ${(totalDuration / 1000).toFixed(1)}s`);
    console.log(`📈 Summary: ${summary.completed} successful, ${summary.failed} failed, ${summary.partial} partial`);
    console.log(`📊 Data: ${summary.itemsNew} new items, ${summary.itemsUpdated} updated`);
    
    if (summary.totalErrors > 0) {
      console.log(`⚠️  ${summary.totalErrors} total errors occurred`);
    }

    // Exit with proper code
    process.exit(summary.failed > 0 ? 1 : 0);
    
  } catch (error) {
    const errorLogEntry = {
      ...logEntry,
      event: 'scraper_run_failed',
      endTime: new Date().toISOString(),
      error: error.message,
      stack: error.stack,
    };
    
    await fs.appendFile(logFile, JSON.stringify(errorLogEntry) + '\n');
    
    console.error('\n❌ Scraper run failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runAllScrapers().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runAllScrapers };