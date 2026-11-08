// Optional regression: NODE_PATH=<playwright node_modules> INFINITE_STUDIO_TEST_URL=http://127.0.0.1:5272/ node scripts/sharing-ux-smoke.cjs
// Synthetic preview only. External requests are blocked and no Drive permission is changed.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const base = new URL(process.env.INFINITE_STUDIO_TEST_URL || 'http://127.0.0.1:5272/');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)) throw new Error('Only an isolated loopback preview is allowed.');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [320, 390, 1440]) for (const mode of ['failure', 'cancel', 'success']) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'zh-TW', reducedMotion: 'reduce' });
      await context.addInitScript(() => localStorage.setItem('infinite-moodboard-interface-locale-v1', 'zh-Hant'));
      await context.route('**/*', route => new URL(route.request().url()).origin === base.origin ? route.continue() : route.abort());
      const page = await context.newPage();
      base.search = `?sharingPreview=owner-remove-${mode}`;
      await page.goto(base.href);
      const dialog = page.getByRole('dialog', { name: '分享 Google Drive 工作檔' });
      await dialog.getByRole('button', { name: '移除 測試成員 的存取權' }).click();
      if (mode === 'failure') {
        const feedback = dialog.locator('.collaboration-member-feedback');
        await feedback.getByText('請先重新連結 Google Drive，再移除成員。').waitFor();
        assert(await feedback.evaluate(element => {
          const bounds = element.getBoundingClientRect();
          const parent = element.closest('article').getBoundingClientRect();
          return bounds.left >= parent.left - 1 && bounds.right <= parent.right + 1 && element.scrollWidth <= element.clientWidth + 1;
        }), 'member failure feedback must fit inside its row');
        assert.equal(await dialog.getByText('測試成員', { exact: true }).count(), 1);
      } else if (mode === 'success') {
        const feedback = dialog.getByRole('status').filter({ hasText: '已移除成員的存取權。' });
        await feedback.waitFor();
        await page.waitForFunction(() => document.activeElement?.textContent?.includes('已移除成員的存取權。'));
        assert.equal(await dialog.getByText('測試成員', { exact: true }).count(), 0);
      } else {
        assert.equal(await dialog.getByText('測試成員', { exact: true }).count(), 1);
        assert.equal(await dialog.getByRole('alert').count(), 0);
        assert.equal(await dialog.getByText('已移除成員的存取權。').count(), 0);
      }
      console.log(`${width}px ${mode}: PASS`);
      await context.close();
    }
    for (const width of [320, 390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'zh-TW' });
      await context.addInitScript(() => localStorage.setItem('infinite-moodboard-interface-locale-v1', 'zh-Hant'));
      await context.route('**/*', route => new URL(route.request().url()).origin === base.origin ? route.continue() : route.abort());
      const page = await context.newPage();
      base.search = '?sharingPreview=edit-request';
      await page.goto(base.href);
      const dialog = page.getByRole('dialog', { name: '需要編輯權限' });
      const request = await dialog.getByRole('textbox', { name: '給擁有者的訊息' }).inputValue();
      assert(request.includes('driveFile=preview_shared_file_123456'), 'request must retain the shared file');
      await dialog.getByRole('button', { name: '重新檢查權限' }).click();
      await dialog.getByText('目前仍是檢視權限；請確認擁有者已授予編輯權限。').waitFor();
      assert(await dialog.isVisible(), 'viewers must not lose the request dialog');
      console.log(`${width}px viewer permission recheck: PASS`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
