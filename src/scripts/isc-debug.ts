import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: false, channel: 'chrome' });
  const page = await browser.newPage();
  
  // Login first
  console.log('Going to ISC portal...');
  await page.goto('https://apps.isc.ca/PORTAL/Land/Search');
  await page.waitForTimeout(4000);
  
  // Check login state
  const hasLogin = await page.evaluate(() => !!document.querySelector('a[href*="Login"]'));
  console.log('Needs login:', hasLogin);
  
  if (hasLogin) {
    const loginLink = await page.$('a[href*="Login"]');
    if (loginLink) { await loginLink.click(); await page.waitForTimeout(3000); }
    const uf = await page.$('input[name="Username"]');
    if (uf) {
      await uf.fill('NovaSaskatoon');
      await page.fill('input[name="Password"]', 'Novatest123!');
      await page.click('button[type="submit"], input[type="submit"]');
      await page.waitForTimeout(5000);
    }
  }
  
  // Go to Land Description Search
  console.log('Going to Land Description Search...');
  await page.goto('https://apps.isc.ca/LAND2/TPS/SearchByLandDescription');
  await page.waitForTimeout(5000);
  
  // Debug: check page URL and frames
  console.log('URL:', page.url());
  const frames = page.frames();
  console.log('Frames:', frames.length);
  frames.forEach((f, i) => console.log(`  Frame ${i}: ${f.url()}`));
  
  // Check for jQuery
  const hasJQ = await page.evaluate(() => !!(window as any).jQuery);
  console.log('Has jQuery:', hasJQ);
  
  // Check for ComboBox elements
  const comboInfo = await page.evaluate(() => {
    const $ = (window as any).jQuery;
    if (!$) return 'No jQuery';
    
    const meridian = $('#Meridian');
    const meridianCombo = meridian.data('tComboBox');
    
    return {
      meridianExists: meridian.length > 0,
      meridianComboExists: !!meridianCombo,
      meridianHtml: meridian.prop('outerHTML')?.substring(0, 200),
      allInputs: $('input').map(function(this: any) { return { id: $(this).attr('id'), name: $(this).attr('name'), type: $(this).attr('type') }; }).get().slice(0, 20),
      allSelects: $('select').map(function(this: any) { return { id: $(this).attr('id'), name: $(this).attr('name') }; }).get(),
      tComboBoxes: $('.t-combobox, .tComboBox, [data-role="combobox"]').map(function(this: any) { return $(this).attr('id') || $(this).attr('class'); }).get(),
    };
  });
  console.log('Combo info:', JSON.stringify(comboInfo, null, 2));
  
  // Check page title and key text
  const title = await page.title();
  console.log('Title:', title);
  
  const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 1000));
  console.log('Body text:', bodyText.substring(0, 500));

  // Keep browser open for 30s to inspect
  console.log('\nBrowser staying open 30s for inspection...');
  await page.waitForTimeout(30000);
  await browser.close();
}

main().catch(console.error);
