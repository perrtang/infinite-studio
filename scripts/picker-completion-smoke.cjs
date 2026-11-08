// Isolated picker-flow UI regression; all Drive and Picker responses are synthetic.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
  const base = new URL(process.env.INFINITE_STUDIO_TEST_URL || 'http://127.0.0.1:5272/');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)) throw new Error('Loopback preview required');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [320, 1440]) for (const mode of ['editor', 'viewer', 'cancel']) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'zh-TW', reducedMotion: 'reduce' });
      await context.route('**/*', async route => {
        const u = new URL(route.request().url());
        if (u.origin !== base.origin) return route.abort();
        if (u.pathname === '/drive-picker.js') return route.fulfill({ contentType: 'application/javascript', body: `export async function openGoogleDriveMoodboardPicker() { return window.__pickerMode === 'cancel' ? {status:'cancelled'} : {status:'picked',file:{id:'qa-shared-file'}}; }` });
        if (u.pathname !== '/main.jsx') return route.continue();
        const response = await route.fetch();
        let body = await response.text();
        const open = 'const openGoogleDriveFile = useCallback(async (file, { sharedLink = false, automatic = false, externalRecovery = null } = {}) => {';
        const refresh = 'const refreshDriveSharing = useCallback(async (target = null, { onRole = null, permissionChanged = false, expectedPermission = null } = {}) => {';
        const anchor = 'const hasBlockingDialog = Boolean(';
        for (const a of [open, refresh, anchor]) assert(body.includes(a), 'missing injection anchor');
        body = body.replace(open, open + `\nif (window.__pickerMode) return { metadata: {id:file.id, resourceKey:'', capabilities:{canEdit:window.__pickerMode !== 'viewer', canShare:false}} };`);
        body = body.replace(refresh, refresh + '\nif (window.__pickerMode) return true;');
        body = body.replace(anchor, `window.__pickerRead = () => ({showEditPermissionRequest}); window.__pickerSeed = (mode) => { window.__pickerMode=mode; initialDriveShareRef.current={fileId:'qa-shared-file',resourceKey:''}; pendingSharedEditRef.current=true; driveTokenRef.current={accessToken:'test',expiresAt:Date.now()+60000}; setDriveSharing({...EMPTY_DRIVE_SHARING,status:'needs-picker-access',fileId:'qa-shared-file'}); setShowCollaboration(true); finishStartup(); };\n` + anchor);
        return route.fulfill({ response, body });
      });
      const page = await context.newPage();
      await page.goto(base.href + '?authPreview=signed-in');
      await page.waitForFunction(() => window.__pickerSeed);
      await page.waitForTimeout(2200);
      await page.evaluate(mode => window.__pickerSeed(mode), mode);
      const share = page.getByRole('dialog', { name: '分享 Google Drive 工作檔' });
      await share.getByRole('button', { name: '授權這份共享檔案' }).click();
      if (mode === 'cancel') {
        await share.getByText('你已取消選取；沒有開啟任何內容，也沒有把空白畫布當成共享檔案。').waitFor();
        assert(await share.isVisible());
      } else {
        await share.waitFor({ state: 'hidden' });
        if (mode === 'viewer') await page.waitForFunction(() => window.__pickerRead().showEditPermissionRequest);
      }
      console.log(`${width}px ${mode}: PASS`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
