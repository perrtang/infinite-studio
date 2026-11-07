// Optional browser regression: install Playwright locally and run against a dev server.
// A fresh browser context is used, and non-loopback requests are blocked.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const base = new URL(process.env.INFINITE_STUDIO_TEST_URL || 'http://127.0.0.1:5238/');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)) throw new Error('Only an isolated loopback preview is allowed.');
  base.search = '?authPreview=signed-in';
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await context.route('**/*', (route) => new URL(route.request().url()).origin === base.origin ? route.continue() : route.abort());
    const page = await context.newPage();
    await page.goto(base.href);
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: '加入文字', exact: true }).click();
    await page.keyboard.press('Escape');
    const objects = page.locator('.board-object');
    assert.equal(await objects.count(), 1);
    const copied = await page.evaluate(() => {
      const data = new DataTransfer();
      window.dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, cancelable: true }));
      window.__studioSmokeClipboard = data;
      return data.getData('text/plain');
    });
    assert.ok(copied, 'selection must be copied before checking modal clipboard isolation');
    await page.getByRole('button', { name: '主選單', exact: true }).click();
    await page.getByText('版本紀錄', { exact: true }).first().click();
    const dialog = page.getByRole('dialog', { name: '版本紀錄' });
    await dialog.waitFor();
    await page.waitForTimeout(100);
    for (const key of ['Tab', 'Shift+Tab']) {
      for (let i = 0; i < 16; i++) {
        await page.keyboard.press(key);
        assert.equal(await dialog.evaluate((el) => el.contains(document.activeElement)), true, `${key} escaped dialog`);
      }
    }
    await page.evaluate(() => {
      window.dispatchEvent(new ClipboardEvent('cut', { clipboardData: new DataTransfer(), cancelable: true }));
      window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: window.__studioSmokeClipboard, cancelable: true }));
    });
    await page.keyboard.press('Delete');
    await page.keyboard.press('Control+z');
    assert.equal(await objects.count(), 1, 'dialog shortcuts changed the canvas');
    await dialog.getByPlaceholder('例如：完成第一輪素材篩選').focus();
    await page.keyboard.press('Escape');
    assert.equal(await dialog.isVisible(), false);
    assert.equal(await page.getByRole('button', { name: '主選單', exact: true }).evaluate((el) => el === document.activeElement), true);
    await page.getByRole('tab', { name: '素材', exact: true }).click();
    await page.getByRole('button', { name: '主選單', exact: true }).click();
    await page.getByText('版本紀錄', { exact: true }).first().click();
    await dialog.getByPlaceholder('例如：完成第一輪素材篩選').focus();
    await page.keyboard.press('Escape');
    assert.equal(await dialog.isVisible(), false, 'Escape failed in source view');
    console.log('Dialog focus, canvas isolation, clipboard, and Escape: PASS');
    await context.close();
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
