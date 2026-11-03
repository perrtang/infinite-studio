import test from 'node:test';
import assert from 'node:assert/strict';
import { assertUpdateSnapshotUnchanged, savePrimaryBeforeUpdate } from './update-safety.js';

test('update must not reload when the board or view changed after its backup', () => {
  const snapshot = { id: 'board', revision: 1, updatedAt: 't1', view: { zoom: 1 } };
  assert.doesNotThrow(() => assertUpdateSnapshotUnchanged(snapshot, { ...snapshot }, { zoom: 1 }));
  for (const current of [{ ...snapshot, id: 'other' }, { ...snapshot, revision: 2 }, { ...snapshot, updatedAt: 't2' }]) {
    assert.throws(() => assertUpdateSnapshotUnchanged(snapshot, current, snapshot.view), /變更/);
  }
  assert.throws(() => assertUpdateSnapshotUnchanged(snapshot, snapshot, { zoom: 2 }), /變更/);
});

test('dirty work is saved to its primary destination or blocks the update', async () => {
  let local = 0, drive = 0;
  const base = { dirty: true, saveLocal: async () => { local++; return true; }, saveDrive: async () => { drive++; return true; } };
  assert.equal(await savePrimaryBeforeUpdate({ ...base, target: null }), false);
  assert.equal(await savePrimaryBeforeUpdate({ ...base, target: 'local', localStatus: 'unlinked' }), false);
  assert.equal(await savePrimaryBeforeUpdate({ ...base, target: 'local', localStatus: 'linked', hasHandle: true }), true);
  assert.equal(local, 1);
  assert.equal(await savePrimaryBeforeUpdate({ ...base, target: 'drive', driveBusy: true }), false);
  assert.equal(await savePrimaryBeforeUpdate({ ...base, target: 'drive', saveDrive: async () => false }), false);
  assert.equal(await savePrimaryBeforeUpdate({ ...base, target: 'drive' }), true);
  assert.equal(drive, 1);
  assert.equal(await savePrimaryBeforeUpdate({ ...base, dirty: false, target: null }), true);
});
