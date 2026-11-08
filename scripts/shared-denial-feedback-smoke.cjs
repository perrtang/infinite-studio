// Synthetic Drive denial: isolated preview only; no real Drive calls or data.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
  const base = new URL(process.env.INFINITE_STUDIO_TEST_URL || 'http://127.0.0.1:5272/');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)) throw new Error('Loopback preview required');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [320, 390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'zh-TW', reducedMotion: 'reduce' });
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== base.origin) return route.abort();
        if (url.pathname !== '/main.jsx') return route.continue();
        const response = await route.fetch();
        let body = await response.text();
        const download = 'const { downloadCurrentGoogleDriveMoodboard } = await loadDriveRuntime();';
        const anchor = 'const hasBlockingDialog = Boolean(';
        assert(body.includes(download) && body.includes(anchor));
        body = body.replace(download, `if (window.__qaDeny) throw Object.assign(new Error('test denial'), { status: 404 });\n${download}`);
        body = body.replace(anchor, `window.__qaOpenDenied = () => { window.__qaDeny = true; initialDriveShareRef.current = {fileId:'qa-shared-file',resourceKey:''}; driveTokenRef.current = {accessToken:'test',expiresAt:Date.now()+60000}; setShowCollaboration(true); void openIncomingDirectly(); };\n${anchor}`);
        return route.fulfill({ response, body });
      });
      const page = await context.newPage();
      await page.goto(new URL('?authPreview=signed-in', base).href);
      await page.waitForFunction(() => window.__qaOpenDenied);
      await page.waitForTimeout(2200);
      await page.evaluate(() => window.__qaOpenDenied());
      const dialog = page.getByRole('dialog', { name: '分享 Google Drive 工作檔' });
      await dialog.getByText('共享檔案尚未開啟', { exact: true }).waitFor();
      assert.equal(await dialog.getByText('請先選取這份檔案', { exact: false }).count(), 1, 'the denial guidance must appear only once');
      assert(await dialog.getByRole('button', { name: '授權這份共享檔案' }).isVisible());
      assert(await dialog.getByRole('link', { name: '在 Google Drive 檢查或申請權限' }).isVisible());
      assert.equal(await dialog.locator('.toast').count(), 0, 'the same denial must not appear as a second message');
      assert(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
      console.log(`${width}px shared-file denial feedback: PASS`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
