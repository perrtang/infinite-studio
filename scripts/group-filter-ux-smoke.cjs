// Isolated local preview; no external requests or account data.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const url = new URL(process.env.INFINITE_STUDIO_TEST_URL || 'http://127.0.0.1:5272/');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('A loopback preview is required');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [320, 390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 800 }, locale: 'zh-TW', reducedMotion: 'reduce' });
      await context.route('**/*', route => new URL(route.request().url()).origin === url.origin ? route.continue() : route.abort());
      const page = await context.newPage();
      await page.goto(url.href);
      await page.getByRole('button', { name: '略過開場' }).click({ timeout: 2000 }).catch(() => {});
      const openSidebar = page.getByRole('button', { name: '展開左側欄', exact: true });
      if (await openSidebar.isVisible()) await openSidebar.click();
      await page.getByRole('tab', { name: '分群' }).click();
      const any = page.getByRole('button', { name: '任一標記', exact: true });
      const all = page.getByRole('button', { name: '全部符合', exact: true });
      assert.equal(await any.getAttribute('aria-pressed'), 'true');
      assert.equal(await all.getAttribute('aria-pressed'), 'false');
      await all.focus();
      await page.keyboard.press('Enter');
      assert.equal(await any.getAttribute('aria-pressed'), 'false');
      assert.equal(await all.getAttribute('aria-pressed'), 'true');
      await any.focus();
      await page.keyboard.press('Space');
      assert.equal(await any.getAttribute('aria-pressed'), 'true');
      assert.equal(await all.getAttribute('aria-pressed'), 'false');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      console.log(`${width}px keyboard and selected state: PASS`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
