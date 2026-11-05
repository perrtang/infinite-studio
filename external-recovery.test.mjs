import test from 'node:test';
import assert from 'node:assert/strict';
import { saveVerifiedRecovery, recoveryMatchesCurrent, openAfterVerifiedRecovery } from './external-recovery.js';
const snapshot = { id: 'a', objects: [{ type: 'text', text: 'work' }] };
function mockPicker({ corrupt = false, fail = false } = {}) {
  let data = '';
  return async () => ({ name: 'backup.studio', createWritable: async () => ({ write: async (value) => { if (fail) throw new Error('disk failure'); data = value; }, close: async () => {}, abort: async () => {} }), getFile: async () => ({ text: async () => corrupt ? 'wrong' : data }) });
}
test('backup is written, read back, and tied to the exact snapshot', async () => {
  const backup = await saveVerifiedRecovery(snapshot, mockPicker(), 'backup.studio');
  assert.equal(recoveryMatchesCurrent(backup, snapshot), true);
  assert.equal(recoveryMatchesCurrent(backup, { ...snapshot, id: 'b' }), false);
});
test('failed or mismatched backup never permits continuing', async () => {
  await assert.rejects(saveVerifiedRecovery(snapshot, mockPicker({ fail: true }), 'backup.studio'), /disk failure/);
  await assert.rejects(saveVerifiedRecovery(snapshot, mockPicker({ corrupt: true }), 'backup.studio'), /無法確認/);
  await assert.rejects(saveVerifiedRecovery(snapshot, null, 'backup.studio'), /瀏覽器/);
});
test('cancelling file selection or failing to close never reports a saved backup', async () => {
  const cancelled = Object.assign(new Error('cancelled'), { name: 'AbortError' });
  await assert.rejects(saveVerifiedRecovery(snapshot, async () => { throw cancelled; }, 'backup.studio'), { name: 'AbortError' });
  let aborted = false;
  const picker = async () => ({ createWritable: async () => ({ write: async () => {}, close: async () => { throw new Error('close failed'); }, abort: async () => { aborted = true; } }) });
  await assert.rejects(saveVerifiedRecovery(snapshot, picker, 'backup.studio'), /close failed/);
  assert.equal(aborted, true);
});

test('open runs only after verified backup while the same workspace is active', async () => {
  let calls = 0;
  const args = { snapshot, picker: mockPicker(), suggestedName: 'backup.studio', getCurrentSnapshot: () => snapshot, isCurrent: () => true, open: async () => { calls++; return true; } };
  assert.equal((await openAfterVerifiedRecovery(args)).opened, true);
  assert.equal(calls, 1);
  assert.equal((await openAfterVerifiedRecovery({ ...args, getCurrentSnapshot: () => ({ ...snapshot, id: 'changed' }) })).changed, true);
  assert.equal((await openAfterVerifiedRecovery({ ...args, isCurrent: () => false })).changed, true);
  await assert.rejects(openAfterVerifiedRecovery({ ...args, picker: mockPicker({ corrupt: true }) }));
  assert.equal(calls, 1);
});
