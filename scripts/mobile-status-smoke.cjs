// Isolated preview: no account or Drive requests are made.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const base = new URL(process.env.INFINITE_STUDIO_TEST_URL || 'http://127.0.0.1:5272/');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)) throw new Error('Loopback preview required');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [320, 390, 1440]) for (const scheme of ['dark', 'light']) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'zh-TW', colorScheme: scheme, hasTouch: true, reducedMotion: 'reduce' });
      await context.route('**/*', route => new URL(route.request().url()).origin === base.origin ? route.continue() : route.abort());
      const page = await context.newPage();
      await page.goto(base.origin + '/?authPreview=signed-in');
      await page.waitForTimeout(2000);
      await page.getByRole('button', { name: '加入文字', exact: true }).click();
      const status = page.locator('.toast.is-in-header');
      await status.waitFor();
      await status.tap();
      const result = await status.evaluate(el => {
        const css = getComputedStyle(el, '::after');
        const box = el.getBoundingClientRect();
        return { focused: document.activeElement === el, content: css.content, title: el.title, left: box.left + parseFloat(css.left || 0), width: parseFloat(css.width || 0) };
      });
      assert(result.focused, 'touch should focus status');
      if (width <= 620) {
        assert(result.content.includes(result.title), 'complete status must be visible on focus');
        assert(result.left >= 0 && result.left + result.width <= width, 'expanded status must fit viewport');
      } else assert.equal(result.content, 'none');
      await status.getByRole('button', { name: '關閉提示' }).click();
      await status.waitFor({ state: 'hidden' });
      console.log(`${width}px ${scheme}: PASS`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
