#!/usr/bin/env npx tsx
/**
 * Phase 4: ISC Ownership Lookups via GetParcelInformation
 * 
 * Usage: npx tsx isc-ownership-lookup.ts [--test] [--limit N]
 *   --test: Only do 5 lookups
 *   --limit N: Max lookups per session (default 50)
 */
import { chromium } from 'playwright';
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.resolve(__dirname, '../../data/cre-intel.db');
const ISC_PARCEL_API = 'https://apps.isc.ca/MapSearch/TPSSearch/GetParcelInformation';
const LOGIN_URL = 'https://apps.isc.ca/PORTALSEC/SecWeb/SecPage.aspx?ReturnUrl=%2fLAND2%2fTPS%2fSearchByLandDescription';
const CREDS = {
  username: 'NovaSaskatoon',
  password: 'Novatest123!',
  clientNumber: '141997427',
  accountNumber: '107058539',
  accountPassword: 'Novatest123!',
};

const MIN_DELAY = 5000;
const MAX_DELAY = 12000;
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  const args = process.argv.slice(2);
  const isTest = args.includes('--test');
  const limitIdx = args.indexOf('--limit');
  const maxLookups = isTest ? 5 : (limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : 50);

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Get ISC parcels without ownership data — prioritize those matched to CRE assessments
  let batch = db.prepare(`
    SELECT ip.id, ip.parcel_number, ip.legal_description
    FROM isc_parcels ip
    WHERE ip.parcel_number != ''
    AND ip.id NOT IN (SELECT isc_parcel_id FROM isc_ownership)
    AND ip.id IN (SELECT isc_parcel_id FROM isc_parcel_matches)
    ORDER BY ip.id LIMIT ?
  `).all(maxLookups) as any[];

  if (batch.length === 0) {
    batch = db.prepare(`
      SELECT id, parcel_number, legal_description FROM isc_parcels
      WHERE parcel_number != '' AND id NOT IN (SELECT isc_parcel_id FROM isc_ownership)
      ORDER BY id LIMIT ?
    `).all(maxLookups) as any[];
  }

  if (batch.length === 0) {
    console.log('✅ All parcels already have ownership data');
    db.close();
    return;
  }

  console.log(`📋 ${batch.length} parcels to look up (${isTest ? 'TEST MODE' : 'production'})`);

  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-features=DnsOverHttps', '--no-sandbox'],
  });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  try {
    // Navigate to ISC login page
    console.log('\n🔑 Logging into ISC...');
    await page.goto(LOGIN_URL, { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const loginForm = await page.$('#c_username');
    if (loginForm) {
      await page.fill('#c_username', CREDS.username);
      await page.fill('#c_Password', CREDS.password);
      await page.fill('#c_clientNumber', CREDS.clientNumber);
      await page.fill('#c_txtAcctNo', CREDS.accountNumber);
      await page.fill('#c_txtAcctPwd', CREDS.accountPassword);
      await page.click('#c_btnSignIn');
      await page.waitForTimeout(6000);
    }
    console.log('  URL:', page.url());
    console.log('✅ Ready\n');

    const insertOwnership = db.prepare(`
      INSERT OR REPLACE INTO isc_ownership 
      (isc_parcel_id, parcel_number, owner_names, title_number, title_share,
       last_amendment_date, municipality, commodity_description, title_value, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    let success = 0;
    let failed = 0;

    for (let i = 0; i < batch.length; i++) {
      const p = batch[i];
      if (i > 0) {
        const delay = rand(MIN_DELAY, MAX_DELAY);
        console.log(`  ⏳ ${(delay / 1000).toFixed(0)}s delay...`);
        await sleep(delay);
      }

      console.log(`🔍 [${i + 1}/${batch.length}] Parcel ${p.parcel_number}`);

      try {
        const apiResp = await ctx.request.post(ISC_PARCEL_API, {
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify({ parcelNumber: p.parcel_number, fromPopup: true }),
        });

        if (!apiResp.ok()) {
          const status = apiResp.status();
          console.error(`  ❌ HTTP ${status}`);
          if (status === 429) {
            console.error('  🛑 RATE LIMITED — stopping');
            break;
          }
          failed++;
          continue;
        }

        const response = await apiResp.json();
        const summaries = response.SearchTitleSummaries || [];

        if (summaries.length === 0) {
          console.log('  📭 No title data');
          insertOwnership.run(p.id, p.parcel_number, null, null, null, null, null, null, null);
          success++;
          continue;
        }

        const owners: string[] = [];
        const titles: string[] = [];
        const shares: string[] = [];
        let lastAmendment = '';
        let municipality = '';
        let commodity = '';
        let totalValue = 0;

        for (const s of summaries) {
          const holder = (typeof s.TitleHolders === 'string' ? s.TitleHolders : '').trim();
          if (holder && !owners.includes(holder)) owners.push(holder);
          if (s.TitleNumber) titles.push(String(s.TitleNumber));
          if (s.ConvertedTitleNumber) titles.push(s.ConvertedTitleNumber);
          if (s.TitleShareNumerator != null && s.TitleShareDenominator != null) {
            shares.push(`${s.TitleShareNumerator}/${s.TitleShareDenominator}`);
          }
          if (s.TitleLastAmendmentDate) {
            const ms = s.TitleLastAmendmentDate.match(/\/Date\((\d+)\)\//);
            lastAmendment = ms ? new Date(parseInt(ms[1])).toISOString().split('T')[0] : '';
          }
          if (s.Municipality) municipality = s.Municipality;
          if (s.CommodityUnitDescription) commodity = s.CommodityUnitDescription;
          if (s.TitleValue) totalValue += s.TitleValue;
        }

        console.log(`  ✅ ${owners.join(', ') || '(no owner)'} | $${totalValue.toLocaleString()} | ${titles[0] || ''}`);

        insertOwnership.run(
          p.id, p.parcel_number,
          owners.join('; ') || null,
          titles.join('; ') || null,
          shares.join('; ') || null,
          lastAmendment || null,
          municipality || null,
          commodity || null,
          totalValue || null
        );
        success++;

      } catch (err: any) {
        console.error(`  ❌ ${err.message?.substring(0, 100)}`);
        if (err.message?.includes('429') || err.message?.includes('blocked')) {
          console.error('  🛑 Stopping');
          break;
        }
        failed++;
      }
    }

    console.log(`\n=== Session Complete ===`);
    console.log(`Success: ${success} | Failed: ${failed}`);
    const total = (db.prepare('SELECT COUNT(*) as c FROM isc_ownership').get() as any).c;
    const withOwners = (db.prepare("SELECT COUNT(*) as c FROM isc_ownership WHERE owner_names IS NOT NULL AND owner_names != ''").get() as any).c;
    console.log(`Total ownership records: ${total} (${withOwners} with owner names)`);

  } finally {
    await browser.close();
    db.close();
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
