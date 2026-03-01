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

  console.log('Form set, clicking search...');
  
  // Click the Search link
  await page.click('a:has-text("Search"):not(.land_menu_link)');
  console.log('Clicked, waiting for results...');
  await page.waitForTimeout(10000);

  // Dump page info
  console.log('URL:', page.url());
  const title = await page.title();
  console.log('Title:', title);
  
  const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 2000));
  console.log('Body text:', bodyText.substring(0, 1500));
  
  // Check for CSV link
  const csvLink = await page.evaluate(() => {
    const a = document.querySelector('a[href*="LLD_Search"]');
    return a ? (a as HTMLAnchorElement).href : null;
  });
  console.log('CSV link:', csvLink);

  // Check for table
  const tableInfo = await page.evaluate(() => {
    const tables = document.querySelectorAll('table');
    return Array.from(tables).map(t => ({
      id: t.id, class: t.className, rows: t.rows.length,
      firstRow: t.rows[1] ? Array.from(t.rows[1].cells).map(c => c.textContent?.trim().substring(0,30)) : []
    }));
  });
  console.log('Tables:', JSON.stringify(tableInfo, null, 2));

  await page.waitForTimeout(15000);
  await browser.close();
}
main().catch(console.error);
