// Isolated browser acceptance: only the test browser's responses are instrumented.
// No production hooks, real accounts, or real Drive writes are used.
// NODE_PATH=<directory containing playwright> node scripts/test-storage-workflow.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const base = process.env.MOODBOARD_TEST_URL || 'http://127.0.0.1:5184';
const out = process.env.MOODBOARD_TEST_OUTPUT || '/tmp/infinite-studio-recovery-busy-qa';
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname)) throw new Error('Only an isolated loopback preview is allowed.');

const hook = `
window.__storageQA = {
  hydrated,
  read: () => ({ board: boardRef.current, dirty, drive: driveSession, prefs: storagePreferences, links: driveSettings.links, pending: pendingTabUpdate, recovery: driveLoadRecovery, confirmation: driveSaveConfirmation }),
  seed: async () => {
    cancelDriveOperations();
    const next = ensureBoard(createBoard({ id: 'qa-board', name: '編輯中的 Moodboard', revision: 10,
      objects: [{ id: 'qa-shape', type: 'shape', shape: 'rectangle', name: '目前編輯內容', x: 100, y: 160, width: 320, height: 220, fill: '#dddddd', color: '#dddddd', rotation: 0 }] }));
    boardRef.current = next; setBoard(next); setDirty(true);
    viewRef.current = next.view; setView(next.view);
    driveTokenRef.current = { accessToken: 'isolated-test-token', expiresAt: Date.now() + 3600000 };
    const metadata = { id: 'qa-file', name: '共同設計.moodboard', version: '1', headRevisionId: 'h1', modifiedTime: new Date().toISOString(), size: 4096, ownedByMe: true, capabilities: { canEdit: true, canShare: true } };
    window.__driveMock = { metadata, board: { ...next, name: '雲端內容', revision: 9 }, uploads: [], calls: {}, gates: {} };
    updateDriveSettings((s) => linkDriveFile({ ...s, enabled: true, autoSync: false, folderId: 'qa-folder' }, next, metadata));
    updateStoragePreferences((s) => ({ ...s, autoSave: false, targets: { ...s.targets, [next.id]: 'drive' }, uploadPaused: {}, loadRecoveries: {} }));
    setDriveSession((s) => ({ ...s, connected: true, busy: false, status: 'ready', conflict: null, message: '', files: [metadata] }));
    setDriveSharing({ ...EMPTY_DRIVE_SHARING });
    setDriveLoadRecovery(null); setDriveIncomingVersion(null); setPendingTabUpdate(null);
    setDriveSaveConfirmation(null); setShowDriveLibrary(false); setShowStorageLocation(false); setShowLocalFileLocation(false);
    setShowVersions(false); setLocalSwitchConfirmation(false); setToast(null); finishStartup();
    await persistBoardLocally(next);
  },
  edit: (name) => applyBoard((s) => ({ ...s, name })),
  save: saveBoardToGoogleDrive,
  expireToken: () => { driveTokenRef.current = null; },
  open: () => openGoogleDriveFile(window.__driveMock.metadata),
  refresh: refreshGoogleDrive,
  restore: restoreBeforeDriveLoad,
  close: closeDriveLibrary,
  library: () => setShowDriveLibrary(true),
  enableSyncQueue: () => updateDriveSettings((s) => ({ ...s, autoSync: true })),
  queueCurrent: () => enqueueSync(boardRef.current),
  chooseLocal: () => choosePrimaryStorageTarget('local'),
  enableAutoUpload: () => {
    driveTokenRef.current = { accessToken: 'isolated-test-token', expiresAt: Date.now() + 3600000 };
    updateDriveSettings((s) => ({ ...s, enabled: true, autoSync: true }));
    updateStoragePreferences((s) => ({ ...s, autoSave: true }));
    setDriveSession((s) => ({ ...s, connected: true, status: 'ready', busy: false }));
  },
  download: () => saveBoardFile(true),
  versions: () => listVersions(boardRef.current.id),
  dismissStartup: finishStartup,
  hideLocalPrompt: () => setShowLocalFileLocation(false),
};
`;
const mock = `
const state = () => window.__driveMock;
const copy = (x) => structuredClone(x);
const gate = async (name) => {
  const s = state(); s.calls[name] = (s.calls[name] || 0) + 1;
  if (s.gates[name]) await new Promise((resolve) => { s.gates[name] = resolve; });
};
export const requestGoogleDriveToken = async () => ({ accessToken: 'isolated-test-token', expiresAt: Date.now() + 3600000 });
export const ensureGoogleDriveFolder = async () => 'qa-folder';
export const getGoogleDriveAbout = async () => ({ user: { emailAddress: 'qa@example.test' }, quota: { limit: '10000000000', usage: '0' } });
export const listGoogleDriveMoodboards = async () => { await gate('list'); return [copy(state().metadata)]; };
export const listGoogleDriveRevisions = async () => [];
export const getGoogleDriveFile = async () => { await gate('metadata'); return copy(state().metadata); };
export const downloadGoogleDriveMoodboard = async () => { const content = JSON.stringify(state().board); await gate('download'); return content; };
export const downloadCurrentGoogleDriveMoodboard = async () => { const content = JSON.stringify(state().board); const metadata = copy(state().metadata); await gate('download'); return {content, metadata}; };
export const uploadGoogleDriveMoodboard = async (token, options) => {
  await gate('upload');
  if (options.signal.aborted) throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
  const s = state();
  if (s.failure) throw Object.assign(new Error(s.failure.message || 'Mock failure'), s.failure);
  if (options.existingFile && (options.forceOverwrite ? options.confirmedRemoteVersion : options.expectedVersion) !== s.metadata.version) {
    throw Object.assign(new Error('Remote changed'), { code: 'drive/conflict', remoteFile: copy(s.metadata) });
  }
  s.uploads.push({ board: copy(options.board), force: options.forceOverwrite });
  s.board = copy(options.board);
  const version = String(Number(s.metadata.version) + 1);
  s.metadata = { ...s.metadata, version, headRevisionId: 'h' + version, modifiedTime: new Date().toISOString() };
  await gate('verify');
  if (s.verificationFailure) throw Object.assign(new Error('Update sent; verification failed'), { code: 'drive/verification' });
  return copy(s.metadata);
};
`;

(async () => {
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-TW', colorScheme: 'dark', reducedMotion: 'reduce' });
  const errors = [];
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(base).origin) return route.abort();
    if (url.pathname === '/drive-storage.js') return route.fulfill({ contentType: 'application/javascript', body: mock });
    if (url.pathname === '/storage.js') {
      const response = await route.fetch();
      let body = await response.text();
      for (const [fn, args, name] of [
        ['getSyncJob', 'boardId', 'queueRead'],
        ['updateSyncJob', 'boardId, patch = {}', 'queueWrite'],
        ['removeSyncJob', 'boardId', 'queueRemove'],
      ]) {
        const anchor = 'export async function ' + fn + '(' + args + ') {';
        assert(body.includes(anchor), 'queue fault injection anchor must exist: ' + fn);
        body = body.replace(anchor, anchor + '\nif (window.__driveMock?.gates.' + name + ') await new Promise((resolve) => { window.__driveMock.gates.' + name + ' = resolve; });');
      }
      return route.fulfill({ response, body });
    }
    if (url.pathname === '/main.jsx') {
      const response = await route.fetch();
      let body = await response.text();
      assert(body.includes('const hasBlockingDialog = Boolean('), 'test injection anchor must exist');
      for (const [anchor, injected] of [
        ['const persistBoardLocally = useCallback((snapshot) => {', 'if (window.__driveMock?.localFailure) return Promise.reject(new Error("Simulated local recovery failure"));'],
        ['const refreshLocalLibrarySummary = useCallback(async () => {', 'if (window.__driveMock?.gates.localSummary) await new Promise((resolve) => { window.__driveMock.gates.localSummary = resolve; });'],
      ]) {
        assert(body.includes(anchor), 'fault injection anchor must exist: ' + anchor);
        body = body.replace(anchor, anchor + '\n' + injected);
      }
      return route.fulfill({ response, body: body.replace('const hasBlockingDialog = Boolean(', hook + '\nconst hasBlockingDialog = Boolean(') });
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  const results = [];
  const record = (name) => { results.push(name); console.log('PASS ' + name); };
  const state = () => page.evaluate(() => window.__storageQA.read());
  const seed = async () => { await page.evaluate(() => window.__storageQA.seed()); await page.waitForFunction(() => window.__storageQA.read().board.name === '編輯中的 Moodboard' && !window.__storageQA.read().drive.busy); };
  const gate = (name) => page.evaluate((key) => { window.__driveMock.gates[key] = true; }, name);
  const waitGate = (name) => page.waitForFunction((key) => typeof window.__driveMock.gates[key] === 'function', name);
  const release = (name) => page.evaluate((key) => { const resolve = window.__driveMock.gates[key]; delete window.__driveMock.gates[key]; resolve(); }, name);
  try {
    await page.goto(base + '/?authPreview=signed-in', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__storageQA?.hydrated);
    for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await seed();
    await page.locator('.topbar-save-button').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.topbar-save-button').innerText(), '更新至雲端');
    await page.screenshot({ path: out + '/desktop-workspace.png' });

    await seed();
    await page.evaluate(() => window.__storageQA.open());
    await page.waitForFunction(() => Boolean(window.__storageQA.read().recovery));
    await gate('list');
    await page.evaluate(() => { window.__refresh = window.__storageQA.refresh(); });
    await waitGate('list');
    await page.getByRole('button', { name: '主選單', exact: true }).click();
    await page.getByText('版本紀錄', { exact: true }).first().click();
    const restoreButton = page.getByRole('button', { name: '復原載入前內容', exact: true });
    assert.equal(await restoreButton.isEnabled(), true);
    await restoreButton.scrollIntoViewIfNeeded();
    const bounds = await restoreButton.boundingBox();
    assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width, 'recovery action must fit the viewport');
    assert(bounds.width >= 100 && bounds.height >= 44, 'recovery action must remain readable and touch-sized');
    await page.screenshot({ path: `${out}/recovery-${width}.png` });
    await restoreButton.click();
    await page.waitForFunction(() => window.__storageQA.read().board.name === '編輯中的 Moodboard');
    assert.equal((await state()).prefs.uploadPaused['qa-board'], true);
    assert.equal(await page.evaluate(() => window.__driveMock.uploads.length), 0);
    await release('list');
    await page.evaluate(() => window.__refresh);
    assert.equal((await state()).board.name, '編輯中的 Moodboard');
    assert.equal((await state()).drive.busy, false);
    record(`${width}px local recovery during delayed Drive refresh, without upload or stale overwrite`);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await seed();
    await page.evaluate(() => window.__storageQA.open());
    await page.waitForFunction(() => Boolean(window.__storageQA.read().recovery));
    await gate('upload');
    await page.evaluate(() => { window.__save = window.__storageQA.save(); });
    await waitGate('upload');
    await page.getByRole('button', { name: '主選單', exact: true }).click();
    await page.getByText('版本紀錄', { exact: true }).first().click();
    assert.equal(await page.getByRole('button', { name: '復原載入前內容', exact: true }).isDisabled(), true);
    await release('upload');
    await page.evaluate(() => window.__save);
    record('recovery remains disabled during an active upload');

    assert.deepEqual(errors, []);
    await fs.writeFile(out + '/results.json', JSON.stringify({ passed: results.length, results, errors, mockDrive: true }, null, 2));
    console.log(JSON.stringify({ passed: results.length, artifacts: out }));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
