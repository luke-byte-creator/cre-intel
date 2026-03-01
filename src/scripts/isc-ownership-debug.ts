#!/usr/bin/env npx tsx
/**
 * Debug: Check what GetParcelInformation actually returns
 */
import { chromium } from 'playwright';

const ISC_LAND2_URL = 'https://apps.isc.ca/LAND2/TPS/SearchByLandDescription';
const ISC_PARCEL_API = 'https://apps.isc.ca/MapSearch/TPSSearch/GetParcelInformation';
const CREDS = {
  username: 'NovaSaskatoon', password: 'Novatest123!',
  clientNumber: '141997427', accountNumber: '107058539', accountPassword: 'Novatest123!',
};

async function main() {
  const browser = await chromium.launch({ headless: false, args: ['--disable-features=DnsOverHttps'] });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // Login via LAND2
  await page.goto(ISC_LAND2_URL, { timeout: 20000 });
  await page.waitForTimeout(4000);
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
  console.log('Logged in at:', page.url());

  // Test with a few known parcels
  const testParcels = ['118925354', '118981749', '119855245'];
  
  for (const parcelNum of testParcels) {
    console.log(`\n=== Parcel ${parcelNum} ===`);
    const resp = await ctx.request.post(ISC_PARCEL_API, {
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ parcelNumber: parcelNum, fromPopup: true }),
    });
    
    if (!resp.ok()) {
      console.log('ERROR:', resp.status(), await resp.text());
      continue;
    }
    
    const json = await resp.json();
    console.log(JSON.stringify(json, null, 2).substring(0, 3000));
    
    await new Promise(r => setTimeout(r, 3000));
  }

  await browser.close();
}

main();
