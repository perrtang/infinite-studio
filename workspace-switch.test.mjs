import test from 'node:test';
import assert from 'node:assert/strict';
import { protectBeforeWorkspaceSwitch } from './workspace-switch.js';

test('switching to another file saves the outgoing file without duplicating its history', async () => {
  const events = [];
  const current = { id: 'a', objects: [{ id: 'one' }] };
  await protectBeforeWorkspaceSwitch({ current, nextBoard: { id: 'b' }, needsCheckpoint: true, persist: async (board) => events.push(['saved', board]), checkpoint: async () => events.push(['checkpoint']) });
  assert.deepEqual(events, [['saved', current]]);
});

test('failed outgoing save prevents the switch and does not discard its error', async () => {
  let checkpointed = false;
  await assert.rejects(protectBeforeWorkspaceSwitch({ current: { id: 'a' }, nextBoard: { id: 'b' }, needsCheckpoint: true, persist: async () => { throw new Error('storage failed'); }, checkpoint: async () => { checkpointed = true; } }), /storage failed/);
  assert.equal(checkpointed, false);
});

test('replacing the same file requires a successful recovery checkpoint', async () => {
  await assert.rejects(protectBeforeWorkspaceSwitch({ current: { id: 'a' }, nextBoard: { id: 'a' }, needsCheckpoint: true, persist: async () => {}, checkpoint: async () => { throw new Error('checkpoint failed'); } }), /checkpoint failed/);
});

test('verified external backup permits a local switch only for the exact snapshot', async () => {
  const current = { id: 'a', objects: [{ id: 'one' }] };
  const backup = { text: `${JSON.stringify(current, null, 2)}\n` };
  let writes = 0;
  const args = { current, nextBoard: { id: 'b' }, needsCheckpoint: true, persist: async () => { writes++; throw new Error('quota'); }, checkpoint: async () => { writes++; } };
  await protectBeforeWorkspaceSwitch({ ...args, externalRecovery: backup });
  assert.equal(writes, 0);
  await assert.rejects(protectBeforeWorkspaceSwitch({ ...args, current: { ...current, id: 'changed' }, externalRecovery: backup }), /畫面已變更/);
  assert.equal(writes, 0);
});
