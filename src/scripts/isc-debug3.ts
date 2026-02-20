import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: false, channel: 'chrome' });
  const page = await browser.newPage();
  
  await page.goto('https://apps.isc.ca/LAND2/TPS/SearchByLandDescription');
  await page.waitForTimeout(3000);
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

  // Find all buttons and inputs with type=submit/button
  const buttons = await page.evaluate(() => {
    const btns = document.querySelectorAll('button, input[type="submit"], input[type="button"], a.t-button, .t-button');
    return Array.from(btns).map(b => ({
      tag: b.tagName,
      type: (b as any).type,
      value: (b as any).value,
      text: b.textContent?.trim().substring(0, 50),
      id: b.id,
      class: b.className,
      name: (b as any).name,
    }));
  });
  console.log('Buttons:', JSON.stringify(buttons, null, 2));

  // Also check radio buttons and checkboxes
  const radios = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input[type="radio"]')).map(r => ({
      id: r.id, name: (r as any).name, value: (r as any).value, checked: (r as any).checked
    }));
  });
  console.log('Radios:', JSON.stringify(radios, null, 2));

  const checkboxes = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input[type="checkbox"]')).map(r => ({
      id: r.id, name: (r as any).name, checked: (r as any).checked
    }));
  });
  console.log('Checkboxes:', JSON.stringify(checkboxes, null, 2));

  await page.waitForTimeout(10000);
  await browser.close();
}
main().catch(console.error);
