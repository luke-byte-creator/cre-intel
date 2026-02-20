import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: false, channel: 'chrome' });
  const page = await browser.newPage();
  
  await page.goto('https://apps.isc.ca/LAND2/TPS/SearchByLandDescription');
  await page.waitForTimeout(4000);

  // Login
  const loginForm = await page.$('#c_username');
  if (loginForm) {
    await page.fill('#c_username', 'NovaSaskatoon');
    await page.fill('#c_Password', 'Novatest123!');
    await page.fill('#c_clientNumber', '141997427');
    await page.fill('#c_txtAcctNo', '107058539');
    await page.fill('#c_txtAcctPwd', 'Novatest123!');
    await page.click('#c_btnSignIn');
    await page.waitForTimeout(6000);
  }

  if (!page.url().includes('SearchByLandDescription')) {
    await page.goto('https://apps.isc.ca/LAND2/TPS/SearchByLandDescription');
    await page.waitForTimeout(4000);
  }

  console.log('URL:', page.url());

  // Debug all combo boxes
  const debug = await page.evaluate(() => {
    const $ = (window as any).jQuery;
    if (!$) return 'No jQuery';
    
    const result: any = {};
    
    // Check each known combo ID
    for (const id of ['Meridian', 'Range', 'Township', 'Section']) {
      const el = $(`#${id}`);
      const combo = el.data('tComboBox');
      result[id] = {
        exists: el.length > 0,
        hasCombo: !!combo,
        html: el.prop('outerHTML')?.substring(0, 300),
      };
      
      if (combo) {
        // Get items from dropdown
        const $items = combo.dropDown?.$items;
        if ($items) {
          result[id].itemCount = $items.length;
          result[id].sampleItems = [];
          for (let i = 0; i < Math.min(10, $items.length); i++) {
            result[id].sampleItems.push($items.eq(i).text().trim());
          }
        }
        // Try .data property
        if (combo.data) {
          result[id].dataCount = combo.data.length;
          result[id].sampleData = combo.data.slice(0, 5);
        }
        // Check methods
        result[id].methods = Object.keys(combo).filter(k => typeof combo[k] === 'function').slice(0, 15);
        result[id].value = combo.value?.();
        result[id].text = combo.text?.();
      }
    }
    
    // Also check if there are divs wrapping the combos
    result.allTCombo = $('.t-combobox').map(function(this: any) { 
      return { id: $(this).attr('id'), classes: $(this).attr('class') }; 
    }).get();
    
    return result;
  });
  
  console.log(JSON.stringify(debug, null, 2));

  // Now try setting Meridian to 3 and see if Range populates
  console.log('\nSetting Meridian to 3...');
  const setResult = await page.evaluate(() => {
    const $ = (window as any).jQuery;
    const combo = $('#Meridian').data('tComboBox');
    const $items = combo?.dropDown?.$items;
    if (!$items) return 'no items';
    for (let i = 0; i < $items.length; i++) {
      if ($items.eq(i).text().trim() === '3') { combo.select(i); return `selected index ${i}`; }
    }
    return 'not found';
  });
  console.log('Meridian:', setResult);
  
  await page.waitForTimeout(2000);
  
  // Check Range after Meridian change (may be dynamically populated)
  const rangeAfter = await page.evaluate(() => {
    const $ = (window as any).jQuery;
    const combo = $('#Range').data('tComboBox');
    if (!combo) return 'no combo';
    const $items = combo.dropDown?.$items;
    return {
      itemCount: $items?.length || 0,
      items: $items ? Array.from({ length: Math.min(10, $items.length) }, (_, i) => $items.eq(i).text().trim()) : [],
      data: combo.data?.slice(0, 10),
    };
  });
  console.log('Range after Meridian set:', JSON.stringify(rangeAfter, null, 2));

  await page.waitForTimeout(20000);
  await browser.close();
}

main().catch(console.error);
