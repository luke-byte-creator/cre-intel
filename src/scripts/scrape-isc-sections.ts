/**
 * ISC Land Description Search Scraper — Phase 2
 * Playwright-driven, uses Telerik ComboBox jQuery API
 * 
 * Max 10 searches/session, 30-90s delays, stops on 429
 * Never clicks "View Title", never uses "Search by Name"
 */

import { chromium, type Page } from 'playwright';
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(__dirname, '../../data/cre-intel.db');
const MAX_SEARCHES = 10;
const MIN_DELAY = 30_000;
const MAX_DELAY = 90_000;

interface Section { township: number; range: number; section: number; }

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const sleep = (ms: number) => { console.log(`  ⏳ ${Math.round(ms/1000)}s delay...`); return new Promise(r => setTimeout(r, ms)); };

// 93 sections ordered by CRE property density
const ALL_SECTIONS: Section[] = [
  {township:37,range:5,section:5},{township:37,range:5,section:17},{township:37,range:5,section:8},
  {township:37,range:5,section:6},{township:37,range:5,section:28},{township:37,range:5,section:20},
  {township:37,range:5,section:29},{township:37,range:5,section:21},{township:36,range:5,section:31},
  {township:36,range:5,section:34},{township:36,range:5,section:32},{township:37,range:5,section:2},
  {township:36,range:5,section:33},{township:37,range:5,section:18},{township:37,range:5,section:33},
  {township:36,range:6,section:36},{township:37,range:5,section:34},{township:37,range:5,section:9},
  {township:37,range:6,section:1},{township:37,range:5,section:16},{township:37,range:5,section:4},
  {township:37,range:5,section:7},{township:36,range:5,section:35},{township:37,range:5,section:32},
  {township:36,range:5,section:36},{township:36,range:5,section:30},{township:37,range:5,section:25},
  {township:37,range:5,section:3},{township:37,range:5,section:1},{township:37,range:5,section:24},
  {township:37,range:5,section:31},{township:37,range:6,section:2},{township:36,range:5,section:29},
  {township:37,range:5,section:14},{township:37,range:5,section:35},{township:37,range:5,section:15},
  {township:37,range:5,section:10},{township:37,range:5,section:11},{township:37,range:5,section:22},
  {township:37,range:5,section:13},{township:37,range:5,section:26},{township:36,range:5,section:27},
  {township:37,range:5,section:27},{township:37,range:6,section:12},{township:37,range:5,section:19},
  {township:36,range:5,section:26},{township:37,range:5,section:30},{township:37,range:6,section:11},
  {township:37,range:4,section:19},{township:36,range:6,section:25},{township:37,range:5,section:12},
  {township:36,range:5,section:28},{township:36,range:6,section:35},{township:37,range:6,section:3},
  {township:37,range:4,section:18},{township:37,range:6,section:13},{township:36,range:5,section:25},
  {township:37,range:4,section:30},{township:36,range:5,section:20},{township:36,range:6,section:26},
  {township:37,range:6,section:14},{township:36,range:4,section:30},{township:36,range:6,section:34},
  {township:37,range:4,section:7},{township:36,range:5,section:22},{township:36,range:5,section:24},
  {township:36,range:5,section:14},{township:37,range:4,section:20},{township:37,range:6,section:10},
  {township:36,range:5,section:15},{township:36,range:5,section:16},{township:36,range:6,section:27},
  {township:36,range:6,section:28},{township:36,range:4,section:31},{township:36,range:5,section:19},
  {township:36,range:5,section:21},{township:36,range:5,section:23},{township:37,range:4,section:6},
  {township:37,range:6,section:4},{township:37,range:6,section:36},{township:36,range:4,section:19},
  {township:36,range:4,section:20},{township:36,range:4,section:29},{township:36,range:4,section:32},
  {township:36,range:6,section:24},{township:36,range:6,section:33},{township:37,range:4,section:8},
  {township:37,range:6,section:5},{township:38,range:5,section:3},{township:38,range:5,section:4},
  {township:38,range:5,section:8},{township:38,range:5,section:9},{township:38,range:6,section:1},
];

/**
 * Set a Telerik ComboBox by finding the item whose text/value matches.
 * ISC ComboBox data items have { Text: "5", Value: "5" } format.
 * Meridian uses Value "3" for W3M.
 */
async function setCombo(page: Page, id: string, value: string): Promise<boolean> {
  return page.evaluate(({ id, value }) => {
    const $ = (window as any).jQuery;
    if (!$) return false;
    const combo = $(`#${id}`).data('tComboBox');
    if (!combo) return false;
    
    // Get dropdown items
    const $items = combo.dropDown?.$items;
    if (!$items || !$items.length) return false;
    
    for (let i = 0; i < $items.length; i++) {
      const text = $items.eq(i).text().trim();
      if (text === value) {
        combo.select(i);
        return true;
      }
    }
    return false;
  }, { id, value });
}

async function searchSection(page: Page, s: Section): Promise<string | null> {
  const key = `T${s.township}-R${s.range}-S${s.section}`;
  console.log(`\n🔍 ${key}`);

  await page.goto('https://apps.isc.ca/LAND2/TPS/SearchByLandDescription');
  await page.waitForTimeout(3000);

  // Wait for jQuery/Telerik to load
  await page.waitForFunction(() => !!(window as any).jQuery?.('#Meridian').data('tComboBox'), { timeout: 10000 })
    .catch(() => console.log('  ⚠️ ComboBox not ready, trying anyway...'));

  // Fill form via Telerik API — values are zero-padded (e.g. "05", "37")
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (!await setCombo(page, 'Meridian', '3')) console.log('  ⚠️ Meridian set failed');
  await page.waitForTimeout(800);
  if (!await setCombo(page, 'Range', pad(s.range))) console.log('  ⚠️ Range set failed');
  await page.waitForTimeout(800);
  if (!await setCombo(page, 'Township', pad(s.township))) console.log('  ⚠️ Township set failed');
  await page.waitForTimeout(800);
  if (!await setCombo(page, 'Section', pad(s.section))) console.log('  ⚠️ Section set failed');
  await page.waitForTimeout(500);

  // Surface Only radio (SearchOptionSurfaceMineral value="1" = Surface only, already default)
  // Return All Titles checkbox (ReturnAllTitles, already checked by default)
  // Just verify they're set correctly
  await page.evaluate(() => {
    // Surface only = value "1" on SearchOptionSurfaceMineral (already default)
    const surfaceRadio = document.querySelector('input[name="SearchOptionSurfaceMineral"][value="1"]') as HTMLInputElement;
    if (surfaceRadio && !surfaceRadio.checked) surfaceRadio.click();
    // Return all titles
    const allTitles = document.getElementById('ReturnAllTitles') as HTMLInputElement;
    if (allTitles && !allTitles.checked) allTitles.click();
  });
  await page.waitForTimeout(300);

  // Verify form values before submit
  const formVals = await page.evaluate(() => {
    const $ = (window as any).jQuery;
    return {
      meridian: $('#Meridian').data('tComboBox')?.value?.() || $('#Meridian-input')?.val(),
      range: $('#Range').data('tComboBox')?.value?.() || $('#Range-input')?.val(),
      township: $('#Township').data('tComboBox')?.value?.() || $('#Township-input')?.val(),
      section: $('#Section').data('tComboBox')?.value?.() || $('#Section-input')?.val(),
    };
  });
  console.log(`  Form values: M=${formVals.meridian} T=${formVals.township} R=${formVals.range} S=${formVals.section}`);

  // Click Search (it's an <a> tag with text "Search" and href="#")
  await page.click('a:has-text("Search"):not(.land_menu_link)');
  await page.waitForTimeout(8000);

  // Check for problems
  const url = page.url();
  const content = await page.content();
  
  // Only flag rate limit on actual HTTP error pages (not ISC app content that might contain these words)
  const isErrorPage = !content.includes('SearchByLandDescription') && !content.includes('LLD_Search');
  if (isErrorPage && (content.includes('Too Many Requests') || content.includes('HTTP 429'))) {
    console.error('  🛑 RATE LIMITED (actual HTTP error page)');
    return 'RATE_LIMITED';
  }

  if (content.includes('No results') || content.includes('returned 0 results') || content.includes('no parcels')) {
    console.log('  📭 No parcels');
    return '';
  }

  // Find CSV download link
  const csvHref = await page.evaluate(() => {
    const link = document.querySelector('a[href*="LLD_Search"]') as HTMLAnchorElement;
    return link?.href || null;
  });

  if (csvHref) {
    console.log(`  📥 Downloading CSV...`);
    try {
      const resp = await page.context().request.get(csvHref);
      if (resp.ok()) {
        const csv = await resp.text();
        const lines = csv.trim().split('\n');
        console.log(`  ✅ ${lines.length - 1} rows`);
        return csv;
      }
    } catch (e) {
      console.log(`  ⚠️ CSV fetch failed, falling back to table parse`);
    }
  }

  // Fallback: parse HTML table - ISC uses deeply nested layout tables
  console.log('  📋 Parsing HTML table...');
  const rows = await page.evaluate(() => {
    // Find all text nodes containing 9-digit parcel numbers, then extract surrounding data
    const results: string[][] = [];
    const allTds = document.querySelectorAll('td');
    for (const td of allTds) {
      const text = td.textContent?.trim() || '';
      // Parcel numbers are 9 digits
      if (/^\d{9}$/.test(text)) {
        // Walk up to find the containing row/section and extract sibling data
        let parent = td.closest('tr') || td.parentElement;
        // Look at neighboring cells in the same structural context
        const row = parent ? Array.from(parent.querySelectorAll('td')).map(c => c.textContent?.trim() || '') : [text];
        if (row.length >= 2) {
          results.push(row);
        }
      }
    }
    return results;
  });

  if (rows.length === 0) {
    // Could be a "more than 300 results" page that still has the table
    const allText = await page.evaluate(() => document.body.innerText.substring(0, 500));
    console.log(`  Page text: ${allText.substring(0, 200)}...`);
    console.log('  ⚠️ No parseable results');
    return '';
  }

  // Build CSV from table rows
  // Columns: Parcel Number, Parcel Type, Parcel Class, Municipality, Ties, Legal Description
  const header = 'Parcel Number,Parcel Type,Parcel Class,Municipality,Ties,Legal Description';
  const csvRows = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(','));
  return header + '\n' + csvRows.join('\n');
}

function parseCSV(csv: string, s: Section): any[] {
  if (!csv?.trim()) return [];
  const key = `T${s.township}-R${s.range}-S${s.section}`;
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];

  // Parse header
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  
  return lines.slice(1).map(line => {
    // Simple CSV parse (handles quoted fields)
    const vals: string[] = [];
    let current = '';
    let inQuote = false;
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === ',' && !inQuote) { vals.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    vals.push(current.trim());

    const obj: Record<string, string> = {};
    headers.forEach((h, i) => obj[h] = vals[i] || '');

    const legal = obj['Land Description'] || obj['Legal Description'] || '';
    // CSV has explicit columns for lot, block/parcel, plan
    const block = obj['block/parcel'] || '';
    const lot = obj['lot'] || '';
    const plan = obj['plan'] || '';

    return {
      parcel_number: obj['Parcel Number'] || '',
      title_number: '', // not in CSV
      legal_description: legal,
      municipality: obj['Municipality'] || '',
      parcel_class: obj['Parcel Class'] || '',
      plan_number: plan,
      block_number: block,
      lot_number: lot,
      township: s.township,
      range_num: s.range,
      section: s.section,
      key
    };
  }).filter(p => p.parcel_number); // skip empty rows
}

async function main() {
  const db = new Database(DB_PATH);

  const searched = new Set(
    db.prepare('SELECT township || \'-\' || range_num || \'-\' || section as key FROM isc_search_log').all()
      .map((r: any) => r.key)
  );

  const batch: Section[] = [];
  for (const s of ALL_SECTIONS) {
    if (!searched.has(`${s.township}-${s.range}-${s.section}`) && batch.length < MAX_SEARCHES) {
      batch.push(s);
    }
  }

  if (!batch.length) { console.log('✅ All done!'); db.close(); return; }

  console.log(`📋 Session: ${batch.length} sections`);
  batch.forEach(s => console.log(`  T${s.township} R${s.range} S${s.section}`));

  const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--disable-features=DnsOverHttps'] });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  try {
    // Login to ISC LAND2 (separate auth from portal)
    console.log('\n🔑 Logging into ISC LAND2...');
    await page.goto('https://apps.isc.ca/LAND2/TPS/SearchByLandDescription');
    await page.waitForTimeout(4000);

    // LAND2 redirects to PORTALSEC login with: username, password, client#, account#, account password
    const loginForm = await page.$('#c_username');
    if (loginForm) {
      await page.fill('#c_username', 'NovaSaskatoon');
      await page.fill('#c_Password', 'Novatest123!');
      await page.fill('#c_clientNumber', '141997427');
      await page.fill('#c_txtAcctNo', '107058539');
      await page.fill('#c_txtAcctPwd', 'Novatest123!');
      await page.click('#c_btnSignIn');
      await page.waitForTimeout(6000);
      console.log('  Post-login URL:', page.url());
    }

    // After login, should redirect to the search page
    if (!page.url().includes('SearchByLandDescription')) {
      console.log('  Navigating to search form...');
      await page.goto('https://apps.isc.ca/LAND2/TPS/SearchByLandDescription');
      await page.waitForTimeout(4000);
    }
    console.log('✅ Ready\n');

    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO isc_parcels 
      (parcel_number, title_number, legal_description, municipality, parcel_class,
       plan_number, block_number, lot_number, township, range_num, section, meridian, search_section_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'W3M', ?)
    `);
    const logStmt = db.prepare(`
      INSERT OR REPLACE INTO isc_search_log (township, range_num, section, parcel_count)
      VALUES (?, ?, ?, ?)
    `);

    let total = 0;

    for (let i = 0; i < batch.length; i++) {
      const s = batch[i];
      if (i > 0) await sleep(rand(MIN_DELAY, MAX_DELAY));

      const csv = await searchSection(page, s);
      if (csv === 'RATE_LIMITED' || csv === null) {
        console.error('\n🛑 Stopping.');
        break;
      }

      const parcels = parseCSV(csv, s);
      console.log(`  📊 ${parcels.length} parcels parsed`);

      db.transaction(() => {
        for (const p of parcels) {
          insertStmt.run(p.parcel_number, p.title_number, p.legal_description, p.municipality,
            p.parcel_class, p.plan_number, p.block_number, p.lot_number,
            p.township, p.range_num, p.section, p.key);
        }
        logStmt.run(s.township, s.range, s.section, parcels.length);
      })();

      total += parcels.length;
      console.log(`  ✅ ${total} total | ${i+1}/${batch.length} sections done`);
    }

    console.log(`\n=== Session Complete ===`);
    console.log(`Sections: ${batch.length} | Parcels: ${total}`);
    console.log(`DB total: ${(db.prepare('SELECT COUNT(*) as c FROM isc_parcels').get() as any).c}`);

  } finally {
    await browser.close();
    db.close();
  }
}

main().catch(console.error);
