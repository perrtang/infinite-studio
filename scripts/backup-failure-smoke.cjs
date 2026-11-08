// Run against an isolated loopback preview with Playwright available via NODE_PATH.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
  const base = new URL(process.env.INFINITE_STUDIO_TEST_URL || 'http://127.0.0.1:5272/');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)) throw new Error('Loopback preview required');
  base.search = '?authPreview=signed-in';
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ locale: 'zh-TW', viewport: { width, height: 900 } });
      await context.route('**/*', route => new URL(route.request().url()).origin === base.origin ? route.continue() : route.abort());
      await context.addInitScript(() => { URL.createObjectURL = () => { throw new Error('Simulated download failure'); }; });
      const page = await context.newPage();
      await page.goto(base.href);
      await page.getByRole('button', { name: '加入文字', exact: true }).click();
      await page.keyboard.press('Escape');
      const count = await page.locator('.board-object').count();
      assert.equal(count, 1);
      await page.getByRole('button', { name: '主選單', exact: true }).click();
      await page.getByText('下載本機副本…', { exact: true }).click();
      await page.getByText('下載備份失敗；目前畫面仍開啟，請檢查下載設定後重試。', { exact: true }).waitFor();
      assert.equal(await page.locator('.board-object').count(), count, 'failure must retain the canvas');
      assert.equal(await page.getByText('儲存失敗，畫布仍保留在本機自動儲存。', { exact: true }).count(), 0);
      console.log(`Backup failure, ${width}px: PASS`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
