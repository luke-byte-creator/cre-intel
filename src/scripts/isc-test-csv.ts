import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: false, channel: 'chrome' });
  const page = await browser.newPage();
  
  // Login
  await page.goto('https://apps.isc.ca/LAND2/TPS/SearchByLandDescription');
  await page.waitForTimeout(3000);
  const lf = await page.$('#c_username');
  if (lf) {
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

  // Set form fields
  async function setCombo(id: string, value: string) {
    return page.evaluate(({ id, value }) => {
      const $ = (window as any).jQuery;
      const combo = $(`#${id}`).data('tComboBox');
      if (!combo) return false;
      const $items = combo.dropDown?.$items;
      if (!$items) return false;
      for (let i = 0; i < $items.length; i++) {
        if ($items.eq(i).text().trim() === value) { combo.select(i); return true; }
      }
      return false;
    }, { id, value });
  }

  await setCombo('Meridian', '3');
  await page.waitForTimeout(800);
  await setCombo('Range', '05');
  await page.waitForTimeout(800);
  await setCombo('Township', '37');
  await page.waitForTimeout(800);
  await setCombo('Section', '05');
  await page.waitForTimeout(500);

  // Click Search
  await page.click('a:has-text("Search"):not(.land_menu_link)');
  await page.waitForTimeout(10000);

  console.log('URL:', page.url());
  
  // Find CSV link
  const csvInfo = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a'));
    const csvLinks = links.filter(a => a.href?.includes('LLD_Search') || a.href?.includes('.csv') || a.textContent?.includes('Download') || a.textContent?.includes('CSV'));
    return csvLinks.map(a => ({ href: a.href, text: a.textContent?.trim().substring(0, 50), id: a.id }));
  });
  console.log('CSV links:', JSON.stringify(csvInfo, null, 2));
  
  // Also look for any links with "download" or "export" in href
  const allLinks = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a')).map(a => ({
      href: a.href?.substring(0, 100),
      text: a.textContent?.trim().substring(0, 30)
    })).filter(a => a.href && !a.href.startsWith('javascript'));
  });
  console.log('All links:', JSON.stringify(allLinks, null, 2));

  // Try downloading if CSV link found
  if (csvInfo.length > 0) {
    const url = csvInfo[0].href;
    console.log('Downloading:', url);
    const resp = await page.context().request.get(url);
    console.log('Status:', resp.status());
    const text = await resp.text();
    console.log('First 500 chars:', text.substring(0, 500));
    console.log('Lines:', text.split('\n').length);
  }

  await page.waitForTimeout(5000);
  await browser.close();
}
main().catch(console.error);
