// Isolated local preview; no external requests or account data.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const url = new URL(process.env.INFINITE_STUDIO_TEST_URL || 'http://127.0.0.1:5272/');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('A loopback preview is required');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [320, 390, 1440]) for (const closeMethod of ['escape', 'button']) {
      const context = await browser.newContext({ viewport: { width, height: 800 }, locale: 'zh-TW', reducedMotion: 'reduce' });
      await context.route('**/*', route => new URL(route.request().url()).origin === url.origin ? route.continue() : route.abort());
      const page = await context.newPage();
      await page.goto(url.href);
      await page.getByRole('button', { name: '略過開場' }).click({ timeout: 2000 }).catch(() => {});
      const triggerName = width <= 900 ? '更多功能' : '帳號與設定';
      await page.getByRole('button', { name: triggerName, exact: true }).click();
      await page.getByRole('menuitem', { name: width <= 900 ? '帳號與設定' : '外觀', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '帳號與設定' });
      const nav = dialog.getByRole('navigation', { name: '設定分類' });
      for (const name of ['帳號與隱私', '儲存與同步', '一般設定', '外觀', '工作區', '關於']) {
        const option = nav.getByRole('button', { name, exact: true });
        await option.click();
        assert.equal(await option.getAttribute('aria-current'), 'page');
        assert.equal(await nav.locator('[aria-current="page"]').count(), 1);
      }
      if (closeMethod === 'escape') await page.keyboard.press('Escape');
      else await dialog.getByRole('button', { name: '關閉', exact: true }).click();
      await page.waitForFunction(name => document.activeElement?.getAttribute('aria-label') === name, triggerName);
      console.log(`${width}px ${closeMethod}: PASS`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
