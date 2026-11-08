// Isolated local preview; synthetic recent files and no external network requests.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const url = new URL(process.env.INFINITE_STUDIO_TEST_URL || 'http://127.0.0.1:5272/');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('A loopback preview is required');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [320, 390, 1440]) for (const colorScheme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: 800 }, colorScheme, locale: 'zh-TW', reducedMotion: 'reduce' });
      await context.addInitScript(() => localStorage.setItem('infinite-studio-recent-files-v1', JSON.stringify(
        Array.from({ length: 8 }, (_, index) => ({ kind: 'drive', id: `test-${index}`, name: `測試用很長的最近開啟工作檔名稱 ${index}`, openedAt: new Date().toISOString() }))
      )));
      await context.route('**/*', route => new URL(route.request().url()).origin === url.origin ? route.continue() : route.abort());
      const page = await context.newPage();
      await page.goto(url.href);
      await page.getByRole('button', { name: '略過開場' }).click({ timeout: 2000 }).catch(() => {});
      await page.getByRole('button', { name: '主選單' }).click();
      const trigger = page.getByRole('menuitem', { name: /最近開啟/ });
      await trigger.focus();
      await trigger.press('ArrowLeft');
      const menu = page.getByRole('menu', { name: '最近開啟的工作檔' });
      await menu.waitFor();
      await page.waitForFunction(() => document.activeElement?.closest('#recent-files-menu'));
      assert.equal(await menu.getByRole('menuitem').filter({ hasText: '測試用很長' }).count(), 8);
      assert(await menu.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        if (element.scrollWidth > element.clientWidth + 1 || bounds.left < 0 || bounds.right > innerWidth) return false;
        // At mobile widths the two sidebar handles cross these edges when their
        // stacking order is wrong; they must not receive pointer hits over the menu.
        return [bounds.left + 12, bounds.right - 12].every(x => {
          const hit = document.elementFromPoint(x, Math.min(bounds.bottom - 10, innerHeight * 0.56));
          return hit && element.contains(hit);
        });
      }), `${width}px ${colorScheme}: menu must cover sidebar handles`);
      await page.keyboard.press('Escape');
      assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
      await page.waitForFunction(() => document.activeElement?.textContent?.includes('最近開啟'));
      console.log(`${width}px ${colorScheme}: PASS`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
